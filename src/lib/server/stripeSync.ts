/**
 * Server-only helpers that keep Stripe and Supabase in agreement.
 *
 * Used by the checkout, portal, sync and webhook routes. Every write here
 * throws on failure so callers can surface an error (and, for the webhook,
 * return a non-2xx so Stripe retries instead of silently dropping the event).
 */

import { createServerClient } from '@supabase/ssr';
import type Stripe from 'stripe';
import { getStripe, tierFromPriceId } from '@bs/core/billing';
import type { Attribution } from '@/lib/attribution';

const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);

export function getServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );
}

// Stripe moved `current_period_end` onto subscription items in 2025-03-31.basil.
// Read the item first, fall back to the legacy field, never throw on bad input.
export function periodEndIso(sub: Record<string, unknown>): string | null {
  const item = (sub.items as { data?: Array<Record<string, unknown>> } | undefined)?.data?.[0];
  const raw = (item?.current_period_end ?? sub.current_period_end) as number | undefined;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const d = new Date(raw * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Find the Supabase user a subscription belongs to: subscription metadata
 * first (set at checkout from now on), then the customer's metadata (set on
 * every customer we've ever created).
 */
export async function resolveUserId(sub: Stripe.Subscription): Promise<string | null> {
  const fromSub = sub.metadata?.supabase_user_id;
  if (fromSub) return fromSub;

  const customer =
    typeof sub.customer === 'string'
      ? await getStripe().customers.retrieve(sub.customer)
      : sub.customer;
  if (!customer || customer.deleted) return null;
  return customer.metadata?.supabase_user_id ?? null;
}

/** Insert or update the subscriptions row for a Stripe subscription. Throws on DB error. */
export async function upsertSubscription(sub: Stripe.Subscription, userId: string) {
  const raw = sub as unknown as Record<string, unknown>;
  const priceId = sub.items.data[0]?.price.id;
  const periodEnd = periodEndIso(raw);

  const { error } = await getServiceClient()
    .from('subscriptions')
    .upsert(
      {
        id: sub.id,
        user_id: userId,
        status: sub.status,
        ...(priceId ? { tier: tierFromPriceId(priceId) } : {}),
        ...(periodEnd ? { current_period_end: periodEnd } : {}),
        cancel_at_period_end: Boolean(raw.cancel_at_period_end),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
  if (error) throw new Error(`subscriptions upsert failed for ${sub.id}: ${error.message}`);
}

/**
 * Save the Stripe customer ID on the user's profile. Upsert, not update:
 * most users have no profiles row, and an update on a missing row is a
 * silent no-op — which is why every checkout used to mint a new customer.
 */
export async function saveCustomerId(userId: string, customerId: string) {
  const { error } = await getServiceClient()
    .from('profiles')
    .upsert({ id: userId, stripe_customer_id: customerId }, { onConflict: 'id' });
  if (error) throw new Error(`profiles upsert failed for ${userId}: ${error.message}`);
}

/**
 * Record first-touch attribution on the profile, once. Never overwrites an
 * existing value (the first answer is the one that matters) and never
 * throws: attribution is best-effort and must not block a checkout.
 */
export async function saveFirstTouch(userId: string, attr: Attribution | null) {
  if (!attr) return;
  try {
    const service = getServiceClient();
    const { data } = await service
      .from('profiles')
      .select('first_touch')
      .eq('id', userId)
      .maybeSingle();
    if (data?.first_touch) return;
    const { error } = await service
      .from('profiles')
      .upsert({ id: userId, first_touch: attr }, { onConflict: 'id' });
    if (error) console.error(`[attribution] profiles.first_touch upsert failed for ${userId}: ${error.message}`);
  } catch (err) {
    console.error('[attribution] saveFirstTouch failed:', err);
  }
}

/**
 * Return the user's Stripe customer ID, reusing an existing one wherever
 * possible: the profile first, then any Stripe customer tagged with this
 * user (preferring one that has a live subscription). Creates a customer
 * only when none exists. Always persists the result to the profile.
 */
export async function getOrCreateCustomerId(userId: string, email: string | undefined) {
  const service = getServiceClient();
  const { data: profile } = await service
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .maybeSingle();
  if (profile?.stripe_customer_id) return profile.stripe_customer_id as string;

  const stripe = getStripe();
  const existing = await findCustomersForUser(userId);
  let customerId: string | undefined;
  for (const c of existing) {
    const subs = await stripe.subscriptions.list({ customer: c.id, status: 'all', limit: 10 });
    if (subs.data.some((s) => ACTIVE_STATUSES.has(s.status))) {
      customerId = c.id;
      break;
    }
  }
  customerId ??= existing[0]?.id;

  if (!customerId) {
    const created = await stripe.customers.create({
      email,
      metadata: { supabase_user_id: userId },
    });
    customerId = created.id;
  }

  await saveCustomerId(userId, customerId);
  return customerId;
}

export async function findCustomersForUser(userId: string): Promise<Stripe.Customer[]> {
  const res = await getStripe().customers.search({
    query: `metadata['supabase_user_id']:'${userId.replace(/'/g, '')}'`,
    limit: 20,
  });
  return res.data;
}

/**
 * True when the user already has a live subscription, checked in Supabase
 * and directly in Stripe (the webhook may not have landed yet).
 */
export async function hasLiveSubscription(userId: string): Promise<boolean> {
  const { data } = await getServiceClient()
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing'])
    .limit(1);
  if (data && data.length > 0) return true;

  const stripe = getStripe();
  for (const c of await findCustomersForUser(userId)) {
    const subs = await stripe.subscriptions.list({ customer: c.id, status: 'all', limit: 10 });
    if (subs.data.some((s) => s.status === 'active' || s.status === 'trialing')) return true;
  }
  return false;
}
