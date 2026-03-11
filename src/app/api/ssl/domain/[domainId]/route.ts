import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, domains } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * GET /api/ssl/domain/[domainId]
 * Returns domain data for resuming verification
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { domainId: string } }
) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    // Get domain
    const [domain] = await db
      .select()
      .from(domains)
      .where(and(eq(domains.id, params.domainId), eq(domains.userId, user.id)))
      .limit(1);

    if (!domain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    // Generate instructions based on validation method
    const instructions =
      domain.validationMethod === "dns-01"
        ? {
            type: "DNS TXT Record",
            steps: [
              "Log in to your domain registrar or DNS provider",
              `Create a new TXT record with the following details:`,
              `• Name/Host: _acme-challenge (or _acme-challenge.${domain.domainName})`,
              `• Type: TXT`,
              `• Value: ${domain.challengeValue}`,
              `• TTL: 300 (5 minutes) or default`,
              "Wait 5-10 minutes for DNS propagation",
              "Click 'Verify Domain Ownership' below",
            ],
          }
        : {
            type: "HTTP File Upload",
            steps: [
              "Access your web server via FTP/SFTP or file manager",
              `Create this directory structure: /.well-known/acme-challenge/`,
              `Create a file named: ${domain.challengeToken}`,
              `Paste this content into the file: ${domain.challengeValue}`,
              `Ensure the file is accessible at: http://${domain.domainName}/.well-known/acme-challenge/${domain.challengeToken}`,
              "Click 'Verify Domain Ownership' below",
            ],
          };

    return NextResponse.json({
      domain: {
        id: domain.id,
        domainName: domain.domainName,
        validationMethod: domain.validationMethod,
        challengeToken: domain.challengeToken,
        challengeValue: domain.challengeValue,
      },
      instructions,
      email: user.email,
    });
  } catch (error: any) {
    console.error("Domain fetch error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch domain" },
      { status: 500 }
    );
  }
}
