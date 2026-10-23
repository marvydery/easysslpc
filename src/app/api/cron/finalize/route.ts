import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, domains, acmeChallenges, type AcmeChallenge } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { apexOf } from "@/lib/acme";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { finalizeRenewal, isStale } from "@/lib/renewal";
import { getPanelTypesByDomain } from "@/lib/panels";
import { sendBridgeFailureWarning, sendAdminRenewalFailure } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIME_BUDGET_MS = 40_000;
/** Give customers a few minutes between order creation and finalization. */
const MIN_AGE_MS = 5 * 60 * 1000;

/**
 * GET /api/cron/finalize  (Vercel Cron, daily 03:00 UTC)
 *
 * Phase 2 — for each pending renewal order, confirm bridge.php serves the
 * tokens, then let Let's Encrypt validate, issue the cert, install it via
 * bridge.php and email the customer.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  try {
    const rows = await db
      .select({ challenge: acmeChallenges, user: users })
      .from(acmeChallenges)
      .innerJoin(users, eq(acmeChallenges.userId, users.id));

    // One Let's Encrypt order can cover apex + www → group rows by order
    const groups = new Map<string, { user: typeof users.$inferSelect; rows: AcmeChallenge[] }>();
    for (const { challenge, user } of rows) {
      const g = groups.get(challenge.orderUrl) ?? { user, rows: [] };
      g.rows.push(challenge);
      groups.set(challenge.orderUrl, g);
    }

    const results: Array<Record<string, unknown>> = [];
    const panelDomains = await getPanelTypesByDomain();

    for (const { user, rows: group } of Array.from(groups.values())) {
      const names = group.map((r) => r.domain);
      const label = names.join(", ");

      // Expired orders (or abandoned manual attempts) are useless — clear them
      if (isStale(group)) {
        await db.delete(acmeChallenges).where(inArray(acmeChallenges.id, group.map((r) => r.id)));
        results.push({ domain: label, status: "stale_cleared" });
        continue;
      }
      if (group.some((r) => Date.now() - new Date(r.createdAt).getTime() < MIN_AGE_MS)) {
        results.push({ domain: label, status: "too_fresh" });
        continue;
      }
      if (Date.now() - started > TIME_BUDGET_MS) {
        results.push({ domain: label, status: "deferred" });
        continue;
      }

      const lookup = Array.from(new Set(names.flatMap((n) => [n, apexOf(n)])));
      const [domain] = await db
        .select()
        .from(domains)
        .where(and(eq(domains.userId, user.id), inArray(domains.domainName, lookup)))
        .limit(1);

      // Only auto-renew domains with a bridge are finalized here; manual
      // generations in progress are left for the customer to finish.
      if (!domain || !domain.autoRenewEnabled || (!domain.bridgeSecret && !panelDomains[domain.id])) {
        results.push({ domain: label, status: "skipped_manual" });
        continue;
      }

      try {
        const result = await finalizeRenewal(user, domain, group);

        if (result.status === "bridge_not_ready") {
          const daysLeft = domain.nextRenewalDate
            ? Math.round((new Date(domain.nextRenewalDate).getTime() - Date.now()) / 86_400_000)
            : null;
          if (daysLeft !== null && daysLeft <= 7) {
            await sendBridgeFailureWarning(user.email, domain.domainName, daysLeft, result.url);
          }
          results.push({ domain: label, status: "bridge_not_ready", reason: result.reason, daysLeft });
        } else if (result.status === "order_invalid") {
          // Rows were cleared; tomorrow's challenge cron starts a fresh order
          await sendAdminRenewalFailure(user.email, domain.domainName, result.message);
          results.push({ domain: label, status: "failed", error: result.message });
        } else {
          results.push({
            domain: label,
            status: "renewed",
            expiryDate: result.expiryDate,
            installed: result.install?.installed ?? false,
            installMessage: result.install?.message,
          });
        }
      } catch (err: any) {
        console.error(`[cron/finalize] Failed for ${label}:`, err);
        await sendAdminRenewalFailure(user.email, domain.domainName, err.message);
        results.push({ domain: label, status: "failed", error: err.message });
      }
    }

    const tally = (s: string) => results.filter((r) => r.status === s).length;
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      renewed: tally("renewed"),
      bridge_not_ready: tally("bridge_not_ready"),
      failed: tally("failed"),
      deferred: tally("deferred"),
      results,
    });
  } catch (error: any) {
    console.error("[cron/finalize] Error:", error);
    return NextResponse.json({ error: error.message || "Finalize cron failed" }, { status: 500 });
  }
}
