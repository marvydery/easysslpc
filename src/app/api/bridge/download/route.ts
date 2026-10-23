import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, domains } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";
import { generateBridgePHP } from "@/lib/bridge-kit";

/**
 * GET /api/bridge/download?domainId=XXX
 * Returns a personalized bridge.php for the user's domain.
 * Generates and stores a bridgeSecret if not already set.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const domainId = request.nextUrl.searchParams.get("domainId");
    if (!domainId) {
      return NextResponse.json({ error: "domainId required" }, { status: 400 });
    }

    const [user] = await db.select().from(users).where(eq(users.clerkId, userId)).limit(1);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    if (!["pro", "lifetime"].includes(user.subscriptionTier) && !user.isAdmin) {
      return NextResponse.json(
        { error: "Bridge Protocol requires a Pro or Lifetime plan" },
        { status: 403 }
      );
    }

    const [domain] = await db
      .select()
      .from(domains)
      .where(and(eq(domains.id, domainId), eq(domains.userId, user.id)))
      .limit(1);

    if (!domain) return NextResponse.json({ error: "Domain not found" }, { status: 404 });

    let bridgeSecret = domain.bridgeSecret;
    if (!bridgeSecret) {
      bridgeSecret = randomBytes(32).toString("hex");
      await db
        .update(domains)
        .set({ bridgeSecret, autoRenewEnabled: true, updatedAt: new Date() })
        .where(eq(domains.id, domain.id));
    }

    // Fall back to the URL this request came in on, so bridge.php never points nowhere
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

    return new NextResponse(generateBridgePHP(domain.domainName, bridgeSecret, appUrl), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="bridge.php"`,
      },
    });
  } catch (error: any) {
    console.error("[bridge/download] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
