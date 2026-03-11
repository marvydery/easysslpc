import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

/**
 * Stripe Webhook Handler
 * POST /api/stripe/webhook
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature")!;

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
      console.error(`Webhook signature verification failed: ${err.message}`);
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    // Handle the event
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const tier = session.metadata?.tier;

        if (userId && tier) {
          // Update user subscription tier
          await db
            .update(users)
            .set({
              subscriptionTier: tier as "free" | "pro" | "lifetime",
              stripeCustomerId: session.customer as string,
            })
            .where(eq(users.clerkId, userId));

          console.log(`Updated user ${userId} to ${tier} tier`);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Downgrade user to free tier
        await db
          .update(users)
          .set({ subscriptionTier: "free" })
          .where(eq(users.stripeCustomerId, customerId));

        console.log(`Downgraded customer ${customerId} to free tier`);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        if (subscription.status === "active") {
          // Keep pro tier active
          console.log(`Subscription active for customer ${customerId}`);
        } else if (subscription.status === "canceled" || subscription.status === "unpaid") {
          // Downgrade to free
          await db
            .update(users)
            .set({ subscriptionTier: "free" })
            .where(eq(users.stripeCustomerId, customerId));
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: error.message || "Webhook handler failed" },
      { status: 500 }
    );
  }
}
