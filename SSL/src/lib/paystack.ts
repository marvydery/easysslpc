/**
 * Paystack API helper
 * Docs: https://paystack.com/docs/api/
 */

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;
const BASE_URL = "https://api.paystack.co";

async function paystackRequest<T>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = (await res.json()) as { status: boolean; message: string; data: T };

  if (!json.status) {
    throw new Error(json.message || "Paystack API error");
  }

  return json.data;
}

export interface PaystackInitData {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export interface PaystackVerifyData {
  status: string; // "success" | "failed" | "abandoned"
  reference: string;
  amount: number;
  currency: string;
  customer: { email: string; customer_code: string };
  metadata: Record<string, string>;
}

/**
 * Initialize a Paystack transaction.
 * Amount must be in the smallest currency unit (e.g. cents for USD).
 */
export async function initializeTransaction(opts: {
  email: string;
  amount: number; // in cents
  currency?: string;
  reference?: string;
  callback_url?: string;
  metadata?: Record<string, string>;
}): Promise<PaystackInitData> {
  return paystackRequest<PaystackInitData>("POST", "/transaction/initialize", {
    email: opts.email,
    amount: opts.amount,
    currency: opts.currency ?? "USD",
    reference: opts.reference,
    callback_url: opts.callback_url,
    metadata: opts.metadata,
  });
}

/**
 * Verify a transaction by reference.
 */
export async function verifyTransaction(reference: string): Promise<PaystackVerifyData> {
  return paystackRequest<PaystackVerifyData>(
    "GET",
    `/transaction/verify/${reference}`
  );
}
