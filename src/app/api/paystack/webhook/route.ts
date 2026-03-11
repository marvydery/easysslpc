import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/paystack/webhook
 * Receives Paystack charge.success events and upgrades the user's plan.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-paystack-signature");
    const secret = process.env.PAYSTACK_SECRET_KEY!;

    // Verify webhook authenticity
    const expected = createHmac("sha512", secret)
      .update(rawBody)
      .digest("hex");

    if (signature !== expected) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(rawBody) as {
      event: string;
      data: {
        status: string;
        reference: string;
        customer: { email: string; customer_code: string };
        metadata: Record<string, string>;
      };
    };

    if (event.event !== "charge.success") {
      // Acknowledge non-relevant events
      return NextResponse.json({ received: true });
    }

    const { status, metadata, customer } = event.data;

    if (status !== "success") {
      return NextResponse.json({ received: true });
    }

    const { plan, userId } = metadata;

    if (!plan || !userId) {
      console.error("Paystack webhook: missing metadata", metadata);
      return NextResponse.json({ error: "Missing metadata" }, { status: 400 });
    }

    if (!["pro", "lifetime"].includes(plan)) {
      return NextResponse.json({ error: "Invalid plan in metadata" }, { status: 400 });
    }

    // Update user subscription
    await db
      .update(users)
      .set({
        subscriptionTier: plan as "pro" | "lifetime",
        stripeCustomerId: customer.customer_code, // reuse field for Paystack customer code
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    console.log(`✅ Paystack: upgraded user ${userId} to ${plan}`);
    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Paystack webhook error:", error);
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}
