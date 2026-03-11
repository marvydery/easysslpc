import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, domains, certificates } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * DELETE /api/domains/[domainId]/delete
 * Deletes a pending domain (domains without SSL certificates)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { domainId: string } }
) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    // Get domain
    const [domain] = await db
      .select()
      .from(domains)
      .where(and(eq(domains.id, params.domainId), eq(domains.userId, user.id)))
      .limit(1);

    if (!domain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    // Check if domain has a certificate
    const [certificate] = await db
      .select()
      .from(certificates)
      .where(eq(certificates.domainId, domain.id))
      .limit(1);

    if (certificate) {
      return NextResponse.json(
        { error: "Cannot delete domains with active SSL certificates" },
        { status: 400 }
      );
    }

    // Delete the pending domain
    await db.delete(domains).where(eq(domains.id, params.domainId));

    return NextResponse.json({
      success: true,
      message: "Pending domain deleted successfully",
    });
  } catch (error: any) {
    console.error("Domain deletion error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete domain" },
      { status: 500 }
    );
  }
}
