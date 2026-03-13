import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, domains, acmeChallenges } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

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

    // Check if www was included by looking at stored acme_challenges
    const apexDomain = domain.domainName.startsWith("www.")
      ? domain.domainName.slice(4)
      : domain.domainName;
    const wwwDomain = `www.${apexDomain}`;

    const storedChallenges = await db
      .select()
      .from(acmeChallenges)
      .where(eq(acmeChallenges.userId, user.id));

    const includeWww = storedChallenges.some((c) => c.domain === wwwDomain);

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
