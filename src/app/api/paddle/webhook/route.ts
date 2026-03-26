import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifyPaddleWebhook } from "@/lib/paddle";

const WEBHOOK_SECRET = process.env.PADDLE_WEBHOOK_SECRET!;
const PADDLE_API_KEY = process.env.PADDLE_API_KEY!;

/**
 * Fetch customer email from Paddle API using customer_id.
 * The v1 webhook payload does not include email — we must look it up.
 */
async function getCustomerEmail(customerId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.paddle.com/customers/${customerId}`, {
      headers: { Authorization: `Bearer ${PADDLE_API_KEY}` },
    });
    const json = await res.json() as { data?: { email?: string } };
    return json.data?.email ?? null;
  } catch (err) {
    console.error("[Paddle Webhook] Failed to fetch customer:", err);
    return null;
  }
}

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
      status?: string;
      customer_id: string;
      items?: Array<{ price: { id: string } }>;
    };
  };

  console.log(`[Paddle Webhook] Event: ${event.event_type}`, {
    customerId: event.data.customer_id,
  });

  try {
    switch (event.event_type) {
      /**
       * Subscription activated (yearly/pro plan)
       */
      case "subscription.activated": {
        const priceId = event.data.items?.[0]?.price?.id;
        const tier = priceId ? getTierFromPriceId(priceId) : null;
        const customerId = event.data.customer_id;

        if (!tier) {
          console.error("[Paddle Webhook] Unrecognised price ID:", priceId);
          break;
        }

        const email = await getCustomerEmail(customerId);
        if (!email) {
          console.error("[Paddle Webhook] Could not fetch email for customer:", customerId);
          break;
        }

        const result = await db
          .update(users)
          .set({
            subscriptionTier: tier,
            stripeCustomerId: customerId,
            updatedAt: new Date(),
          })
          .where(eq(users.email, email));

        console.log(`[Paddle Webhook] ✅ Upgraded ${email} to ${tier}`);
        break;
      }

      /**
       * One-time payment completed (lifetime plan)
       */
      case "transaction.completed": {
        const priceId = event.data.items?.[0]?.price?.id;
        const tier = priceId ? getTierFromPriceId(priceId) : null;
        const customerId = event.data.customer_id;

        if (!tier) {
          // Not one of our tracked products — ignore silently
          console.log("[Paddle Webhook] transaction.completed — not a tracked price, ignoring");
          break;
        }

        const email = await getCustomerEmail(customerId);
        if (!email) {
          console.error("[Paddle Webhook] Could not fetch email for customer:", customerId);
          break;
        }

        await db
          .update(users)
          .set({
            subscriptionTier: tier,
            stripeCustomerId: customerId,
            updatedAt: new Date(),
          })
          .where(eq(users.email, email));

        console.log(`[Paddle Webhook] ✅ transaction.completed → ${email} to ${tier}`);
        break;
      }

      /**
       * Subscription cancelled — downgrade back to free
       */
      case "subscription.canceled": {
        const customerId = event.data.customer_id;
        const email = await getCustomerEmail(customerId);

        if (!email) break;

        await db
          .update(users)
          .set({
            subscriptionTier: "free",
            updatedAt: new Date(),
          })
          .where(eq(users.email, email));

        console.log(`[Paddle Webhook] ✅ Downgraded ${email} to free`);
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
