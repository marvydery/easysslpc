import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, domains, certificates } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import * as acme from "acme-client";
import { encrypt } from "@/lib/crypto";
import { ACME_DIRECTORY_URL, apexOf, getCertExpiry, parseCertChain } from "@/lib/acme";
import { checkChallengeServed } from "@/lib/http-probe";
import { clearPendingChallenges, getPendingChallenges } from "@/lib/renewal";
import JSZip from "jszip";

// Let's Encrypt validation + issuance usually takes 5–30 seconds
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { domainId, email } = await request.json();
    if (!domainId || !email) {
      return NextResponse.json({ error: "Domain ID and email are required" }, { status: 400 });
    }

    const [user] = await db.select().from(users).where(eq(users.clerkId, userId)).limit(1);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const [domain] = await db
      .select()
      .from(domains)
      .where(and(eq(domains.id, domainId), eq(domains.userId, user.id)))
      .limit(1);
    if (!domain) return NextResponse.json({ error: "Domain not found" }, { status: 404 });

    const apexDomain = apexOf(domain.domainName);
    const stored = await getPendingChallenges(user.id, domain);
    if (stored.length === 0) {
      return NextResponse.json(
        { error: "No pending challenge found. Please restart the verification process." },
        { status: 400 }
      );
    }

    // Step 1: Confirm every file is reachable exactly as Let's Encrypt will fetch it
    for (const ch of stored) {
      const served = await checkChallengeServed(ch.domain, ch.token, ch.keyAuthorization);
      if (!served.ok) {
        return NextResponse.json(
          {
            error:
              served.reason === "file content does not match"
                ? `File content mismatch for ${ch.domain}. Re-download and re-upload the verification file.`
                : `${ch.domain}: cannot reach ${served.url} (${served.reason}). Make sure your domain points to your server.`,
          },
          { status: 400 }
        );
      }
    }

    const { accountKeyPem, csrKeyPem, csrDer, orderUrl } = stored[0];
    const domainList = stored.map((c) => c.domain);

    // Step 2: Resume the exact order the user uploaded files for, with the same account key
    const client = new acme.Client({
      directoryUrl: ACME_DIRECTORY_URL,
      accountKey: accountKeyPem,
      backoffAttempts: 8,
      backoffMin: 2000,
      backoffMax: 10000,
    });

    let certChain: string;
    try {
      await client.createAccount({ termsOfServiceAgreed: true, contact: [`mailto:${email}`] });
      let order = await client.getOrder({ url: orderUrl } as acme.Order);
      if (order.status === "invalid") throw new Error("This verification attempt has expired");

      const authorizations = await client.getAuthorizations(order);
      for (const authz of authorizations) {
        if (authz.status === "valid") continue;
        const challenge = authz.challenges.find((c) => c.type === "http-01");
        if (!challenge) throw new Error(`No HTTP-01 challenge for ${authz.identifier.value}`);
        await client.completeChallenge(challenge);
        await client.waitForValidStatus(challenge);
      }

      if (order.status !== "valid") {
        order = await client.finalizeOrder(order, Buffer.from(csrDer, "base64"));
      }
      certChain = await client.getCertificate(order);
    } catch (err: any) {
      // A failed order can never succeed — clear it so the user starts fresh
      await clearPendingChallenges(user.id, domain);
      return NextResponse.json(
        {
          error: `Let's Encrypt could not validate your domain: ${err.message}. Please start again from Step 1 to get new verification files.`,
          restart: true,
        },
        { status: 400 }
      );
    }

    // Step 3: Store the certificate
    const { certificate, caCertificate } = parseCertChain(certChain);
    const expiryDate = getCertExpiry(certificate);

    await db.insert(certificates).values({
      domainId: domain.id,
      crtBody: certificate,
      keyBodyEncrypted: encrypt(csrKeyPem),
      caBundle: caCertificate || null,
      expiryDate,
    });

    await db
      .update(domains)
      .set({ challengeToken: null, challengeValue: null, nextRenewalDate: expiryDate, updatedAt: new Date() })
      .where(eq(domains.id, domain.id));

    await clearPendingChallenges(user.id, domain);

    const zip = new JSZip();
    zip.file(`${apexDomain}.crt`, certificate);
    zip.file(`${apexDomain}.key`, csrKeyPem);
    if (caCertificate) zip.file(`${apexDomain}-ca-bundle.crt`, caCertificate);
    const coveredDomains = domainList.join(", ");
    zip.file(
      "README.txt",
      `SSL Certificate for ${apexDomain}\nDomains: ${coveredDomains}\nExpires: ${expiryDate.toUTCString()}\n`
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
    return NextResponse.json({ error: error.message || "Certificate issuance failed" }, { status: 500 });
  }
}
