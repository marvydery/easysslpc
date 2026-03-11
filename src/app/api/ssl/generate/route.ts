import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, domains, certificates, acmeChallenges } from "@/lib/db/schema";
import { createAcmeChallenge, finaliseAcmeOrder } from "@/lib/acme";
import { encrypt, generateBridgeSecret } from "@/lib/crypto";
import { getDomainLimit } from "@/lib/plans";
import { eq, count, and } from "drizzle-orm";
import JSZip from "jszip";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ssl/generate
//
// Two-phase flow controlled by the `action` field in the request body:
//
//   action: "prepare"  → Phase 1: create ACME order, return challenge token
//                         so the user (or bridge) can serve the file.
//
//   action: "finalize" → Phase 2: tell Let's Encrypt to validate, issue cert.
//                         Must be called AFTER the challenge file is live.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { domain: domainName, email, useBridge, action = "prepare" } = body;

    if (!domainName || !email) {
      return NextResponse.json(
        { error: "Domain and email are required" },
        { status: 400 }
      );
    }

    if (!["prepare", "finalize"].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "prepare" or "finalize"' },
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

    // ── Enforce domain limit (on prepare only to avoid double-counting) ─────
    if (!user.isAdmin && action === "prepare") {
      const limit = getDomainLimit(user.subscriptionTier, false);
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
    // PHASE 1 — prepare: create ACME order, return challenge token to client
    // ════════════════════════════════════════════════════════════════════════
    if (action === "prepare") {
      const challengeInfo = await createAcmeChallenge(domainName, email);

      // Persist the challenge state in DB so Phase 2 can resume it.
      // You need an `acme_challenges` table (see schema note below).
      await db
        .insert(acmeChallenges)
        .values({
          userId: user.id,
          domain: domainName,
          token: challengeInfo.token,
          keyAuthorization: challengeInfo.keyAuthorization,
          orderUrl: challengeInfo.orderUrl,
          accountKeyPem: challengeInfo.accountKeyPem,
          csrKeyPem: challengeInfo.csrKeyPem,
          // Store csrDer as base64 string
          csrDer: challengeInfo.csrDer.toString("base64"),
          createdAt: new Date(),
        })
        // If user retries the prepare step, overwrite the previous record
        .onConflictDoUpdate({
          target: [acmeChallenges.userId, acmeChallenges.domain],
          set: {
            token: challengeInfo.token,
            keyAuthorization: challengeInfo.keyAuthorization,
            orderUrl: challengeInfo.orderUrl,
            accountKeyPem: challengeInfo.accountKeyPem,
            csrKeyPem: challengeInfo.csrKeyPem,
            csrDer: challengeInfo.csrDer.toString("base64"),
            createdAt: new Date(),
          },
        });

      return NextResponse.json({
        success: true,
        action: "prepare",
        challenge: {
          token: challengeInfo.token,
          keyAuthorization: challengeInfo.keyAuthorization,
          // Tell the frontend exactly what URL Let's Encrypt will check
          verifyUrl: `http://${domainName}/.well-known/acme-challenge/${challengeInfo.token}`,
        },
        message:
          "Challenge created. Serve the keyAuthorization at the verifyUrl, then call this endpoint with action=finalize.",
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 2 — finalize: validate challenge + issue certificate
    // ════════════════════════════════════════════════════════════════════════

    // Load the persisted challenge state
    const [saved] = await db
      .select()
      .from(acmeChallenges)
      .where(
        and(
          eq(acmeChallenges.userId, user.id),
          eq(acmeChallenges.domain, domainName)
        )
      )
      .limit(1);

    if (!saved) {
      return NextResponse.json(
        {
          error:
            'No pending challenge found for this domain. Please call action="prepare" first.',
        },
        { status: 400 }
      );
    }

    // Reconstruct ChallengeInfo from DB
    const challengeInfo = {
      token: saved.token,
      keyAuthorization: saved.keyAuthorization,
      orderUrl: saved.orderUrl,
      accountKeyPem: saved.accountKeyPem,
      csrKeyPem: saved.csrKeyPem,
      csrDer: Buffer.from(saved.csrDer, "base64"),
    };

    // ── Actually issue the certificate ──────────────────────────────────────
    const sslResult = await finaliseAcmeOrder(domainName, challengeInfo);

    // Clean up the challenge row – no longer needed
    await db
      .delete(acmeChallenges)
      .where(
        and(
          eq(acmeChallenges.userId, user.id),
          eq(acmeChallenges.domain, domainName)
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
      caBundle: sslResult.caCertificate,
      expiryDate: sslResult.expiryDate,
    });

    // ── Build ZIP ───────────────────────────────────────────────────────────
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
CA Bundle:   ${domainName}-ca-bundle.crt

Certificate expires: ${sslResult.expiryDate.toLocaleDateString()}
`
    );

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    const base64Zip = zipBuffer.toString("base64");

    return NextResponse.json({
      success: true,
      action: "finalize",
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
