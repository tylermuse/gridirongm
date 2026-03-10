export type Tier = 'free' | 'pro' | 'elite';

export type Feature =
  | 'ad_free'
  | 'scouting_pro'       // Scouting levels 1-2
  | 'scouting_elite'     // Scouting levels 3-4
  | 'ai_coach'
  | 'custom_team'
  | 'coaching_staff'
  | 'analytics_dashboard'
  | 'historical_drafts'
  | 'league_export';

const PRO_FEATURES: Feature[] = [
  'ad_free',
  'scouting_pro',
  'analytics_dashboard',
];

const ELITE_FEATURES: Feature[] = [
  ...PRO_FEATURES,
  'scouting_elite',
  'ai_coach',
  'custom_team',
  'coaching_staff',
  'analytics_dashboard',
  'historical_drafts',
  'league_export',
];

// All features are free for everyone
export function hasFeature(_tier: Tier, _feature: Feature): boolean {
  return true;
}

/** Maximum scouting level — all levels unlocked */
export function maxScoutingLevel(_tier: Tier): number {
  return 2;
}

/** Maximum deep scouts — unlimited for everyone */
export function maxDeepScouts(_tier: Tier): number {
  return 999;
}

// Stripe price IDs — safe to import client-side (no Stripe SDK dependency)
export const PRICE_IDS = {
  pro_monthly: 'price_1T8WqYC87PsOiVCS72XaASn0',
  pro_yearly: 'price_1T8WrAC87PsOiVCSahhW6Yy4',
  elite_monthly: 'price_1T8WreC87PsOiVCSpnKIEdWT',
  elite_yearly: 'price_1T8WsOC87PsOiVCSOaK2yN8G',
} as const;

export type PriceId = (typeof PRICE_IDS)[keyof typeof PRICE_IDS];

export function tierFromPriceId(priceId: string): 'pro' | 'elite' {
  if (priceId === PRICE_IDS.pro_monthly || priceId === PRICE_IDS.pro_yearly) return 'pro';
  return 'elite';
}

export const SCOUTING_LEVELS = [
  { name: 'Entry', tier: 'free' as Tier, tooltip: 'Wide OVR ranges (±12).' },
  { name: 'Pro', tier: 'free' as Tier, tooltip: 'Tighter ranges (±5), position breakdowns, trait hints.' },
  { name: 'Elite', tier: 'free' as Tier, tooltip: 'Near-exact ratings (±2), full trait report, complete profile.' },
];
