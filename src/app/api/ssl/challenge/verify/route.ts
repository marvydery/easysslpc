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

/**
 * POST /api/ssl/challenge/verify
 * Body: { domainId, email }
 *
 * Uses acme-client's auto() method which handles the full challenge flow
 * internally — no need to resume a stale order URL.
 * The stored csrKey is reused so the issued cert matches what we expect.
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

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

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

    const apexDomain = domain.domainName.startsWith("www.")
      ? domain.domainName.slice(4)
      : domain.domainName;
    const wwwDomain = `www.${apexDomain}`;

    // Load stored challenge rows
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

    // Build a lookup of token → keyAuthorization for the challenge handler
    const challengeMap = new Map(
      storedChallenges.map((c) => [c.token, c.keyAuthorization])
    );

    // Rebuild client from stored account key
    const client = new acme.Client({
      directoryUrl: ACME_DIRECTORY_URL,
      accountKey: accountKeyPem,
      backoffAttempts: 8,
      backoffMin: 2000,
      backoffMax: 10000,
    });

    // Rebuild CSR from stored key + der
    const csrBuffer = Buffer.from(csrDer, "base64");

    // Use acme auto() — it creates a fresh order, handles all challenges,
    // and finalizes. We serve the challenge content from our stored map.
    let certChain: string;
    try {
      certChain = await client.auto({
        csr: csrBuffer,
        email,
        termsOfServiceAgreed: true,
        challengePriority: ["http-01"],
        challengeCreateFn: async (authz, challenge, keyAuthorization) => {
          // Verify the file is actually accessible before telling LE to check
          const url = `http://${authz.identifier.value}/.well-known/acme-challenge/${challenge.token}`;
          const res = await fetch(url, {
            headers: { "User-Agent": "EasySSL-Verification/1.0" },
          });
          if (!res.ok) {
            throw new Error(
              `Verification file not accessible at ${url} (HTTP ${res.status}). Please ensure the file is uploaded.`
            );
          }
          const content = await res.text();
          if (!content.trim().startsWith(keyAuthorization.trim())) {
            throw new Error(
              `File content mismatch for ${authz.identifier.value}. Please re-download and re-upload the verification file.`
            );
          }
        },
        challengeRemoveFn: async () => {
          // Nothing to remove — user keeps the file on their server
        },
      });
    } catch (err: any) {
      console.error("ACME auto error:", err);
      return NextResponse.json(
        {
          error: err.message || "Let's Encrypt could not verify your domain.",
          hint: "Make sure the verification file is accessible via plain HTTP and contains exactly the right content.",
        },
        { status: 400 }
      );
    }

    const { certificate, caCertificate } = parseCertChain(certChain);

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 90);

    const encryptedPrivateKey = encrypt(csrKeyPem);

    await db.insert(certificates).values({
      domainId: domain.id,
      crtBody: certificate,
      keyBodyEncrypted: encryptedPrivateKey,
      caBundle: caCertificate || null,
      expiryDate,
    });

    await db
      .update(domains)
      .set({ challengeToken: null, challengeValue: null, nextRenewalDate: expiryDate, updatedAt: new Date() })
      .where(eq(domains.id, domain.id));

    await db
      .delete(acmeChallenges)
      .where(eq(acmeChallenges.userId, user.id));

    // Build ZIP
    const zip = new JSZip();
    zip.file(`${apexDomain}.crt`, certificate);
    zip.file(`${apexDomain}.key`, csrKeyPem);
    if (caCertificate) zip.file(`${apexDomain}-ca-bundle.crt`, caCertificate);

    const coveredDomains = domainList.join(", ");
    zip.file("README.txt", `SSL Certificate for ${apexDomain}
${"─".repeat(40)}
Domains covered : ${coveredDomains}
Certificate     : ${apexDomain}.crt
Private Key     : ${apexDomain}.key
CA Bundle       : ${caCertificate ? `${apexDomain}-ca-bundle.crt` : "(not included)"}
Expires         : ${expiryDate.toLocaleDateString()}
`);

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
