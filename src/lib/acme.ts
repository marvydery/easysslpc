import * as acme from "acme-client";

const ACME_DIRECTORY_URL =
  process.env.ACME_DIRECTORY_URL ||
  "https://acme-v02.api.letsencrypt.org/directory";

// ─── Bridge in-memory store (only used during a single request lifetime) ──────

const challengeStore = new Map<string, string>();

export function storeChallenge(domain: string, token: string, keyAuthorization: string) {
  challengeStore.set(`${domain}:${token}`, keyAuthorization);
}
export function getChallenge(domain: string, token: string): string | undefined {
  return challengeStore.get(`${domain}:${token}`);
}
export function clearChallenge(domain: string, token: string) {
  challengeStore.delete(`${domain}:${token}`);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PreparedChallenge {
  domain: string;
  token: string;
  keyAuthorization: string;
  filePath: string;
  fileContent: string;
  /** Serialised state needed to resume this challenge later */
  orderUrl: string;
  accountKeyPem: string;
  csrKeyPem: string;
  csrDer: string; // base64
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function buildDomainList(domain: string, includeWww: boolean): string[] {
  if (!includeWww) return [domain];
  const isWww = domain.startsWith("www.");
  const apex = isWww ? domain.slice(4) : domain;
  const www = `www.${apex}`;
  // apex first → becomes commonName
  return [apex, www];
}

/** Correctly split a PEM chain into leaf cert + CA bundle */
function parseCertChain(chain: string): { certificate: string; caCertificate: string } {
  const blocks =
    chain.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
  if (blocks.length === 0) return { certificate: chain.trim(), caCertificate: "" };
  return {
    certificate: blocks[0],
    caCertificate: blocks.slice(1).join("\n"),
  };
}

// ─── Step 1: Prepare — create ACME order, return serialisable challenge data ──

/**
 * Creates an ACME order for all requested domains and returns the http-01
 * challenge details for each domain.  All state needed to resume the order
 * is returned as plain strings so the caller can persist them to the DB.
 */
export async function prepareSSLChallenges(
  domain: string,
  email: string,
  includeWww: boolean = false
): Promise<PreparedChallenge[]> {
  const domainList = buildDomainList(domain, includeWww);

  // One ACME client / account key covers the whole order
  const accountKey = await acme.crypto.createPrivateKey();
  const client = new acme.Client({ directoryUrl: ACME_DIRECTORY_URL, accountKey });

  await client.createAccount({
    termsOfServiceAgreed: true,
    contact: [`mailto:${email}`],
  });

  // Single CSR covering all domains (SAN)
  const [csrKey, csr] = await acme.crypto.createCsr({
    commonName: domainList[0],
    altNames: domainList.length > 1 ? domainList : undefined,
  });

  const order = await client.createOrder({
    identifiers: domainList.map((d) => ({ type: "dns", value: d })),
  });

  const authorizations = await client.getAuthorizations(order);
  const results: PreparedChallenge[] = [];

  for (const auth of authorizations) {
    const challenge = auth.challenges.find((c: any) => c.type === "http-01");
    if (!challenge) throw new Error(`No HTTP-01 challenge for ${auth.identifier.value}`);

    const keyAuthorization = await client.getChallengeKeyAuthorization(challenge);

    results.push({
      domain: auth.identifier.value,
      token: challenge.token,
      keyAuthorization,
      filePath: `/.well-known/acme-challenge/${challenge.token}`,
      fileContent: keyAuthorization,
      // Serialisable state — stored to DB so finalize works across serverless invocations
      orderUrl: order.url,
      accountKeyPem: accountKey.toString(),
      csrKeyPem: csrKey.toString(),
      csrDer: csr.toString("base64"),
    });
  }

  return results;
}

// ─── Step 2: Finalize — resume order from DB data, validate, issue cert ───────

export interface StoredChallenge {
  domain: string;
  token: string;
  keyAuthorization: string;
  orderUrl: string;
  accountKeyPem: string;
  csrKeyPem: string;
  csrDer: string; // base64
}

/**
 * Resumes an ACME order using data previously stored in the DB, validates
 * all http-01 challenges, and returns the issued certificate.
 */
export async function finalizeSSLCertificate(
  storedChallenges: StoredChallenge[],
  useBridge: boolean = false
): Promise<{
  certificate: string;
  privateKey: string;
  caCertificate: string;
  expiryDate: Date;
}> {
  if (storedChallenges.length === 0) throw new Error("No stored challenges provided");

  // All challenges share the same order / account key / CSR
  const { orderUrl, accountKeyPem, csrKeyPem, csrDer } = storedChallenges[0];

  const accountKey = await acme.crypto.createPrivateKey(accountKeyPem);
  const client = new acme.Client({ directoryUrl: ACME_DIRECTORY_URL, accountKey });

  // Re-register (idempotent — ACME allows this)
  await client.createAccount({ termsOfServiceAgreed: true });

  // Reconstruct order reference
  const order = { url: orderUrl } as acme.Order;
  const authorizations = await client.getAuthorizations(order);

  for (const auth of authorizations) {
    const challenge = auth.challenges.find((c: any) => c.type === "http-01");
    if (!challenge) throw new Error(`No HTTP-01 challenge for ${auth.identifier.value}`);

    const stored = storedChallenges.find((s) => s.domain === auth.identifier.value);
    if (!stored) throw new Error(`No stored data for ${auth.identifier.value}`);

    if (useBridge) storeChallenge(stored.domain, stored.token, stored.keyAuthorization);

    await client.verifyChallenge(auth, challenge);
    await client.completeChallenge(challenge);
    await client.waitForValidStatus(challenge);

    if (useBridge) clearChallenge(stored.domain, stored.token);
  }

  const csrBuffer = Buffer.from(csrDer, "base64");
  await client.finalizeOrder(order, csrBuffer);
  const cert = await client.getCertificate(order);

  const { certificate, caCertificate } = parseCertChain(cert);

  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 90);

  return {
    certificate,
    privateKey: csrKeyPem,
    caCertificate,
    expiryDate,
  };
}

// ─── Legacy one-shot (used by renewals) ──────────────────────────────────────

export async function generateSSLCertificate(
  domain: string,
  email: string,
  useBridge: boolean = false,
  includeWww: boolean = false
) {
  const challenges = await prepareSSLChallenges(domain, email, includeWww);
  return finalizeSSLCertificate(challenges, useBridge);
}

export async function renewSSLCertificate(
  domain: string,
  email: string,
  useBridge: boolean = true,
  includeWww: boolean = false
) {
  return generateSSLCertificate(domain, email, useBridge, includeWww);
}
