import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifyTransaction } from "@/lib/paystack";

/**
 * GET /api/paystack/verify?reference=xxx
 * Called after Paystack redirects back. Verifies and activates the plan.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const reference = request.nextUrl.searchParams.get("reference");
    if (!reference) {
      return NextResponse.json({ error: "Missing reference" }, { status: 400 });
    }

    const txn = await verifyTransaction(reference);

    if (txn.status !== "success") {
      return NextResponse.json({ error: `Payment not successful (status: ${txn.status})` }, { status: 400 });
    }

    const { plan, userId: metaUserId } = txn.metadata;

    if (!plan || !["pro", "lifetime"].includes(plan)) {
      return NextResponse.json({ error: "Invalid plan in transaction" }, { status: 400 });
    }

    // Update user subscription
    await db
      .update(users)
      .set({
        subscriptionTier: plan as "pro" | "lifetime",
        stripeCustomerId: txn.customer.customer_code,
        updatedAt: new Date(),
      })
      .where(eq(users.id, metaUserId));

    return NextResponse.json({ success: true, plan });
  } catch (error: any) {
    console.error("Paystack verify error:", error);
    return NextResponse.json({ error: error.message || "Verification failed" }, { status: 500 });
  }
}
