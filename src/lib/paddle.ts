/**
 * Paddle API helper
 * Docs: https://developer.paddle.com/api-reference
 */

const PADDLE_API_KEY = process.env.PADDLE_API_KEY!;
const BASE_URL = "https://api.paddle.com"; // sandbox: https://sandbox-api.paddle.com

async function paddleRequest<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${PADDLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = (await res.json()) as { data: T; error?: { detail: string } };

  if (!res.ok) {
    throw new Error(json.error?.detail || "Paddle API error");
  }

  return json.data;
}

export interface PaddleCustomer {
  id: string;
  email: string;
}

export interface PaddleTransaction {
  id: string;
  status: string;
  customer_id: string;
}

/**
 * Get or create a Paddle customer by email.
 * We store the Paddle customer ID in the users table (paddleCustomerId / stripe_customer_id col).
 */
export async function getOrCreateCustomer(email: string): Promise<PaddleCustomer> {
  // Search existing customers
  const res = await fetch(
    `${BASE_URL}/customers?email=${encodeURIComponent(email)}`,
    {
      headers: { Authorization: `Bearer ${PADDLE_API_KEY}` },
    }
  );
  const json = (await res.json()) as { data: PaddleCustomer[] };

  if (json.data && json.data.length > 0) {
    return json.data[0];
  }

  // Create new customer
  return paddleRequest<PaddleCustomer>("POST", "/customers", { email });
}

/**
 * Verify and parse a Paddle webhook event.
 * Returns the raw event object if valid.
 */
export async function verifyPaddleWebhook(
  rawBody: string,
  signature: string,
  secret: string
): Promise<boolean> {
  // Paddle uses HMAC-SHA256 for webhook verification
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  // Paddle signature format: ts=timestamp;h1=hash
  const parts = signature.split(";");
  const tsPart = parts.find((p) => p.startsWith("ts="));
  const h1Part = parts.find((p) => p.startsWith("h1="));

  if (!tsPart || !h1Part) return false;

  const ts = tsPart.replace("ts=", "");
  const h1 = h1Part.replace("h1=", "");

  const signedPayload = `${ts}:${rawBody}`;
  const hashBuffer = Buffer.from(h1, "hex");

  return crypto.subtle.verify(
    "HMAC",
    key,
    hashBuffer,
    encoder.encode(signedPayload)
  );
}
