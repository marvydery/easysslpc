import { NextRequest, NextResponse } from "next/server";
import { getChallenge } from "@/lib/acme";

/**
 * Bridge API Endpoint
 * This endpoint is called by the bridge.php file on user's servers
 * to retrieve ACME challenge responses
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const domain = searchParams.get("domain");
    const token = searchParams.get("token");
    const secret = searchParams.get("secret");

    // Validate parameters
    if (!domain || !token || !secret) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    // TODO: Verify the bridge secret against the database
    // For now, we'll retrieve the challenge from memory
    const keyAuthorization = getChallenge(domain, token);

    if (!keyAuthorization) {
      return new NextResponse("Challenge not found", { status: 404 });
    }

    // Return the challenge response as plain text
    return new NextResponse(keyAuthorization, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  } catch (error) {
    console.error("Bridge API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
