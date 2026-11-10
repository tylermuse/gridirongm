/**
 * Loaders for the business reports on /admin/analytics: subscribers and MRR,
 * revenue, accounts created, and where signups came from.
 *
 * None of these depend on the 7d/30d/90d selector. Each returns everything it
 * has and the page cuts it to the period, so one cached copy serves all three.
 * They read Stripe and a few small tables; none touches analytics_events.
 */

import type { createServerClient } from '@supabase/ssr';
import type Stripe from 'stripe';
import { getStripe } from '@bs/core/billing';
import {
  buildSpans,
  buildSubscriberDays,
  type StripeSubscriptionFacts,
  type SubscriberGrowth,
  type TableSubscription,
} from '@/app/admin/analytics/subscriberGrowth';
import {
  accountsByDay,
  landingOf,
  revenueByDay,
  sourceOf,
  type AccountsReport,
  type AcquisitionReport,
  type RevenueReport,
} from '@/app/admin/analytics/businessMetrics';

type Service = ReturnType<typeof createServerClient>;
type Loaded<T> = { data: T | null; error: { message: string } | null };

/** PostgREST returns at most this many rows per request (`db-max-rows`). */
const PAGE = 1000;
/** Stop paging somewhere: 50k rows means this report needs a SQL function, not a bigger loop. */
const MAX_PAGES = 50;
const DAY_MS = 86400000;

const fail = (err: unknown): { data: null; error: { message: string } } => ({
  data: null,
  error: { message: err instanceof Error ? err.message : String(err) },
});

// ── Subscribers and MRR ────────────────────────────────────────────────────
// Start and end dates come from Stripe, who is live today comes from our
// `subscriptions` table; buildSpans() in subscriberGrowth.ts explains why.

/** What a subscription bills per month, in cents: list price x quantity, a yearly plan spread over 12. */
function monthlyCents(sub: Stripe.Subscription): number {
  let cents = 0;
  for (const item of sub.items.data) {
    const amount = (item.price.unit_amount ?? 0) * (item.quantity ?? 1);
    const every = item.price.recurring?.interval_count ?? 1;
    switch (item.price.recurring?.interval) {
      case 'year': cents += amount / (12 * every); break;
      case 'week': cents += (amount * 52) / (12 * every); break;
      case 'day': cents += (amount * 365) / (12 * every); break;
      default: cents += amount / every;
    }
  }
  return Math.round(cents);
}

async function stripeSubscriptions(): Promise<StripeSubscriptionFacts[]> {
  const subs = await getStripe()
    .subscriptions.list({ status: 'all', limit: 100, expand: ['data.customer'] })
    .autoPagingToArray({ limit: 5000 });
  return subs
    // A test-mode key (local dev, previews) lists test subscriptions that have nothing to do with our table.
    .filter(s => s.livemode)
    .map(s => {
      // One person can own several Stripe customers (every checkout used to
      // mint a new one), so prefer the user id, then the email, over the customer id.
      const customer = typeof s.customer === 'string' || s.customer.deleted ? null : s.customer;
      const customerId = typeof s.customer === 'string' ? s.customer : s.customer.id;
      const accountKey =
        s.metadata?.supabase_user_id ||
        customer?.metadata?.supabase_user_id ||
        customer?.email?.toLowerCase() ||
        customerId;
      return {
        id: s.id,
        status: s.status,
        created: s.created,
        ended_at: s.ended_at,
        canceled_at: s.canceled_at,
        cancel_at: s.cancel_at,
        monthlyCents: monthlyCents(s),
        accountKey,
      };
    });
}

export async function loadSubscriberGrowth(service: Service): Promise<Loaded<SubscriberGrowth>> {
  const { data: rows, error } = await service
    .from('subscriptions')
    .select('id, user_id, status, created_at, updated_at')
    .order('created_at', { ascending: true })
    .limit(PAGE);
  if (error) return { data: null, error };
  if (rows.length >= PAGE) {
    return { data: null, error: { message: `more than ${PAGE} subscription rows — this report needs paging before it can be trusted` } };
  }

  let stripe: StripeSubscriptionFacts[] | null = null;
  let stripeError: string | undefined;
  try {
    stripe = await stripeSubscriptions();
  } catch (err) {
    stripeError = err instanceof Error ? err.message : String(err);
  }

  const { spans, ...counts } = buildSpans(rows as TableSubscription[], stripe);
  return {
    data: {
      days: buildSubscriberDays(spans, Date.now()),
      subscriptions: spans.length,
      ...counts,
      ...(stripeError ? { stripeError } : {}),
    },
    error: null,
  };
}

// ── Revenue ────────────────────────────────────────────────────────────────

/** Money in, refunds and fees per day from Stripe's ledger, for the last two years. */
export async function loadRevenue(): Promise<Loaded<RevenueReport>> {
  try {
    const since = Math.floor((Date.now() - 730 * DAY_MS) / 1000);
    const txs = await getStripe()
      .balanceTransactions.list({ limit: 100, created: { gte: since } })
      .autoPagingToArray({ limit: 10000 });
    return { data: { byDay: revenueByDay(txs) }, error: null };
  } catch (err) {
    return fail(err);
  }
}

// ── Accounts ───────────────────────────────────────────────────────────────

/** When every account was created. Only the dates leave this function. */
export async function loadAccounts(service: Service): Promise<Loaded<AccountsReport>> {
  try {
    const createdAt: string[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { data, error } = await service.auth.admin.listUsers({ page, perPage: PAGE });
      if (error) return { data: null, error };
      for (const u of data.users) createdAt.push(u.created_at);
      if (data.users.length < PAGE) return { data: accountsByDay(createdAt), error: null };
    }
    return { data: null, error: { message: `more than ${MAX_PAGES * PAGE} accounts — count them in SQL instead` } };
  } catch (err) {
    return fail(err);
  }
}

// ── Where signups come from ────────────────────────────────────────────────

/** Attributed signups from the last 90 days, each marked with whether that account subscribes today. */
export async function loadAcquisition(service: Service): Promise<Loaded<AcquisitionReport>> {
  try {
    const since = new Date(Date.now() - 90 * DAY_MS).toISOString();
    type Row = { user_id: string; app: string | null; first_referrer: string | null; landing_path: string | null; utm_source: string | null; attributed_at: string };
    const rows: Row[] = [];
    for (let page = 0; ; page++) {
      if (page >= MAX_PAGES) return { data: null, error: { message: `more than ${MAX_PAGES * PAGE} attributed signups in 90 days — aggregate them in SQL instead` } };
      const { data, error } = await service
        .from('user_attribution')
        .select('user_id, app, first_referrer, landing_path, utm_source, attributed_at')
        .gte('attributed_at', since)
        .order('attributed_at', { ascending: true })
        .order('user_id', { ascending: true })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) return { data: null, error };
      rows.push(...(data as Row[]));
      if (data.length < PAGE) break;
    }

    const { data: live, error: liveError } = await service
      .from('subscriptions')
      .select('user_id')
      .in('status', ['active', 'trialing'])
      .limit(PAGE);
    if (liveError) return { data: null, error: liveError };
    const subscribed = new Set((live as { user_id: string }[]).map(r => r.user_id));

    return {
      data: {
        signups: rows.map(r => ({
          day: r.attributed_at.slice(0, 10),
          app: r.app ?? 'bs-football',
          source: sourceOf(r.utm_source, r.first_referrer),
          landing: landingOf(r.landing_path),
          subscribed: subscribed.has(r.user_id),
        })),
      },
      error: null,
    };
  } catch (err) {
    return fail(err);
  }
}
