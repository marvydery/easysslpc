import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, domains } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { apexOf } from "@/lib/acme";
import { BRIDGE_TEST_TOKEN, BRIDGE_VERSION } from "@/lib/bridge-kit";
import { probeUrl } from "@/lib/http-probe";
import { getRenewalDomainList } from "@/lib/renewal";
import { adapterFor, getPanelConnection, recordPanelStatus, testPanelConnection } from "@/lib/panels";

export const maxDuration = 30;

type Check = { label: string; status: "pass" | "fail" | "warn"; message: string };

/**
 * Tests the full path Let's Encrypt uses:
 * http://<host>/.well-known/acme-challenge/<token> → .htaccess → bridge.php → /api/bridge
 * When it fails, probes bridge.php directly to pinpoint which piece is broken.
 */
async function testBridgeChain(host: string, domainName: string): Promise<Check> {
  const base = `http://${host}/.well-known/acme-challenge`;
  const expected = `easyssl-bridge-ok ${domainName}`;

  const viaRewrite = await probeUrl(`${base}/${BRIDGE_TEST_TOKEN}`);
  if (viaRewrite.ok && viaRewrite.content.trim() === expected) {
    return { label: `Bridge working (${host})`, status: "pass", message: "Let's Encrypt can reach your bridge and it answers correctly." };
  }

  const direct = await probeUrl(`${base}/bridge.php?token=${BRIDGE_TEST_TOKEN}`);
  let message: string;
  if (direct.ok && direct.content.trim() === expected) {
    message = `bridge.php works, but the .htaccess rewrite is not active. Upload .htaccess to public_html/.well-known/acme-challenge/ (and make sure mod_rewrite is enabled).`;
  } else if (direct.ok && direct.content.trim().startsWith("easyssl-bridge-ok")) {
    message = `This bridge.php belongs to a different domain. Download bridge.php for ${domainName} again and re-upload it.`;
  } else if (direct.status === 404 && direct.content.trim() === "Not Found") {
    message = `bridge.php is installed but cannot reach EasySSL, or its secret is out of date. Download a fresh bridge.php and re-upload it.`;
  } else if (direct.status === 404) {
    message = `bridge.php was not found at ${base}/bridge.php. Upload it to public_html/.well-known/acme-challenge/.`;
  } else if (direct.status === 0) {
    message = `Could not connect to ${host} (${direct.error}). Check that the domain points to your hosting server.`;
  } else {
    message = `bridge.php returned an unexpected response (HTTP ${direct.status}). Make sure PHP is enabled for this folder.`;
  }
  return { label: `Bridge working (${host})`, status: "fail", message };
}

async function testAutoInstall(host: string): Promise<Check> {
  const res = await probeUrl(`http://${host}/.well-known/acme-challenge/bridge.php?action=info`);
  let info: any = null;
  try {
    info = JSON.parse(res.content);
  } catch {
    /* older bridge.php */
  }

  if (!info || typeof info.version !== "number") {
    return {
      label: "Automatic installation",
      status: "warn",
      message: `Your bridge.php is an older version. Download the new bridge.php (v${BRIDGE_VERSION}) so renewed certificates are installed automatically.`,
    };
  }
  if (info.uapi || info.api_token) {
    return {
      label: "Automatic installation",
      status: "pass",
      message: info.uapi
        ? "Renewed certificates will be installed automatically through cPanel."
        : "Renewed certificates will be installed automatically using your cPanel API token.",
    };
  }
  return {
    label: "Automatic installation",
    status: "warn",
    message:
      "Your host doesn't let PHP run cPanel's installer. Renewals still happen and are emailed to you. To install them automatically, create a cPanel API token (Security → Manage API Tokens) and paste it into bridge.php.",
  };
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const domainId = request.nextUrl.searchParams.get("domainId");
    if (!domainId) {
      return NextResponse.json({ error: "domainId required" }, { status: 400 });
    }

    const [user] = await db.select().from(users).where(eq(users.clerkId, userId)).limit(1);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const [domain] = await db
      .select()
      .from(domains)
      .where(and(eq(domains.id, domainId), eq(domains.userId, user.id)))
      .limit(1);
    if (!domain) return NextResponse.json({ error: "Domain not found" }, { status: 404 });

    const apexDomain = apexOf(domain.domainName);
    const checks: Check[] = [];

    checks.push({
      label: "Auto-Renewal Enabled",
      status: domain.autoRenewEnabled ? "pass" : "fail",
      message: domain.autoRenewEnabled
        ? "Auto-renewal is enabled for this domain"
        : "Auto-renewal is not enabled. Download bridge.php to enable it.",
    });

    const panel = await getPanelConnection(domain.id).catch(() => null);

    checks.push({
      label: "Renewal Date",
      status: domain.nextRenewalDate ? "pass" : "fail",
      message: domain.nextRenewalDate
        ? `Certificate expires ${new Date(domain.nextRenewalDate).toDateString()}. Renewal starts 30 days before that.`
        : "No certificate yet. Generate a certificate first.",
    });

    if (panel) {
      // Hosting panel: run the same end-to-end test used when connecting
      const result = await testPanelConnection(
        adapterFor(panel),
        panel.panelType,
        apexDomain,
        await getRenewalDomainList(domain)
      );
      checks.push(...result.steps);
      const firstFail = result.steps.find((s) => s.status === "fail");
      await recordPanelStatus(panel.id, result.ok ? "ok" : "error", firstFail?.message ?? "Connection test passed");
    } else {
      checks.push({
        label: "Bridge Secret",
        status: domain.bridgeSecret ? "pass" : "fail",
        message: domain.bridgeSecret
          ? "Bridge secret is configured"
          : "Connect your hosting panel, or download bridge.php to set up the bridge.",
      });
    }

    if (!panel && domain.bridgeSecret) {
      // Every name on the certificate must route through the bridge (e.g. apex + www)
      const hosts = await getRenewalDomainList(domain);
      const chainChecks = await Promise.all(hosts.map((h) => testBridgeChain(h, domain.domainName)));
      checks.push(...chainChecks);

      if (chainChecks.some((c) => c.status === "pass")) {
        checks.push(await testAutoInstall(apexDomain));
      }
    }

    const allPassed = checks.every((c) => c.status === "pass");
    const anyFailed = checks.some((c) => c.status === "fail");

    return NextResponse.json({
      success: true,
      domainName: apexDomain,
      allPassed,
      anyFailed,
      checks,
      summary: allPassed
        ? "Everything is set up correctly. Your certificate will renew and install automatically."
        : anyFailed
        ? "Some checks failed. Please fix the issues above."
        : "Renewal will work. See the note above about automatic installation.",
    });
  } catch (error: any) {
    console.error("[bridge/check] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
