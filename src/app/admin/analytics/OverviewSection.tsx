'use client';

import { change, money, netOf, revenueInPeriod, sumPeriod, type AccountsReport, type RevenueReport } from './businessMetrics';
import type { SubscriberGrowth } from './subscriberGrowth';
import { Delta, PERIOD_DAYS, SectionHeading, Tile, type Period } from './ui';

/**
 * The five numbers to read before anything else, each against the same span
 * of time just before it. Everything below this row is the detail behind one
 * of these.
 */
export function OverviewSection({
  growth,
  revenue,
  accounts,
  engagedMau,
  period,
  now,
}: {
  growth: SubscriberGrowth | null;
  revenue: RevenueReport | null;
  accounts: AccountsReport | null;
  /** Engaged devices in the last 30 days, per app; null when that report failed. */
  engagedMau: { football: number | null; hoops: number | null };
  period: Period;
  now: number;
}) {
  const days = PERIOD_DAYS[period];
  const ago = `vs ${days} days ago`;
  const previous = `vs previous ${period}`;

  const series = growth?.days ?? [];
  const today = series[series.length - 1];
  // Before the first subscriber there were none, so a history shorter than the period compares with zero.
  const before = series[series.length - 1 - days];

  const net = revenue ? netOf(revenueInPeriod(revenue.byDay, now, days)) : null;
  const netBefore = revenue ? netOf(revenueInPeriod(revenue.byDay, now, days, 1)) : null;

  const created = accounts ? sumPeriod(accounts.byDay, now, days) : null;
  const createdBefore = accounts ? sumPeriod(accounts.byDay, now, days, 1) : null;

  const mau = engagedMau.football === null ? null : engagedMau.football + (engagedMau.hoops ?? 0);

  return (
    <div>
      <SectionHeading title="At a glance" />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Tile
          size="lg"
          label="Monthly recurring revenue"
          value={today ? money(today.mrrCents) : growth ? money(0) : null}
          delta={today && <Delta change={change(today.mrrCents, before?.mrrCents ?? 0)} vs={ago} format={money} />}
          sub={today ? `${money(today.mrrCents * 12)} a year at this rate` : undefined}
        />
        <Tile
          size="lg"
          label="Premium subscribers"
          value={today ? today.active : growth ? 0 : null}
          delta={today && <Delta change={{ ...change(today.active, before?.active ?? 0), pct: null }} vs={ago} />}
        />
        <Tile
          size="lg"
          label={`Net revenue · last ${period}`}
          value={net === null ? null : money(net)}
          delta={net !== null && netBefore !== null && <Delta change={change(net, netBefore)} vs={previous} format={money} />}
          sub="after refunds and Stripe fees"
        />
        <Tile
          size="lg"
          label={`New accounts · last ${period}`}
          value={created}
          delta={created !== null && createdBefore !== null && <Delta change={change(created, createdBefore)} vs={previous} />}
          sub={accounts ? `${accounts.total.toLocaleString()} all time` : undefined}
        />
        <Tile
          size="lg"
          label="Engaged monthly users"
          value={mau}
          sub={
            engagedMau.football === null
              ? undefined
              : `Football ${engagedMau.football.toLocaleString()} · Hoops ${(engagedMau.hoops ?? 0).toLocaleString()} · devices, last 30 days`
          }
        />
      </div>
    </div>
  );
}
