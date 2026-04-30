// Subscription tier model — Free + Premium ($4.99/mo).
// Founding members (signed up before FOUNDING_MEMBER_CUTOFF in
// SubscriptionProvider) and admins are treated as Premium for free.

export type Tier = 'free' | 'premium';

export type Feature =
  | 'ad_free'
  | 'ai_commentary'
  | 'unlimited_scouting'
  | 'podcast_credits';

const PREMIUM_FEATURES: ReadonlySet<Feature> = new Set<Feature>([
  'ad_free',
  'ai_commentary',
  'unlimited_scouting',
  'podcast_credits',
]);

/** Tier-only feature check. The provider layers admin + founder overrides on top. */
export function hasFeature(tier: Tier, feature: Feature): boolean {
  if (tier === 'premium') return PREMIUM_FEATURES.has(feature);
  return false;
}

/**
 * @deprecated kept for back-compat — every tier now has scouting access,
 * just with different point allotments. Returns true so callers don't
 * accidentally hide the UI for free users.
 */
export function hasScouting(_tier: Tier): boolean {
  return true;
}

/** Per-draft scouting + per-FA-period intel report allotments by tier. */
export interface ScoutingAllocations {
  /** Total scout points granted at draft entry. Sentinel value for unlimited. */
  scoutPoints: number;
  /** Total intel reports granted at FA entry. Sentinel value for unlimited. */
  intelReports: number;
  /** True when the tier is uncapped — UI should render "∞" instead of a count. */
  isUnlimited: boolean;
}

/** Sentinel value used for unlimited tiers. Chosen large enough that it
 *  never realistically depletes during a draft / FA period. */
export const UNLIMITED_ALLOCATION = 999_999;

/**
 * Resolve scouting allocations for a tier + founder flag.
 * Founders + admins get unlimited regardless of paid tier.
 */
export function getScoutingAllocations(tier: Tier, isFounder: boolean): ScoutingAllocations {
  if (isFounder) {
    return { scoutPoints: UNLIMITED_ALLOCATION, intelReports: UNLIMITED_ALLOCATION, isUnlimited: true };
  }
  if (tier === 'premium') {
    return { scoutPoints: 30, intelReports: 9, isUnlimited: false };
  }
  return { scoutPoints: 10, intelReports: 3, isUnlimited: false };
}

/** How many monthly Spotlight podcast credits the tier gets. */
export const PODCAST_CREDITS_PER_MONTH: Record<Tier, number> = {
  free: 0,
  premium: 3,
};

/**
 * Stripe price ID for the $4.99/mo Premium tier.
 * Set NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID in .env.local once the price is
 * created in the Stripe dashboard.
 */
export const PREMIUM_PRICE_ID: string =
  process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID ?? '';

/**
 * Legacy Pro/Elite price IDs from the previous three-tier model.
 * These are still recognized so existing subscribers map up to 'premium'
 * instead of being downgraded by the tier collapse.
 */
export const LEGACY_PAID_PRICE_IDS = [
  'price_1T8WqYC87PsOiVCS72XaASn0', // pro_monthly  ($4.99)
  'price_1T8WrAC87PsOiVCSahhW6Yy4', // pro_yearly   ($39.99)
  'price_1T8WreC87PsOiVCSpnKIEdWT', // elite_monthly ($9.99)
  'price_1T8WsOC87PsOiVCSOaK2yN8G', // elite_yearly  ($79.99)
] as const;

// Kept for back-compat with importers that referenced PRICE_IDS by name.
export const PRICE_IDS = {
  premium_monthly: PREMIUM_PRICE_ID,
  pro_monthly: LEGACY_PAID_PRICE_IDS[0],
  pro_yearly: LEGACY_PAID_PRICE_IDS[1],
  elite_monthly: LEGACY_PAID_PRICE_IDS[2],
  elite_yearly: LEGACY_PAID_PRICE_IDS[3],
} as const;

export type PriceId = (typeof PRICE_IDS)[keyof typeof PRICE_IDS];

/**
 * Map a Stripe price ID to a tier. The new Premium price plus every legacy
 * paid price all map to 'premium' — that way Pro/Elite subscribers from the
 * old model are not downgraded when the webhook re-syncs them.
 */
export function tierFromPriceId(priceId: string): Tier {
  if (!priceId) return 'free';
  if (PREMIUM_PRICE_ID && priceId === PREMIUM_PRICE_ID) return 'premium';
  if ((LEGACY_PAID_PRICE_IDS as readonly string[]).includes(priceId)) {
    return 'premium';
  }
  return 'free';
}

/**
 * Coarse OVR bucket label shown to Free-tier users instead of exact ratings.
 * Premium users always see the actual numeric OVR.
 */
export function coarseOvrBucket(ovr: number): string {
  if (ovr >= 75) return '1st-round talent';
  if (ovr >= 65) return 'Day 2 prospect';
  if (ovr >= 55) return 'Day 3 prospect';
  return 'UDFA / project';
}
