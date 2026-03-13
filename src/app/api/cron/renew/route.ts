import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, domains, certificates, acmeChallenges } from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto";
import { eq, and, lte, isNotNull } from "drizzle-orm";
import * as acme from "acme-client";
import JSZip from "jszip";

const ACME_DIRECTORY_URL =
  process.env.ACME_DIRECTORY_URL ||
  "https://acme-v02.api.letsencrypt.org/directory";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

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
 * GET /api/cron/renew?key=RENEWAL_CRON_KEY
 *
 * Two-phase renewal:
 * Phase 1 — domains approaching expiry (≤ 10 days away from 80-day mark):
 *   Creates ACME challenge, stores in DB. bridge.php will serve it.
 *
 * Phase 2 — domains that already have a pending challenge (created in Phase 1):
 *   Resumes the stored order, completes challenge via bridge, finalizes cert,
 *   emails new ZIP to user.
 *
 * Run this cron daily. Phase 1 and Phase 2 happen in the same run for
 * different domains depending on where they are in the cycle.
 */
export async function GET(request: NextRequest) {
  try {
    const cronKey = request.nextUrl.searchParams.get("key");
    if (cronKey !== process.env.RENEWAL_CRON_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const today = new Date();
    // Renew when ≤ 10 days remain (cert is 90 days, we target 80-day mark)
    const renewalThreshold = new Date(today);
    renewalThreshold.setDate(today.getDate() + 10);

    const results: any[] = [];

    // ── PHASE 2: Finalize pending challenges ─────────────────────────────────
    // Find domains with stored challenges that are ready to finalize
    const pendingChallenges = await db
      .select({ challenge: acmeChallenges, domain: domains, user: users })
      .from(acmeChallenges)
      .innerJoin(domains, eq(acmeChallenges.userId, domains.userId))
      .innerJoin(users, eq(domains.userId, users.id))
      .where(eq(domains.autoRenewEnabled, true));

    for (const { challenge, domain, user } of pendingChallenges) {
      // Only finalize challenges that are at least 5 minutes old (gives bridge time to be ready)
      const challengeAge = (today.getTime() - new Date(challenge.createdAt).getTime()) / 1000 / 60;
      if (challengeAge < 5) continue;

      try {
        console.log(`[cron] Phase 2: Finalizing renewal for ${domain.domainName}`);

        const client = new acme.Client({
          directoryUrl: ACME_DIRECTORY_URL,
          accountKey: challenge.accountKeyPem,
          backoffAttempts: 5,
          backoffMin: 2000,
          backoffMax: 8000,
        });

        await client.createAccount({ termsOfServiceAgreed: true, contact: [`mailto:${user.email}`] });

        // Verify bridge is serving the challenge correctly
        const verifyUrl = `http://${challenge.domain}/.well-known/acme-challenge/${challenge.token}`;
        let bridgeOk = false;
        try {
          const res = await fetch(verifyUrl, { headers: { "User-Agent": "EasySSL-Cron/1.0" } });
          const content = await res.text();
          bridgeOk = res.ok && content.trim() === challenge.keyAuthorization.trim();
        } catch {
          bridgeOk = false;
        }

        if (!bridgeOk) {
          console.log(`[cron] Bridge not ready for ${domain.domainName}, will retry next run`);
          results.push({ domain: domain.domainName, status: "bridge_not_ready" });
          continue;
        }

        // Resume stored order
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

        // Save new certificate
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

        // Clean up challenge row
        await db.delete(acmeChallenges).where(eq(acmeChallenges.id, challenge.id));

        // Build ZIP for email
        const zip = new JSZip();
        zip.file(`${domain.domainName}.crt`, certificate);
        zip.file(`${domain.domainName}.key`, challenge.csrKeyPem);
        if (caCertificate) zip.file(`${domain.domainName}-ca-bundle.crt`, caCertificate);
        zip.file("README.txt", `Renewed SSL Certificate\nDomain: ${domain.domainName}\nExpires: ${expiryDate.toLocaleDateString()}\n`);
        const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

        // Send email with new certificate
        await fetch(`${APP_URL}/api/email/certificate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user.email,
            domainName: domain.domainName,
            expiryDate: expiryDate.toLocaleDateString(),
            certificateZip: zipBuffer.toString("base64"),
            isRenewal: true,
          }),
        });

        results.push({ domain: domain.domainName, status: "renewed", expiryDate });
        console.log(`[cron] Renewed ${domain.domainName} successfully`);
      } catch (err: any) {
        console.error(`[cron] Phase 2 failed for ${domain.domainName}:`, err);
        results.push({ domain: domain.domainName, status: "failed", error: err.message });
      }
    }

    // ── PHASE 1: Create challenges for domains approaching expiry ────────────
    const domainsToRenew = await db
      .select({ domain: domains, user: users })
      .from(domains)
      .innerJoin(users, eq(domains.userId, users.id))
      .where(
        and(
          eq(domains.autoRenewEnabled, true),
          isNotNull(domains.nextRenewalDate),
          lte(domains.nextRenewalDate, renewalThreshold)
        )
      );

    for (const { domain, user } of domainsToRenew) {
      // Skip if already has a pending challenge
      const existing = await db
        .select()
        .from(acmeChallenges)
        .where(and(eq(acmeChallenges.userId, user.id), eq(acmeChallenges.domain, domain.domainName)))
        .limit(1);

      if (existing.length > 0) continue;

      try {
        console.log(`[cron] Phase 1: Creating challenge for ${domain.domainName}`);

        const accountKey = await acme.crypto.createPrivateKey();
        const client = new acme.Client({ directoryUrl: ACME_DIRECTORY_URL, accountKey });

        await client.createAccount({
          termsOfServiceAgreed: true,
          contact: [`mailto:${user.email}`],
        });

        const [csrKey, csr] = await acme.crypto.createCsr({ commonName: domain.domainName });

        const order = await client.createOrder({
          identifiers: [{ type: "dns", value: domain.domainName }],
        });

        const authorizations = await client.getAuthorizations(order);
        const authz = authorizations[0];
        const challenge = authz.challenges.find((c: any) => c.type === "http-01");
        if (!challenge) throw new Error("No HTTP-01 challenge found");

        const keyAuthorization = await client.getChallengeKeyAuthorization(challenge);

        await db
          .insert(acmeChallenges)
          .values({
            userId: user.id,
            domain: domain.domainName,
            token: challenge.token,
            keyAuthorization,
            orderUrl: order.url,
            accountKeyPem: accountKey.toString(),
            csrKeyPem: csrKey.toString(),
            csrDer: csr.toString("base64"),
          })
          .onConflictDoUpdate({
            target: [acmeChallenges.userId, acmeChallenges.domain],
            set: {
              token: challenge.token,
              keyAuthorization,
              orderUrl: order.url,
              accountKeyPem: accountKey.toString(),
              csrKeyPem: csrKey.toString(),
              csrDer: csr.toString("base64"),
              createdAt: new Date(),
            },
          });

        results.push({ domain: domain.domainName, status: "challenge_created", token: challenge.token });
        console.log(`[cron] Challenge created for ${domain.domainName}`);
      } catch (err: any) {
        console.error(`[cron] Phase 1 failed for ${domain.domainName}:`, err);
        results.push({ domain: domain.domainName, status: "failed", error: err.message });
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: today.toISOString(),
      phase1_challenged: results.filter((r) => r.status === "challenge_created").length,
      phase2_renewed: results.filter((r) => r.status === "renewed").length,
      bridge_not_ready: results.filter((r) => r.status === "bridge_not_ready").length,
      failed: results.filter((r) => r.status === "failed").length,
      results,
    });
  } catch (error: any) {
    console.error("[cron] Renewal error:", error);
    return NextResponse.json({ error: error.message || "Renewal cron failed" }, { status: 500 });
  }
}
