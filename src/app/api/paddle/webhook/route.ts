import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifyPaddleWebhook } from "@/lib/paddle";

const WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET!;

/**
 * Maps Paddle price IDs to our internal subscription tiers.
 */
function getTierFromPriceId(priceId: string): "pro" | "lifetime" | null {
  if (priceId === process.env.PADDLE_YEARLY_PRICE_ID) return "pro";
  if (priceId === process.env.PADDLE_LIFETIME_PRICE_ID) return "lifetime";
  return null;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("paddle-signature") || "";

  // Verify webhook authenticity
  const isValid = await verifyPaddleWebhook(rawBody, signature, WEBHOOK_SECRET);
  if (!isValid) {
    console.error("[Paddle Webhook] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody) as {
    event_type: string;
    data: {
      id: string;
      status: string;
      customer_id: string;
      customer?: { email: string };
      items?: Array<{ price: { id: string } }>;
      subscription_id?: string;
      custom_data?: { user_id?: string; clerk_id?: string };
    };
  };

  console.log(`[Paddle Webhook] Event: ${event.event_type}`);

  try {
    switch (event.event_type) {
      /**
       * Subscription activated (yearly/pro plan)
       */
      case "subscription.activated": {
        const priceId = event.data.items?.[0]?.price?.id;
        const tier = priceId ? getTierFromPriceId(priceId) : null;
        const email = event.data.customer?.email;
        const paddleCustomerId = event.data.customer_id;

        if (!email || !tier) {
          console.error("[Paddle Webhook] Missing email or unrecognised price ID");
          break;
        }

        await db
          .update(users)
          .set({
            subscriptionTier: tier,
            stripeCustomerId: paddleCustomerId, // reusing this column for Paddle customer ID
            updatedAt: new Date(),
          })
          .where(eq(users.email, email));

        console.log(`[Paddle Webhook] Upgraded ${email} to ${tier}`);
        break;
      }

      /**
       * One-time payment completed (lifetime plan)
       */
      case "transaction.completed": {
        const priceId = event.data.items?.[0]?.price?.id;
        const tier = priceId ? getTierFromPriceId(priceId) : null;
        const email = event.data.customer?.email;
        const paddleCustomerId = event.data.customer_id;

        if (!email || !tier) {
          // Not one of our tracked products — ignore
          break;
        }

        await db
          .update(users)
          .set({
            subscriptionTier: tier,
            stripeCustomerId: paddleCustomerId,
            updatedAt: new Date(),
          })
          .where(eq(users.email, email));

        console.log(`[Paddle Webhook] transaction.completed → ${email} to ${tier}`);
        break;
      }

      /**
       * Subscription cancelled — downgrade back to free
       */
      case "subscription.canceled": {
        const email = event.data.customer?.email;

        if (!email) break;

        await db
          .update(users)
          .set({
            subscriptionTier: "free",
            updatedAt: new Date(),
          })
          .where(eq(users.email, email));

        console.log(`[Paddle Webhook] Downgraded ${email} to free`);
        break;
      }

      default:
        console.log(`[Paddle Webhook] Unhandled event: ${event.event_type}`);
    }
  } catch (err) {
    console.error("[Paddle Webhook] DB error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
