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
 * POST /api/ssl/generate
 * One-shot SSL generation used by the Bridge auto-renew flow.
 * (The manual UI flow uses /api/ssl/challenge/* instead.)
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { domain: domainName, email, useBridge = false, includeWww = false } = body;

    if (!domainName || !email) {
      return NextResponse.json(
        { error: "Domain and email are required" },
        { status: 400 }
      );
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!user.isAdmin) {
      const limit = getDomainLimit(user.subscriptionTier, user.isAdmin);
      const [{ value: domainCount }] = await db
        .select({ value: count() })
        .from(domains)
        .where(eq(domains.userId, user.id));

      if (domainCount >= limit) {
        return NextResponse.json(
          {
            error: `Domain limit reached. Your ${user.subscriptionTier} plan allows up to ${limit} domain${
              limit === 1 ? "" : "s"
            }. Please upgrade to add more.`,
          },
          { status: 403 }
        );
      }
    }

    const canUseBridge =
      user.subscriptionTier === "pro" || user.subscriptionTier === "lifetime";

    if (useBridge && !canUseBridge) {
      return NextResponse.json(
        { error: "Bridge feature requires Pro or Lifetime subscription" },
        { status: 403 }
      );
    }

    const sslResult = await generateSSLCertificate(domainName, email, useBridge, includeWww);

    const bridgeSecret = useBridge ? generateBridgeSecret() : null;
    const nextRenewalDate = new Date();
    nextRenewalDate.setDate(nextRenewalDate.getDate() + 75);

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

    const encryptedPrivateKey = encrypt(sslResult.privateKey);

    await db.insert(certificates).values({
      domainId: newDomain.id,
      crtBody: sslResult.certificate,
      keyBodyEncrypted: encryptedPrivateKey,
      caBundle: sslResult.caCertificate || null,
      expiryDate: sslResult.expiryDate,
    });

    const zip = new JSZip();
    zip.file(`${domainName}.crt`, sslResult.certificate);
    zip.file(`${domainName}.key`, sslResult.privateKey);
    if (sslResult.caCertificate) {
      zip.file(`${domainName}-ca-bundle.crt`, sslResult.caCertificate);
    }
    zip.file(
      "README.txt",
      `SSL Certificate for ${domainName}

Certificate: ${domainName}.crt
Private Key: ${domainName}.key
CA Bundle: ${domainName}-ca-bundle.crt${
        sslResult.caCertificate ? "" : " (not included)"
      }

Certificate expires: ${sslResult.expiryDate.toLocaleDateString()}
`
    );

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    return NextResponse.json({
      success: true,
      domainId: newDomain.id,
      expiryDate: sslResult.expiryDate,
      autoRenewEnabled: useBridge,
      certificateZip: zipBuffer.toString("base64"),
    });
  } catch (error: any) {
    console.error("SSL generation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate SSL certificate" },
      { status: 500 }
    );
  }
}
