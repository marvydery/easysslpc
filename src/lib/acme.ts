import { X509Certificate } from "crypto";

export const ACME_DIRECTORY_URL =
  process.env.ACME_DIRECTORY_URL ||
  "https://acme-v02.api.letsencrypt.org/directory";

/**
 * Returns the list of domains to include in the certificate.
 * When includeWww=true, always returns [apex, www.apex].
 */
export function buildDomainList(domain: string, includeWww: boolean): string[] {
  if (!includeWww) return [domain];
  const apex = apexOf(domain);
  return [apex, `www.${apex}`];
}

export function apexOf(domain: string): string {
  return domain.startsWith("www.") ? domain.slice(4) : domain;
}

// ─── PEM helpers ──────────────────────────────────────────────────────────────

export function parseCertChain(chain: string): { certificate: string; caCertificate: string } {
  const blocks =
    chain.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
  if (blocks.length === 0) return { certificate: chain.trim(), caCertificate: "" };
  return {
    certificate: blocks[0] as string,
    caCertificate: blocks.slice(1).join("\n"),
  };
}

/** Real expiry from the certificate itself (falls back to now + 90 days). */
export function getCertExpiry(certPem: string): Date {
  try {
    return new Date(new X509Certificate(certPem).validTo);
  } catch {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + 90);
    return fallback;
  }
}

/** DNS names the certificate covers, e.g. ["example.com", "www.example.com"]. */
export function getCertDomains(certPem: string): string[] {
  try {
    const san = new X509Certificate(certPem).subjectAltName ?? "";
    return san
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.startsWith("DNS:"))
      .map((s) => s.slice(4).toLowerCase());
  } catch {
    return [];
  }
}
