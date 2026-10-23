/**
 * Live certificate scans: what a domain is actually serving on port 443.
 * Lets the dashboard show the truth when a certificate was installed outside
 * EasySSL, and keeps renewal timing aligned with the certificate in use.
 */
import { X509Certificate } from "crypto";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { certificates, domains, type Domain } from "@/lib/db/schema";
import { apexOf } from "@/lib/acme";
import { inspectCertificate } from "@/lib/ssl-inspect";

export interface LiveScan {
  domainId: string;
  valid: boolean;
  validTo: string | null;
  issuer: string | null;
  /** True when the live certificate is the latest one EasySSL issued */
  managedByEasySSL: boolean;
  error: string | null;
  checkedAt: string;
}

let tableReady: Promise<unknown> | null = null;

function ensureLiveScanTable() {
  tableReady ??= db
    .execute(sql`
      CREATE TABLE IF NOT EXISTS domain_live_scans (
        domain_id uuid PRIMARY KEY REFERENCES domains(id) ON DELETE CASCADE,
        valid boolean NOT NULL DEFAULT false,
        valid_to timestamp,
        issuer text,
        managed_by_easyssl boolean NOT NULL DEFAULT false,
        error text,
        checked_at timestamp NOT NULL DEFAULT now()
      )
    `)
    .catch((err) => {
      tableReady = null;
      throw err;
    });
  return tableReady;
}

type Row = {
  domain_id: string;
  valid: boolean;
  valid_to: Date | string | null;
  issuer: string | null;
  managed_by_easyssl: boolean;
  error: string | null;
  checked_at: Date | string;
};

const iso = (v: Date | string | null) => (v ? new Date(v).toISOString() : null);

function toScan(r: Row): LiveScan {
  return {
    domainId: r.domain_id,
    valid: r.valid,
    validTo: iso(r.valid_to),
    issuer: r.issuer,
    managedByEasySSL: r.managed_by_easyssl,
    error: r.error,
    checkedAt: iso(r.checked_at)!,
  };
}

/** Latest scan per domain, keyed by domain id. Never throws. */
export async function getLiveScans(domainIds: string[]): Promise<Record<string, LiveScan>> {
  if (domainIds.length === 0) return {};
  try {
    await ensureLiveScanTable();
    const ids = sql.join(domainIds.map((id) => sql`${id}::uuid`), sql`, `);
    const result: any = await db.execute(sql`SELECT * FROM domain_live_scans WHERE domain_id IN (${ids})`);
    const rows: Row[] = Array.isArray(result) ? result : result.rows ?? [];
    return Object.fromEntries(rows.map((r) => [r.domain_id, toScan(r)]));
  } catch (err) {
    console.error("[live-scan] could not read scans:", err);
    return {};
  }
}

function sha1Fingerprint(pem: string): string | null {
  try {
    return new X509Certificate(pem).fingerprint.toUpperCase();
  } catch {
    return null;
  }
}

/**
 * Reads the certificate the domain is serving, records it, and moves the
 * renewal date to match the certificate actually in use.
 */
export async function scanDomain(domain: Domain): Promise<LiveScan> {
  await ensureLiveScanTable();

  const [latest] = await db
    .select({ crtBody: certificates.crtBody, expiryDate: certificates.expiryDate })
    .from(certificates)
    .where(eq(certificates.domainId, domain.id))
    .orderBy(desc(certificates.createdAt))
    .limit(1);

  let scan: Omit<LiveScan, "checkedAt">;
  try {
    const live = await inspectCertificate(apexOf(domain.domainName));
    const ours = latest ? sha1Fingerprint(latest.crtBody) : null;
    const managed = !!ours && ours === live.fingerprint.toUpperCase();
    scan = {
      domainId: domain.id,
      valid: live.valid,
      validTo: live.validTo,
      issuer: live.issuer.O || live.issuer.CN || null,
      managedByEasySSL: managed,
      error: null,
    };

    // Renewal follows whichever certificate is really live
    if (live.valid && !managed) {
      await db
        .update(domains)
        .set({ nextRenewalDate: new Date(live.validTo), updatedAt: new Date() })
        .where(eq(domains.id, domain.id));
    } else if (managed && latest) {
      await db
        .update(domains)
        .set({ nextRenewalDate: latest.expiryDate, updatedAt: new Date() })
        .where(eq(domains.id, domain.id));
    }
  } catch (err: any) {
    scan = {
      domainId: domain.id,
      valid: false,
      validTo: null,
      issuer: null,
      managedByEasySSL: false,
      error: String(err?.message ?? err).slice(0, 500),
    };
  }

  await db.execute(sql`
    INSERT INTO domain_live_scans (domain_id, valid, valid_to, issuer, managed_by_easyssl, error, checked_at)
    VALUES (${scan.domainId}::uuid, ${scan.valid}, ${scan.validTo}, ${scan.issuer}, ${scan.managedByEasySSL}, ${scan.error}, now())
    ON CONFLICT (domain_id) DO UPDATE SET
      valid = EXCLUDED.valid,
      valid_to = EXCLUDED.valid_to,
      issuer = EXCLUDED.issuer,
      managed_by_easyssl = EXCLUDED.managed_by_easyssl,
      error = EXCLUDED.error,
      checked_at = now()
  `);

  return { ...scan, checkedAt: new Date().toISOString() };
}

/** Forget scans after EasySSL issues a new certificate (it will be live soon). */
export async function clearLiveScan(domainId: string) {
  try {
    await ensureLiveScanTable();
    await db.execute(sql`DELETE FROM domain_live_scans WHERE domain_id = ${domainId}::uuid`);
  } catch {
    /* non-critical */
  }
}
