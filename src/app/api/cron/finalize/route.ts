import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, domains, certificates, acmeChallenges } from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto";
import { eq, and } from "drizzle-orm";
import * as acme from "acme-client";
import JSZip from "jszip";
import {
  sendCertificateEmail,
  sendBridgeFailureWarning,
  sendAdminRenewalSuccess,
  sendAdminRenewalFailure,
} from "@/lib/email";
import * as https from "https";
import * as http from "http";

const ACME_DIRECTORY_URL =
  process.env.ACME_DIRECTORY_URL ||
  "https://acme-v02.api.letsencrypt.org/directory";

function parseCertChain(chain: string): { certificate: string; caCertificate: string } {
  const blocks =
    chain.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
  if (blocks.length === 0) return { certificate: chain.trim(), caCertificate: "" };
  return {
    certificate: blocks[0] as string,
    caCertificate: blocks.slice(1).join("\n"),
  };
}

/**
 * Checks bridge by trying https (ignoring expired cert) then falling back to http.
 * This handles sites that force HTTP→HTTPS redirect even with an expired cert.
 */
async function checkBridge(domain: string, token: string, keyAuthorization: string): Promise<{ ok: boolean; url: string }> {
  function tryUrl(url: string, ignoreSSL = false): Promise<boolean> {
    return new Promise((resolve) => {
      const isHttps = url.startsWith("https");
      const requester = isHttps ? https : http;
      const options: any = {
        timeout: 5000,
        headers: { "User-Agent": "EasySSL-Cron/1.0" },
      };
      if (isHttps) options.rejectUnauthorized = false; // allow expired certs

      const req = (requester as any).get(url, options, (res: any) => {
        let data = "";
        res.on("data", (chunk: any) => (data += chunk));
        res.on("end", () => resolve(data.trim() === keyAuthorization.trim()));
      });
      req.on("error", () => resolve(false));
      req.on("timeout", () => { req.destroy(); resolve(false); });
    });
  }

  const httpsUrl = `https://${domain}/.well-known/acme-challenge/${token}`;
  if (await tryUrl(httpsUrl)) return { ok: true, url: httpsUrl };

  const httpUrl = `http://${domain}/.well-known/acme-challenge/${token}`;
  if (await tryUrl(httpUrl)) return { ok: true, url: httpUrl };

  return { ok: false, url: httpsUrl };
}

/**
 * GET /api/cron/finalize?key=RENEWAL_CRON_KEY
 *
 * Phase 2 — Finalize pending ACME challenges that are at least 5 minutes old.
 * Verifies bridge.php is serving the token, then completes Let's Encrypt
 * validation and issues the new certificate.
 *
 * Run daily at 3:00 AM UTC (1 hour after challenge cron at 2:00 AM).
 *
 * Notifications:
 * - Customer: gets new cert ZIP on success, bridge warning on failure (≤5 days left)
 * - Admin (jocykwa2015@gmail.com): gets notified on every success AND every failure
 */
export async function GET(request: NextRequest) {
  try {
    const cronKey = request.nextUrl.searchParams.get("key");
    if (cronKey !== process.env.RENEWAL_CRON_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const today = new Date();
    const results: any[] = [];

    const pendingChallenges = await db
      .select({ challenge: acmeChallenges, domain: domains, user: users })
      .from(acmeChallenges)
      .innerJoin(
        domains,
        and(
          eq(acmeChallenges.userId, domains.userId),
          eq(acmeChallenges.domain, domains.domainName)
        )
      )
      .innerJoin(users, eq(domains.userId, users.id))
      .where(eq(domains.autoRenewEnabled, true));

    for (const { challenge, domain, user } of pendingChallenges) {
      const challengeAgeMinutes =
        (today.getTime() - new Date(challenge.createdAt).getTime()) / 1000 / 60;
      if (challengeAgeMinutes < 5) {
        results.push({ domain: domain.domainName, status: "too_fresh" });
        continue;
      }

      try {
        console.log(`[cron/finalize] Finalizing renewal for ${domain.domainName}`);

        const { ok: bridgeOk, url: verifyUrl } = await checkBridge(
          challenge.domain,
          challenge.token,
          challenge.keyAuthorization
        );

        if (!bridgeOk) {
          const daysUntilExpiry = domain.nextRenewalDate
            ? Math.round(
                (new Date(domain.nextRenewalDate).getTime() - today.getTime()) /
                  1000 / 60 / 60 / 24
              )
            : null;

          console.warn(
            `[cron/finalize] Bridge not ready for ${domain.domainName} (${daysUntilExpiry}d left)`
          );

          if (daysUntilExpiry !== null && daysUntilExpiry <= 5) {
            await sendBridgeFailureWarning(
              user.email,
              domain.domainName,
              daysUntilExpiry,
              verifyUrl
            );
          }

          results.push({ domain: domain.domainName, status: "bridge_not_ready", daysUntilExpiry });
          continue;
        }

        const client = new acme.Client({
          directoryUrl: ACME_DIRECTORY_URL,
          accountKey: challenge.accountKeyPem,
          backoffAttempts: 5,
          backoffMin: 2000,
          backoffMax: 8000,
        });

        await client.createAccount({
          termsOfServiceAgreed: true,
          contact: [`mailto:${user.email}`],
        });

        const order = await client.getOrder({ url: challenge.orderUrl } as acme.Order);
        const authorizations = await client.getAuthorizations(order);

        for (const authz of authorizations) {
          const ch = authz.challenges.find((c: any) => c.type === "http-01");
          if (!ch) throw new Error(`No HTTP-01 challenge for ${authz.identifier.value}`);
          await client.completeChallenge(ch);
          await client.waitForValidStatus(ch);
        }

        const csrBuffer = Buffer.from(challenge.csrDer, "base64");
        await client.finalizeOrder(order, csrBuffer);
        const certChain = await client.getCertificate(order);

        const { certificate, caCertificate } = parseCertChain(certChain);
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 90);

        await db.insert(certificates).values({
          domainId: domain.id,
          crtBody: certificate,
          keyBodyEncrypted: encrypt(challenge.csrKeyPem),
          caBundle: caCertificate || null,
          expiryDate,
        });

        await db
          .update(domains)
          .set({ nextRenewalDate: expiryDate, updatedAt: new Date() })
          .where(eq(domains.id, domain.id));

        await db.delete(acmeChallenges).where(eq(acmeChallenges.id, challenge.id));

        const zip = new JSZip();
        zip.file(`${domain.domainName}.crt`, certificate);
        zip.file(`${domain.domainName}.key`, challenge.csrKeyPem);
        if (caCertificate) zip.file(`${domain.domainName}-ca-bundle.crt`, caCertificate);
        zip.file(
          "README.txt",
          `Renewed SSL Certificate\nDomain: ${domain.domainName}\nExpires: ${expiryDate.toLocaleDateString()}\n`
        );
        const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

        await sendCertificateEmail(user.email, domain.domainName, zipBuffer);
        await sendAdminRenewalSuccess(user.email, domain.domainName, expiryDate);

        results.push({ domain: domain.domainName, status: "renewed", expiryDate });
        console.log(`[cron/finalize] Successfully renewed ${domain.domainName}`);
      } catch (err: any) {
        console.error(`[cron/finalize] Failed for ${domain.domainName}:`, err);
        await sendAdminRenewalFailure(user.email, domain.domainName, err.message);
        results.push({ domain: domain.domainName, status: "failed", error: err.message });
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: today.toISOString(),
      renewed: results.filter((r) => r.status === "renewed").length,
      bridge_not_ready: results.filter((r) => r.status === "bridge_not_ready").length,
      too_fresh: results.filter((r) => r.status === "too_fresh").length,
      failed: results.filter((r) => r.status === "failed").length,
      results,
    });
  } catch (error: any) {
    console.error("[cron/finalize] Error:", error);
    return NextResponse.json({ error: error.message || "Finalize cron failed" }, { status: 500 });
  }
}
