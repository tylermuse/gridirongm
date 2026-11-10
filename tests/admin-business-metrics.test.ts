import { describe, expect, it } from 'vitest';
import {
  accountsByDay,
  change,
  landingOf,
  money,
  netOf,
  periodDays,
  rankSignups,
  revenueByDay,
  revenueByMonth,
  revenueInPeriod,
  sourceOf,
  sumPeriod,
  type AttributedSignup,
} from '../src/app/admin/analytics/businessMetrics';

const NOW = Date.parse('2026-11-10T15:00:00Z');
const unix = (iso: string) => Date.parse(iso) / 1000;

describe('periods', () => {
  it('ends a period today and counts today as a day', () => {
    expect(periodDays(NOW, 3)).toEqual(['2026-11-08', '2026-11-09', '2026-11-10']);
  });

  it('puts the previous period directly before it, same length, no overlap', () => {
    expect(periodDays(NOW, 3, 1)).toEqual(['2026-11-05', '2026-11-06', '2026-11-07']);
  });

  it('sums a per-day count over either period', () => {
    const byDay = { '2026-11-10': 4, '2026-11-08': 1, '2026-11-07': 10, '2026-11-01': 99 };
    expect(sumPeriod(byDay, NOW, 3)).toBe(5);
    expect(sumPeriod(byDay, NOW, 3, 1)).toBe(10);
  });
});

describe('change', () => {
  it('gives the difference and the fractional change', () => {
    expect(change(150, 100)).toEqual({ abs: 50, pct: 0.5 });
    expect(change(50, 100)).toEqual({ abs: -50, pct: -0.5 });
  });

  it('has no percentage when there was nothing before', () => {
    expect(change(7, 0)).toEqual({ abs: 7, pct: null });
  });
});

describe('revenue', () => {
  const txs = [
    { created: unix('2026-11-06T17:31:00Z'), reporting_category: 'charge', amount: 499, fee: 44 },
    { created: unix('2026-11-06T20:00:00Z'), reporting_category: 'fee', amount: -3, fee: 0 },
    { created: unix('2026-10-13T12:00:00Z'), reporting_category: 'refund', amount: -499, fee: 0 },
    { created: unix('2026-10-03T12:00:00Z'), reporting_category: 'charge', amount: 499, fee: 52 },
    // Stripe billing fee that itself carried sales tax
    { created: unix('2026-10-03T13:00:00Z'), reporting_category: 'fee', amount: -14, fee: 1 },
    // Money moving to the bank is not revenue
    { created: unix('2026-11-07T12:00:00Z'), reporting_category: 'payout', amount: -1787, fee: 0 },
    { created: unix('2026-11-07T12:00:00Z'), reporting_category: 'something_new', amount: 5000, fee: 0 },
  ];
  const byDay = revenueByDay(txs);

  it('splits the ledger into payments, refunds and fees per day', () => {
    expect(byDay['2026-11-06']).toEqual({ gross: 499, refunds: 0, fees: 47 });
    expect(byDay['2026-10-13']).toEqual({ gross: 0, refunds: 499, fees: 0 });
    expect(byDay['2026-10-03']).toEqual({ gross: 499, refunds: 0, fees: 67 });
  });

  it('leaves out payouts and categories it does not recognise', () => {
    expect(byDay['2026-11-07']).toBeUndefined();
  });

  it('nets a period: payments less refunds less fees', () => {
    expect(netOf(revenueInPeriod(byDay, NOW, 7))).toBe(499 - 47);
    expect(netOf(revenueInPeriod(byDay, NOW, 30))).toBe(499 - 47 - 499);
    expect(netOf(revenueInPeriod(byDay, NOW, 7, 1))).toBe(0);
  });

  it('rolls up by calendar month from the first payment through this month', () => {
    const months = revenueByMonth(byDay, NOW);
    expect(months.map((m) => m.month)).toEqual(['2026-10', '2026-11']);
    expect(netOf(months[0])).toBe(499 - 67 - 499);
    expect(months[1]).toMatchObject({ gross: 499, fees: 47 });
  });

  it('keeps an empty month between two paying ones, and caps how far back it goes', () => {
    const sparse = revenueByDay([
      { created: unix('2025-01-15T00:00:00Z'), reporting_category: 'charge', amount: 100, fee: 0 },
      { created: unix('2026-09-15T00:00:00Z'), reporting_category: 'charge', amount: 100, fee: 0 },
      { created: unix('2026-11-01T00:00:00Z'), reporting_category: 'charge', amount: 100, fee: 0 },
    ]);
    expect(revenueByMonth(sparse, NOW, 3).map((m) => [m.month, m.gross])).toEqual([
      ['2026-09', 100],
      ['2026-10', 0],
      ['2026-11', 100],
    ]);
  });

  it('has no months before any money moved', () => {
    expect(revenueByMonth({}, NOW)).toEqual([]);
  });
});

describe('accountsByDay', () => {
  it('counts accounts by the UTC day they were created', () => {
    expect(accountsByDay(['2026-11-09T23:59:59Z', '2026-11-09T00:00:00Z', '2026-11-10T01:00:00Z'])).toEqual({
      byDay: { '2026-11-09': 2, '2026-11-10': 1 },
      total: 3,
    });
  });
});

describe('signup sources', () => {
  it('prefers the utm tag, then the referring site, then direct', () => {
    expect(sourceOf('ChatGPT.com', 'https://www.google.com/')).toBe('chatgpt.com');
    expect(sourceOf(null, 'https://www.google.com/')).toBe('google.com');
    expect(sourceOf('', 'https://gemini.google.com/app')).toBe('gemini.google.com');
    expect(sourceOf(null, null)).toBe('direct');
    expect(sourceOf(null, '')).toBe('direct');
  });

  it('folds a referring Android app into its site', () => {
    expect(sourceOf(null, 'android-app://com.reddit.frontpage/')).toBe('reddit.com');
    expect(sourceOf(null, 'https://www.reddit.com/')).toBe('reddit.com');
  });

  it('collapses per-game ids in landing paths', () => {
    expect(landingOf('/game/9c85ad56-4b5b-4f3f-9b8d-9fe5937600fd')).toBe('/game/…');
    expect(landingOf('/rosters/2026')).toBe('/rosters/2026');
    expect(landingOf(null)).toBe('(unknown)');
  });

  const signup = (over: Partial<AttributedSignup>): AttributedSignup => ({
    day: '2026-11-05',
    app: 'bs-football',
    source: 'google.com',
    landing: '/',
    subscribed: false,
    ...over,
  });

  it('ranks by signups and counts who went on to subscribe', () => {
    const rows = rankSignups(
      [signup({}), signup({ subscribed: true }), signup({ source: 'reddit.com' }), signup({ source: 'direct', day: '2026-10-01' })],
      '2026-11-01',
      'source',
    );
    expect(rows).toEqual([
      { label: 'google.com', signups: 2, subscribers: 1 },
      { label: 'reddit.com', signups: 1, subscribers: 0 },
    ]);
  });

  it('folds the long tail into Other without losing any signups', () => {
    const many = Array.from({ length: 12 }, (_, i) => signup({ source: `site-${String(i).padStart(2, '0')}.com` }));
    const rows = rankSignups([...many, signup({}), signup({})], '2026-11-01', 'source', 4);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ label: 'google.com', signups: 2 });
    expect(rows[3]).toMatchObject({ label: 'Other (10)', signups: 10 });
    expect(rows.reduce((n, r) => n + r.signups, 0)).toBe(14);
  });
});

describe('money', () => {
  it('prints cents as dollars, dropping the cents once they stop mattering', () => {
    expect(money(5489)).toBe('$54.89');
    expect(money(-47)).toBe('-$0.47');
    expect(money(0)).toBe('$0.00');
    expect(money(123456)).toBe('$1,235');
  });
});
