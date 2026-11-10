import { describe, expect, it } from 'vitest';
import {
  buildSpans,
  buildSubscriberDays,
  sampleDays,
  windowChange,
  type StripeSubscriptionFacts,
  type TableSubscription,
} from '../src/app/admin/analytics/subscriberGrowth';

const NOW = Date.parse('2026-11-10T15:00:00Z');
const at = (day: string) => `${day}T12:00:00.000Z`;

describe('buildSubscriberDays', () => {
  it('returns nothing when there has never been a subscriber', () => {
    expect(buildSubscriberDays([], NOW)).toEqual([]);
  });

  it('runs one row per day from the first subscriber through today', () => {
    const days = buildSubscriberDays([{ userId: 'a', start: at('2026-11-07'), end: null }], NOW);
    expect(days.map((d) => d.day)).toEqual(['2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10']);
    expect(days.map((d) => d.active)).toEqual([1, 1, 1, 1]);
    expect(days[0].started).toBe(1);
  });

  it('adds subscribers as they start and drops them the day they end', () => {
    const days = buildSubscriberDays(
      [
        { userId: 'a', start: at('2026-11-06'), end: null },
        { userId: 'b', start: at('2026-11-07'), end: at('2026-11-09') },
        { userId: 'c', start: at('2026-11-08'), end: null },
      ],
      NOW,
    );
    expect(days.map((d) => d.active)).toEqual([1, 2, 3, 2, 2]);
    expect(days.find((d) => d.day === '2026-11-09')).toMatchObject({ started: 0, churned: 1 });
  });

  it("counts one account once, however many overlapping subscriptions it has", () => {
    // A double checkout: two subscriptions the same day, the duplicate cancelled a week later.
    const days = buildSubscriberDays(
      [
        { userId: 'a', start: at('2026-11-01'), end: null },
        { userId: 'a', start: at('2026-11-01'), end: at('2026-11-08') },
      ],
      NOW,
    );
    expect(days.every((d) => d.active === 1)).toBe(true);
    expect(days.reduce((n, d) => n + d.started, 0)).toBe(1);
    expect(days.reduce((n, d) => n + d.churned, 0)).toBe(0);
  });

  it('counts a lapse and a return as churn, then a new subscriber', () => {
    const days = buildSubscriberDays(
      [
        { userId: 'a', start: at('2026-11-01'), end: at('2026-11-03') },
        { userId: 'a', start: at('2026-11-06'), end: null },
      ],
      NOW,
    );
    expect(days.slice(0, 7).map((d) => d.active)).toEqual([1, 1, 0, 0, 0, 1, 1]);
    expect(days.reduce((n, d) => n + d.started, 0)).toBe(2);
  });

  it('keeps a subscription that ends later today counted until it ends', () => {
    const days = buildSubscriberDays([{ userId: 'a', start: at('2026-11-09'), end: '2026-11-10T20:00:00Z' }], NOW);
    expect(days[days.length - 1]).toMatchObject({ day: '2026-11-10', active: 1, churned: 0 });
  });

  it('ignores unusable dates', () => {
    const days = buildSubscriberDays(
      [
        { userId: 'a', start: 'not a date', end: null },
        { userId: 'b', start: at('2026-12-25'), end: null },
        { userId: 'c', start: at('2026-11-09'), end: at('2026-11-01') },
      ],
      NOW,
    );
    expect(days).toEqual([]);
  });
});

describe('windowChange', () => {
  it('sums starts and losses over the last N days only', () => {
    const days = buildSubscriberDays(
      [
        { userId: 'a', start: at('2026-10-01'), end: null },
        { userId: 'b', start: at('2026-11-05'), end: at('2026-11-09') },
        { userId: 'c', start: at('2026-11-10'), end: null },
      ],
      NOW,
    );
    expect(windowChange(days, 7)).toEqual({ started: 2, churned: 1, net: 1 });
    expect(windowChange(days, 90)).toEqual({ started: 3, churned: 1, net: 2 });
  });
});

describe('sampleDays', () => {
  const days = buildSubscriberDays([{ userId: 'a', start: at('2025-11-01'), end: null }], NOW);

  it('leaves a short history alone', () => {
    expect(sampleDays(days.slice(-30), 120)).toHaveLength(30);
  });

  it('thins a long history to the cap and always keeps today', () => {
    const sampled = sampleDays(days, 120);
    expect(sampled.length).toBeLessThanOrEqual(120);
    expect(sampled[sampled.length - 1].day).toBe('2026-11-10');
    expect(sampled.map((d) => d.day)).toEqual([...sampled.map((d) => d.day)].sort());
  });
});

describe('buildSpans', () => {
  const unix = (day: string) => Date.parse(at(day)) / 1000;
  const row = (over: Partial<TableSubscription>): TableSubscription => ({
    id: 'sub_1',
    user_id: 'user-a',
    status: 'active',
    created_at: at('2026-10-14'),
    updated_at: at('2026-10-14'),
    ...over,
  });
  const stripeSub = (over: Partial<StripeSubscriptionFacts>): StripeSubscriptionFacts => ({
    id: 'sub_1',
    status: 'active',
    created: unix('2026-08-02'),
    ended_at: null,
    canceled_at: null,
    cancel_at: null,
    monthlyCents: 499,
    accountKey: 'cus_1',
    ...over,
  });

  it("dates a subscription from Stripe, not from when our row was written", () => {
    const { spans, tableOnly } = buildSpans([row({})], [stripeSub({})]);
    expect(spans).toEqual([{ userId: 'user-a', start: at('2026-08-02'), end: null, monthlyCents: 499 }]);
    expect(tableOnly).toBe(0);
  });

  it('includes past subscriptions that only Stripe remembers', () => {
    const { spans, stripeOnlyLive } = buildSpans(
      [],
      [stripeSub({ status: 'canceled', created: unix('2026-07-11'), ended_at: unix('2026-08-19'), canceled_at: unix('2026-08-19') })],
    );
    expect(spans).toEqual([{ userId: 'cus_1', start: at('2026-07-11'), end: at('2026-08-19'), monthlyCents: 499 }]);
    expect(stripeOnlyLive).toBe(0);
  });

  it('ends a cancel-at-period-end subscription when it actually ended, not when the cancel was requested', () => {
    const { spans } = buildSpans(
      [row({ status: 'canceled', updated_at: at('2026-10-29') })],
      [stripeSub({ status: 'canceled', created: unix('2026-09-29'), canceled_at: unix('2026-10-14'), ended_at: unix('2026-10-29') })],
    );
    expect(spans[0].end).toBe(at('2026-10-29'));
  });

  it('keeps a subscription live while it is only scheduled to cancel, and lists when it will go', () => {
    const { spans, scheduledToCancel } = buildSpans(
      [row({})],
      [stripeSub({ canceled_at: unix('2026-11-06'), cancel_at: unix('2026-12-06') })],
    );
    expect(spans[0].end).toBeNull();
    expect(scheduledToCancel).toEqual([{ day: '2026-12-06', monthlyCents: 499 }]);
  });

  it('counts failed payments Stripe is still retrying', () => {
    expect(buildSpans([], [stripeSub({ status: 'past_due' }), stripeSub({ id: 'sub_2' })]).pastDue).toBe(1);
    expect(buildSpans([row({ status: 'past_due' })], null).pastDue).toBe(1);
  });

  it('lets our table decide who is live today, so the chart matches the conversion card', () => {
    // Payment failed: Stripe has not ended it, but the app (and the card) stopped counting it.
    const { spans } = buildSpans(
      [row({ status: 'past_due', updated_at: at('2026-11-05') })],
      [stripeSub({ status: 'past_due' })],
    );
    expect(spans[0].end).toBe(at('2026-11-05'));
  });

  it('counts and flags a live Stripe subscription our table never recorded', () => {
    const { spans, stripeOnlyLive } = buildSpans([], [stripeSub({})]);
    expect(spans[0].end).toBeNull();
    expect(stripeOnlyLive).toBe(1);
  });

  it('keeps table rows Stripe has never heard of, on the table\'s own dates', () => {
    const comped = row({ id: '58653368-uuid', user_id: 'user-b', created_at: at('2026-07-18') });
    const { spans, tableOnly } = buildSpans([comped, row({})], [stripeSub({})]);
    expect(tableOnly).toBe(1);
    expect(spans).toContainEqual({ userId: 'user-b', start: at('2026-07-18'), end: null, monthlyCents: 0 });
  });

  it('never counts a checkout that was not paid', () => {
    const { spans } = buildSpans(
      [row({ status: 'incomplete_expired' }), row({ id: 'manual', status: 'incomplete' })],
      [stripeSub({ status: 'incomplete_expired' })],
    );
    expect(spans).toEqual([]);
  });

  it("falls back to the table's dates when Stripe cannot be read", () => {
    const { spans, tableOnly } = buildSpans(
      [row({}), row({ id: 'sub_2', user_id: 'user-c', status: 'canceled', created_at: at('2026-10-03'), updated_at: at('2026-10-14') })],
      null,
    );
    expect(spans).toEqual([
      { userId: 'user-a', start: at('2026-10-14'), end: null, monthlyCents: 0 },
      { userId: 'user-c', start: at('2026-10-03'), end: at('2026-10-14'), monthlyCents: 0 },
    ]);
    expect(tableOnly).toBe(0);
  });
});

describe('monthly recurring revenue', () => {
  it('adds up what live subscriptions bill, day by day', () => {
    const days = buildSubscriberDays(
      [
        { userId: 'a', start: at('2026-11-07'), end: null, monthlyCents: 499 },
        { userId: 'b', start: at('2026-11-08'), end: at('2026-11-09'), monthlyCents: 499 },
        { userId: 'comped', start: at('2026-11-07'), end: null, monthlyCents: 0 },
      ],
      NOW,
    );
    expect(days.map((d) => d.mrrCents)).toEqual([499, 998, 499, 499]);
    expect(days.map((d) => d.active)).toEqual([2, 3, 2, 2]);
  });

  it("bills an account once for overlapping duplicates", () => {
    const days = buildSubscriberDays(
      [
        { userId: 'a', start: at('2026-11-08'), end: null, monthlyCents: 499 },
        { userId: 'a', start: at('2026-11-08'), end: at('2026-11-09'), monthlyCents: 499 },
      ],
      NOW,
    );
    expect(days.map((d) => d.mrrCents)).toEqual([499, 499, 499]);
  });
});
