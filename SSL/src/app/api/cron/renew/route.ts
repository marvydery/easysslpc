import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, domains, certificates } from "@/lib/db/schema";
import { renewSSLCertificate } from "@/lib/acme";
import { encrypt } from "@/lib/crypto";
import { sendCertificateEmail } from "@/lib/email";
import { eq, and, lte } from "drizzle-orm";
import JSZip from "jszip";

/**
 * Renewal Cron Job
 * GET /api/cron/renew?key=RENEWAL_CRON_KEY
 * 
 * This endpoint should be called daily by a cron service (e.g., Vercel Cron, GitHub Actions)
 * It checks for domains that need renewal (< 15 days until expiry) and renews them automatically
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron key
    const cronKey = request.nextUrl.searchParams.get("key");
    if (cronKey !== process.env.RENEWAL_CRON_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find domains that need renewal (next renewal date is today or earlier)
    const today = new Date();
    const domainsToRenew = await db
      .select({
        domain: domains,
        user: users,
      })
      .from(domains)
      .innerJoin(users, eq(domains.userId, users.id))
      .where(
        and(
          eq(domains.autoRenewEnabled, true),
          lte(domains.nextRenewalDate, today)
        )
      );

    console.log(`Found ${domainsToRenew.length} domains to renew`);

    const results = [];

    for (const { domain, user } of domainsToRenew) {
      try {
        console.log(`Renewing certificate for ${domain.domainName}`);

        // Renew SSL certificate
        const sslResult = await renewSSLCertificate(
          domain.domainName,
          user.email,
          true // Use bridge for renewal
        );

        // Encrypt private key
        const encryptedPrivateKey = encrypt(sslResult.privateKey);

        // Create new certificate record
        await db.insert(certificates).values({
          domainId: domain.id,
          crtBody: sslResult.certificate,
          keyBodyEncrypted: encryptedPrivateKey,
          caBundle: sslResult.caCertificate,
          expiryDate: sslResult.expiryDate,
        });

        // Update next renewal date (75 days from now)
        const nextRenewalDate = new Date();
        nextRenewalDate.setDate(nextRenewalDate.getDate() + 75);

        await db
          .update(domains)
          .set({ nextRenewalDate })
          .where(eq(domains.id, domain.id));

        // Create ZIP file with certificates
        const zip = new JSZip();
        zip.file(`${domain.domainName}.crt`, sslResult.certificate);
        zip.file(`${domain.domainName}.key`, sslResult.privateKey);
        if (sslResult.caCertificate) {
          zip.file(`${domain.domainName}-ca-bundle.crt`, sslResult.caCertificate);
        }
        zip.file("README.txt", `SSL Certificate for ${domain.domainName}

Certificate: ${domain.domainName}.crt
Private Key: ${domain.domainName}.key
CA Bundle: ${domain.domainName}-ca-bundle.crt

This is an automatically renewed certificate.

Certificate expires: ${sslResult.expiryDate.toLocaleDateString()}
Next renewal: ${nextRenewalDate.toLocaleDateString()}
`);

        const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

        // Send email with new certificate
        await sendCertificateEmail(
          user.email,
          domain.domainName,
          zipBuffer
        );

        results.push({
          domain: domain.domainName,
          status: "success",
          expiryDate: sslResult.expiryDate,
        });

        console.log(`Successfully renewed certificate for ${domain.domainName}`);
      } catch (error: any) {
        console.error(`Failed to renew ${domain.domainName}:`, error);
        results.push({
          domain: domain.domainName,
          status: "failed",
          error: error.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      renewed: results.filter((r) => r.status === "success").length,
      failed: results.filter((r) => r.status === "failed").length,
      results,
    });
  } catch (error: any) {
    console.error("Renewal cron error:", error);
    return NextResponse.json(
      { error: error.message || "Renewal cron failed" },
      { status: 500 }
    );
  }
}
