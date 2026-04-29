// Module-level, non-persisted holder for the active user's subscription tier.
// SubscriptionProvider writes here as soon as it resolves the tier; engine
// code (which is decoupled from React) reads from here when it needs to seed
// per-league state (e.g. scouting points) according to entitlements.
//
// This is intentionally a small global rather than threading the tier through
// every store action — the tier is environmental, not per-league, and is
// already authoritative on the server (subscriptions table). The client-side
// flag is only used to seed initial state and as a hint for cap checks; it
// can never grant entitlement that the server doesn't also enforce.

import type { Tier } from './subscription';

let currentTier: Tier = 'free';

/** Set by SubscriptionProvider whenever the resolved tier changes. */
export function setCurrentSubscriptionTier(tier: Tier): void {
  currentTier = tier;
}

/** Read the last-known resolved tier. Defaults to 'free' before auth resolves. */
export function getCurrentSubscriptionTier(): Tier {
  return currentTier;
}

/** Convenience predicate for engine code that just wants a yes/no. */
export function isPremiumActive(): boolean {
  return currentTier === 'premium';
}
