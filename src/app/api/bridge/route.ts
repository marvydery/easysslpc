import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { acmeChallenges, domains } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const domain = searchParams.get("domain");
    const token = searchParams.get("token");
    const secret = searchParams.get("secret");

    if (!domain || !token || !secret) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    const [domainRow] = await db.select().from(domains)
      .where(and(eq(domains.domainName, domain), eq(domains.bridgeSecret, secret)))
      .limit(1);

    if (!domainRow) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const [challenge] = await db.select().from(acmeChallenges)
      .where(and(eq(acmeChallenges.domain, domain), eq(acmeChallenges.token, token)))
      .limit(1);

    if (!challenge) {
      return new NextResponse("Not found", { status: 404 });
    }

    return new NextResponse(challenge.keyAuthorization, {
      headers: { "Content-Type": "text/plain" }
    });
  } catch (error) {
    console.error("Bridge API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
