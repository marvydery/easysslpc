import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, domains, acmeChallenges } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * POST /api/ssl/challenge/check
 * Body: { domainId: string }
 * Checks that ALL verification files for this domain (including www if applicable)
 * are accessible and contain the correct content before the user proceeds.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { domainId } = body;

    if (!domainId) {
      return NextResponse.json({ error: "Domain ID is required" }, { status: 400 });
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
      .where(and(eq(domains.id, domainId), eq(domains.userId, user.id)))
      .limit(1);

    if (!domain) {
      return NextResponse.json(
        { error: "Domain not found or access denied" },
        { status: 404 }
      );
    }

    // Load all challenge rows for this user's pending challenges
    // (covers both apex and www if includeWww was used)
    const storedChallenges = await db
      .select()
      .from(acmeChallenges)
      .where(eq(acmeChallenges.userId, user.id));

    // Filter to challenges relevant to this domain
    const apexDomain = domain.domainName.startsWith("www.")
      ? domain.domainName.slice(4)
      : domain.domainName;
    const wwwDomain = `www.${apexDomain}`;

    const relevantChallenges = storedChallenges.filter(
      (c) => c.domain === apexDomain || c.domain === wwwDomain
    );

    if (relevantChallenges.length === 0) {
      return NextResponse.json(
        { error: "No pending challenge found. Please restart the verification process." },
        { status: 400 }
      );
    }

    // Check every challenge file
    const results: Array<{ domain: string; ok: boolean; error?: string }> = [];

    for (const ch of relevantChallenges) {
      const url = `http://${ch.domain}/.well-known/acme-challenge/${ch.token}`;

      try {
        const response = await fetch(url, {
          method: "GET",
          headers: { "User-Agent": "EasySSL-Verification/1.0" },
          redirect: "follow",
        });

        if (!response.ok) {
          results.push({
            domain: ch.domain,
            ok: false,
            error: `File not accessible (HTTP ${response.status}). Make sure it's uploaded to public_html/.well-known/acme-challenge/`,
          });
          continue;
        }

        const content = await response.text();

        if (!content.trim().startsWith(ch.keyAuthorization.trim())) {
          results.push({
            domain: ch.domain,
            ok: false,
            error: `File content doesn't match. Re-download and re-upload the verification file for ${ch.domain}.`,
          });
          continue;
        }

        results.push({ domain: ch.domain, ok: true });
      } catch (err: any) {
        results.push({
          domain: ch.domain,
          ok: false,
          error: `Cannot reach ${url}. Make sure your domain points to your server. (${err.message})`,
        });
      }
    }

    const failed = results.filter((r) => !r.ok);

    if (failed.length > 0) {
      return NextResponse.json(
        {
          error: "One or more verification files are not accessible.",
          details: failed,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `All ${results.length} verification file${results.length > 1 ? "s" : ""} confirmed. You can now generate your SSL certificate.`,
      domainId: domain.id,
      domainName: domain.domainName,
      checked: results,
    });
  } catch (error: any) {
    console.error("Challenge check error:", error);
    return NextResponse.json(
      { error: error.message || "Verification check failed" },
      { status: 500 }
    );
  }
}
