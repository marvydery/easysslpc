import { NextRequest } from "next/server";

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically when the
 * CRON_SECRET environment variable is set on the project. Requests without it
 * are rejected — including when CRON_SECRET is missing entirely.
 */
export function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET is not set — refusing to run");
    return false;
  }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
