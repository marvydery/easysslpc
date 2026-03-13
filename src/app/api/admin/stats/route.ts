/**
 * src/app/api/admin/stats/route.ts
 * GET — dashboard overview stats
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, domains, certificates } from "@/lib/db/schema";
import { eq, count, gte } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const [admin] = await db.select().from(users).where(eq(users.clerkId, userId)).limit(1);
    if (!admin?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalUsers,
      freeUsers,
      proUsers,
      lifetimeUsers,
      suspendedUsers,
      totalDomains,
      totalCerts,
      newUsersThisMonth,
    ] = await Promise.all([
      db.select({ count: count() }).from(users),
      db.select({ count: count() }).from(users).where(eq(users.subscriptionTier, "free")),
      db.select({ count: count() }).from(users).where(eq(users.subscriptionTier, "pro")),
      db.select({ count: count() }).from(users).where(eq(users.subscriptionTier, "lifetime")),
      db.select({ count: count() }).from(users).where(eq(users.isSuspended, true)),
      db.select({ count: count() }).from(domains),
      db.select({ count: count() }).from(certificates),
      db.select({ count: count() }).from(users).where(gte(users.createdAt, thirtyDaysAgo)),
    ]);

    return NextResponse.json({
      success: true,
      stats: {
        totalUsers: totalUsers[0].count,
        freeUsers: freeUsers[0].count,
        proUsers: proUsers[0].count,
        lifetimeUsers: lifetimeUsers[0].count,
        suspendedUsers: suspendedUsers[0].count,
        totalDomains: totalDomains[0].count,
        totalCerts: totalCerts[0].count,
        newUsersThisMonth: newUsersThisMonth[0].count,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
