/**
 * Premium subscriber count over time, for /admin/analytics.
 *
 * Pure: the API route reads our `subscriptions` table and Stripe, and this
 * turns the two into one span per subscription and then a per-day series.
 */

/** One subscription's paid lifetime. `end` is null while it is still live. */
export interface SubscriptionSpan {
  userId: string;
  /** ISO timestamp */
  start: string;
  /** ISO timestamp, or null if the subscription is still live */
  end: string | null;
  /** What it bills per month, in cents. 0 for a comped account. */
  monthlyCents?: number;
}

export interface SubscriberDay {
  /** YYYY-MM-DD (UTC) */
  day: string;
  /** Subscribers at the end of this day (for today: right now). */
  active: number;
  /** Accounts that became subscribers this day. */
  started: number;
  /** Accounts that stopped being subscribers this day. */
  churned: number;
  /** Monthly recurring revenue at the end of this day, in cents: list price, before discounts and Stripe fees. */
  mrrCents: number;
}

/** A live subscription that already has an end date. */
export interface ScheduledCancel {
  /** YYYY-MM-DD (UTC) it stops */
  day: string;
  monthlyCents: number;
}

export interface SubscriberGrowth {
  /** Every UTC day from the first subscriber through today; empty if there has never been one. */
  days: SubscriberDay[];
  /** Subscriptions counted, across Stripe and our table. */
  subscriptions: number;
  /** Of those, how many are in our table but not in Stripe (comped or added by hand), so their dates are the table's. */
  tableOnly: number;
  /** Live in Stripe with no row in our table: someone paying whom the app does not know is Premium. */
  stripeOnlyLive: number;
  /** Live today, but the subscriber has already cancelled; soonest first. */
  scheduledToCancel: ScheduledCancel[];
  /** Subscriptions whose last payment failed and Stripe is still retrying. Not counted as subscribers. */
  pastDue: number;
  /** Set when Stripe could not be read, so every date is the approximate one from our own table. */
  stripeError?: string;
}

/** A row of our `subscriptions` table. */
export interface TableSubscription {
  id: string;
  user_id: string;
  status: string;
  created_at: string;
  updated_at: string | null;
}

/** The parts of a Stripe subscription this report reads. Times are unix seconds. */
export interface StripeSubscriptionFacts {
  id: string;
  status: string;
  created: number;
  ended_at: number | null;
  canceled_at: number | null;
  /** Set while the subscription is live but already has an end date. */
  cancel_at: number | null;
  /** What it bills per month, in cents (a yearly plan divided by 12). */
  monthlyCents: number;
  /** Whatever identifies the person when our table has no row: user id, else email, else customer id. */
  accountKey: string;
}

const LIVE_STATUSES = new Set(['active', 'trialing']);
/** Never paid, so never a subscriber. */
const NEVER_STARTED = new Set(['incomplete', 'incomplete_expired']);
const isoFromUnix = (seconds: number) => new Date(seconds * 1000).toISOString();

/**
 * One span per subscription, from both sources.
 *
 * Stripe is the record of WHEN: our table's created_at is when a row was
 * written, not when the person paid (rows backfilled on 2026-10-14 all carry
 * that date), and subscriptions whose webhook was dropped before the handler
 * was fixed were never written at all, so only Stripe remembers them.
 *
 * Our table is the record of WHO IS LIVE NOW, so today's count agrees with the
 * subscriber count on the conversion card. It also holds the rows Stripe has
 * never heard of (a comped account), which keep the table's own dates.
 *
 * Pass `stripe: null` when Stripe could not be read: every span then falls
 * back to the table's dates.
 */
export function buildSpans(
  table: TableSubscription[],
  stripe: StripeSubscriptionFacts[] | null,
): { spans: SubscriptionSpan[]; tableOnly: number; stripeOnlyLive: number; scheduledToCancel: ScheduledCancel[]; pastDue: number } {
  const rowById = new Map(table.map((r) => [r.id, r]));
  const inStripe = new Set<string>();
  const spans: SubscriptionSpan[] = [];
  let stripeOnlyLive = 0;
  const scheduledToCancel: ScheduledCancel[] = [];
  const pastDue = stripe
    ? stripe.filter((s) => s.status === 'past_due').length
    : table.filter((r) => r.status === 'past_due').length;

  for (const s of stripe ?? []) {
    inStripe.add(s.id);
    if (NEVER_STARTED.has(s.status)) continue;
    const row = rowById.get(s.id);
    const stripeEnd = s.ended_at ?? (LIVE_STATUSES.has(s.status) ? null : s.canceled_at);
    let end: string | null;
    if (row) {
      end = LIVE_STATUSES.has(row.status) ? null : stripeEnd !== null ? isoFromUnix(stripeEnd) : (row.updated_at ?? row.created_at);
    } else {
      end = stripeEnd !== null ? isoFromUnix(stripeEnd) : null;
      if (end === null) stripeOnlyLive++;
    }
    spans.push({ userId: row?.user_id ?? s.accountKey, start: isoFromUnix(s.created), end, monthlyCents: s.monthlyCents });
    if (end === null && s.cancel_at !== null) {
      scheduledToCancel.push({ day: isoFromUnix(s.cancel_at).slice(0, 10), monthlyCents: s.monthlyCents });
    }
  }

  let tableOnly = 0;
  for (const r of table) {
    if (inStripe.has(r.id) || NEVER_STARTED.has(r.status)) continue;
    if (stripe) tableOnly++;
    spans.push({
      userId: r.user_id,
      start: r.created_at,
      end: LIVE_STATUSES.has(r.status) ? null : (r.updated_at ?? r.created_at),
      monthlyCents: 0,
    });
  }

  scheduledToCancel.sort((a, b) => a.day.localeCompare(b.day));
  return { spans, tableOnly, stripeOnlyLive, scheduledToCancel, pastDue };
}

const DAY_MS = 86400000;
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Counts ACCOUNTS, not subscriptions: one person's overlapping subscriptions
 * (a double checkout, or a replacement started before the old one lapsed) are
 * merged into a single stretch, so they are neither counted twice nor shown as
 * churn. Someone who lapses and later comes back counts as churned, then new.
 */
export function buildSubscriberDays(spans: SubscriptionSpan[], nowMs: number): SubscriberDay[] {
  const byUser = new Map<string, { start: number; end: number; cents: number }[]>();
  for (const s of spans) {
    const start = Date.parse(s.start);
    const end = s.end === null ? Infinity : Date.parse(s.end);
    // A span that starts in the future, or ends before it starts, is bad data; leave it out.
    if (!Number.isFinite(start) || Number.isNaN(end) || start > nowMs || end < start) continue;
    const list = byUser.get(s.userId) ?? [];
    list.push({ start, end, cents: s.monthlyCents ?? 0 });
    byUser.set(s.userId, list);
  }

  const started = new Map<string, number>();
  const churned = new Map<string, number>();
  const bump = (m: Map<string, number>, ms: number) => m.set(dayOf(ms), (m.get(dayOf(ms)) ?? 0) + 1);
  let first = Infinity;

  for (const list of byUser.values()) {
    list.sort((a, b) => a.start - b.start);
    let cur = { start: list[0].start, end: list[0].end };
    const stretches = [cur];
    for (const next of list.slice(1)) {
      if (next.start <= cur.end) cur.end = Math.max(cur.end, next.end);
      else stretches.push((cur = { start: next.start, end: next.end }));
    }
    for (const st of stretches) {
      first = Math.min(first, st.start);
      bump(started, st.start);
      if (st.end <= nowMs) bump(churned, st.end);
    }
  }

  if (!Number.isFinite(first)) return [];

  const days: SubscriberDay[] = [];
  let active = 0;
  const lastDay = dayOf(nowMs);
  for (let t = Date.parse(`${dayOf(first)}T00:00:00Z`); ; t += DAY_MS) {
    const day = dayOf(t);
    const s = started.get(day) ?? 0;
    const c = churned.get(day) ?? 0;
    active += s - c;
    // An account pays once however many overlapping subscriptions it has (the
    // duplicates were refunded), so it contributes its largest live one.
    const at = Math.min(t + DAY_MS - 1, nowMs);
    let mrrCents = 0;
    for (const list of byUser.values()) {
      let best = 0;
      for (const sp of list) if (sp.start <= at && sp.end > at) best = Math.max(best, sp.cents);
      mrrCents += best;
    }
    days.push({ day, active, started: s, churned: c, mrrCents });
    if (day >= lastDay) break;
  }
  return days;
}

/** New and lost subscribers over the last `windowDays` days of the series (today included). */
export function windowChange(days: SubscriberDay[], windowDays: number): { started: number; churned: number; net: number } {
  const recent = days.slice(-windowDays);
  const started = recent.reduce((n, d) => n + d.started, 0);
  const churned = recent.reduce((n, d) => n + d.churned, 0);
  return { started, churned, net: started - churned };
}

/**
 * Thin a long history down to at most `maxBars` evenly spaced days, always
 * keeping today, so a year of history still fits the chart. Each kept bar is
 * the count on that day, which is all a running total needs.
 */
export function sampleDays(days: SubscriberDay[], maxBars: number): SubscriberDay[] {
  if (days.length <= maxBars) return days;
  const step = Math.ceil(days.length / maxBars);
  const out: SubscriberDay[] = [];
  for (let i = days.length - 1; i >= 0; i -= step) out.unshift(days[i]);
  return out;
}
