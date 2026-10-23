import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, domains } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getPendingChallenges } from "@/lib/renewal";

export async function GET(
  request: NextRequest,
  { params }: { params: { domainId: string } }
) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const [domain] = await db
      .select()
      .from(domains)
      .where(and(eq(domains.id, params.domainId), eq(domains.userId, user.id)))
      .limit(1);

    if (!domain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    // Pending verification rows for this domain tell us whether www was requested
    const pending = await getPendingChallenges(user.id, domain);
    const includeWww = pending.some((c) => c.domain.startsWith("www."));

    return NextResponse.json({
      domain,
      userEmail: user.email,
      includeWww,
    });
  } catch (error: any) {
    console.error("GET /api/domains/[domainId] error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
