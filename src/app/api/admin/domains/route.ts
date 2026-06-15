/**
 * src/app/api/admin/domains/route.ts
 * GET    — fetch all domains with owner, certificate status, expiry
 * POST   — trigger manual renewal (Phase 1: create challenge, Phase 2: finalize)
 * DELETE — permanently delete a domain and all its data
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

async function getAdminUser(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.clerkId, userId)).limit(1);
  if (!user?.isAdmin) return null;
  return user;
}

function parseCertChain(chain: string): { certificate: string; caCertificate: string } {
  const blocks =
    chain.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
  if (blocks.length === 0) return { certificate: chain.trim(), caCertificate: "" };
  return {
    certificate: blocks[0] as string,
    caCertificate: blocks.slice(1).join("\n"),
  };
}

// Check bridge by calling bridge.php?token= directly (most reliable),
// then falling back to bare token URL, trying https before http each time
async function checkBridge(
  domain: string,
  token: string,
  keyAuthorization: string
): Promise<{ ok: boolean; url: string }> {
  function tryUrl(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      const isHttps = url.startsWith("https");
      const requester = isHttps ? https : http;
      const options: any = { timeout: 5000, headers: { "User-Agent": "EasySSL-Admin/1.0" } };
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

  // Try bridge.php?token= directly first (bypasses htaccess rewrite)
  const bridgeHttps = `https://${domain}/.well-known/acme-challenge/bridge.php?token=${token}`;
  if (await tryUrl(bridgeHttps)) return { ok: true, url: bridgeHttps };

  const bridgeHttp = `http://${domain}/.well-known/acme-challenge/bridge.php?token=${token}`;
  if (await tryUrl(bridgeHttp)) return { ok: true, url: bridgeHttp };

  // Fall back to bare token URL
  const httpsUrl = `https://${domain}/.well-known/acme-challenge/${token}`;
  if (await tryUrl(httpsUrl)) return { ok: true, url: httpsUrl };

  const httpUrl = `http://${domain}/.well-known/acme-challenge/${token}`;
  if (await tryUrl(httpUrl)) return { ok: true, url: httpUrl };

  return { ok: false, url: bridgeHttps };
}

// ── GET: All domains with owner + latest cert info ────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = await getAdminUser(userId);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const allDomains = await db
      .select({
        domain: domains,
        user: {
          id: users.id,
          email: users.email,
          subscriptionTier: users.subscriptionTier,
        },
      })
      .from(domains)
      .innerJoin(users, eq(domains.userId, users.id))
      .orderBy(desc(domains.createdAt));

    const result = await Promise.all(
      allDomains.map(async ({ domain, user }) => {
        const [latestCert] = await db
          .select({ expiryDate: certificates.expiryDate, createdAt: certificates.createdAt })
          .from(certificates)
          .where(eq(certificates.domainId, domain.id))
          .orderBy(desc(certificates.createdAt))
          .limit(1);

        const [pendingChallenge] = await db
          .select({ id: acmeChallenges.id, createdAt: acmeChallenges.createdAt })
          .from(acmeChallenges)
          .where(
            and(eq(acmeChallenges.userId, domain.userId), eq(acmeChallenges.domain, domain.domainName))
          )
          .limit(1);

        const now = new Date();
        const expiry = latestCert?.expiryDate ? new Date(latestCert.expiryDate) : null;
        const daysLeft = expiry
          ? Math.round((expiry.getTime() - now.getTime()) / 1000 / 60 / 60 / 24)
          : null;

        let certStatus: "active" | "expired" | "expiring_soon" | "no_cert" = "no_cert";
        if (expiry) {
          if (expiry < now) certStatus = "expired";
          else if (daysLeft !== null && daysLeft <= 14) certStatus = "expiring_soon";
          else certStatus = "active";
        }

        return {
          id: domain.id,
          domainName: domain.domainName,
          autoRenewEnabled: domain.autoRenewEnabled,
          nextRenewalDate: domain.nextRenewalDate,
          bridgeSecret: !!domain.bridgeSecret,
          createdAt: domain.createdAt,
          certStatus,
          expiryDate: latestCert?.expiryDate ?? null,
          daysLeft,
          hasPendingChallenge: !!pendingChallenge,
          owner: user,
        };
      })
    );

    return NextResponse.json({ success: true, domains: result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ── POST: Manual renewal trigger ──────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = await getAdminUser(userId);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { domainId } = await request.json();
    if (!domainId) return NextResponse.json({ error: "domainId required" }, { status: 400 });

    const [row] = await db
      .select({ domain: domains, user: users })
      .from(domains)
      .innerJoin(users, eq(domains.userId, users.id))
      .where(eq(domains.id, domainId))
      .limit(1);

    if (!row) return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    const { domain, user } = row;

    const apexDomain = domain.domainName.startsWith("www.")
      ? domain.domainName.slice(4)
      : domain.domainName;
    const wwwDomain = `www.${apexDomain}`;

    // Check for existing pending challenges
    const allChallenges = await db.select().from(acmeChallenges).where(eq(acmeChallenges.userId, user.id));
    const existingChallenges = allChallenges.filter(
      (c) => c.domain === apexDomain || c.domain === wwwDomain
    );

    // ── Phase 1: Create challenges for apex + www ──────────────────────────
    if (existingChallenges.length === 0) {
      const accountKey = await acme.crypto.createPrivateKey();
      const client = new acme.Client({ directoryUrl: ACME_DIRECTORY_URL, accountKey });

      await client.createAccount({
        termsOfServiceAgreed: true,
        contact: [`mailto:${user.email}`],
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
          userId: user.id,
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
        message: `Challenge created for ${apexDomain} and ${wwwDomain}. Bridge.php will serve both tokens automatically. Click Renew again to finalize.`,
        phase: "challenge_created",
      });
    }

    // ── Phase 2: Verify bridge for all challenges and finalize ─────────────
    for (const ch of existingChallenges) {
      const { ok, url } = await checkBridge(ch.domain, ch.token, ch.keyAuthorization);
      if (!ok) {
        return NextResponse.json({
          success: false,
          message: `Bridge is not reachable for ${ch.domain}. Make sure bridge.php is uploaded and the .htaccess is correct.`,
          phase: "bridge_not_ready",
          bridgeUrl: url,
        }, { status: 422 });
      }
    }

    // All bridges OK — finalize with Let's Encrypt
    const { accountKeyPem, csrKeyPem, csrDer, orderUrl } = existingChallenges[0];

    const client = new acme.Client({
      directoryUrl: ACME_DIRECTORY_URL,
      accountKey: accountKeyPem,
      backoffAttempts: 5,
      backoffMin: 2000,
      backoffMax: 8000,
    });

    await client.createAccount({
      termsOfServiceAgreed: true,
      contact: [`mailto:${user.email}`],
    });

    // Detect stale order
    let order: acme.Order;
    let authorizations: acme.Authorization[];
    try {
      order = await client.getOrder({ url: orderUrl } as acme.Order);
      authorizations = await client.getAuthorizations(order);
    } catch {
      // Stale — delete all challenges so next click starts fresh
      for (const ch of existingChallenges) {
        await db.delete(acmeChallenges).where(eq(acmeChallenges.id, ch.id));
      }
      return NextResponse.json({
        success: false,
        phase: "order_expired",
        message: "The ACME order expired. Click Renew again to start a fresh attempt.",
      }, { status: 422 });
    }

    for (const authz of authorizations) {
      const ch = authz.challenges.find((c: any) => c.type === "http-01");
      if (!ch) throw new Error(`No HTTP-01 challenge for ${authz.identifier.value}`);
      await client.completeChallenge(ch);
      await client.waitForValidStatus(ch);
    }

    const csrBuffer = Buffer.from(csrDer, "base64");
    await client.finalizeOrder(order, csrBuffer);
    const certChain = await client.getCertificate(order);

    const { certificate, caCertificate } = parseCertChain(certChain);
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 90);

    await db.insert(certificates).values({
      domainId: domain.id,
      crtBody: certificate,
      keyBodyEncrypted: encrypt(csrKeyPem),
      caBundle: caCertificate || null,
      expiryDate,
    });

    await db.update(domains)
      .set({ nextRenewalDate: expiryDate, updatedAt: new Date() })
      .where(eq(domains.id, domain.id));

    // Clean up all challenge rows
    for (const ch of existingChallenges) {
      await db.delete(acmeChallenges).where(eq(acmeChallenges.id, ch.id));
    }

    const zip = new JSZip();
    zip.file(`${apexDomain}.crt`, certificate);
    zip.file(`${apexDomain}.key`, csrKeyPem);
    if (caCertificate) zip.file(`${apexDomain}-ca-bundle.crt`, caCertificate);
    zip.file("README.txt", `Renewed SSL Certificate\nDomain: ${apexDomain} + ${wwwDomain}\nExpires: ${expiryDate.toLocaleDateString()}\n`);
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    await sendCertificateEmail(user.email, apexDomain, zipBuffer);
    await sendAdminRenewalSuccess(user.email, apexDomain, expiryDate);

    return NextResponse.json({
      success: true,
      message: `${apexDomain} and ${wwwDomain} renewed successfully. Certificate emailed to ${user.email}.`,
      phase: "renewed",
      expiryDate,
    });
  } catch (error: any) {
    console.error("[admin/domains] Manual renewal error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ── DELETE: Remove a domain and all its certificates/challenges ───────────────
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = await getAdminUser(userId);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { domainId } = await request.json();
    if (!domainId) return NextResponse.json({ error: "domainId required" }, { status: 400 });

    const [row] = await db
      .select({ domain: domains })
      .from(domains)
      .where(eq(domains.id, domainId))
      .limit(1);

    if (!row) return NextResponse.json({ error: "Domain not found" }, { status: 404 });

    const domainName = row.domain.domainName;
    await db.delete(domains).where(eq(domains.id, domainId));

    return NextResponse.json({
      success: true,
      message: `${domainName} and all associated certificates have been deleted.`,
    });
  } catch (error: any) {
    console.error("[admin/domains] Delete error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
