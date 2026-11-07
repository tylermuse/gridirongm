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

import type { Tier, ScoutingAllocations } from './subscription';

let currentTier: Tier = 'free';
let currentAllocations: ScoutingAllocations = {
  scoutPoints: 10,
  intelReports: 3,
  isUnlimited: false,
};

/** Set by SubscriptionProvider whenever the resolved tier changes. */
export function setCurrentSubscriptionTier(tier: Tier): void {
  currentTier = tier;
}

/** Set by SubscriptionProvider whenever the resolved allocations change. */
export function setCurrentSubscriptionAllocations(allocations: ScoutingAllocations): void {
  currentAllocations = allocations;
}

/** Read the last-known resolved tier. Defaults to 'free' before auth resolves. */
export function getCurrentSubscriptionTier(): Tier {
  return currentTier;
}

/** Read the last-known resolved scouting allocations. Defaults to free-tier values. */
export function getCurrentSubscriptionAllocations(): ScoutingAllocations {
  return currentAllocations;
}

/** Convenience predicate for engine code that just wants a yes/no. */
export function isPremiumActive(): boolean {
  return currentTier === 'premium';
}

/**
 * Who the current viewer is, commercially. Finer than Tier, which collapses
 * paid subscribers, Founding Members and admins into 'premium'. Stamped on
 * every `feature_used` event so usage can be split by plan without a join.
 */
export type Plan = 'guest' | 'free' | 'paid' | 'founder' | 'admin';

let currentPlan: Plan = 'guest';

/** Set by SubscriptionProvider whenever the resolved entitlement changes. */
export function setCurrentPlan(plan: Plan): void {
  currentPlan = plan;
}

export function getCurrentPlan(): Plan {
  return currentPlan;
}

/** Resolution order matches the providers: admin → founder → paid sub → free. */
export function resolvePlan(o: { signedIn: boolean; admin: boolean; founder: boolean; paid: boolean }): Plan {
  if (!o.signedIn) return 'guest';
  if (o.admin) return 'admin';
  if (o.founder) return 'founder';
  if (o.paid) return 'paid';
  return 'free';
}
