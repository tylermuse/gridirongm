import { describe, expect, it } from 'vitest';
import {
  MAX_DAILY_BARS,
  PERIODS,
  countsByMonth,
  needsLongDailySeries,
  parsePeriod,
  resolveRange,
  sinceIso,
  weeklyAverage,
} from '../src/app/admin/analytics/periods';
import { periodDays } from '../src/app/admin/analytics/businessMetrics';

const NOW = Date.parse('2026-11-10T15:00:00Z');

describe('parsePeriod', () => {
  it('accepts every option in the dropdown', () => {
    for (const p of PERIODS) expect(parsePeriod(p.value)).toBe(p.value);
  });

  it('falls back to 30 days for anything else', () => {
    expect(parsePeriod(null)).toBe('30d');
    expect(parsePeriod('45d')).toBe('30d');
    expect(parsePeriod('')).toBe('30d');
  });
});

describe('sinceIso', () => {
  it('starts a fixed range that many days back', () => {
    expect(sinceIso('7d', NOW)).toBe('2026-11-03T15:00:00.000Z');
    expect(sinceIso('6m', NOW)).toBe('2026-05-12T15:00:00.000Z');
  });

  it('starts all time before either game existed', () => {
    expect(Date.parse(sinceIso('all', NOW))).toBeLessThan(Date.parse('2025-01-01T00:00:00Z'));
  });
});

describe('needsLongDailySeries', () => {
  it('is only true past the 30 days the active-users report already carries', () => {
    expect(PERIODS.filter((p) => needsLongDailySeries(p.value)).map((p) => p.value)).toEqual(['90d', '6m', 'all']);
  });
});

describe('resolveRange', () => {
  it('words a fixed range and gives it something to compare with', () => {
    expect(resolveRange('7d', NOW, '2026-03-01')).toEqual({
      period: '7d',
      days: 7,
      short: '7d',
      phrase: 'last 7d',
      previous: 'vs previous 7d',
      ago: 'vs 7 days ago',
    });
    expect(resolveRange('6m', NOW, null)).toMatchObject({ days: 182, phrase: 'last 6 months', previous: 'vs previous 6 months', ago: 'vs 6 months ago' });
  });

  it('makes all time run from the first day of data through today, with nothing to compare against', () => {
    const r = resolveRange('all', NOW, '2026-11-01');
    expect(r).toMatchObject({ days: 10, phrase: 'all time', short: 'all time', previous: null, ago: null });
    expect(periodDays(NOW, r.days)[0]).toBe('2026-11-01');
  });

  it('still gives all time a length when no report loaded', () => {
    expect(resolveRange('all', NOW, null).days).toBe(365);
  });

  it('keeps six months of daily bars daily', () => {
    expect(resolveRange('6m', NOW, null).days).toBeLessThanOrEqual(MAX_DAILY_BARS);
  });
});

describe('weeklyAverage', () => {
  it('averages each Monday-to-Sunday week over the days it has', () => {
    const series = [
      { day: '2026-11-01', all: 70, engaged: 7 }, // Sunday: last day of the week of Oct 26
      { day: '2026-11-02', all: 100, engaged: 50 }, // Monday
      { day: '2026-11-03', all: 200, engaged: 100 },
      { day: '2026-11-09', all: 31, engaged: 10 }, // next Monday
    ];
    expect(weeklyAverage(series)).toEqual([
      { day: '2026-10-26', all: 70, engaged: 7 },
      { day: '2026-11-02', all: 150, engaged: 75 },
      { day: '2026-11-09', all: 31, engaged: 10 },
    ]);
  });

  it('returns nothing for nothing', () => {
    expect(weeklyAverage([])).toEqual([]);
  });
});

describe('countsByMonth', () => {
  it('sums the days of the range into calendar months, keeping empty months', () => {
    const days = periodDays(NOW, 72); // 2026-08-31 .. 2026-11-10
    const byDay = { '2026-08-31': 2, '2026-08-01': 99, '2026-10-05': 3, '2026-10-06': 4, '2026-11-10': 1 };
    expect(countsByMonth(byDay, days)).toEqual([
      { day: '2026-08-01', value: 2 },
      { day: '2026-09-01', value: 0 },
      { day: '2026-10-01', value: 7 },
      { day: '2026-11-01', value: 1 },
    ]);
  });
});
