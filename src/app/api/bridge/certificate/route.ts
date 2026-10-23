import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { domains, certificates } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";
import { apexOf } from "@/lib/acme";

export const dynamic = "force-dynamic";

/**
 * GET /api/bridge/certificate?secret=BRIDGE_SECRET
 *
 * Called by bridge.php (?action=install) on the customer's own server to fetch
 * the latest certificate + private key and install it via cPanel. The bridge
 * secret only exists in that customer's bridge.php, so it authenticates them.
 */
export async function GET(request: NextRequest) {
  try {
    const secret = request.nextUrl.searchParams.get("secret");
    if (!secret || secret.length < 32) {
      return NextResponse.json({ error: "Bad Request" }, { status: 400 });
    }

    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.bridgeSecret, secret))
      .limit(1);
    if (!domain) return NextResponse.json({ error: "Not Found" }, { status: 404 });

    const [cert] = await db
      .select()
      .from(certificates)
      .where(eq(certificates.domainId, domain.id))
      .orderBy(desc(certificates.createdAt))
      .limit(1);
    if (!cert) return NextResponse.json({ error: "No certificate yet" }, { status: 404 });

    return NextResponse.json(
      {
        domain: apexOf(domain.domainName),
        cert: cert.crtBody,
        key: decrypt(cert.keyBodyEncrypted),
        cabundle: cert.caBundle ?? "",
        expiryDate: cert.expiryDate,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    console.error("[bridge/certificate] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
