'use client';

import { useState } from 'react';
import { DailyBars } from './DailyBars';
import { Card, RankedBars, SectionHeading, Tile, Toggle, type Period } from './ui';

export interface ActiveUsersRolling {
  dau: number;
  wau: number;
  mau: number;
  engagedDau: number;
  engagedWau: number;
  engagedMau: number;
  returningMau: number;
  dailyActive: { day: string; all: number; engaged: number }[];
}

type App = 'football' | 'hoops';

/**
 * Do people come back? Both games side by side on fixed rolling windows, then
 * the selected period's traffic.
 */
export function EngagementSection({
  football,
  hoops,
  windowed,
  topPages,
  period,
}: {
  football: ActiveUsersRolling | null;
  hoops: ActiveUsersRolling | null;
  /** In-period totals from the summary report; each null when it failed. */
  windowed: { activeUsers: number | null; sessions: number | null; pageViews: number | null };
  topPages: { path: string; count: number }[] | null;
  period: Period;
}) {
  const [app, setApp] = useState<App>('football');
  const apps = [
    { key: 'football' as const, name: 'BS Football', a: football },
    { key: 'hoops' as const, name: 'BS Hoops', a: hoops },
  ].filter((x) => x.a && (x.key === 'football' || x.a.mau > 0));
  const shown = (app === 'hoops' && hoops ? hoops : football) ?? null;
  const series = shown?.dailyActive.slice(-30) ?? [];
  const viewsPerSession =
    windowed.sessions !== null && windowed.pageViews !== null && windowed.sessions > 0 ? (windowed.pageViews / windowed.sessions).toFixed(1) : null;

  return (
    <div>
      <SectionHeading
        title="Engagement"
        note="Engaged = a device with 2 or more page views in the window, which leaves out crawlers and one-page bounces. These windows are fixed and ignore the period selector."
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
          title="Daily active devices (30d)"
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
        </Card>

        <Card title={`Most viewed pages (${period})`}>
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
        <Tile label={`Signed-in players · last ${period}`} value={windowed.activeUsers} sub="accounts that were active" />
        <Tile label={`Sessions · last ${period}`} value={windowed.sessions} />
        <Tile label={`Page views · last ${period}`} value={windowed.pageViews} />
        <Tile label="Pages per session" value={viewsPerSession} sub="how deep a visit goes" />
      </div>
    </div>
  );
}
