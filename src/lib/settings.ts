/**
 * src/lib/settings.ts
 * Helper to read/write site settings from the database.
 * Falls back to env vars if not set in DB.
 */
import { db } from "@/lib/db";
import { siteSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const SETTING_KEYS = {
  PAYSTACK_PRO_AMOUNT: "paystack_pro_amount",
  PAYSTACK_LIFETIME_AMOUNT: "paystack_lifetime_amount",
  PAYSTACK_CURRENCY: "paystack_currency",
  PAYSTACK_PUBLIC_KEY: "paystack_public_key",
  PAYSTACK_SECRET_KEY: "paystack_secret_key",
  ACME_ENVIRONMENT: "acme_environment", // "staging" | "production"
  GA_MEASUREMENT_ID: "ga_measurement_id",
  SITE_NAME: "site_name",
  SITE_LOGO_URL: "site_logo_url",
  MAINTENANCE_MODE: "maintenance_mode", // "true" | "false"
  MAINTENANCE_MESSAGE: "maintenance_message",
  ANNOUNCEMENT_BANNER: "announcement_banner",
  USD_TO_GHS_RATE: "usd_to_ghs_rate",
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

/** Get a single setting — DB first, then env var fallback */
export async function getSetting(key: SettingKey): Promise<string | null> {
  try {
    const [row] = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.key, key))
      .limit(1);
    if (row?.value !== undefined && row.value !== null) return row.value;
  } catch {}
  // Env var fallbacks
  const fallbacks: Record<string, string | undefined> = {
    paystack_pro_amount: process.env.PAYSTACK_PRO_AMOUNT,
    paystack_lifetime_amount: process.env.PAYSTACK_LIFETIME_AMOUNT,
    paystack_currency: process.env.PAYSTACK_CURRENCY ?? "GHS",
    paystack_public_key: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
    paystack_secret_key: process.env.PAYSTACK_SECRET_KEY,
    acme_environment: process.env.ACME_DIRECTORY_URL?.includes("staging") ? "staging" : "production",
    site_name: "EasySSL",
    usd_to_ghs_rate: "12",
  };
  return fallbacks[key] ?? null;
}

/** Get all settings as a key/value map */
export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(siteSettings);
  return Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
}

/** Upsert a setting */
export async function setSetting(key: SettingKey, value: string): Promise<void> {
  await db
    .insert(siteSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: { value, updatedAt: new Date() },
    });
}

/** Upsert multiple settings at once */
export async function setSettings(entries: Partial<Record<SettingKey, string>>): Promise<void> {
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined) await setSetting(key as SettingKey, value);
  }
}
