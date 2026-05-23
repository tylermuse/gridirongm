/**
 * @bs/core/billing — subscription tier model, Stripe client, and tier state.
 *
 * Promoted from apps/web/src/lib/{stripe,subscription,subscriptionState}.ts
 * during Sub-phase 1D.
 *
 * Mixed server/client surface:
 *   - subscription.* and state.* run on both server and client
 *   - stripe.getStripe() is server-only (uses STRIPE_SECRET_KEY) — importing
 *     it from a client component will throw at runtime since the secret is
 *     undefined in browser env. Don't.
 */

// Subscription tier model — types, constants, pure functions
export * from './subscription';

// Stripe server SDK factory + re-exports
export { getStripe } from './stripe';

// Client-side state holder (used by SubscriptionProvider and engine reads)
export {
  setCurrentSubscriptionTier,
  setCurrentSubscriptionAllocations,
  getCurrentSubscriptionTier,
  getCurrentSubscriptionAllocations,
  isPremiumActive,
} from './state';
