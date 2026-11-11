'use client';

import { useState } from 'react';
import { DailyBars } from './DailyBars';
import { MAX_DAILY_BARS, weeklyAverage, type ActiveDay, type Range } from './periods';
import { Card, RankedBars, SectionHeading, Tile, Toggle } from './ui';

export interface ActiveUsersRolling {
  dau: number;
  wau: number;
  mau: number;
  engagedDau: number;
  engagedWau: number;
  engagedMau: number;
  returningMau: number;
  /** The last 30 days. */
  dailyActive: ActiveDay[];
}

type App = 'football' | 'hoops';

/**
 * Do people come back? Both games side by side on fixed rolling windows, then
 * the selected range's daily chart and traffic.
 */
export function EngagementSection({
  football,
  hoops,
  windowed,
  topPages,
  longDaily,
  range,
  trafficFrom,
}: {
  football: ActiveUsersRolling | null;
  hoops: ActiveUsersRolling | null;
  /** In-period totals from the summary report; each null when it failed. */
  windowed: { activeUsers: number | null; sessions: number | null; pageViews: number | null };
  topPages: { path: string; count: number }[] | null;
  /**
   * The daily series for a range longer than 30 days, per app. Undefined when
   * the range needs none; null when it was asked for and did not load, in which
   * case the chart falls back to the 30 days it has and says so.
   */
  longDaily: { football: ActiveDay[]; hoops: ActiveDay[] } | null | undefined;
  range: Range;
  /** Set (e.g. "Jul 27, 2026") when visit tracking starts after the range does. */
  trafficFrom: string | null;
}) {
  const [app, setApp] = useState<App>('football');
  const apps = [
    { key: 'football' as const, name: 'BS Football', a: football },
    { key: 'hoops' as const, name: 'BS Hoops', a: hoops },
  ].filter((x) => x.a && (x.key === 'football' || x.a.mau > 0));
  const shown = (app === 'hoops' && hoops ? hoops : football) ?? null;
  const shownApp: App = app === 'hoops' && hoops ? 'hoops' : 'football';
  const daily = longDaily ? longDaily[shownApp] : (shown?.dailyActive.slice(-Math.min(range.days, 30)) ?? []);
  const weekly = daily.length > MAX_DAILY_BARS;
  const series = weekly ? weeklyAverage(daily) : daily;
  const fellBack = longDaily === null;
  const chartSpan = fellBack ? '30d' : range.short;
  const counted = trafficFrom ? `counted since ${trafficFrom}` : undefined;
  const viewsPerSession =
    windowed.sessions !== null && windowed.pageViews !== null && windowed.sessions > 0 ? (windowed.pageViews / windowed.sessions).toFixed(1) : null;

  return (
    <div>
      <SectionHeading
        title="Engagement"
        note="Engaged = a device with 2 or more page views in the window, which leaves out crawlers and one-page bounces. The table's windows are fixed; the chart and the numbers under it follow the range selector."
      />
      <Card>
        {apps.length === 0 ? (
          <p className="text-sm text-amber-700">Didn&rsquo;t load — see the warning above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500">
                  <th className="text-left font-medium pb-2">Game</th>
                  <th className="text-right font-medium pb-2">Today (24h)</th>
                  <th className="text-right font-medium pb-2">This week (7d)</th>
                  <th className="text-right font-medium pb-2">This month (30d)</th>
                  <th className="text-right font-medium pb-2">Came back on 2+ days</th>
                  <th className="text-right font-medium pb-2" title="Engaged devices today as a share of the month's">Stickiness</th>
                </tr>
              </thead>
              <tbody>
                {apps.map(({ key, name, a }) => (
                  <tr key={key} className="border-t border-gray-100">
                    <td className="py-2 font-medium text-gray-900">{name}</td>
                    <td className="py-2 text-right tabular-nums">{a!.engagedDau.toLocaleString()}</td>
                    <td className="py-2 text-right tabular-nums">{a!.engagedWau.toLocaleString()}</td>
                    <td className="py-2 text-right tabular-nums font-semibold">{a!.engagedMau.toLocaleString()}</td>
                    <td className="py-2 text-right tabular-nums">
                      {a!.returningMau.toLocaleString()}
                      <span className="text-gray-400"> ({a!.engagedMau > 0 ? Math.round((a!.returningMau / a!.engagedMau) * 100) : 0}%)</span>
                    </td>
                    <td className="py-2 text-right tabular-nums">{a!.engagedMau > 0 ? Math.round((a!.engagedDau / a!.engagedMau) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <Card
          title={`Daily active devices (${chartSpan})${weekly ? ' · weekly average' : ''}`}
          right={
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-600" />Engaged</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-100" />All</span>
              </div>
              {apps.length > 1 && (
                <Toggle value={app} onChange={setApp} options={[{ value: 'football', label: 'Football' }, { value: 'hoops', label: 'Hoops' }]} />
              )}
            </div>
          }
        >
          {series.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No activity recorded</p>
          ) : (
            <DailyBars bars={series.map((d) => ({ day: d.day, value: d.engaged, backdrop: d.all }))} valueLabel="Engaged" backdropLabel="All" />
          )}
          {fellBack && (
            <p className="text-xs text-amber-700 mt-3">
              Showing the last 30 days: the longer history did not load. If this stays, apply supabase/migrations/20261110_analytics_daily_active.sql.
            </p>
          )}
          {!fellBack && weekly && <p className="text-xs text-gray-400 mt-3">Each bar is one week: the average number of devices per day that week.</p>}
          {!fellBack && trafficFrom && <p className="text-xs text-gray-400 mt-3">Visits have been counted since {trafficFrom}.</p>}
        </Card>

        <Card title={`Most viewed pages (${range.short})`}>
          {!topPages ? (
            <p className="text-sm text-amber-700 py-4 text-center">Didn&rsquo;t load</p>
          ) : topPages.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No page views yet</p>
          ) : (
            <RankedBars rows={topPages.map((p) => ({ label: p.path, value: p.count }))} />
          )}
        </Card>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
        <Tile label={`Signed-in players · ${range.phrase}`} value={windowed.activeUsers} sub={counted ? `accounts that were active · ${counted}` : 'accounts that were active'} />
        <Tile label={`Sessions · ${range.phrase}`} value={windowed.sessions} sub={counted} />
        <Tile label={`Page views · ${range.phrase}`} value={windowed.pageViews} sub={counted} />
        <Tile label="Pages per session" value={viewsPerSession} sub="how deep a visit goes" />
      </div>
    </div>
  );
}
