/**
 * The range selector on /admin/analytics.
 *
 * Pure, and shared by the page and the API route so the two can never disagree
 * about what a range means.
 */

const DAY_MS = 86400000;

export const PERIODS = [
  { value: '7d', label: 'Last 7 days', short: '7d', days: 7 },
  { value: '30d', label: 'Last 30 days', short: '30d', days: 30 },
  { value: '90d', label: 'Last 90 days', short: '90d', days: 90 },
  { value: '6m', label: 'Last 6 months', short: '6 months', days: 182 },
  // Everything there is. Its length depends on how far back the data goes, so `days` is worked out per request.
  { value: 'all', label: 'All time', short: 'all time', days: null },
] as const;

export type Period = (typeof PERIODS)[number]['value'];

export const DEFAULT_PERIOD: Period = '30d';

/** Anything that isn't a known range (a stale link, a typo) falls back to the default. */
export function parsePeriod(raw: string | null | undefined): Period {
  return PERIODS.find((p) => p.value === raw)?.value ?? DEFAULT_PERIOD;
}

/** Where "all time" starts for the database reports: before the first event either game ever recorded. */
const ALL_TIME_SINCE = '2020-01-01T00:00:00.000Z';

/** The `p_since` the windowed reports are asked for. */
export function sinceIso(period: Period, nowMs: number): string {
  const days = PERIODS.find((p) => p.value === period)!.days;
  return days === null ? ALL_TIME_SINCE : new Date(nowMs - days * DAY_MS).toISOString();
}

/**
 * admin_active_users() already returns the last 30 days of the daily chart, so
 * only a longer range needs the separate admin_daily_active() query.
 */
export function needsLongDailySeries(period: Period): boolean {
  const days = PERIODS.find((p) => p.value === period)!.days;
  return days === null || days > 30;
}

/** A selected range, resolved to a length in days and the words the page uses for it. */
export interface Range {
  period: Period;
  /** Days in the range, today included. */
  days: number;
  /** For card titles: "7d", "6 months", "all time". */
  short: string;
  /** For tile labels: "last 7d", "last 6 months", "all time". */
  phrase: string;
  /** "vs previous 7d". Null for all time, which has no earlier period to compare with. */
  previous: string | null;
  /** "vs 7 days ago". Null for all time. */
  ago: string | null;
}

/**
 * @param firstDay The earliest day (YYYY-MM-DD, UTC) any loaded report has data
 *   for; it sets how long "all time" is. Null when nothing has loaded.
 */
export function resolveRange(period: Period, nowMs: number, firstDay: string | null): Range {
  const p = PERIODS.find((x) => x.value === period)!;
  if (p.days === null) {
    const today = Date.parse(`${new Date(nowMs).toISOString().slice(0, 10)}T00:00:00Z`);
    const first = firstDay ? Date.parse(`${firstDay}T00:00:00Z`) : NaN;
    const days = Number.isNaN(first) || first > today ? 365 : Math.round((today - first) / DAY_MS) + 1;
    return { period, days, short: p.short, phrase: p.short, previous: null, ago: null };
  }
  return {
    period,
    days: p.days,
    short: p.short,
    phrase: `last ${p.short}`,
    previous: `vs previous ${p.short}`,
    ago: p.value === '6m' ? 'vs 6 months ago' : `vs ${p.days} days ago`,
  };
}

/** Past this many daily bars a chart groups its days (by week or month) so the bars stay readable. */
export const MAX_DAILY_BARS = 185;

export interface ActiveDay {
  /** YYYY-MM-DD */
  day: string;
  all: number;
  engaged: number;
}

/**
 * A long daily series as one bar per calendar week (Monday start): the average
 * devices per day that week. An average, not a sum, because one device active
 * on five days is still one device. The first and last weeks may be partial
 * and are averaged over the days they have.
 */
export function weeklyAverage(series: ActiveDay[]): ActiveDay[] {
  const weeks = new Map<string, { all: number; engaged: number; n: number }>();
  for (const d of series) {
    const t = Date.parse(`${d.day}T00:00:00Z`);
    const sinceMonday = (new Date(t).getUTCDay() + 6) % 7;
    const weekStart = new Date(t - sinceMonday * DAY_MS).toISOString().slice(0, 10);
    const w = weeks.get(weekStart) ?? { all: 0, engaged: 0, n: 0 };
    w.all += d.all;
    w.engaged += d.engaged;
    w.n += 1;
    weeks.set(weekStart, w);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, w]) => ({ day, all: Math.round(w.all / w.n), engaged: Math.round(w.engaged / w.n) }));
}

/** Per-day counts summed into calendar months, oldest first; `day` is the first of each month. */
export function countsByMonth(byDay: Record<string, number>, days: string[]): { day: string; value: number }[] {
  const months = new Map<string, number>();
  for (const day of days) {
    const month = day.slice(0, 7);
    months.set(month, (months.get(month) ?? 0) + (byDay[day] ?? 0));
  }
  return [...months.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([month, value]) => ({ day: `${month}-01`, value }));
}
