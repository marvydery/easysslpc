import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { initializeTransaction } from "@/lib/paystack";
import { randomBytes } from "crypto";

const AMOUNTS: Record<string, number> = {
  pro: Number(process.env.PAYSTACK_PRO_AMOUNT) || 2900,
  lifetime: Number(process.env.PAYSTACK_LIFETIME_AMOUNT) || 4900,
};

/**
 * POST /api/paystack/initialize
 * Body: { plan: "pro" | "lifetime" }
 * Returns: { authorization_url: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { plan } = body as { plan: string };

    if (!["pro", "lifetime"].includes(plan)) {
      return NextResponse.json({ error: "Invalid plan. Choose 'pro' or 'lifetime'." }, { status: 400 });
    }

    const clerkUser = await currentUser();
    const email = clerkUser?.emailAddresses[0]?.emailAddress;
    if (!email) {
      return NextResponse.json({ error: "No email found on account." }, { status: 400 });
    }

    // Get DB user
    const [dbUser] = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, userId))
      .limit(1);

    if (!dbUser) {
      return NextResponse.json({ error: "User not found in database." }, { status: 404 });
    }

    // Generate a unique reference
    const reference = `easyssl_${plan}_${dbUser.id}_${randomBytes(6).toString("hex")}`;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    const currency = process.env.PAYSTACK_CURRENCY || "NGN";
    const data = await initializeTransaction({
      email,
      amount: AMOUNTS[plan],
      currency,
      reference,
      callback_url: `${appUrl}/dashboard/upgrade/success?reference=${reference}`,
      metadata: {
        plan,
        userId: dbUser.id,
        clerkId: userId,
        email,
      },
    });

    return NextResponse.json({ authorization_url: data.authorization_url, reference });
  } catch (error: any) {
    console.error("Paystack init error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to initialize payment" },
      { status: 500 }
    );
  }
}
