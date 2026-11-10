/**
 * The numbers an owner reads first on /admin/analytics: money in, accounts
 * created, and where those accounts came from.
 *
 * Pure. The API route sends each report whole (every day it has), and the page
 * cuts it to the selected period here, so switching 7d/30d/90d never refetches
 * these and "vs the previous period" needs no second query.
 */

const DAY_MS = 86400000;
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** YYYY-MM-DD (UTC) -> count */
export type DayCounts = Record<string, number>;

// ── Windows ────────────────────────────────────────────────────────────────

/**
 * The UTC days in a period ending today (`periodsBack` 0) or in the equally
 * long period before it (1), oldest first. Today counts as a day, to match the
 * charts.
 */
export function periodDays(nowMs: number, days: number, periodsBack = 0): string[] {
  const end = nowMs - periodsBack * days * DAY_MS;
  return Array.from({ length: days }, (_, i) => dayOf(end - (days - 1 - i) * DAY_MS));
}

export function sumPeriod(byDay: DayCounts, nowMs: number, days: number, periodsBack = 0): number {
  return periodDays(nowMs, days, periodsBack).reduce((n, d) => n + (byDay[d] ?? 0), 0);
}

export interface Change {
  /** current - previous */
  abs: number;
  /** Fractional change, or null when there is nothing to divide by. */
  pct: number | null;
}

export function change(current: number, previous: number): Change {
  return { abs: current - previous, pct: previous > 0 ? (current - previous) / previous : null };
}

// ── Revenue ────────────────────────────────────────────────────────────────

/** One day of money movement, in cents. All three are positive amounts. */
export interface RevenueDay {
  /** Payments taken. */
  gross: number;
  /** Refunds and lost disputes. */
  refunds: number;
  /** Stripe's processing and billing fees. */
  fees: number;
}

export interface RevenueReport {
  byDay: Record<string, RevenueDay>;
}

/** The parts of a Stripe balance transaction this report reads. */
export interface BalanceTransactionFacts {
  /** unix seconds */
  created: number;
  reporting_category: string;
  /** cents; negative for money going out */
  amount: number;
  /** cents Stripe kept from this transaction */
  fee: number;
}

/**
 * Group Stripe's ledger into money in, money back, and fees per day.
 * Payouts to the bank and other balance movements are not revenue, so only the
 * categories named here count; anything unrecognised is left out, not guessed.
 */
export function revenueByDay(txs: BalanceTransactionFacts[]): Record<string, RevenueDay> {
  const byDay: Record<string, RevenueDay> = {};
  for (const t of txs) {
    const delta: RevenueDay = { gross: 0, refunds: 0, fees: 0 };
    switch (t.reporting_category) {
      case 'charge':
        delta.gross = t.amount;
        delta.fees = t.fee;
        break;
      case 'refund':
      case 'partial_capture_reversal':
      case 'dispute':
        delta.refunds = -t.amount;
        delta.fees = t.fee;
        break;
      case 'dispute_reversal':
        delta.refunds = -t.amount; // money returned to us: a negative refund
        delta.fees = t.fee;
        break;
      case 'fee':
        delta.fees = -t.amount + t.fee;
        break;
      default:
        continue;
    }
    const day = dayOf(t.created * 1000);
    const d = (byDay[day] ??= { gross: 0, refunds: 0, fees: 0 });
    d.gross += delta.gross;
    d.refunds += delta.refunds;
    d.fees += delta.fees;
  }
  return byDay;
}

export const netOf = (d: RevenueDay) => d.gross - d.refunds - d.fees;

export function revenueInPeriod(byDay: Record<string, RevenueDay>, nowMs: number, days: number, periodsBack = 0): RevenueDay {
  const total: RevenueDay = { gross: 0, refunds: 0, fees: 0 };
  for (const day of periodDays(nowMs, days, periodsBack)) {
    const d = byDay[day];
    if (!d) continue;
    total.gross += d.gross;
    total.refunds += d.refunds;
    total.fees += d.fees;
  }
  return total;
}

export interface RevenueMonth extends RevenueDay {
  /** YYYY-MM */
  month: string;
}

/** Calendar months from the first money movement through this month (at most `maxMonths`), gaps filled with zeros. */
export function revenueByMonth(byDay: Record<string, RevenueDay>, nowMs: number, maxMonths = 12): RevenueMonth[] {
  const days = Object.keys(byDay).sort();
  if (days.length === 0) return [];
  const months: RevenueMonth[] = [];
  const now = new Date(nowMs);
  const first = days[0].slice(0, 7);
  for (let i = 0; i < maxMonths; i++) {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7);
    if (month < first) break;
    months.unshift({ month, gross: 0, refunds: 0, fees: 0 });
  }
  const byMonth = new Map(months.map((m) => [m.month, m]));
  for (const day of days) {
    const m = byMonth.get(day.slice(0, 7));
    if (!m) continue;
    m.gross += byDay[day].gross;
    m.refunds += byDay[day].refunds;
    m.fees += byDay[day].fees;
  }
  return months;
}

// ── Accounts ───────────────────────────────────────────────────────────────

export interface AccountsReport {
  /** Accounts created per day, all time. */
  byDay: DayCounts;
  total: number;
}

export function accountsByDay(createdAt: string[]): AccountsReport {
  const byDay: DayCounts = {};
  for (const iso of createdAt) {
    const day = iso.slice(0, 10);
    byDay[day] = (byDay[day] ?? 0) + 1;
  }
  return { byDay, total: createdAt.length };
}

// ── Where signups come from ────────────────────────────────────────────────

/** One new account whose first visit we recorded (signup attribution, since 2026-10-28). */
export interface AttributedSignup {
  /** YYYY-MM-DD (UTC) */
  day: string;
  app: string;
  source: string;
  landing: string;
  /** Has a live Premium subscription today. */
  subscribed: boolean;
}

export interface AcquisitionReport {
  /** Every attributed signup in the last 90 days. */
  signups: AttributedSignup[];
}

const KNOWN_APP_REFERRERS: Record<string, string> = {
  'com.reddit.frontpage': 'reddit.com',
  'com.google.android.googlequicksearchbox': 'google.com',
  'com.google.android.gm': 'gmail',
};

/**
 * Where a signup came from, by the same rule as the `signups_by_source` view:
 * the utm_source tag if there is one, else the referring site, else "direct".
 * A referring Android app is folded into its website.
 */
export function sourceOf(utmSource: string | null, firstReferrer: string | null): string {
  if (utmSource) return utmSource.toLowerCase();
  if (!firstReferrer) return 'direct';
  const host = (firstReferrer.split('/')[2] ?? '').replace(/^www\./, '').toLowerCase();
  if (!host) return 'direct';
  return KNOWN_APP_REFERRERS[host] ?? host;
}

const ID_SEGMENT = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi;

/** Landing paths with per-game ids collapsed, so "/game/<id>" is one row instead of hundreds. */
export function landingOf(path: string | null): string {
  if (!path) return '(unknown)';
  return path.replace(ID_SEGMENT, '/…');
}

export interface RankedRow {
  label: string;
  signups: number;
  subscribers: number;
}

/** Signups since `fromDay`, grouped by one field, largest first; beyond `limit` rows the rest fold into "Other". */
export function rankSignups(
  signups: AttributedSignup[],
  fromDay: string,
  by: 'source' | 'landing' | 'app',
  limit = 8,
): RankedRow[] {
  const rows = new Map<string, RankedRow>();
  for (const s of signups) {
    if (s.day < fromDay) continue;
    const row = rows.get(s[by]) ?? { label: s[by], signups: 0, subscribers: 0 };
    row.signups++;
    if (s.subscribed) row.subscribers++;
    rows.set(s[by], row);
  }
  const ranked = [...rows.values()].sort((a, b) => b.signups - a.signups || a.label.localeCompare(b.label));
  if (ranked.length <= limit) return ranked;
  const rest = ranked.slice(limit - 1);
  return [
    ...ranked.slice(0, limit - 1),
    { label: `Other (${rest.length})`, signups: rest.reduce((n, r) => n + r.signups, 0), subscribers: rest.reduce((n, r) => n + r.subscribers, 0) },
  ];
}

// ── Formatting ─────────────────────────────────────────────────────────────

/** $1,234.56, or $1,235 once the cents stop mattering. */
export function money(cents: number): string {
  const dollars = cents / 100;
  const whole = Math.abs(dollars) >= 1000;
  return dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
}
