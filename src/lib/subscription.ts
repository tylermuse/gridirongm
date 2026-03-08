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

export function hasFeature(tier: Tier, feature: Feature): boolean {
  if (tier === 'elite') return ELITE_FEATURES.includes(feature);
  if (tier === 'pro') return PRO_FEATURES.includes(feature);
  return false;
}

/** Maximum scouting level allowed for this tier (0-indexed, 0=Entry, 1=Pro, 2=Elite) */
export function maxScoutingLevel(tier: Tier): number {
  if (tier === 'elite') return 2;
  if (tier === 'pro') return 1;
  return 0;
}

/** Maximum deep scouts per draft: Entry=1, Pro=5, Elite=unlimited */
export function maxDeepScouts(tier: Tier): number {
  if (tier === 'elite') return 999;
  if (tier === 'pro') return 5;
  return 1;
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
  { name: 'Entry', tier: 'free' as Tier, tooltip: 'Wide OVR ranges (±12). Free for all players.' },
  { name: 'Pro', tier: 'pro' as Tier, tooltip: 'Tighter ranges (±5), position breakdowns, trait hints. Requires Pro subscription.' },
  { name: 'Elite', tier: 'elite' as Tier, tooltip: 'Near-exact ratings (±2), full trait report, complete profile. Requires Elite subscription.' },
];
