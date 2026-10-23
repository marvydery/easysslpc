/**
 * src/app/api/admin/domains/route.ts
 * GET    — fetch all domains with owner, certificate status, expiry
 * POST   — renew now (creates/reuses an order and finalizes it in one request)
 * DELETE — permanently delete a domain and all its data
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, domains, certificates, acmeChallenges } from "@/lib/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { apexOf } from "@/lib/acme";
import { describeResult, renewNow } from "@/lib/renewal";
import { sendAdminRenewalFailure } from "@/lib/email";

export const maxDuration = 60;

async function getAdminUser(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.clerkId, userId)).limit(1);
  if (!user?.isAdmin) return null;
  return user;
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
            and(
              eq(acmeChallenges.userId, domain.userId),
              inArray(acmeChallenges.domain, [domain.domainName, apexOf(domain.domainName), `www.${apexOf(domain.domainName)}`])
            )
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

    const result = await renewNow(user, domain);
    if (result.status === "order_invalid") {
      await sendAdminRenewalFailure(user.email, domain.domainName, result.message);
    }

    return NextResponse.json(
      {
        success: result.status === "renewed",
        phase: result.status,
        message: describeResult(domain.domainName, result),
        ...(result.status === "renewed" ? { expiryDate: result.expiryDate } : {}),
      },
      { status: result.status === "renewed" ? 200 : 422 }
    );
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
