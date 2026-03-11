import * as acme from "acme-client";
import { encrypt, decrypt } from "./crypto";

const ACME_DIRECTORY_URL =
  process.env.ACME_DIRECTORY_URL ||
  "https://acme-v02.api.letsencrypt.org/directory";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChallengeInfo {
  token: string;
  keyAuthorization: string;
  /** Serialised ACME order URL so we can resume it later */
  orderUrl: string;
  /** Serialised account private key so we reuse the same ACME account */
  accountKeyPem: string;
  /** The CSR private key – generated once, reused at finalise step */
  csrKeyPem: string;
  /** The DER-encoded CSR */
  csrDer: Buffer;
}

export interface SSLResult {
  certificate: string;
  privateKey: string;
  caCertificate: string;
  expiryDate: Date;
}

// ─── Phase 1: Create ACME order and return challenge details ──────────────────
//
// Call this when the user clicks "Verify Domain".
// Save the returned ChallengeInfo in your database so Phase 2 can resume it.

export async function createAcmeChallenge(
  domain: string,
  email: string
): Promise<ChallengeInfo> {
  // Create a fresh account key for this domain (persisted so we reuse it)
  const accountKey = await acme.crypto.createPrivateKey();
  const accountKeyPem = accountKey.toString();

  const client = new acme.Client({
    directoryUrl: ACME_DIRECTORY_URL,
    accountKey,
  });

  // Register (or retrieve existing) ACME account
  await client.createAccount({
    termsOfServiceAgreed: true,
    contact: [`mailto:${email}`],
  });

  // Generate CSR key pair once – we'll reuse these at finalise time
  const [csrKey, csr] = await acme.crypto.createCsr({ commonName: domain });
  const csrKeyPem = csrKey.toString();
  const csrDer = csr; // Buffer

  // Place the order
  const order = await client.createOrder({
    identifiers: [{ type: "dns", value: domain }],
  });

  // Get the HTTP-01 challenge
  const authorizations = await client.getAuthorizations(order);
  const auth = authorizations[0];
  const challenge = auth.challenges.find((c: any) => c.type === "http-01");

  if (!challenge) {
    throw new Error(
      "No HTTP-01 challenge available. Make sure the domain is publicly reachable on port 80."
    );
  }

  const keyAuthorization = await client.getChallengeKeyAuthorization(challenge);

  console.log(`[ACME] Challenge created for ${domain}`);
  console.log(`[ACME] Token: ${challenge.token}`);
  console.log(
    `[ACME] Verify URL: http://${domain}/.well-known/acme-challenge/${challenge.token}`
  );

  return {
    token: challenge.token,
    keyAuthorization,
    orderUrl: order.url,
    accountKeyPem,
    csrKeyPem,
    csrDer,
  };
}

// ─── Phase 2: Finalise the order after the challenge file is in place ─────────
//
// Call this when the user clicks "Generate SSL".
// Pass in the ChallengeInfo you saved in Phase 1.

export async function finaliseAcmeOrder(
  domain: string,
  challengeInfo: ChallengeInfo
): Promise<SSLResult> {
  const { accountKeyPem, csrKeyPem, csrDer, orderUrl, token, keyAuthorization } =
    challengeInfo;

 // Reconstruct the client with the *same* account key
const accountKey = Buffer.from(accountKeyPem);

  const client = new acme.Client({
    directoryUrl: ACME_DIRECTORY_URL,
    accountKey: Buffer.from(accountKeyPem),
  });

  // Re-fetch the order and its authorizations
  const order = await client.getOrder({ url: orderUrl } as any);
  const authorizations = await client.getAuthorizations(order);
  const auth = authorizations[0];
  const challenge = auth.challenges.find(
    (c: any) => c.type === "http-01" && c.token === token
  );

  if (!challenge) {
    throw new Error("HTTP-01 challenge no longer available on this order.");
  }

  // Tell Let's Encrypt to go and check the challenge file
  await client.completeChallenge(challenge);

  // Wait for LE to mark it valid (polls with back-off)
  await client.waitForValidStatus(challenge);

  console.log(`[ACME] Challenge validated for ${domain}`);

  // Finalise the order with the CSR we created in Phase 1
  await client.finalizeOrder(order, csrDer);
  const cert = await client.getCertificate(order);

  // Split the PEM chain: first block = leaf cert, rest = CA bundle
  const pemBlocks = cert
    .split(/(-----END CERTIFICATE-----\n?)/)
    .reduce<string[]>((acc, part, i, arr) => {
      if (part.startsWith("-----BEGIN")) acc.push(part + (arr[i + 1] ?? ""));
      return acc;
    }, []);

  const certificate = pemBlocks[0] ?? cert;
  const caCertificate = pemBlocks.slice(1).join("") ?? "";

  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 90);

  return {
    certificate,
    privateKey: csrKeyPem,
    caCertificate,
    expiryDate,
  };
}

// ─── Renewal (reuses the full two-phase flow) ─────────────────────────────────

export async function renewSSLCertificate(
  domain: string,
  email: string
): Promise<ChallengeInfo> {
  // Renewal just starts a fresh challenge – caller must serve the file and
  // call finaliseAcmeOrder() exactly like first issuance.
  return createAcmeChallenge(domain, email);
}
