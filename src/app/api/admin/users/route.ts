/**
 * src/app/api/admin/users/route.ts
 * GET  — list all users with domain/cert counts
 * POST — update user (tier, suspend, delete, impersonate)
 */
import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, domains, certificates } from "@/lib/db/schema";
import { eq, count, desc } from "drizzle-orm";

async function getAdminUser(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.clerkId, userId)).limit(1);
  if (!user?.isAdmin) return null;
  return user;
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = await getAdminUser(userId);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Get all users with domain counts
    const allUsers = await db
      .select()
      .from(users)
      .orderBy(desc(users.createdAt));

    // Get domain counts per user
    const domainCounts = await db
      .select({ userId: domains.userId, count: count() })
      .from(domains)
      .groupBy(domains.userId);

    const domainCountMap = Object.fromEntries(
      domainCounts.map((d) => [d.userId, d.count])
    );

    // Get active cert counts per user (via domain join)
    const certCounts = await db
      .select({ userId: domains.userId, count: count() })
      .from(certificates)
      .innerJoin(domains, eq(certificates.domainId, domains.id))
      .groupBy(domains.userId);

    const certCountMap = Object.fromEntries(
      certCounts.map((c) => [c.userId, c.count])
    );

    const result = allUsers.map((u) => ({
      id: u.id,
      email: u.email,
      clerkId: u.clerkId,
      subscriptionTier: u.subscriptionTier,
      isAdmin: u.isAdmin,
      isSuspended: u.isSuspended,
      domainCount: domainCountMap[u.id] ?? 0,
      certCount: certCountMap[u.id] ?? 0,
      createdAt: u.createdAt,
    }));

    return NextResponse.json({ success: true, users: result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = await getAdminUser(userId);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { action, targetUserId, tier } = await request.json();

    const [targetUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!targetUser) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (targetUser.isAdmin) return NextResponse.json({ error: "Cannot modify another admin" }, { status: 403 });

    switch (action) {
      case "change_tier":
        await db
          .update(users)
          .set({ subscriptionTier: tier, updatedAt: new Date() })
          .where(eq(users.id, targetUserId));
        return NextResponse.json({ success: true, message: `Tier updated to ${tier}` });

      case "suspend":
        await db
          .update(users)
          .set({ isSuspended: true, updatedAt: new Date() })
          .where(eq(users.id, targetUserId));
        return NextResponse.json({ success: true, message: "User suspended" });

      case "unsuspend":
        await db
          .update(users)
          .set({ isSuspended: false, updatedAt: new Date() })
          .where(eq(users.id, targetUserId));
        return NextResponse.json({ success: true, message: "User unsuspended" });

      case "delete":
        // Delete from DB (cascade handles domains/certs/challenges)
        await db.delete(users).where(eq(users.id, targetUserId));
        // Also delete from Clerk
        try {
          await clerkClient.users.deleteUser(targetUser.clerkId);
        } catch {}
        return NextResponse.json({ success: true, message: "User deleted" });

      case "impersonate":
        // Return a sign-in token for admin to impersonate
        const token = await clerkClient.users.createUserImpersonationToken({
          userId: targetUser.clerkId,
          expiresInSeconds: 3600,
        });
        return NextResponse.json({ success: true, token: token.token });

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
