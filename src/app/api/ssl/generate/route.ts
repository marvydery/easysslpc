import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, domains, certificates, acmeChallenges } from "@/lib/db/schema";
import { prepareSSLChallenges, finalizeSSLCertificate, buildDomainList } from "@/lib/acme";
import { encrypt, generateBridgeSecret } from "@/lib/crypto";
import { getDomainLimit } from "@/lib/plans";
import { eq, count, and, inArray } from "drizzle-orm";
import JSZip from "jszip";

/**
 * POST /api/ssl/generate
 *
 * action: "prepare"
 *   → Creates ACME order, stores challenge rows in acme_challenges table,
 *     returns challenge details so the user can place the verification file.
 *
 * action: "finalize"
 *   → Reads challenge rows from DB, validates ownership with Let's Encrypt,
 *     issues cert, saves domain + certificate records, returns ZIP.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      action = "finalize",
      domain: domainName,
      email,
      useBridge = false,
      includeWww = false,
    } = body;

    if (!domainName || !email) {
      return NextResponse.json(
        { error: "Domain and email are required" },
        { status: 400 }
      );
    }

    // ── Resolve user ────────────────────────────────────────────────────────
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ── Bridge permission check ─────────────────────────────────────────────
    const canUseBridge =
      user.subscriptionTier === "pro" || user.subscriptionTier === "lifetime";

    if (useBridge && !canUseBridge) {
      return NextResponse.json(
        { error: "Bridge feature requires Pro or Lifetime subscription" },
        { status: 403 }
      );
    }

    // ════════════════════════════════════════════════════════════════════════
    // PREPARE — create ACME order and persist challenge data to DB
    // ════════════════════════════════════════════════════════════════════════
    if (action === "prepare") {
      // Enforce domain limit before creating a pending entry
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

      const prepared = await prepareSSLChallenges(domainName, email, includeWww);

      // Upsert one row per domain into acme_challenges
      // (unique constraint: userId + domain — delete old row first if exists)
      const domainList = buildDomainList(domainName, includeWww);

      // Clear any stale challenges for these domains
      if (domainList.length > 0) {
        await db
          .delete(acmeChallenges)
          .where(
            and(
              eq(acmeChallenges.userId, user.id),
              inArray(acmeChallenges.domain, domainList)
            )
          );
      }

      // Insert fresh challenge rows
      await db.insert(acmeChallenges).values(
        prepared.map((c) => ({
          userId: user.id,
          domain: c.domain,
          token: c.token,
          keyAuthorization: c.keyAuthorization,
          orderUrl: c.orderUrl,
          accountKeyPem: c.accountKeyPem,
          csrKeyPem: c.csrKeyPem,
          csrDer: c.csrDer,
        }))
      );

      return NextResponse.json({
        success: true,
        // Primary challenge (for single-domain backward compat in page.tsx)
        challenge: {
          token: prepared[0].token,
          keyAuthorization: prepared[0].keyAuthorization,
          filePath: prepared[0].filePath,
          fileContent: prepared[0].fileContent,
        },
        // All challenges — for www + non-www
        challenges: prepared.map((c) => ({
          domain: c.domain,
          token: c.token,
          keyAuthorization: c.keyAuthorization,
          filePath: c.filePath,
          fileContent: c.fileContent,
        })),
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // FINALIZE — load challenges from DB, validate, issue cert, save records
    // ════════════════════════════════════════════════════════════════════════

    const domainList = buildDomainList(domainName, includeWww);

    // Load all challenge rows for this user + domain(s) from DB
    const storedRows = await db
      .select()
      .from(acmeChallenges)
      .where(
        and(
          eq(acmeChallenges.userId, user.id),
          inArray(acmeChallenges.domain, domainList)
        )
      );

    if (storedRows.length === 0) {
      return NextResponse.json(
        {
          error:
            "No pending challenge found. Please restart the verification process.",
        },
        { status: 400 }
      );
    }

    // Issue the certificate
    const sslResult = await finalizeSSLCertificate(storedRows, useBridge);

    // Clean up challenge rows
    await db
      .delete(acmeChallenges)
      .where(
        and(
          eq(acmeChallenges.userId, user.id),
          inArray(acmeChallenges.domain, domainList)
        )
      );

    // ── Persist domain + certificate ────────────────────────────────────────
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

    // ── Build ZIP ───────────────────────────────────────────────────────────
    const zip = new JSZip();
    zip.file(`${domainName}.crt`, sslResult.certificate);
    zip.file(`${domainName}.key`, sslResult.privateKey);

    if (sslResult.caCertificate) {
      zip.file(`${domainName}-ca-bundle.crt`, sslResult.caCertificate);
    }

    const coveredDomains = includeWww
      ? domainList.join(", ")
      : domainName;

    zip.file(
      "README.txt",
      `SSL Certificate for ${domainName}
${"─".repeat(40)}
Domains covered : ${coveredDomains}
Certificate     : ${domainName}.crt
Private Key     : ${domainName}.key
CA Bundle       : ${
        sslResult.caCertificate
          ? `${domainName}-ca-bundle.crt`
          : "(not included — not provided by CA for this issuance)"
      }

Certificate expires: ${sslResult.expiryDate.toLocaleDateString()}

Installation instructions vary by server type.
Please consult your hosting provider's documentation.
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
