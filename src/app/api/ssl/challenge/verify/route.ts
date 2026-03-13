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

function parseCertChain(chain: string): { certificate: string; caCertificate: string } {
  const blocks =
    chain.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
  if (blocks.length === 0) return { certificate: chain.trim(), caCertificate: "" };
  return {
    certificate: blocks[0] as string,
    caCertificate: blocks.slice(1).join("\n"),
  };
}

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

    const [user] = await db.select().from(users).where(eq(users.clerkId, userId)).limit(1);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const [domain] = await db
      .select()
      .from(domains)
      .where(and(eq(domains.id, domainId), eq(domains.userId, user.id)))
      .limit(1);
    if (!domain) return NextResponse.json({ error: "Domain not found" }, { status: 404 });

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
        { error: "No pending challenge found. Please restart the verification process." },
        { status: 400 }
      );
    }

    const { accountKeyPem, csrKeyPem, csrDer } = storedChallenges[0];
    const domainList = storedChallenges.map((c) => c.domain);
    const csrBuffer = Buffer.from(csrDer, "base64");

    // Rebuild client with the SAME account key used to create the order
    const client = new acme.Client({
      directoryUrl: ACME_DIRECTORY_URL,
      accountKey: accountKeyPem,
      backoffAttempts: 8,
      backoffMin: 2000,
      backoffMax: 10000,
    });

    // Re-register (idempotent — returns existing LE account)
    await client.createAccount({
      termsOfServiceAgreed: true,
      contact: [`mailto:${email}`],
    });

    // First verify all files are uploaded correctly before creating the order
    for (const stored of storedChallenges) {
      const url = `http://${stored.domain}/.well-known/acme-challenge/${stored.token}`;
      let fetchRes: Response;
      try {
        fetchRes = await fetch(url, { headers: { "User-Agent": "EasySSL/1.0" } });
      } catch {
        return NextResponse.json(
          { error: `Could not reach ${url}. Ensure your server is accessible over HTTP.` },
          { status: 400 }
        );
      }

      if (!fetchRes.ok) {
        return NextResponse.json(
          {
            error: `Verification file not found for ${stored.domain} (HTTP ${fetchRes.status}).`,
            hint: `Upload a file named "${stored.token}" to public_html/.well-known/acme-challenge/`,
          },
          { status: 400 }
        );
      }

      const content = await fetchRes.text();
      if (content.trim() !== stored.keyAuthorization.trim()) {
        return NextResponse.json(
          {
            error: `File content mismatch for ${stored.domain}.`,
            hint: `The file should contain exactly: ${stored.keyAuthorization}`,
          },
          { status: 400 }
        );
      }
    }

    // Files confirmed — now create a fresh order and complete challenges.
    // Since the same account key is used and files are already in place,
    // LE will validate immediately when we call completeChallenge.
    const order = await client.createOrder({
      identifiers: domainList.map((d) => ({ type: "dns", value: d })),
    });

    const authorizations = await client.getAuthorizations(order);

    for (const authz of authorizations) {
      const challenge = authz.challenges.find((c: any) => c.type === "http-01");
      if (!challenge) {
        return NextResponse.json(
          { error: `No HTTP-01 challenge for ${authz.identifier.value}` },
          { status: 400 }
        );
      }

      // The new order may have a different token — update the file check
      const keyAuthorization = await client.getChallengeKeyAuthorization(challenge);
      const url = `http://${authz.identifier.value}/.well-known/acme-challenge/${challenge.token}`;

      const fetchRes = await fetch(url, { headers: { "User-Agent": "EasySSL/1.0" } });

      if (!fetchRes.ok || (await fetchRes.text()).trim() !== keyAuthorization.trim()) {
        // Token changed — inform user they need to re-upload
        return NextResponse.json(
          {
            error: `Let's Encrypt issued a new challenge token for ${authz.identifier.value}.`,
            hint: `Please go back, download the new verification file, and upload it.`,
            newToken: challenge.token,
            newFileContent: keyAuthorization,
            needsRestart: true,
          },
          { status: 400 }
        );
      }

      await client.completeChallenge(challenge);
      await client.waitForValidStatus(challenge);
    }

    // Finalize and get certificate
    await client.finalizeOrder(order, csrBuffer);
    const certChain = await client.getCertificate(order);

    const { certificate, caCertificate } = parseCertChain(certChain);
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 90);

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

    await db.delete(acmeChallenges).where(eq(acmeChallenges.userId, user.id));

    // Build ZIP
    const zip = new JSZip();
    zip.file(`${apexDomain}.crt`, certificate);
    zip.file(`${apexDomain}.key`, csrKeyPem);
    if (caCertificate) zip.file(`${apexDomain}-ca-bundle.crt`, caCertificate);
    const coveredDomains = domainList.join(", ");
    zip.file(
      "README.txt",
      `SSL Certificate for ${apexDomain}\nDomains: ${coveredDomains}\nExpires: ${expiryDate.toLocaleDateString()}\n`
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
      { error: error.message || "Certificate issuance failed" },
      { status: 500 }
    );
  }
}
