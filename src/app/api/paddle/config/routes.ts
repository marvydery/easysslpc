import { NextResponse } from "next/server";

/**
 * Returns Paddle config values to the client.
 * This is the correct pattern for exposing env vars to client components —
 * process.env is read on the SERVER here, not on the client.
 */
export async function GET() {
  const clientToken = process.env.PADDLE_CLIENT_TOKEN;
  const yearlyPriceId = process.env.PADDLE_YEARLY_PRICE_ID;
  const lifetimePriceId = process.env.PADDLE_LIFETIME_PRICE_ID;

  if (!clientToken || !yearlyPriceId || !lifetimePriceId) {
    console.error("[Paddle Config] Missing env vars:", {
      clientToken: !!clientToken,
      yearlyPriceId: !!yearlyPriceId,
      lifetimePriceId: !!lifetimePriceId,
    });
    return NextResponse.json(
      { error: "Payment configuration missing" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    clientToken,
    yearlyPriceId,
    lifetimePriceId,
  });
}
