import { NextRequest, NextResponse } from "next/server";
import { verifyChallengeFile } from "@/lib/acme";

/**
 * POST /api/ssl/challenge/verify
 * Checks that the challenge file is live and correct before telling LE to validate
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { domain, token, keyAuthorization } = body;

    if (!domain || !token || !keyAuthorization) {
      return NextResponse.json(
        { error: "domain, token and keyAuthorization are required" },
        { status: 400 }
      );
    }

    const result = await verifyChallengeFile(domain, token, keyAuthorization);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Challenge verify error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Verification failed" },
      { status: 500 }
    );
  }
}
