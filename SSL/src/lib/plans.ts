/**
 * Plan configuration — single source of truth for domain limits and features.
 */

export const PLANS = {
  free: {
    name: "Free",
    price: "$0",
    period: "90 days",
    domainLimit: 1,
    autoRenew: false,
    bridge: false,
  },
  pro: {
    name: "Pro",
    price: "$29",
    period: "year",
    domainLimit: 5,
    autoRenew: true,
    bridge: true,
  },
  lifetime: {
    name: "Lifetime",
    price: "$49",
    period: "one-time",
    domainLimit: 10,
    autoRenew: true,
    bridge: true,
  },
} as const;

export const ADMIN_DOMAIN_LIMIT = 999_999; // effectively unlimited

/**
 * Returns the maximum number of domains allowed for a user.
 * Admins get an effectively unlimited count.
 */
export function getDomainLimit(tier: string, isAdmin: boolean): number {
  if (isAdmin) return ADMIN_DOMAIN_LIMIT;
  return PLANS[tier as keyof typeof PLANS]?.domainLimit ?? 1;
}

/**
 * Returns a human-readable label for the limit.
 */
export function getDomainLimitLabel(tier: string, isAdmin: boolean): string {
  if (isAdmin) return "Unlimited";
  const limit = getDomainLimit(tier, false);
  return `${limit} domain${limit === 1 ? "" : "s"}`;
}
