/**
 * Hosting panel connections: lets EasySSL renew and install certificates
 * through the customer's control panel instead of bridge.php.
 * Add a panel by writing an adapter and listing it in PANELS.
 */
import { randomBytes } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { panelConnections, type PanelConnection } from "@/lib/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import { checkChallengeServed } from "@/lib/http-probe";
import { CpanelAdapter, CPANEL_DEFAULT_PORT } from "./cpanel";
import { PanelAdapter, PanelError, PanelType } from "./types";

export { PanelError } from "./types";
export type { PanelType } from "./types";

export const PANELS: Record<PanelType, { label: string; available: boolean; defaultPort: number }> = {
  cpanel: { label: "cPanel", available: true, defaultPort: CPANEL_DEFAULT_PORT },
  plesk: { label: "Plesk", available: false, defaultPort: 8443 },
  directadmin: { label: "DirectAdmin", available: false, defaultPort: 2222 },
};

export function panelLabel(type: string): string {
  return PANELS[type as PanelType]?.label ?? type;
}

/** "https://server.host.com:2083/cpsess…" → "server.host.com:2083" */
export function normalizeHost(input: string, type: PanelType): string {
  const bare = input.trim().replace(/^[a-z]+:\/\//i, "").split(/[/?#]/)[0].toLowerCase();
  return /:\d+$/.test(bare) ? bare : `${bare}:${PANELS[type].defaultPort}`;
}

export function createAdapter(type: string, host: string, username: string, token: string): PanelAdapter {
  switch (type) {
    case "cpanel":
      return new CpanelAdapter({ host, username, token });
    default:
      throw new PanelError(`${panelLabel(type)} isn't supported yet.`);
  }
}

export function adapterFor(conn: PanelConnection): PanelAdapter {
  return createAdapter(conn.panelType, conn.host, conn.username, decrypt(conn.tokenEncrypted));
}

// ─── Storage ──────────────────────────────────────────────────────────────────

let tableReady: Promise<unknown> | null = null;

/** Creates the table on first use, so no manual migration is needed. */
export function ensurePanelTable() {
  tableReady ??= db
    .execute(sql`
      CREATE TABLE IF NOT EXISTS panel_connections (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        domain_id uuid NOT NULL UNIQUE REFERENCES domains(id) ON DELETE CASCADE,
        panel_type varchar(30) NOT NULL,
        host varchar(255) NOT NULL,
        username varchar(255) NOT NULL,
        token_encrypted text NOT NULL,
        last_status varchar(20),
        last_message text,
        last_checked_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `)
    .catch((err) => {
      tableReady = null; // retry next time
      throw err;
    });
  return tableReady;
}

export async function getPanelConnection(domainId: string): Promise<PanelConnection | null> {
  await ensurePanelTable();
  const [row] = await db.select().from(panelConnections).where(eq(panelConnections.domainId, domainId)).limit(1);
  return row ?? null;
}

/** domainId → panel type, for every connected domain (optionally one user's). */
export async function getPanelTypesByDomain(userId?: string): Promise<Record<string, string>> {
  try {
    await ensurePanelTable();
    const rows = await db
      .select({ domainId: panelConnections.domainId, panelType: panelConnections.panelType })
      .from(panelConnections)
      .where(userId ? eq(panelConnections.userId, userId) : undefined);
    return Object.fromEntries(rows.map((r) => [r.domainId, r.panelType]));
  } catch (err) {
    console.error("[panels] could not list connections:", err);
    return {};
  }
}

export async function savePanelConnection(input: {
  userId: string;
  domainId: string;
  panelType: PanelType;
  host: string;
  username: string;
  token: string;
}) {
  await ensurePanelTable();
  const values = {
    userId: input.userId,
    domainId: input.domainId,
    panelType: input.panelType,
    host: input.host,
    username: input.username,
    tokenEncrypted: encrypt(input.token),
    lastStatus: "ok",
    lastMessage: "Connected",
    lastCheckedAt: new Date(),
    updatedAt: new Date(),
  };
  await db
    .insert(panelConnections)
    .values(values)
    .onConflictDoUpdate({ target: panelConnections.domainId, set: values });
}

export async function deletePanelConnection(domainId: string, userId: string) {
  await ensurePanelTable();
  await db
    .delete(panelConnections)
    .where(and(eq(panelConnections.domainId, domainId), eq(panelConnections.userId, userId)));
}

export async function recordPanelStatus(id: string, status: "ok" | "error", message: string) {
  await db
    .update(panelConnections)
    .set({ lastStatus: status, lastMessage: message.slice(0, 1000), lastCheckedAt: new Date() })
    .where(eq(panelConnections.id, id))
    .catch(() => {});
}

// ─── End-to-end test ──────────────────────────────────────────────────────────

export type TestStep = { label: string; status: "pass" | "fail"; message: string };

/**
 * Proves renewal will work: finds the site's folder, confirms SSL access,
 * then writes a probe file and fetches it from the internet exactly as
 * Let's Encrypt will, for every hostname on the certificate.
 */
export async function testPanelConnection(
  adapter: PanelAdapter,
  type: string,
  apexDomain: string,
  hosts: string[]
): Promise<{ ok: boolean; steps: TestStep[] }> {
  const label = panelLabel(type);
  const steps: TestStep[] = [];
  const fail = (stepLabel: string, err: unknown) => {
    steps.push({
      label: stepLabel,
      status: "fail",
      message: err instanceof PanelError ? err.message : `Unexpected error: ${(err as Error)?.message ?? err}`,
    });
    return { ok: false, steps };
  };

  let docRoot: string;
  try {
    docRoot = await adapter.getDocRoot(apexDomain);
    steps.push({ label: `Connected to ${label}`, status: "pass", message: `Found the website folder for ${apexDomain}: ${docRoot}` });
  } catch (err) {
    return fail(`Connect to ${label}`, err);
  }

  try {
    await adapter.checkSslAccess();
    steps.push({ label: "Permission to install certificates", status: "pass", message: `This token can manage SSL in ${label}.` });
  } catch (err) {
    return fail("Permission to install certificates", err);
  }

  const probeName = `easyssl-probe-${randomBytes(6).toString("hex")}`;
  const probeContent = randomBytes(16).toString("hex");
  try {
    await adapter.writeChallenge(docRoot, probeName, probeContent);
  } catch (err) {
    return fail("Write the verification file", err);
  }

  try {
    let allServed = true;
    for (const host of hosts) {
      const served = await checkChallengeServed(host, probeName, probeContent);
      steps.push({
        label: `Let's Encrypt can verify ${host}`,
        status: served.ok ? "pass" : "fail",
        message: served.ok
          ? `A test file written through ${label} is visible at ${served.url}.`
          : `A test file written through ${label} isn't visible at ${served.url} (${served.reason}). Make sure ${host} points to this hosting account.`,
      });
      if (!served.ok) allServed = false;
    }
    return { ok: allServed, steps };
  } finally {
    await adapter.removeChallenge(docRoot, probeName);
  }
}
