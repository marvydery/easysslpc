import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, domains } from "@/lib/db/schema";
import { eq, and, lte, isNotNull, asc } from "drizzle-orm";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { createRenewalOrder, getPendingChallenges, isStale } from "@/lib/renewal";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Stop starting new work after this long so the function never times out. */
const TIME_BUDGET_MS = 45_000;

/**
 * GET /api/cron/challenge  (Vercel Cron, daily 02:00 UTC)
 *
 * Phase 1 — for every auto-renew domain expiring within 30 days, create a
 * Let's Encrypt order. bridge.php on the customer's server serves the tokens.
 * Domains left over when the time budget runs out are picked up the next day.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  try {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + 30);

    const due = await db
      .select({ domain: domains, user: users })
      .from(domains)
      .innerJoin(users, eq(domains.userId, users.id))
      .where(
        and(
          eq(domains.autoRenewEnabled, true),
          isNotNull(domains.bridgeSecret),
          isNotNull(domains.nextRenewalDate),
          lte(domains.nextRenewalDate, threshold)
        )
      )
      .orderBy(asc(domains.nextRenewalDate));

    const results: Array<{ domain: string; status: string; error?: string }> = [];

    for (const { domain, user } of due) {
      if (Date.now() - started > TIME_BUDGET_MS) {
        results.push({ domain: domain.domainName, status: "deferred" });
        continue;
      }

      try {
        const pending = await getPendingChallenges(user.id, domain);
        if (pending.length > 0 && !isStale(pending)) {
          results.push({ domain: domain.domainName, status: "already_pending" });
          continue;
        }
        await createRenewalOrder(user, domain);
        results.push({ domain: domain.domainName, status: "challenge_created" });
      } catch (err: any) {
        console.error(`[cron/challenge] Failed for ${domain.domainName}:`, err);
        results.push({ domain: domain.domainName, status: "failed", error: err.message });
      }
    }

    const tally = (s: string) => results.filter((r) => r.status === s).length;
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      challenged: tally("challenge_created"),
      already_pending: tally("already_pending"),
      deferred: tally("deferred"),
      failed: tally("failed"),
      results,
    });
  } catch (error: any) {
    console.error("[cron/challenge] Error:", error);
    return NextResponse.json({ error: error.message || "Challenge cron failed" }, { status: 500 });
  }
}
