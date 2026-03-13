import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, domains } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";
import { readFileSync } from "fs";
import path from "path";

/**
 * GET /api/bridge/download?domainId=XXX
 * Returns a personalized bridge.php for the user's domain.
 * Generates and stores a bridgeSecret if not already set.
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

    if (!["pro", "lifetime"].includes(user.subscriptionTier) && !user.isAdmin) {
      return NextResponse.json(
        { error: "Bridge Protocol requires a Pro or Lifetime plan" },
        { status: 403 }
      );
    }

    const [domain] = await db
      .select()
      .from(domains)
      .where(and(eq(domains.id, domainId), eq(domains.userId, user.id)))
      .limit(1);

    if (!domain) return NextResponse.json({ error: "Domain not found" }, { status: 404 });

    // Generate bridge secret if not already set
    let bridgeSecret = domain.bridgeSecret;
    if (!bridgeSecret) {
      bridgeSecret = randomBytes(32).toString("hex");
      await db
        .update(domains)
        .set({ bridgeSecret, updatedAt: new Date() })
        .where(eq(domains.id, domain.id));
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

    // Build personalized bridge.php
    const bridgePhp = `<?php
/**
 * EasySSL Bridge Protocol
 * ========================
 * Domain  : ${domain.domainName}
 * Generated: ${new Date().toLocaleDateString()}
 *
 * INSTALLATION:
 * 1. Upload this file to: public_html/.well-known/acme-challenge/bridge.php
 * 2. Upload the .htaccess file to: public_html/.well-known/acme-challenge/.htaccess
 * 3. That's it! Certificate renewals will happen automatically.
 *
 * DO NOT share this file — it contains your unique bridge secret.
 */

define('BRIDGE_SECRET', '${bridgeSecret}');
define('EASYSSL_API',   '${appUrl}/api/bridge');

$token = isset($_GET['token']) ? preg_replace('/[^a-zA-Z0-9_\\-]/', '', $_GET['token']) : '';

if (empty($token)) {
    http_response_code(400);
    exit('Bad Request');
}

$url = EASYSSL_API . '?' . http_build_query(['token' => $token, 'secret' => BRIDGE_SECRET]);
$response = @file_get_contents($url, false, stream_context_create([
    'http' => ['timeout' => 10, 'ignore_errors' => true],
]));

if ($response === false || empty(trim($response))) {
    http_response_code(404);
    exit('Not Found');
}

header('Content-Type: text/plain');
header('Cache-Control: no-store');
echo trim($response);
`;

    return new NextResponse(bridgePhp, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="bridge.php"`,
      },
    });
  } catch (error: any) {
    console.error("[bridge/download] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
