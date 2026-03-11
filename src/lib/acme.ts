import * as acme from "acme-client";
import { encrypt, decrypt } from "./crypto";

const ACME_DIRECTORY_URL = process.env.ACME_DIRECTORY_URL || "https://acme-staging-v02.api.letsencrypt.org/directory";

// In-memory storage for ACME challenges (for Bridge protocol)
const challengeStore = new Map<string, string>();

/**
 * Store a challenge for a domain
 */
export function storeChallenge(domain: string, token: string, keyAuthorization: string) {
  const key = `${domain}:${token}`;
  challengeStore.set(key, keyAuthorization);
  console.log(`Challenge stored for ${domain} with token ${token}`);
}

/**
 * Retrieve a challenge for validation
 */
export function getChallenge(domain: string, token: string): string | undefined {
  const key = `${domain}:${token}`;
  return challengeStore.get(key);
}

/**
 * Clear a challenge after validation
 */
export function clearChallenge(domain: string, token: string) {
  const key = `${domain}:${token}`;
  challengeStore.delete(key);
}

/**
 * Generate SSL certificate using Let's Encrypt
 */
export async function generateSSLCertificate(
  domain: string,
  email: string,
  useBridge: boolean = false
): Promise<{
  certificate: string;
  privateKey: string;
  caCertificate: string;
  expiryDate: Date;
}> {
  try {
    // Create ACME client
    const accountKey = await acme.crypto.createPrivateKey();
    const client = new acme.Client({
      directoryUrl: ACME_DIRECTORY_URL,
      accountKey,
    });

    // Register account with Let's Encrypt
    await client.createAccount({
      termsOfServiceAgreed: true,
      contact: [`mailto:${email}`],
    });

    // Create CSR
    const [key, csr] = await acme.crypto.createCsr({
      commonName: domain,
    });

    // Create certificate order
    const order = await client.createOrder({
      identifiers: [{ type: "dns", value: domain }],
    });

    // Get authorizations
    const authorizations = await client.getAuthorizations(order);

    for (const auth of authorizations) {
      const challenge = auth.challenges.find((c: any) => c.type === "http-01");
      
      if (!challenge) {
        throw new Error("No HTTP-01 challenge found");
      }

      const keyAuthorization = await client.getChallengeKeyAuthorization(challenge);

      if (useBridge) {
        // Store challenge for Bridge protocol
        storeChallenge(domain, challenge.token, keyAuthorization);
      }

      // Return challenge details for manual verification (if not using bridge)
      console.log(`Challenge details for ${domain}:`);
      console.log(`Token: ${challenge.token}`);
      console.log(`Key Authorization: ${keyAuthorization}`);
      console.log(`URL: http://${domain}/.well-known/acme-challenge/${challenge.token}`);

      // Verify challenge (this will trigger the validation)
      await client.verifyChallenge(auth, challenge);

      // Wait for validation
      await client.completeChallenge(challenge);
      await client.waitForValidStatus(challenge);

      if (useBridge) {
        // Clear challenge after validation
        clearChallenge(domain, challenge.token);
      }
    }

    // Finalize order
    await client.finalizeOrder(order, csr);
    const cert = await client.getCertificate(order);

    // Parse certificate chain
    const certChain = cert.split("\n\n");
    const certificate = certChain[0];
    const caCertificate = certChain.slice(1).join("\n\n");

    // Calculate expiry date (90 days from now)
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 90);

    return {
      certificate,
      privateKey: key.toString(),
      caCertificate,
      expiryDate,
    };
  } catch (error) {
    console.error("Error generating SSL certificate:", error);
    throw error;
  }
}

/**
 * Renew SSL certificate (same as generate)
 */
export async function renewSSLCertificate(
  domain: string,
  email: string,
  useBridge: boolean = true
) {
  return generateSSLCertificate(domain, email, useBridge);
}
