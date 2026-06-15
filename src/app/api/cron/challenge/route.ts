import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, domains, acmeChallenges } from "@/lib/db/schema";
import { eq, and, lte, isNotNull } from "drizzle-orm";
import * as acme from "acme-client";

const ACME_DIRECTORY_URL =
  process.env.ACME_DIRECTORY_URL ||
  "https://acme-v02.api.letsencrypt.org/directory";

/**
 * GET /api/cron/challenge?key=RENEWAL_CRON_KEY
 *
 * Phase 1 — Find domains expiring within 30 days and create ACME challenges.
 * Fast: no waiting, no HTTP calls to Let's Encrypt beyond order creation.
 * Run daily at 2:00 AM UTC.
 */
export async function GET(request: NextRequest) {
  try {
    const cronKey = request.nextUrl.searchParams.get("key");
    if (cronKey !== process.env.RENEWAL_CRON_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const today = new Date();

    // Start renewal attempts 30 days before expiry (was 10 — too late for retries)
    const renewalThreshold = new Date(today);
    renewalThreshold.setDate(today.getDate() + 30);

    const results: any[] = [];

    // Find domains that need renewal and don't already have a pending challenge
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
        .where(
          and(
            eq(acmeChallenges.userId, user.id),
            eq(acmeChallenges.domain, domain.domainName)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        results.push({ domain: domain.domainName, status: "already_pending" });
        continue;
      }

      try {
        console.log(`[cron/challenge] Creating challenge for ${domain.domainName}`);

        const accountKey = await acme.crypto.createPrivateKey();
        const client = new acme.Client({ directoryUrl: ACME_DIRECTORY_URL, accountKey });

        await client.createAccount({
          termsOfServiceAgreed: true,
          contact: [`mailto:${user.email}`],
        });

        const [csrKey, csr] = await acme.crypto.createCsr({
          commonName: domain.domainName,
        });

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

        results.push({
          domain: domain.domainName,
          status: "challenge_created",
          token: challenge.token,
        });
        console.log(`[cron/challenge] Challenge created for ${domain.domainName}`);
      } catch (err: any) {
        console.error(`[cron/challenge] Failed for ${domain.domainName}:`, err);
        results.push({ domain: domain.domainName, status: "failed", error: err.message });
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: today.toISOString(),
      challenged: results.filter((r) => r.status === "challenge_created").length,
      already_pending: results.filter((r) => r.status === "already_pending").length,
      failed: results.filter((r) => r.status === "failed").length,
      results,
    });
  } catch (error: any) {
    console.error("[cron/challenge] Error:", error);
    return NextResponse.json({ error: error.message || "Challenge cron failed" }, { status: 500 });
  }
}
