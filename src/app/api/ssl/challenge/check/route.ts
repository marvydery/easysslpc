import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, domains } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { checkChallengeServed } from "@/lib/http-probe";
import { getPendingChallenges } from "@/lib/renewal";

export const maxDuration = 30;

/**
 * POST /api/ssl/challenge/check
 * Body: { domainId: string }
 * Checks that ALL verification files for this domain (including www if applicable)
 * are reachable the way Let's Encrypt will fetch them (http, following redirects,
 * ignoring invalid certificates) and contain the correct content.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { domainId } = await request.json();
    if (!domainId) {
      return NextResponse.json({ error: "Domain ID is required" }, { status: 400 });
    }

    const [user] = await db.select().from(users).where(eq(users.clerkId, userId)).limit(1);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const [domain] = await db
      .select()
      .from(domains)
      .where(and(eq(domains.id, domainId), eq(domains.userId, user.id)))
      .limit(1);
    if (!domain) {
      return NextResponse.json({ error: "Domain not found or access denied" }, { status: 404 });
    }

    const pending = await getPendingChallenges(user.id, domain);
    if (pending.length === 0) {
      return NextResponse.json(
        { error: "No pending challenge found. Please restart the verification process." },
        { status: 400 }
      );
    }

    const results = await Promise.all(
      pending.map(async (ch) => {
        const served = await checkChallengeServed(ch.domain, ch.token, ch.keyAuthorization);
        if (served.ok) return { domain: ch.domain, ok: true };
        const error =
          served.reason === "file content does not match"
            ? `File content doesn't match. Re-download and re-upload the verification file for ${ch.domain}.`
            : `${served.url} — ${served.reason}. Make sure the file is uploaded to public_html/.well-known/acme-challenge/ and the domain points to your server.`;
        return { domain: ch.domain, ok: false, error };
      })
    );

    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      return NextResponse.json(
        { error: "One or more verification files are not accessible.", details: failed },
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
    return NextResponse.json({ error: error.message || "Verification check failed" }, { status: 500 });
  }
}
