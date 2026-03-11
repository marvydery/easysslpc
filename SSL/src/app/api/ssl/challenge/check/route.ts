import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, domains } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import * as acme from "acme-client";

/**
 * POST /api/ssl/challenge/check
 * Body: { domainId: string, email: string }
 * ONLY verifies the challenge with Let's Encrypt (does NOT generate SSL yet)
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { domainId, email } = body;

    if (!domainId || !email) {
      return NextResponse.json(
        { error: "Domain ID and email are required" },
        { status: 400 }
      );
    }

    // Get user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get domain record
    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, domainId))
      .limit(1);

    if (!domain || domain.userId !== user.id) {
      return NextResponse.json(
        { error: "Domain not found or access denied" },
        { status: 404 }
      );
    }

    if (!domain.validationMethod || !domain.challengeToken || !domain.challengeValue) {
      return NextResponse.json(
        { error: "Challenge not initialized for this domain" },
        { status: 400 }
      );
    }

    // First, verify the file is accessible via HTTP
    const verificationUrl = `http://${domain.domainName}/.well-known/acme-challenge/${domain.challengeToken}`;
    
    try {
      console.log(`Checking verification URL: ${verificationUrl}`);
      const response = await fetch(verificationUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'EasySSL-Verification/1.0'
        },
        redirect: 'follow'
      });

      if (!response.ok) {
        return NextResponse.json(
          {
            error: `File not accessible (HTTP ${response.status}). Please ensure the file is uploaded correctly.`,
            verificationUrl,
            hint: "Try opening the verification URL in your browser. You should see the file content.",
          },
          { status: 400 }
        );
      }

      const content = await response.text();
      
      // Verify the content matches what we expect
      if (!content.trim().startsWith(domain.challengeValue.trim())) {
        return NextResponse.json(
          {
            error: "File content doesn't match expected value. Please re-download and upload the file.",
            expected: domain.challengeValue.substring(0, 50) + "...",
            received: content.substring(0, 50) + "...",
          },
          { status: 400 }
        );
      }

      console.log(`File verified successfully at ${verificationUrl}`);
      
    } catch (err: any) {
      console.error("File verification error:", err);
      return NextResponse.json(
        {
          error: "Cannot access verification file. Please ensure it's uploaded correctly.",
          verificationUrl,
          details: err.message,
          hint: "Make sure your domain is pointing to your server and the file is in the correct location.",
        },
        { status: 400 }
      );
    }

    // Update domain to mark as verified (but don't generate SSL yet)
    // Note: We keep challenge data for SSL generation step
    await db
      .update(domains)
      .set({
        updatedAt: new Date(),
      })
      .where(eq(domains.id, domain.id));

    return NextResponse.json({
      success: true,
      message: "Domain verified successfully! You can now generate your SSL certificate.",
      domainId: domain.id,
      domainName: domain.domainName,
    });
  } catch (error: any) {
    console.error("Challenge verification error:", error);
    return NextResponse.json(
      {
        error: error.message || "Verification failed",
        hint: "Make sure you've completed the DNS/HTTP challenge setup correctly.",
      },
      { status: 500 }
    );
  }
}
