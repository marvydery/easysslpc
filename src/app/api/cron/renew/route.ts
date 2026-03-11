import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, domains, certificates, acmeChallenges } from "@/lib/db/schema";
import { createAcmeChallenge } from "@/lib/acme";
import { encrypt } from "@/lib/crypto";
import { sendCertificateEmail } from "@/lib/email";
import { eq, and, lte } from "drizzle-orm";

/**
 * Renewal Cron Job
 * GET /api/cron/renew?key=RENEWAL_CRON_KEY
 *
 * For Bridge users: creates a new ACME challenge and stores it in the DB.
 * The Bridge file (bridge.php) on the user's server will serve the challenge
 * when Let's Encrypt comes to verify. The actual certificate finalization
 * happens via a separate follow-up call once the challenge is verified.
 *
 * For now this endpoint initiates renewal by creating the challenge.
 * A second cron (or the same cron on next run) should finalize it.
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron key
    const cronKey = request.nextUrl.searchParams.get("key");
    if (cronKey !== process.env.RENEWAL_CRON_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const today = new Date();

    // Find domains that need renewal
    const domainsToRenew = await db
      .select({
        domain: domains,
        user: users,
      })
      .from(domains)
      .innerJoin(users, eq(domains.userId, users.id))
      .where(
        and(
          eq(domains.autoRenewEnabled, true),
          lte(domains.nextRenewalDate, today)
        )
      );

    console.log(`Found ${domainsToRenew.length} domains to renew`);

    const results = [];

    for (const { domain, user } of domainsToRenew) {
      try {
        console.log(`Creating renewal challenge for ${domain.domainName}`);

        // Phase 1: Create ACME challenge and store in DB
        // The bridge.php on the user's server will serve this challenge
        // when Let's Encrypt comes to verify
        const challengeInfo = await createAcmeChallenge(domain.domainName, user.email);

        // Store challenge in DB (upsert)
        await db
          .insert(acmeChallenges)
          .values({
            userId: user.id,
            domain: domain.domainName,
            token: challengeInfo.token,
            keyAuthorization: challengeInfo.keyAuthorization,
            orderUrl: challengeInfo.orderUrl,
            accountKeyPem: challengeInfo.accountKeyPem,
            csrKeyPem: challengeInfo.csrKeyPem,
            csrDer: challengeInfo.csrDer.toString("base64"),
            createdAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [acmeChallenges.userId, acmeChallenges.domain],
            set: {
              token: challengeInfo.token,
              keyAuthorization: challengeInfo.keyAuthorization,
              orderUrl: challengeInfo.orderUrl,
              accountKeyPem: challengeInfo.accountKeyPem,
              csrKeyPem: challengeInfo.csrKeyPem,
              csrDer: challengeInfo.csrDer.toString("base64"),
              createdAt: new Date(),
            },
          });

        results.push({
          domain: domain.domainName,
          status: "challenge_created",
          token: challengeInfo.token,
          message: "Challenge created. Bridge will serve it for verification.",
        });

        console.log(`Challenge created for ${domain.domainName}, token: ${challengeInfo.token}`);
      } catch (error: any) {
        console.error(`Failed to create renewal challenge for ${domain.domainName}:`, error);
        results.push({
          domain: domain.domainName,
          status: "failed",
          error: error.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: domainsToRenew.length,
      challenged: results.filter((r) => r.status === "challenge_created").length,
      failed: results.filter((r) => r.status === "failed").length,
      results,
    });
  } catch (error: any) {
    console.error("Renewal cron error:", error);
    return NextResponse.json(
      { error: error.message || "Renewal cron failed" },
      { status: 500 }
    );
  }
}
