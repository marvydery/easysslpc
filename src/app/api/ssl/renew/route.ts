/**
 * POST /api/ssl/renew — customer-triggered renewal for an expired or expiring cert.
 * Creates (or reuses) a Let's Encrypt order and finalizes it in one request;
 * bridge.php serves the challenge tokens straight from the database.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, domains } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { describeResult, renewNow } from "@/lib/renewal";
import { getPanelConnection } from "@/lib/panels";
import { sendAdminRenewalFailure } from "@/lib/email";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { domainId } = await request.json();
    if (!domainId) return NextResponse.json({ error: "domainId required" }, { status: 400 });

    const [dbUser] = await db.select().from(users).where(eq(users.clerkId, userId)).limit(1);
    if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const [domain] = await db
      .select()
      .from(domains)
      .where(and(eq(domains.id, domainId), eq(domains.userId, dbUser.id)))
      .limit(1);
    if (!domain) return NextResponse.json({ error: "Domain not found" }, { status: 404 });

    if (dbUser.subscriptionTier === "free" && !dbUser.isAdmin) {
      return NextResponse.json({ error: "Renewal requires a Pro or Lifetime plan." }, { status: 403 });
    }
    if (!domain.bridgeSecret && !(await getPanelConnection(domain.id))) {
      return NextResponse.json(
        {
          success: false,
          phase: "bridge_not_ready",
          message: "Connect your hosting panel (or upload the bridge files) first.",
        },
        { status: 422 }
      );
    }

    const result = await renewNow(dbUser, domain);
    const message = describeResult(domain.domainName, result);

    if (result.status === "order_invalid") {
      await sendAdminRenewalFailure(dbUser.email, domain.domainName, result.message);
    }

    return NextResponse.json(
      {
        success: result.status === "renewed",
        phase: result.status === "order_invalid" ? "order_expired" : result.status,
        message,
        ...(result.status === "renewed"
          ? { expiryDate: result.expiryDate, installed: result.install?.installed ?? false }
          : {}),
      },
      { status: result.status === "renewed" ? 200 : 422 }
    );
  } catch (error: any) {
    console.error("[ssl/renew] Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Renewal failed" }, { status: 500 });
  }
}
