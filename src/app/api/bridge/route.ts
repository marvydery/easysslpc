import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { domains, acmeChallenges } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { BRIDGE_TEST_TOKEN } from "@/lib/bridge-kit";

export const dynamic = "force-dynamic";

/**
 * GET /api/bridge?token=TOKEN&secret=BRIDGE_SECRET
 *
 * Called by bridge.php on the user's server when Let's Encrypt
 * requests the ACME challenge file during auto-renewal.
 * Returns the raw keyAuthorization string as plain text.
 *
 * The special token "easyssl-bridge-test" returns "easyssl-bridge-ok <domain>"
 * so "Check Auto Renewal" can test the whole chain end to end.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");
    const secret = request.nextUrl.searchParams.get("secret");

    if (!token || !secret) {
      return new NextResponse("Bad Request", { status: 400 });
    }

    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.bridgeSecret, secret))
      .limit(1);

    if (!domain) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const headers = { "Content-Type": "text/plain", "Cache-Control": "no-store" };

    if (token === BRIDGE_TEST_TOKEN) {
      return new NextResponse(`easyssl-bridge-ok ${domain.domainName}`, { status: 200, headers });
    }

    const [challenge] = await db
      .select()
      .from(acmeChallenges)
      .where(and(eq(acmeChallenges.userId, domain.userId), eq(acmeChallenges.token, token)))
      .limit(1);

    if (!challenge) {
      return new NextResponse("Not Found", { status: 404 });
    }

    return new NextResponse(challenge.keyAuthorization, { status: 200, headers });
  } catch (error: any) {
    console.error("[bridge] error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
