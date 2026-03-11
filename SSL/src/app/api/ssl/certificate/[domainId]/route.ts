import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, domains, certificates } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";

/**
 * GET /api/ssl/certificate/[domainId]?type=key|crt|cabundle
 * Returns the certificate file content
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { domainId: string } }
) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const type = request.nextUrl.searchParams.get("type");
    if (!type || !["key", "crt", "cabundle"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid type. Use: key, crt, or cabundle" },
        { status: 400 }
      );
    }

    // Get user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get domain (verify ownership)
    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, params.domainId))
      .limit(1);

    if (!domain || domain.userId !== user.id) {
      return NextResponse.json(
        { error: "Domain not found or access denied" },
        { status: 404 }
      );
    }

    // Get latest certificate
    const [cert] = await db
      .select()
      .from(certificates)
      .where(eq(certificates.domainId, params.domainId))
      .orderBy(desc(certificates.createdAt))
      .limit(1);

    if (!cert) {
      return NextResponse.json(
        { error: "No certificate found for this domain" },
        { status: 404 }
      );
    }

    let content = "";
    let filename = "";

    switch (type) {
      case "key":
        content = decrypt(cert.keyBodyEncrypted);
        filename = `${domain.domainName}.key`;
        break;
      case "crt":
        content = cert.crtBody;
        filename = `${domain.domainName}.crt`;
        break;
      case "cabundle":
        content = cert.caBundle || "";
        filename = `${domain.domainName}-ca-bundle.crt`;
        break;
    }

    return NextResponse.json({
      success: true,
      content,
      filename,
      domainName: domain.domainName,
    });
  } catch (error: any) {
    console.error("Certificate fetch error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch certificate" },
      { status: 500 }
    );
  }
}
