import * as acme from "acme-client";

const ACME_DIRECTORY_URL =
  process.env.ACME_DIRECTORY_URL ||
  "https://acme-v02.api.letsencrypt.org/directory";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChallengeInfo {
  token: string;
  keyAuthorization: string;
  orderUrl: string;
  accountKeyPem: string;
  csrKeyPem: string;
  csrDer: Buffer;
}

export interface SSLResult {
  certificate: string;
  privateKey: string;
  caCertificate: string;
  expiryDate: Date;
}

// ─── Phase 1: Create ACME order and return challenge details ──────────────────

export async function createAcmeChallenge(
  domain: string,
  email: string
): Promise<ChallengeInfo> {
  const accountKey = await acme.crypto.createPrivateKey();
  const accountKeyPem = accountKey.toString();

  const client = new acme.Client({
    directoryUrl: ACME_DIRECTORY_URL,
    accountKey,
  });

  // Register ACME account
  await client.createAccount({
    termsOfServiceAgreed: true,
    contact: [`mailto:${email}`],
  });

  // Generate CSR key pair
  const [csrKey, csr] = await acme.crypto.createCsr({ commonName: domain });
  const csrKeyPem = csrKey.toString();
  const csrDer = csr;

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
  console.log(`[ACME] Verify URL: http://${domain}/.well-known/acme-challenge/${challenge.token}`);

  return {
    token: challenge.token,
    keyAuthorization,
    orderUrl: order.url,
    accountKeyPem,
    csrKeyPem,
    csrDer,
  };
}

// ─── Phase 1b: Verify challenge file is live before telling LE to validate ────

export async function verifyChallengeFile(
  domain: string,
  token: string,
  keyAuthorization: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const url = `http://${domain}/.well-known/acme-challenge/${token}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!response.ok) {
      return {
        success: false,
        error: `Challenge URL returned HTTP ${response.status}. Make sure the file is uploaded correctly.`,
      };
    }

    const content = await response.text();
    const trimmed = content.trim();

    if (trimmed !== keyAuthorization) {
      return {
        success: false,
        error: `File content mismatch. Expected: ${keyAuthorization} — Got: ${trimmed}`,
      };
    }

    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: `Could not reach challenge URL: ${err.message}`,
    };
  }
}

// ─── Phase 2: Finalise the order after challenge is verified ──────────────────

export async function finaliseAcmeOrder(
  domain: string,
  challengeInfo: ChallengeInfo
): Promise<SSLResult> {
  const { accountKeyPem, csrKeyPem, csrDer, orderUrl, token } = challengeInfo;

  const accountKey = Buffer.from(accountKeyPem);

  const client = new acme.Client({
    directoryUrl: ACME_DIRECTORY_URL,
    accountKey,
  });

  // Must call createAccount again so the client gets the account URL
  // This is idempotent — safe to call with an existing key
  await client.createAccount({
    termsOfServiceAgreed: true,
  });

  // Re-fetch the order
  const order = await client.getOrder({ url: orderUrl } as any);
  const authorizations = await client.getAuthorizations(order);
  const auth = authorizations[0];
  const challenge = auth.challenges.find(
    (c: any) => c.type === "http-01" && c.token === token
  );

  if (!challenge) {
    throw new Error("HTTP-01 challenge no longer available on this order.");
  }

  // Tell Let's Encrypt to validate
  await client.completeChallenge(challenge);
  await client.waitForValidStatus(challenge);

  console.log(`[ACME] Challenge validated for ${domain}`);

  // Finalise with the CSR from Phase 1
  await client.finalizeOrder(order, csrDer);
  const cert = await client.getCertificate(order);

  // Split PEM chain
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

// ─── Renewal ──────────────────────────────────────────────────────────────────

export async function renewSSLCertificate(
  domain: string,
  email: string
): Promise<ChallengeInfo> {
  return createAcmeChallenge(domain, email);
}
