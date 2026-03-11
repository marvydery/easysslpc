import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, domains, certificates } from "@/lib/db/schema";
import { generateSSLCertificate } from "@/lib/acme";
import { encrypt, generateBridgeSecret } from "@/lib/crypto";
import { getDomainLimit } from "@/lib/plans";
import { eq, count } from "drizzle-orm";
import JSZip from "jszip";

/**
 * Generate SSL Certificate
 * POST /api/ssl/generate
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { domain: domainName, email, useBridge } = body;

    if (!domainName || !email) {
      return NextResponse.json(
        { error: "Domain and email are required" },
        { status: 400 }
      );
    }

    // Get or create user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Enforce domain limit
    if (!user.isAdmin) {
      const limit = getDomainLimit(user.subscriptionTier, false);
      const [{ value: domainCount }] = await db
        .select({ value: count() })
        .from(domains)
        .where(eq(domains.userId, user.id));

      if (domainCount >= limit) {
        return NextResponse.json(
          {
            error: `Domain limit reached. Your ${user.subscriptionTier} plan allows up to ${limit} domain${limit === 1 ? "" : "s"}. Please upgrade to add more.`,
          },
          { status: 403 }
        );
      }
    }

    // Check if user has access to bridge (Pro or Lifetime)
    const canUseBridge = user.subscriptionTier === "pro" || user.subscriptionTier === "lifetime";
    
    if (useBridge && !canUseBridge) {
      return NextResponse.json(
        { error: "Bridge feature requires Pro or Lifetime subscription" },
        { status: 403 }
      );
    }

    // Generate bridge secret if using bridge
    const bridgeSecret = useBridge ? generateBridgeSecret() : null;

    // Generate SSL certificate
    const sslResult = await generateSSLCertificate(domainName, email, useBridge);

    // Calculate next renewal date (75 days from now - renew at day 75 of 90)
    const nextRenewalDate = new Date();
    nextRenewalDate.setDate(nextRenewalDate.getDate() + 75);

    // Create domain record
    const [newDomain] = await db
      .insert(domains)
      .values({
        userId: user.id,
        domainName,
        bridgeSecret,
        nextRenewalDate: useBridge ? nextRenewalDate : null,
        autoRenewEnabled: useBridge,
      })
      .returning();

    // Encrypt private key
    const encryptedPrivateKey = encrypt(sslResult.privateKey);

    // Create certificate record
    await db.insert(certificates).values({
      domainId: newDomain.id,
      crtBody: sslResult.certificate,
      keyBodyEncrypted: encryptedPrivateKey,
      caBundle: sslResult.caCertificate,
      expiryDate: sslResult.expiryDate,
    });

    // Create ZIP file with certificates
    const zip = new JSZip();
    zip.file(`${domainName}.crt`, sslResult.certificate);
    zip.file(`${domainName}.key`, sslResult.privateKey);
    if (sslResult.caCertificate) {
      zip.file(`${domainName}-ca-bundle.crt`, sslResult.caCertificate);
    }
    zip.file("README.txt", `SSL Certificate for ${domainName}

Certificate: ${domainName}.crt
Private Key: ${domainName}.key
CA Bundle: ${domainName}-ca-bundle.crt

Installation instructions vary by server type. Please consult your hosting provider's documentation.

Certificate expires: ${sslResult.expiryDate.toLocaleDateString()}
`);

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    const base64Zip = zipBuffer.toString("base64");

    return NextResponse.json({
      success: true,
      domainId: newDomain.id,
      expiryDate: sslResult.expiryDate,
      autoRenewEnabled: useBridge,
      certificateZip: base64Zip,
    });
  } catch (error: any) {
    console.error("SSL generation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate SSL certificate" },
      { status: 500 }
    );
  }
}
