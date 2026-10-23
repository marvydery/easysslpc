import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { domains, users } from "@/lib/db/schema";
import { scanDomain } from "@/lib/live-scan";

export const maxDuration = 30;

/**
 * POST /api/ssl/rescan — { domainId }
 * Reads the certificate the site is actually serving and updates the dashboard
 * and renewal date to match (e.g. a certificate installed outside EasySSL).
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { domainId } = await request.json();
    if (!domainId) return NextResponse.json({ error: "domainId required" }, { status: 400 });

    const [user] = await db.select().from(users).where(eq(users.clerkId, userId)).limit(1);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const [domain] = await db
      .select()
      .from(domains)
      .where(and(eq(domains.id, domainId), eq(domains.userId, user.id)))
      .limit(1);
    if (!domain) return NextResponse.json({ error: "Domain not found" }, { status: 404 });

    const scan = await scanDomain(domain);
    return NextResponse.json({ success: true, scan });
  } catch (error: any) {
    console.error("[ssl/rescan] error:", error);
    return NextResponse.json({ error: error.message || "Rescan failed" }, { status: 500 });
  }
}
