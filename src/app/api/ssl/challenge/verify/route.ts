import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, domains, certificates, acmeChallenges } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import * as acme from "acme-client";
import { encrypt } from "@/lib/crypto";
import JSZip from "jszip";

const ACME_DIRECTORY_URL =
  process.env.ACME_DIRECTORY_URL ||
  "https://acme-v02.api.letsencrypt.org/directory";

/**
 * Parse a PEM certificate chain into leaf cert + CA bundle.
 * Uses regex on PEM block boundaries — never splits on "\n\n"
 * which was the original CABundle bug.
 */
function parseCertChain(chain: string): { certificate: string; caCertificate: string } {
  const blocks =
    chain.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
  if (blocks.length === 0) return { certificate: chain.trim(), caCertificate: "" };
  return {
    certificate: blocks[0] as string,
    caCertificate: blocks.slice(1).join("\n"),
  };
}

/**
 * POST /api/ssl/challenge/verify
 * Body: { domainId: string, email: string }
 *
 * Resumes the ACME order stored in acme_challenges, completes http-01
 * validation for ALL domains (apex + www if applicable), issues the
 * certificate, saves it, and returns a ZIP download.
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
      .where(and(eq(domains.id, domainId), eq(domains.userId, user.id)))
      .limit(1);

    if (!domain) {
      return NextResponse.json(
        { error: "Domain not found or access denied" },
        { status: 404 }
      );
    }

    // Load all stored challenge rows for this user
    const apexDomain = domain.domainName.startsWith("www.")
      ? domain.domainName.slice(4)
      : domain.domainName;
    const wwwDomain = `www.${apexDomain}`;

    const allChallenges = await db
      .select()
      .from(acmeChallenges)
      .where(eq(acmeChallenges.userId, user.id));

    const storedChallenges = allChallenges.filter(
      (c) => c.domain === apexDomain || c.domain === wwwDomain
    );

    if (storedChallenges.length === 0) {
      return NextResponse.json(
        {
          error:
            "No pending challenge found. Please restart the verification process.",
        },
        { status: 400 }
      );
    }

    // All rows share the same order / account key / CSR — use first row
    const { orderUrl, accountKeyPem, csrKeyPem, csrDer } = storedChallenges[0];

    // Rebuild ACME client from stored PEM — acme-client accepts a KeyObject
    const { createPrivateKey } = await import("crypto");
    const accountKey = createPrivateKey(accountKeyPem);
    const client = new acme.Client({
      directoryUrl: ACME_DIRECTORY_URL,
      accountKey,
      backoffAttempts: 5,
      backoffMin: 3000,
      backoffMax: 15000,
    });

    // Re-register (idempotent)
    await client.createAccount({ termsOfServiceAgreed: true });

    // Resume the existing order by URL
    const order = { url: orderUrl } as acme.Order;
    const authorizations = await client.getAuthorizations(order);

    // Complete each http-01 challenge
    for (const auth of authorizations) {
      const challenge = auth.challenges.find((c: any) => c.type === "http-01");
      if (!challenge) {
        return NextResponse.json(
          { error: `No HTTP-01 challenge for ${auth.identifier.value}` },
          { status: 400 }
        );
      }

      try {
        await client.completeChallenge(challenge);
        await client.waitForValidStatus(challenge);
      } catch (err: any) {
        console.error(`ACME challenge failed for ${auth.identifier.value}:`, err);
        return NextResponse.json(
          {
            error: `Let's Encrypt could not verify the file for ${auth.identifier.value}.`,
            details: err.message,
            hint: "Make sure the verification file is accessible via plain HTTP (not HTTPS redirects) and contains exactly the right content.",
          },
          { status: 400 }
        );
      }
    }

    // Finalize order using the stored CSR
    const csrBuffer = Buffer.from(csrDer, "base64");
    await client.finalizeOrder(order, csrBuffer);
    const cert = await client.getCertificate(order);

    // ── Fix: parse chain by PEM block, not by "\n\n" ──────────────────────
    const { certificate, caCertificate } = parseCertChain(cert);

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 90);

    // Encrypt and store certificate
    const encryptedPrivateKey = encrypt(csrKeyPem);

    await db.insert(certificates).values({
      domainId: domain.id,
      crtBody: certificate,
      keyBodyEncrypted: encryptedPrivateKey,
      caBundle: caCertificate || null,
      expiryDate,
    });

    // Update domain — clear challenge data, set renewal date
    await db
      .update(domains)
      .set({
        challengeToken: null,
        challengeValue: null,
        nextRenewalDate: expiryDate,
        updatedAt: new Date(),
      })
      .where(eq(domains.id, domain.id));

    // Clean up acme_challenges rows
    await db
      .delete(acmeChallenges)
      .where(eq(acmeChallenges.userId, user.id));

    // Build ZIP
    const zip = new JSZip();
    zip.file(`${apexDomain}.crt`, certificate);
    zip.file(`${apexDomain}.key`, csrKeyPem);
    if (caCertificate) {
      zip.file(`${apexDomain}-ca-bundle.crt`, caCertificate);
    }

    const coveredDomains =
      storedChallenges.length > 1
        ? storedChallenges.map((c) => c.domain).join(", ")
        : apexDomain;

    zip.file(
      "README.txt",
      `SSL Certificate for ${apexDomain}
${"─".repeat(40)}
Domains covered : ${coveredDomains}
Certificate     : ${apexDomain}.crt
Private Key     : ${apexDomain}.key
CA Bundle       : ${
        caCertificate
          ? `${apexDomain}-ca-bundle.crt`
          : "(not included — not provided by CA for this issuance)"
      }

Certificate expires: ${expiryDate.toLocaleDateString()}

Installation instructions vary by server type.
Please consult your hosting provider's documentation.
`
    );

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    return NextResponse.json({
      success: true,
      domainId: domain.id,
      domainName: apexDomain,
      coveredDomains,
      expiryDate,
      certificateZip: zipBuffer.toString("base64"),
    });
  } catch (error: any) {
    console.error("Challenge verify error:", error);
    return NextResponse.json(
      {
        error: error.message || "Certificate issuance failed",
        hint: "Make sure the verification file is still accessible and try again.",
      },
      { status: 500 }
    );
  }
}
