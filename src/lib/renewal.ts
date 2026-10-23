/**
 * Shared certificate renewal logic, used by:
 *  - /api/cron/challenge  (creates renewal orders ~30 days before expiry)
 *  - /api/cron/finalize   (completes them once bridge.php serves the tokens)
 *  - /api/ssl/renew       (customer "Renew Certificate" button)
 *  - /api/admin/domains   (admin "Renew" button)
 *
 * bridge.php reads challenge tokens straight from the database via /api/bridge,
 * so an order can be created and finalized in the same request.
 */
import * as acme from "acme-client";
import JSZip from "jszip";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  acmeChallenges,
  certificates,
  domains,
  type AcmeChallenge,
  type Domain,
  type User,
} from "@/lib/db/schema";
import { encrypt } from "@/lib/crypto";
import {
  ACME_DIRECTORY_URL,
  apexOf,
  getCertDomains,
  getCertExpiry,
  parseCertChain,
} from "@/lib/acme";
import { checkChallengeServed, probeUrl } from "@/lib/http-probe";
import { sendAdminRenewalSuccess, sendCertificateEmail } from "@/lib/email";

/** Let's Encrypt pending orders expire after 7 days; recreate before that. */
const ORDER_MAX_AGE_MS = 6 * 24 * 60 * 60 * 1000;

export function isStale(rows: AcmeChallenge[]): boolean {
  return rows.some((r) => Date.now() - new Date(r.createdAt).getTime() > ORDER_MAX_AGE_MS);
}

/** Domains the renewed cert should cover — same names as the current cert. */
export async function getRenewalDomainList(domain: Domain): Promise<string[]> {
  const [latest] = await db
    .select({ crtBody: certificates.crtBody })
    .from(certificates)
    .where(eq(certificates.domainId, domain.id))
    .orderBy(desc(certificates.createdAt))
    .limit(1);

  const apex = apexOf(domain.domainName);
  const covered = latest ? getCertDomains(latest.crtBody) : [];
  if (covered.includes(apex) && covered.includes(`www.${apex}`)) return [apex, `www.${apex}`];
  return [domain.domainName];
}

/** Every name this domain row could have challenge rows for. */
function candidateNames(domain: Domain): string[] {
  const apex = apexOf(domain.domainName);
  return Array.from(new Set([domain.domainName, apex, `www.${apex}`]));
}

export async function getPendingChallenges(userId: string, domain: Domain): Promise<AcmeChallenge[]> {
  const rows = await db
    .select()
    .from(acmeChallenges)
    .where(and(eq(acmeChallenges.userId, userId), inArray(acmeChallenges.domain, candidateNames(domain))));
  if (rows.length === 0) return rows;
  // Only rows belonging to the same order are usable together
  const orderUrl = rows[0].orderUrl;
  return rows.filter((r) => r.orderUrl === orderUrl);
}

export async function clearPendingChallenges(userId: string, domain: Domain) {
  await db
    .delete(acmeChallenges)
    .where(and(eq(acmeChallenges.userId, userId), inArray(acmeChallenges.domain, candidateNames(domain))));
}

/** Creates a fresh Let's Encrypt order for the domain and stores its challenges. */
export async function createRenewalOrder(user: User, domain: Domain): Promise<AcmeChallenge[]> {
  const domainList = await getRenewalDomainList(domain);

  const accountKey = await acme.crypto.createPrivateKey();
  const client = new acme.Client({ directoryUrl: ACME_DIRECTORY_URL, accountKey });
  await client.createAccount({ termsOfServiceAgreed: true, contact: [`mailto:${user.email}`] });

  const [csrKey, csr] = await acme.crypto.createCsr({
    commonName: domainList[0],
    altNames: domainList,
  });

  const order = await client.createOrder({
    identifiers: domainList.map((d) => ({ type: "dns", value: d })),
  });
  const authorizations = await client.getAuthorizations(order);

  await clearPendingChallenges(user.id, domain);

  const rows: AcmeChallenge[] = [];
  for (const authz of authorizations) {
    const ch = authz.challenges.find((c) => c.type === "http-01");
    if (!ch) throw new Error(`No HTTP-01 challenge for ${authz.identifier.value}`);
    const keyAuthorization = await client.getChallengeKeyAuthorization(ch);

    const [row] = await db
      .insert(acmeChallenges)
      .values({
        userId: user.id,
        domain: authz.identifier.value,
        token: ch.token,
        keyAuthorization,
        orderUrl: order.url,
        accountKeyPem: accountKey.toString(),
        csrKeyPem: csrKey.toString(),
        csrDer: csr.toString("base64"),
      })
      .returning();
    rows.push(row);
  }
  return rows;
}

export interface InstallResult {
  installed: boolean;
  method: string;
  message: string;
}

export type FinalizeResult =
  | { status: "bridge_not_ready"; url: string; reason: string }
  | { status: "order_invalid"; message: string }
  | { status: "renewed"; expiryDate: Date; coveredDomains: string[]; install: InstallResult | null };

/**
 * Completes a pending order: confirms bridge.php serves every token, asks
 * Let's Encrypt to validate, stores the new cert, asks bridge.php to install
 * it, and emails the customer. Challenge rows are removed on success and on
 * any Let's Encrypt failure (a failed order can never be retried).
 */
export async function finalizeRenewal(
  user: User,
  domain: Domain,
  rows: AcmeChallenge[]
): Promise<FinalizeResult> {
  for (const row of rows) {
    const served = await checkChallengeServed(row.domain, row.token, row.keyAuthorization);
    if (!served.ok) return { status: "bridge_not_ready", url: served.url, reason: served.reason ?? "" };
  }

  const { accountKeyPem, csrKeyPem, csrDer, orderUrl } = rows[0];
  const client = new acme.Client({
    directoryUrl: ACME_DIRECTORY_URL,
    accountKey: accountKeyPem,
    backoffAttempts: 6,
    backoffMin: 2000,
    backoffMax: 8000,
  });

  let certChain: string;
  try {
    await client.createAccount({ termsOfServiceAgreed: true, contact: [`mailto:${user.email}`] });
    let order = await client.getOrder({ url: orderUrl } as acme.Order);
    if (order.status === "invalid") throw new Error("Let's Encrypt marked this order invalid");

    const authorizations = await client.getAuthorizations(order);
    for (const authz of authorizations) {
      if (authz.status === "valid") continue;
      const ch = authz.challenges.find((c) => c.type === "http-01");
      if (!ch) throw new Error(`No HTTP-01 challenge for ${authz.identifier.value}`);
      await client.completeChallenge(ch);
      await client.waitForValidStatus(ch);
    }

    if (order.status !== "valid") {
      order = await client.finalizeOrder(order, Buffer.from(csrDer, "base64"));
    }
    certChain = await client.getCertificate(order);
  } catch (err: any) {
    await clearPendingChallenges(user.id, domain);
    return { status: "order_invalid", message: err?.message || String(err) };
  }

  const { certificate, caCertificate } = parseCertChain(certChain);
  const expiryDate = getCertExpiry(certificate);
  const coveredDomains = rows.map((r) => r.domain);

  await db.insert(certificates).values({
    domainId: domain.id,
    crtBody: certificate,
    keyBodyEncrypted: encrypt(csrKeyPem),
    caBundle: caCertificate || null,
    expiryDate,
  });
  await db
    .update(domains)
    .set({ nextRenewalDate: expiryDate, challengeToken: null, challengeValue: null, updatedAt: new Date() })
    .where(eq(domains.id, domain.id));
  await clearPendingChallenges(user.id, domain);

  const install = domain.bridgeSecret ? await triggerBridgeInstall(domain) : null;

  const zip = new JSZip();
  zip.file(`${domain.domainName}.crt`, certificate);
  zip.file(`${domain.domainName}.key`, csrKeyPem);
  if (caCertificate) zip.file(`${domain.domainName}-ca-bundle.crt`, caCertificate);
  zip.file(
    "README.txt",
    `Renewed SSL Certificate\nDomains: ${coveredDomains.join(", ")}\nExpires: ${expiryDate.toUTCString()}\n`
  );
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

  // Email problems must not turn a successful renewal into a failure
  await sendCertificateEmail(user.email, domain.domainName, zipBuffer, {
    renewal: true,
    installed: install?.installed ?? false,
  }).catch((e) => console.error("[renewal] certificate email failed:", e));
  await sendAdminRenewalSuccess(user.email, domain.domainName, expiryDate);

  return { status: "renewed", expiryDate, coveredDomains, install };
}

/** Asks bridge.php (v2+) to pull the latest certificate and install it via cPanel. */
export async function triggerBridgeInstall(domain: Domain): Promise<InstallResult> {
  const url = `http://${apexOf(domain.domainName)}/.well-known/acme-challenge/bridge.php?action=install`;
  const res = await probeUrl(url, 45000);
  try {
    const data = JSON.parse(res.content);
    return {
      installed: !!data.installed,
      method: String(data.method ?? "none"),
      message: String(data.message ?? ""),
    };
  } catch {
    return {
      installed: false,
      method: "none",
      message: res.ok
        ? "This bridge.php is an older version without auto-install. Download the new bridge.php from your dashboard."
        : `Could not reach bridge.php (${res.error ?? `HTTP ${res.status}`}).`,
    };
  }
}

/** One-click renewal: reuse a usable pending order or create one, then finalize it. */
export async function renewNow(user: User, domain: Domain): Promise<FinalizeResult> {
  let rows = await getPendingChallenges(user.id, domain);
  if (rows.length === 0 || isStale(rows)) rows = await createRenewalOrder(user, domain);
  return finalizeRenewal(user, domain, rows);
}

/** Human-readable summary of a renewal result for dashboard messages. */
export function describeResult(domainName: string, result: FinalizeResult): string {
  switch (result.status) {
    case "renewed": {
      const base = `${domainName} renewed. New expiry: ${result.expiryDate.toDateString()}.`;
      if (result.install?.installed) return `${base} It was installed on your server automatically.`;
      const why = result.install ? ` Auto-install did not run: ${result.install.message}` : "";
      return `${base} The certificate has been emailed to you — install it in your hosting panel.${why}`;
    }
    case "bridge_not_ready":
      return `bridge.php is not serving the verification token at ${result.url} (${result.reason}). Run "Check Auto Renewal" to see what is wrong.`;
    case "order_invalid":
      return `Let's Encrypt could not validate ${domainName}: ${result.message}. Click Renew again to start a fresh attempt.`;
  }
}
