'use client';

import { useState } from 'react';
import { DailyBars } from './DailyBars';
import { change, periodDays, rankSignups, sumPeriod, type AccountsReport, type AcquisitionReport, type DayCounts } from './businessMetrics';
import { windowChange, type SubscriberGrowth } from './subscriberGrowth';
import { MAX_DAILY_BARS, countsByMonth, type Range } from './periods';
import { Card, Delta, RankedBars, SectionHeading, Toggle } from './ui';

const APP_NAMES: Record<string, string> = { 'bs-football': 'BS Football', 'bs-hoops': 'BS Hoops' };

type GroupBy = 'source' | 'landing' | 'app';

/**
 * Top of the funnel for the selected range: how many people showed up, how
 * many made an account, how many started paying, and where the new accounts
 * came from.
 */
export function GrowthSection({
  visitors,
  accounts,
  fallbackSignupsByDay,
  growth,
  acquisition,
  range,
  trafficFrom,
  now,
}: {
  /** Unique devices that viewed a page in the period; null when the summary failed. */
  visitors: number | null;
  accounts: AccountsReport | null;
  /** The summary report's per-day signups, used for the chart if the accounts report failed. */
  fallbackSignupsByDay: DayCounts | null;
  growth: SubscriberGrowth | null;
  acquisition: AcquisitionReport | null;
  range: Range;
  /** Set (e.g. "Jul 27, 2026") when visit tracking starts after the range does, so Visitors covers less time than the accounts beside it. */
  trafficFrom: string | null;
  now: number;
}) {
  const [groupBy, setGroupBy] = useState<GroupBy>('source');
  const { days, previous } = range;
  const window = periodDays(now, days);
  const byDay = accounts?.byDay ?? fallbackSignupsByDay;
  // A bar a day stops being readable past about six months; a longer range is drawn by month.
  const monthly = window.length > MAX_DAILY_BARS;

  const created = byDay ? sumPeriod(byDay, now, days) : null;
  const createdBefore = accounts ? sumPeriod(accounts.byDay, now, days, 1) : null;
  const newSubs = growth ? windowChange(growth.days, days).started : null;
  const newSubsBefore = growth ? windowChange(growth.days.slice(0, -days), days).started : null;

  const rate = (part: number | null, whole: number | null) =>
    part === null || whole === null || whole === 0 ? null : `${((part / whole) * 100).toFixed(1)}%`;

  const ranked = acquisition ? rankSignups(acquisition.signups, window[0], groupBy) : [];
  const attributed = ranked.reduce((n, r) => n + r.signups, 0);

  return (
    <div>
      <SectionHeading title={`Growth funnel · ${range.phrase}`} />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr_auto_1fr] gap-3 items-stretch">
        <FunnelStep
          label="Visitors"
          value={visitors}
          sub={trafficFrom ? `devices that viewed a page since ${trafficFrom} · includes crawlers` : 'devices that viewed a page · includes crawlers'}
        />
        {/* No rate when visitors cover less time than accounts: the division would flatter the funnel. */}
        <FunnelArrow rate={trafficFrom ? null : rate(created, visitors)} caption="made an account" />
        <FunnelStep
          label="New accounts"
          value={created}
          delta={previous && created !== null && createdBefore !== null && <Delta change={change(created, createdBefore)} vs={previous} />}
        />
        <FunnelArrow rate={rate(newSubs, created)} caption="started paying" />
        <FunnelStep
          label="New subscribers"
          value={newSubs}
          delta={previous && newSubs !== null && newSubsBefore !== null && <Delta change={{ ...change(newSubs, newSubsBefore), pct: null }} vs={previous} />}
        />
      </div>
      <p className="text-xs text-gray-400 mt-2">
        Each rate divides this period&rsquo;s totals, so it is a pace, not a cohort: someone who subscribed this week may have signed up months ago.
        {trafficFrom && ` Visits have only been counted since ${trafficFrom}, so there is no visitor-to-account rate for a range that starts earlier.`}
      </p>

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <Card title={`New accounts per ${monthly ? 'month' : 'day'} (${range.short})`}>
          {!byDay ? (
            <p className="text-sm text-amber-700 py-4 text-center">Didn&rsquo;t load</p>
          ) : created === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No signups in this period</p>
          ) : (
            <DailyBars
              bars={monthly ? countsByMonth(byDay, window) : window.map((day) => ({ day, value: byDay[day] ?? 0 }))}
              valueLabel="New accounts"
              unit={monthly ? 'month' : 'day'}
            />
          )}
        </Card>

        <Card
          title="Where new accounts came from"
          right={
            <Toggle
              value={groupBy}
              onChange={setGroupBy}
              options={[
                { value: 'source', label: 'Source' },
                { value: 'landing', label: 'First page' },
                { value: 'app', label: 'App' },
              ]}
            />
          }
        >
          {!acquisition ? (
            <p className="text-sm text-amber-700 py-4 text-center">Didn&rsquo;t load</p>
          ) : ranked.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No tracked signups in this period</p>
          ) : (
            <>
              <RankedBars
                rows={ranked.map((r) => ({
                  label: groupBy === 'app' ? (APP_NAMES[r.label] ?? r.label) : r.label,
                  value: r.signups,
                  note: r.subscribers > 0 ? `${r.subscribers} now subscribed` : undefined,
                }))}
              />
              <p className="text-xs text-gray-400 mt-3">
                {attributed.toLocaleString()}
                {created !== null ? ` of ${created.toLocaleString()}` : ''} new accounts have a recorded first visit. Tracking began Oct 28, 2026;
                &ldquo;direct&rdquo; means no referring site was passed along.
              </p>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function FunnelStep({ label, value, delta, sub }: { label: string; value: number | null; delta?: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${value === null ? 'text-gray-300' : 'text-gray-900'}`}>
        {value === null ? '—' : value.toLocaleString()}
      </div>
      {delta && <div className="mt-1">{delta}</div>}
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

function FunnelArrow({ rate, caption }: { rate: string | null; caption: string }) {
  return (
    <div className="flex lg:flex-col items-center justify-center gap-2 lg:gap-0.5 px-1 text-center">
      <span className="text-gray-300 text-lg leading-none lg:order-2" aria-hidden>
        <span className="lg:hidden">↓</span>
        <span className="hidden lg:inline">→</span>
      </span>
      <span className="text-sm font-bold text-gray-900 tabular-nums lg:order-1">{rate ?? '—'}</span>
      <span className="text-[11px] text-gray-400 lg:order-3 lg:max-w-[6.5rem]">{caption}</span>
    </div>
  );
}
