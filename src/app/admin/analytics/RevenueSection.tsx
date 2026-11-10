'use client';

import { DailyBars } from './DailyBars';
import { change, money, netOf, revenueByMonth, type RevenueReport } from './businessMetrics';
import { sampleDays, windowChange, type SubscriberGrowth } from './subscriberGrowth';
import { Card, Delta, PERIOD_DAYS, SectionHeading, Tile, type Period } from './ui';

const shortDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * Who pays, who left, and what actually landed in the bank. The two charts are
 * all-time on purpose: growth is the question, and a 7-day slice of numbers
 * this small is a flat line. The tiles follow the period selector.
 */
export function RevenueSection({
  growth,
  revenue,
  conversion,
  period,
  now,
}: {
  growth: SubscriberGrowth | null;
  revenue: RevenueReport | null;
  /** Subscribers over accounts that are able to subscribe; null fields when the summary failed. */
  conversion: { rate: number | null; subscribers: number; convertible: number | null; founders: number | null };
  period: Period;
  now: number;
}) {
  const days = PERIOD_DAYS[period];
  const series = growth?.days ?? [];
  const current = windowChange(series, days);
  const earlier = windowChange(series.slice(0, -days), days);
  // Everyone who could have left: subscribed when the period opened, or joined during it.
  const everSubscribed = (series[series.length - 1 - days]?.active ?? 0) + current.started;
  const leaving = growth?.scheduledToCancel ?? [];
  const months = revenue ? revenueByMonth(revenue.byDay, now) : [];
  const since = series.length ? new Date(`${series[0].day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : null;

  return (
    <div>
      <SectionHeading
        title="Subscribers & revenue"
        note="Accounts with a live Premium subscription, counted once each. Founders who get Premium free are not subscribers."
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile
          label={`New subscribers · last ${period}`}
          value={growth ? current.started : null}
          delta={growth && <Delta change={{ ...change(current.started, earlier.started), pct: null }} vs={`vs previous ${period}`} />}
        />
        <Tile
          label={`Lost subscribers · last ${period}`}
          value={growth ? current.churned : null}
          delta={growth && <Delta change={{ ...change(current.churned, earlier.churned), pct: null }} vs={`vs previous ${period}`} upIsGood={false} />}
          sub={everSubscribed > 0 ? `${Math.round((current.churned / everSubscribed) * 100)}% of the ${everSubscribed} subscribed at some point in the period` : 'cancelled or lapsed'}
        />
        <Tile
          label="Free to paid"
          value={conversion.rate === null ? null : `${(conversion.rate * 100).toFixed(1)}%`}
          sub={
            conversion.convertible === null
              ? undefined
              : `${conversion.subscribers} of ${conversion.convertible.toLocaleString()} accounts that can buy · ${(conversion.founders ?? 0).toLocaleString()} Founders excluded`
          }
        />
        <Tile
          label="Already cancelled, still active"
          value={growth ? leaving.length : null}
          sub={
            leaving.length
              ? `next ends ${shortDay(leaving[0].day)} · ${money(leaving.reduce((n, l) => n + l.monthlyCents, 0))} of MRR will go`
              : growth
                ? 'nobody has a cancellation pending'
                : undefined
          }
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <Card title={since ? `Premium subscribers since ${since}` : 'Premium subscribers'} className="lg:col-span-2">
          {!growth ? (
            <p className="text-sm text-amber-700 py-4 text-center">Didn&rsquo;t load — see the warning above.</p>
          ) : series.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No subscribers yet.</p>
          ) : (
            <>
              <DailyBars bars={sampleDays(series, 180).map((d) => ({ day: d.day, value: d.active }))} valueLabel="Subscribers" />
              {growth.tableOnly > 0 && (
                <p className="text-xs text-gray-400 mt-3">
                  {growth.tableOnly} of {growth.subscriptions} subscriptions {growth.tableOnly === 1 ? 'isn’t' : 'aren’t'} in Stripe (comped or added by hand),
                  so {growth.tableOnly === 1 ? 'its dates come' : 'their dates come'} from our own table and {growth.tableOnly === 1 ? 'it adds' : 'they add'} nothing to MRR.
                </p>
              )}
            </>
          )}
        </Card>

        <Card
          title="Net revenue by month"
          right={
            months.length > 0 && (
              <div className="flex gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-600" />Net</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-100" />Gross</span>
              </div>
            )
          }
        >
          {!revenue ? (
            <p className="text-sm text-amber-700 py-4 text-center">Didn&rsquo;t load — see the warning above.</p>
          ) : months.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No payments yet.</p>
          ) : (
            <>
              <DailyBars
                bars={months.map((m) => ({ day: `${m.month}-01`, value: netOf(m) / 100, backdrop: m.gross / 100 }))}
                valueLabel="Net"
                backdropLabel="Gross"
                unit="month"
                formatValue={(n) => (Number.isInteger(n) ? `$${n.toLocaleString()}` : money(Math.round(n * 100)))}
              />
              <p className="text-xs text-gray-400 mt-3">
                Gross is every payment taken, including one-off episode packs. Net is what is left after refunds and Stripe fees. The last bar is this month so far.
              </p>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
