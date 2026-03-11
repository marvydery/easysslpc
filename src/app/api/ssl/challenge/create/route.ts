import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, domains } from "@/lib/db/schema";
import { eq, count, and } from "drizzle-orm";
import { getDomainLimit } from "@/lib/plans";
import * as acme from "acme-client";

/**
 * POST /api/ssl/challenge/create
 * Body: { domain: string, email: string, validationMethod: 'dns-01' | 'http-01' }
 * Returns: { challengeToken, challengeValue, recordName?, instructions }
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { domain: domainName, email, validationMethod } = body;

    if (!domainName || !email || !validationMethod) {
      return NextResponse.json(
        { error: "Domain, email, and validation method are required" },
        { status: 400 }
      );
    }

    if (!["dns-01", "http-01"].includes(validationMethod)) {
      return NextResponse.json(
        { error: "Validation method must be 'dns-01' or 'http-01'" },
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

    // Check domain limit
    if (!user.isAdmin) {
      const limit = getDomainLimit(user.subscriptionTier, false);
      const [{ value: domainCount }] = await db
        .select({ value: count() })
        .from(domains)
        .where(eq(domains.userId, user.id));

      if (domainCount >= limit) {
        return NextResponse.json(
          {
            error: `Domain limit reached. Your ${user.subscriptionTier} plan allows up to ${limit} domain${limit === 1 ? "" : "s"}.`,
          },
          { status: 403 }
        );
      }
    }

    // Create ACME client
    const accountKey = await acme.crypto.createPrivateKey();
    const client = new acme.Client({
      directoryUrl:
        process.env.ACME_DIRECTORY_URL ||
        "https://acme-staging-v02.api.letsencrypt.org/directory",
      accountKey,
    });

    // Register account
    await client.createAccount({
      termsOfServiceAgreed: true,
      contact: [`mailto:${email}`],
    });

    // Create order
    const order = await client.createOrder({
      identifiers: [{ type: "dns", value: domainName }],
    });

    // Get authorizations
    const authorizations = await client.getAuthorizations(order);
    const authorization = authorizations[0];

    // Find the requested challenge type
    const challenge = authorization.challenges.find(
      (c: any) => c.type === validationMethod
    );

    if (!challenge) {
      return NextResponse.json(
        { error: `${validationMethod} challenge not available for this domain` },
        { status: 400 }
      );
    }

    const keyAuthorization = await client.getChallengeKeyAuthorization(challenge);

    // For DNS-01, compute the TXT record value
    let challengeValue = keyAuthorization;
    let recordName = `_acme-challenge.${domainName}`;

    if (validationMethod === "dns-01") {
      // Hash the key authorization for DNS TXT record
      const crypto = await import("crypto");
      challengeValue = crypto
        .createHash("sha256")
        .update(keyAuthorization)
        .digest("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
    }

    // Check if domain already exists for this user
    const existingDomains = await db
      .select()
      .from(domains)
      .where(and(eq(domains.userId, user.id), eq(domains.domainName, domainName)))
      .limit(1);

    let domainRecord;
    if (existingDomains.length > 0) {
      // Update existing domain with new challenge data
      const [updated] = await db
        .update(domains)
        .set({
          validationMethod,
          challengeToken: challenge.token,
          challengeValue: keyAuthorization,
          updatedAt: new Date(),
        })
        .where(eq(domains.id, existingDomains[0].id))
        .returning();
      domainRecord = updated;
    } else {
      // Create new domain record
      const [created] = await db
        .insert(domains)
        .values({
          userId: user.id,
          domainName,
          validationMethod,
          challengeToken: challenge.token,
          challengeValue: keyAuthorization,
        })
        .returning();
      domainRecord = created;
    }

    // Return instructions based on method
    const instructions =
      validationMethod === "dns-01"
        ? {
            type: "DNS TXT Record",
            steps: [
              "Log in to your domain registrar or DNS provider",
              `Create a new TXT record with the following details:`,
              `• Name/Host: _acme-challenge (or _acme-challenge.${domainName})`,
              `• Type: TXT`,
              `• Value: ${challengeValue}`,
              `• TTL: 300 (5 minutes) or default`,
              "Wait 5-10 minutes for DNS propagation",
              "Click 'Verify & Generate SSL' below",
            ],
          }
        : {
            type: "HTTP File Upload",
            steps: [
              "Access your web server via FTP/SFTP or file manager",
              `Create this directory structure: /.well-known/acme-challenge/`,
              `Create a file named: ${challenge.token}`,
              `Paste this content into the file: ${keyAuthorization}`,
              `Ensure the file is accessible at: http://${domainName}/.well-known/acme-challenge/${challenge.token}`,
              "Click 'Verify & Generate SSL' below",
            ],
          };

    return NextResponse.json({
      success: true,
      domainId: domainRecord.id,
      validationMethod,
      challengeToken: challenge.token,
      challengeValue: validationMethod === "dns-01" ? challengeValue : keyAuthorization,
      recordName: validationMethod === "dns-01" ? recordName : undefined,
      instructions,
      verificationUrl:
        validationMethod === "http-01"
          ? `http://${domainName}/.well-known/acme-challenge/${challenge.token}`
          : undefined,
    });
  } catch (error: any) {
    console.error("Challenge creation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create challenge" },
      { status: 500 }
    );
  }
}
