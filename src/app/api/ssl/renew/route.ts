/**
 * src/app/api/ssl/renew/route.ts
 * POST — customer-triggered manual renewal for an expired or expiring cert.
 * Works the same two-phase flow as the admin renew:
 *   Phase 1 — creates ACME challenge (if none exists)
 *   Phase 2 — verifies bridge and finalizes (if challenge already exists)
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, domains, certificates, acmeChallenges } from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto";
import { eq, and, desc } from "drizzle-orm";
import * as acme from "acme-client";
import * as https from "https";
import * as http from "http";
import JSZip from "jszip";
import { sendCertificateEmail, sendAdminRenewalSuccess, sendAdminRenewalFailure } from "@/lib/email";

const ACME_DIRECTORY_URL =
  process.env.ACME_DIRECTORY_URL || "https://acme-v02.api.letsencrypt.org/directory";

function parseCertChain(chain: string): { certificate: string; caCertificate: string } {
  const blocks =
    chain.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
  if (blocks.length === 0) return { certificate: chain.trim(), caCertificate: "" };
  return {
    certificate: blocks[0] as string,
    caCertificate: blocks.slice(1).join("\n"),
  };
}

// Tries https (ignoring expired cert) then falls back to http
function checkBridge(domain: string, token: string, keyAuthorization: string): Promise<{ ok: boolean; url: string }> {
  function tryUrl(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      const isHttps = url.startsWith("https");
      const requester = isHttps ? https : http;
      const options: any = { timeout: 5000, headers: { "User-Agent": "EasySSL/1.0" } };
      if (isHttps) options.rejectUnauthorized = false;
      const req = (requester as any).get(url, options, (res: any) => {
        let data = "";
        res.on("data", (c: any) => (data += c));
        res.on("end", () => resolve(data.trim() === keyAuthorization.trim()));
      });
      req.on("error", () => resolve(false));
      req.on("timeout", () => { req.destroy(); resolve(false); });
    });
  }

  return (async () => {
    // Try bridge.php directly first
    const bridgeHttps = `https://${domain}/.well-known/acme-challenge/bridge.php?token=${token}`;
    if (await tryUrl(bridgeHttps)) return { ok: true, url: bridgeHttps };

    const bridgeHttp = `http://${domain}/.well-known/acme-challenge/bridge.php?token=${token}`;
    if (await tryUrl(bridgeHttp)) return { ok: true, url: bridgeHttp };

    // Fall back to direct token URL
    const httpsUrl = `https://${domain}/.well-known/acme-challenge/${token}`;
    if (await tryUrl(httpsUrl)) return { ok: true, url: httpsUrl };
    const httpUrl = `http://${domain}/.well-known/acme-challenge/${token}`;
    if (await tryUrl(httpUrl)) return { ok: true, url: httpUrl };

    return { ok: false, url: bridgeHttps };
  })();
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { domainId } = await request.json();
    if (!domainId) return NextResponse.json({ error: "domainId required" }, { status: 400 });

    // Verify the domain belongs to this user
    const [dbUser] = await db.select().from(users).where(eq(users.clerkId, userId)).limit(1);
    if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const [domain] = await db
      .select()
      .from(domains)
      .where(and(eq(domains.id, domainId), eq(domains.userId, dbUser.id)))
      .limit(1);

    if (!domain) return NextResponse.json({ error: "Domain not found" }, { status: 404 });

    // Must be pro/lifetime to use renewal
    if (dbUser.subscriptionTier === "free" && !dbUser.isAdmin) {
      return NextResponse.json({
        error: "Manual renewal requires a Pro or Lifetime plan.",
      }, { status: 403 });
    }

    // Check for existing pending challenge
    const [existingChallenge] = await db
      .select()
      .from(acmeChallenges)
      .where(and(eq(acmeChallenges.userId, dbUser.id), eq(acmeChallenges.domain, domain.domainName)))
      .limit(1);

    // ── Phase 1: Create challenges for apex + www ─────────────────────────
    const apexDomain = domain.domainName.startsWith("www.")
      ? domain.domainName.slice(4)
      : domain.domainName;
    const wwwDomain = `www.${apexDomain}`;

    // Check for any existing challenges
    const allChallenges = await db.select().from(acmeChallenges).where(eq(acmeChallenges.userId, dbUser.id));
    const existingChallenges = allChallenges.filter(
      (c) => c.domain === apexDomain || c.domain === wwwDomain
    );

    if (existingChallenges.length === 0) {
      const accountKey = await acme.crypto.createPrivateKey();
      const client = new acme.Client({ directoryUrl: ACME_DIRECTORY_URL, accountKey });

      await client.createAccount({
        termsOfServiceAgreed: true,
        contact: [`mailto:${dbUser.email}`],
      });

      const [csrKey, csr] = await acme.crypto.createCsr({
        commonName: apexDomain,
        altNames: [apexDomain, wwwDomain],
      });

      const order = await client.createOrder({
        identifiers: [
          { type: "dns", value: apexDomain },
          { type: "dns", value: wwwDomain },
        ],
      });

      const authorizations = await client.getAuthorizations(order);

      for (const authz of authorizations) {
        const ch = authz.challenges.find((c: any) => c.type === "http-01");
        if (!ch) throw new Error(`No HTTP-01 challenge for ${authz.identifier.value}`);
        const kAuth = await client.getChallengeKeyAuthorization(ch);

        await db.insert(acmeChallenges).values({
          userId: dbUser.id,
          domain: authz.identifier.value,
          token: ch.token,
          keyAuthorization: kAuth,
          orderUrl: order.url,
          accountKeyPem: accountKey.toString(),
          csrKeyPem: csrKey.toString(),
          csrDer: csr.toString("base64"),
        }).onConflictDoUpdate({
          target: [acmeChallenges.userId, acmeChallenges.domain],
          set: {
            token: ch.token,
            keyAuthorization: kAuth,
            orderUrl: order.url,
            accountKeyPem: accountKey.toString(),
            csrKeyPem: csrKey.toString(),
            csrDer: csr.toString("base64"),
            createdAt: new Date(),
          },
        });
      }

      return NextResponse.json({
        success: true,
        phase: "challenge_created",
        message: `Challenge created for ${apexDomain} and ${wwwDomain}. Bridge.php will serve both tokens automatically. Click Renew again to complete.`,
      });
    }

    // ── Phase 2: Verify bridge for all challenges and finalize ───────────
    for (const ch of existingChallenges) {
      const { ok, url } = await checkBridge(ch.domain, ch.token, ch.keyAuthorization);
      if (!ok) {
        return NextResponse.json({
          success: false,
          phase: "bridge_not_ready",
          message: `Bridge is not reachable for ${ch.domain} at ${url}. Make sure bridge.php is correctly uploaded and try again.`,
        }, { status: 422 });
      }
    }
    const bridgeOk = true;
    const verifyUrl = "";

    if (!bridgeOk) {
      return NextResponse.json({
        success: false,
        phase: "bridge_not_ready",
        message: `Bridge is not reachable at ${verifyUrl}. Make sure bridge.php is correctly uploaded to public_html/.well-known/acme-challenge/ and try again.`,
      }, { status: 422 });
    }

    // Bridge OK — finalize with Let's Encrypt
    const client = new acme.Client({
      directoryUrl: ACME_DIRECTORY_URL,
      accountKey: existingChallenge.accountKeyPem,
      backoffAttempts: 5,
      backoffMin: 2000,
      backoffMax: 8000,
    });

    await client.createAccount({
      termsOfServiceAgreed: true,
      contact: [`mailto:${dbUser.email}`],
    });

    // Try to resume the stored order — if expired/invalid, wipe it and
    // tell the customer to click Renew once more to start a fresh Phase 1.
    let order: acme.Order;
    let authorizations: acme.Authorization[];
    try {
      order = await client.getOrder({ url: existingChallenge.orderUrl } as acme.Order);
      authorizations = await client.getAuthorizations(order);
    } catch (err: any) {
      await db.delete(acmeChallenges).where(eq(acmeChallenges.id, existingChallenge.id));
      return NextResponse.json({
        success: false,
        phase: "order_expired",
        message: "The previous renewal order expired. Click Renew Certificate again — your bridge is working correctly so it will complete on the next try.",
      }, { status: 422 });
    }

    for (const authz of authorizations) {
      const ch = authz.challenges.find((c: any) => c.type === "http-01");
      if (!ch) throw new Error(`No HTTP-01 challenge for ${authz.identifier.value}`);
      await client.completeChallenge(ch);
      await client.waitForValidStatus(ch);
    }

    const csrBuffer = Buffer.from(existingChallenge.csrDer, "base64");
    await client.finalizeOrder(order, csrBuffer);
    const certChain = await client.getCertificate(order);

    const { certificate, caCertificate } = parseCertChain(certChain);
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 90);

    await db.insert(certificates).values({
      domainId: domain.id,
      crtBody: certificate,
      keyBodyEncrypted: encrypt(existingChallenge.csrKeyPem),
      caBundle: caCertificate || null,
      expiryDate,
    });

    await db.update(domains)
      .set({ nextRenewalDate: expiryDate, updatedAt: new Date() })
      .where(eq(domains.id, domain.id));

    await db.delete(acmeChallenges).where(eq(acmeChallenges.id, existingChallenge.id));

    // Email customer + admin
    const zip = new JSZip();
    zip.file(`${domain.domainName}.crt`, certificate);
    zip.file(`${domain.domainName}.key`, existingChallenge.csrKeyPem);
    if (caCertificate) zip.file(`${domain.domainName}-ca-bundle.crt`, caCertificate);
    zip.file("README.txt", `Renewed SSL Certificate\nDomain: ${domain.domainName}\nExpires: ${expiryDate.toLocaleDateString()}\n`);
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    await sendCertificateEmail(dbUser.email, domain.domainName, zipBuffer);
    await sendAdminRenewalSuccess(dbUser.email, domain.domainName, expiryDate);

    return NextResponse.json({
      success: true,
      phase: "renewed",
      message: `Certificate renewed successfully! New expiry: ${expiryDate.toLocaleDateString()}. A copy has been emailed to you.`,
      expiryDate,
    });
  } catch (error: any) {
    console.error("[ssl/renew] Error:", error);
    return NextResponse.json({ error: error.message || "Renewal failed" }, { status: 500 });
  }
}
