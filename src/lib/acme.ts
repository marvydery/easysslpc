import * as acme from "acme-client";

const ACME_DIRECTORY_URL =
  process.env.ACME_DIRECTORY_URL ||
  "https://acme-v02.api.letsencrypt.org/directory";

// ─── Bridge in-memory store ───────────────────────────────────────────────────
// Only lives for the duration of a single request — used by one-shot generate

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

// ─── Shared helper — exported so routes can use it ────────────────────────────

/**
 * Returns the list of domains to include in the certificate.
 * When includeWww=true, always returns [apex, www.apex].
 */
export function buildDomainList(domain: string, includeWww: boolean): string[] {
  if (!includeWww) return [domain];
  const apex = domain.startsWith("www.") ? domain.slice(4) : domain;
  return [apex, `www.${apex}`];
}

// ─── Parse a PEM certificate chain ───────────────────────────────────────────

function parseCertChain(chain: string): { certificate: string; caCertificate: string } {
  const blocks =
    chain.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
  if (blocks.length === 0) return { certificate: chain.trim(), caCertificate: "" };
  return {
    certificate: blocks[0] as string,
    caCertificate: blocks.slice(1).join("\n"),
  };
}

// ─── createAcmeChallenge — used by cron/renew to set up Bridge renewal ────────

export interface AcmeChallengeInfo {
  token: string;
  keyAuthorization: string;
  orderUrl: string;
  accountKeyPem: string;
  csrKeyPem: string;
  csrDer: Buffer;
}

/**
 * Creates an ACME order for a single domain and returns all the serialisable
 * data needed to resume it later (stored in acme_challenges table by the cron).
 * The Bridge file on the user's server will serve the challenge file when
 * Let's Encrypt comes to verify.
 */
export async function createAcmeChallenge(
  domain: string,
  email: string
): Promise<AcmeChallengeInfo> {
  const accountKey = await acme.crypto.createPrivateKey();
  const client = new acme.Client({ directoryUrl: ACME_DIRECTORY_URL, accountKey });

  await client.createAccount({
    termsOfServiceAgreed: true,
    contact: [`mailto:${email}`],
  });

  const [csrKey, csr] = await acme.crypto.createCsr({ commonName: domain });

  const order = await client.createOrder({
    identifiers: [{ type: "dns", value: domain }],
  });

  const authorizations = await client.getAuthorizations(order);
  const auth = authorizations[0];
  const challenge = auth.challenges.find((c: any) => c.type === "http-01");

  if (!challenge) throw new Error(`No HTTP-01 challenge available for ${domain}`);

  const keyAuthorization = await client.getChallengeKeyAuthorization(challenge);

  return {
    token: challenge.token,
    keyAuthorization,
    orderUrl: order.url,
    accountKeyPem: accountKey.toString(),
    csrKeyPem: csrKey.toString(),
    csrDer: csr, // Buffer — cron stores as base64
  };
}

// ─── One-shot generation (used by Bridge / cron renew) ───────────────────────

/**
 * Generates an SSL certificate in a single request.
 * Only suitable for the Bridge auto-renew path where the server itself
 * serves the challenge file automatically.
 */
export async function generateSSLCertificate(
  domain: string,
  email: string,
  useBridge: boolean = false,
  includeWww: boolean = false
): Promise<{
  certificate: string;
  privateKey: string;
  caCertificate: string;
  expiryDate: Date;
}> {
  const domainList = buildDomainList(domain, includeWww);

  const accountKey = await acme.crypto.createPrivateKey();
  const client = new acme.Client({
    directoryUrl: ACME_DIRECTORY_URL,
    accountKey,
    backoffAttempts: 5,
    backoffMin: 3000,
    backoffMax: 15000,
  });

  await client.createAccount({
    termsOfServiceAgreed: true,
    contact: [`mailto:${email}`],
  });

  const [key, csr] = await acme.crypto.createCsr({
    commonName: domainList[0],
    altNames: domainList.length > 1 ? domainList : undefined,
  });

  const order = await client.createOrder({
    identifiers: domainList.map((d) => ({ type: "dns", value: d })),
  });

  const authorizations = await client.getAuthorizations(order);

  for (const auth of authorizations) {
    const challenge = auth.challenges.find((c: any) => c.type === "http-01");
    if (!challenge) throw new Error(`No HTTP-01 challenge for ${auth.identifier.value}`);

    const keyAuthorization = await client.getChallengeKeyAuthorization(challenge);

    if (useBridge) {
      storeChallenge(auth.identifier.value, challenge.token, keyAuthorization);
    }

    await client.verifyChallenge(auth, challenge);
    await client.completeChallenge(challenge);
    await client.waitForValidStatus(challenge);

    if (useBridge) {
      clearChallenge(auth.identifier.value, challenge.token);
    }
  }

  await client.finalizeOrder(order, csr);
  const cert = await client.getCertificate(order);

  const { certificate, caCertificate } = parseCertChain(cert);

  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 90);

  return {
    certificate,
    privateKey: key.toString(),
    caCertificate,
    expiryDate,
  };
}

export async function renewSSLCertificate(
  domain: string,
  email: string,
  useBridge: boolean = true,
  includeWww: boolean = false
) {
  return generateSSLCertificate(domain, email, useBridge, includeWww);
}
