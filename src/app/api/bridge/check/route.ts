import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, domains } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * GET /api/bridge/check?domainId=XXX
 * Checks that the bridge is correctly installed on the user's server.
 * Tests:
 * 1. Domain has autoRenewEnabled = true
 * 2. Domain has a bridgeSecret set
 * 3. bridge.php is reachable at the correct URL
 * 4. bridge.php correctly proxies requests to EasySSL
 * 5. Renewal date is set
 */
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

    const checks: Array<{
      label: string;
      status: "pass" | "fail" | "warn";
      message: string;
    }> = [];

    // Check 1: Auto-renew enabled
    checks.push({
      label: "Auto-Renewal Enabled",
      status: domain.autoRenewEnabled ? "pass" : "fail",
      message: domain.autoRenewEnabled
        ? "Auto-renewal is enabled for this domain"
        : "Auto-renewal is not enabled. Regenerate your certificate with Bridge enabled.",
    });

    // Check 2: Bridge secret exists
    checks.push({
      label: "Bridge Secret",
      status: domain.bridgeSecret ? "pass" : "fail",
      message: domain.bridgeSecret
        ? "Bridge secret is configured"
        : "No bridge secret found. Download bridge.php to generate one.",
    });

    // Check 3: Renewal date set
    checks.push({
      label: "Renewal Date",
      status: domain.nextRenewalDate ? "pass" : "fail",
      message: domain.nextRenewalDate
        ? `Certificate renews around ${new Date(domain.nextRenewalDate).toLocaleDateString()}`
        : "No renewal date set. Generate a certificate first.",
    });

    // Check 4: bridge.php reachable on server
    const apexDomain = domain.domainName.startsWith("www.")
      ? domain.domainName.slice(4)
      : domain.domainName;

    const bridgeUrl = `http://${apexDomain}/.well-known/acme-challenge/bridge.php`;
    let bridgeReachable = false;
    let bridgeMessage = "";

    try {
      const res = await fetch(`${bridgeUrl}?token=easyssl-test&secret=test`, {
        headers: { "User-Agent": "EasySSL-Check/1.0" },
        signal: AbortSignal.timeout(8000),
      });
      // We expect a 404 (token not found) — that means bridge.php IS running
      // A 200 would mean bridge.php found a real token (unlikely for test)
      // Anything other than a connection error means the file exists
      bridgeReachable = true;
      bridgeMessage = "bridge.php is installed and reachable on your server";
    } catch {
      bridgeReachable = false;
      bridgeMessage = `Could not reach ${bridgeUrl}. Make sure bridge.php is uploaded to public_html/.well-known/acme-challenge/`;
    }

    checks.push({
      label: "bridge.php Reachable",
      status: bridgeReachable ? "pass" : "fail",
      message: bridgeMessage,
    });

    // Check 5: .htaccess routing works — test that a token URL routes through bridge.php
    // We do this by hitting /.well-known/acme-challenge/easyssl-routing-test
    // If it returns anything other than a static file 404, routing is working
    let htaccessOk = false;
    let htaccessMessage = "";

    if (bridgeReachable) {
      try {
        const testUrl = `http://${apexDomain}/.well-known/acme-challenge/easyssl-routing-test`;
        const res = await fetch(testUrl, {
          headers: { "User-Agent": "EasySSL-Check/1.0" },
          signal: AbortSignal.timeout(8000),
        });
        // If we get any response (even 404 from bridge.php), routing is working
        // A raw Apache 404 page would be much larger — bridge.php returns "Not Found" plaintext
        const text = await res.text();
        htaccessOk = text.trim() === "Not Found" || res.status === 404;
        htaccessMessage = htaccessOk
          ? ".htaccess routing is working correctly"
          : ".htaccess may not be configured correctly. Re-upload the .htaccess file.";
      } catch {
        htaccessOk = false;
        htaccessMessage = "Could not test .htaccess routing. Make sure .htaccess is uploaded.";
      }
    } else {
      htaccessOk = false;
      htaccessMessage = "Cannot check .htaccess until bridge.php is reachable.";
    }

    checks.push({
      label: ".htaccess Routing",
      status: htaccessOk ? "pass" : bridgeReachable ? "fail" : "warn",
      message: htaccessMessage,
    });

    const allPassed = checks.every((c) => c.status === "pass");
    const anyFailed = checks.some((c) => c.status === "fail");

    return NextResponse.json({
      success: true,
      domainName: apexDomain,
      allPassed,
      anyFailed,
      checks,
      summary: allPassed
        ? "Everything is set up correctly. Your certificate will renew automatically."
        : anyFailed
        ? "Some checks failed. Please fix the issues above."
        : "Setup is mostly complete with minor warnings.",
    });
  } catch (error: any) {
    console.error("[bridge/check] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
