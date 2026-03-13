import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, domains, acmeChallenges } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * GET /api/bridge?token=TOKEN&secret=BRIDGE_SECRET
 *
 * Called by bridge.php on the user's server when Let's Encrypt
 * requests the ACME challenge file during auto-renewal.
 * Returns the raw keyAuthorization string as plain text.
 */
export async function GET(request: NextRequest) {
  try {
    const token  = request.nextUrl.searchParams.get("token");
    const secret = request.nextUrl.searchParams.get("secret");

    if (!token || !secret) {
      return new NextResponse("Bad Request", { status: 400 });
    }

    // Find the domain that owns this bridge secret
    const [domainRow] = await db
      .select({ domain: domains, user: users })
      .from(domains)
      .innerJoin(users, eq(domains.userId, users.id))
      .where(eq(domains.bridgeSecret, secret))
      .limit(1);

    if (!domainRow) {
      return new NextResponse("Not Found", { status: 404 });
    }

    // Look up the challenge for this token
    const [challenge] = await db
      .select()
      .from(acmeChallenges)
      .where(
        and(
          eq(acmeChallenges.userId, domainRow.user.id),
          eq(acmeChallenges.token, token)
        )
      )
      .limit(1);

    if (!challenge) {
      return new NextResponse("Not Found", { status: 404 });
    }

    // Return plain text key authorization — exactly what LE expects
    return new NextResponse(challenge.keyAuthorization, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    console.error("[bridge] error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
