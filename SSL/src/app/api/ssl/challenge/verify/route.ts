import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, domains, certificates } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import * as acme from "acme-client";
import { encrypt } from "@/lib/crypto";
import JSZip from "jszip";

/**
 * POST /api/ssl/challenge/verify
 * Body: { domainId: string, email: string }
 * Generates SSL certificate (assumes domain is already verified by /challenge/check)
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

    // Verify file is still accessible before proceeding
    const verificationUrl = `http://${domain.domainName}/.well-known/acme-challenge/${domain.challengeToken}`;
    
    try {
      const response = await fetch(verificationUrl);
      if (!response.ok) {
        return NextResponse.json(
          {
            error: "Verification file is no longer accessible. Please ensure it's still uploaded.",
            verificationUrl,
          },
          { status: 400 }
        );
      }
      
      const content = await response.text();
      if (!content.trim().startsWith(domain.challengeValue.trim())) {
        return NextResponse.json(
          {
            error: "File content has changed. Please re-upload the correct file.",
          },
          { status: 400 }
        );
      }
    } catch (err: any) {
      return NextResponse.json(
        {
          error: "Cannot access verification file. Please ensure it's still uploaded.",
          details: err.message,
        },
        { status: 400 }
      );
    }

    // Create ACME client
    const accountKey = await acme.crypto.createPrivateKey();
    const client = new acme.Client({
      directoryUrl:
        process.env.ACME_DIRECTORY_URL ||
        "https://acme-staging-v02.api.letsencrypt.org/directory",
      accountKey,
      backoffAttempts: 5,
      backoffMin: 3000,
      backoffMax: 15000,
    });

    // Register account
    await client.createAccount({
      termsOfServiceAgreed: true,
      contact: [`mailto:${email}`],
    });

    // Create new order
    const order = await client.createOrder({
      identifiers: [{ type: "dns", value: domain.domainName }],
    });

    // Get authorizations
    const authorizations = await client.getAuthorizations(order);
    const authorization = authorizations[0];

    // Find the http-01 challenge
    const challenge = authorization.challenges.find(
      (c: any) => c.type === "http-01"
    );

    if (!challenge) {
      return NextResponse.json(
        { error: "HTTP-01 challenge not found" },
        { status: 400 }
      );
    }

    // Verify our stored token matches what ACME expects
    const expectedToken = challenge.token;
    const keyAuthorization = await client.getChallengeKeyAuthorization(challenge);
    
    console.log("Expected token:", expectedToken);
    console.log("Stored token:", domain.challengeToken);
    console.log("Key authorization:", keyAuthorization);
    console.log("Stored value:", domain.challengeValue);
    
    // The challenge value should match the key authorization
    if (domain.challengeValue !== keyAuthorization) {
      // Update the stored value to match
      await db
        .update(domains)
        .set({
          challengeValue: keyAuthorization,
          updatedAt: new Date(),
        })
        .where(eq(domains.id, domain.id));
    }

    // Complete challenge
    try {
      await client.completeChallenge(challenge);
      await client.waitForValidStatus(challenge);
    } catch (err: any) {
      console.error("ACME challenge completion error:", err);
      return NextResponse.json(
        {
          error: "Let's Encrypt could not verify the challenge file.",
          details: err.message,
          hint: "Make sure the file is accessible via HTTP (not HTTPS) and returns the exact content.",
        },
        { status: 400 }
      );
    }

    // Create CSR
    const [key, csr] = await acme.crypto.createCsr({
      commonName: domain.domainName,
    });

    // Finalize order and get certificate
    await client.finalizeOrder(order, csr);
    const cert = await client.getCertificate(order);

    // Parse certificate chain
    const certChain = cert.split("\n\n");
    const certificate = certChain[0];
    const caCertificate = certChain.slice(1).join("\n\n");

    // Calculate expiry (90 days from now for Let's Encrypt)
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 90);

    // Encrypt private key
    const encryptedPrivateKey = encrypt(key.toString());

    // Store certificate
    await db.insert(certificates).values({
      domainId: domain.id,
      crtBody: certificate,
      keyBodyEncrypted: encryptedPrivateKey,
      caBundle: caCertificate,
      expiryDate,
    });

    // Update domain to clear challenge data
    await db
      .update(domains)
      .set({
        challengeToken: null,
        challengeValue: null,
        nextRenewalDate: expiryDate,
        updatedAt: new Date(),
      })
      .where(eq(domains.id, domain.id));

    // Create ZIP file
    const zip = new JSZip();
    zip.file(`${domain.domainName}.crt`, certificate);
    zip.file(`${domain.domainName}.key`, key.toString());
    if (caCertificate) {
      zip.file(`${domain.domainName}-ca-bundle.crt`, caCertificate);
    }
    zip.file(
      "README.txt",
      `SSL Certificate for ${domain.domainName}

Certificate: ${domain.domainName}.crt
Private Key: ${domain.domainName}.key
CA Bundle: ${domain.domainName}-ca-bundle.crt

Installation instructions vary by server type. Please consult your hosting provider's documentation.

Certificate expires: ${expiryDate.toLocaleDateString()}
`
    );

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    const base64Zip = zipBuffer.toString("base64");

    return NextResponse.json({
      success: true,
      domainId: domain.id,
      domainName: domain.domainName,
      expiryDate,
      certificateZip: base64Zip,
    });
  } catch (error: any) {
    console.error("Challenge verification error:", error);
    return NextResponse.json(
      {
        error: error.message || "Challenge verification failed",
        hint: "Make sure you've completed the DNS/HTTP challenge setup correctly.",
      },
      { status: 500 }
    );
  }
}
