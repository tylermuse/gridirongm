'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSubscription } from '@/components/providers/SubscriptionProvider';
import { InteractionsSection, type InteractionReport } from './InteractionsSection';

// Every number fed by the summary RPC is null when that query failed (e.g. a
// statement timeout). The cards render "—" for null; they must never show 0 as
// if it were a real count.
interface AnalyticsData {
  period: string;
  generatedAt?: string;
  totalUsers: number | null;
  newUsers: number | null;
  grandfatheredUsers: number | null;
  convertibleUsers: number | null;
  activeUsers: number | null;
  uniqueDevices: number | null;
  sessions: number | null;
  pageViews: number | null;
  conversionRate: number | null;
  totalSubscriptions: number;
  signupsByDay: Record<string, number> | null;
  topPages: { path: string; count: number }[] | null;
  recentEvents: { event: string; properties: Record<string, unknown>; created_at: string; user_id: string | null }[];
  activeUsersRolling: ActiveUsersRolling | null;
  hoopsActiveUsersRolling: ActiveUsersRolling | null;
  sim3dCohorts: Sim3dCohorts | null;
  interactions: InteractionReport | null;
  rollups?: RollupHealth;
  timingsMs?: Record<string, number>;
  warnings?: string[];
}

// From admin_analytics_health() (migration 20261101_analytics_rollup_health).
// applied === null means the health function itself is missing.
interface RollupHealth {
  applied: boolean | null;
  error?: string;
  startedAt?: string;
  trigger?: 'enabled' | 'disabled' | 'missing';
  functionsOnRollups?: Record<string, boolean>;
  latestEventAt?: string | null;
  latestMinute?: string | null;
  lagSeconds?: number | null;
  earliestMinute?: string | null;
  backfillRows30d?: number;
  liveRows30d?: number;
  uiDays30d?: number;
  timeouts?: Record<string, string>;
}

interface Sim3dCohort { devices: number; sessions: number; sessionsPerDevice: number; medianMinutes: number; meanMinutes: number; pctMultiDay: number; pctReturned7d: number }
interface Sim3dCohorts { since: string; cohorts: { on?: Sim3dCohort; off?: Sim3dCohort }; toggles: { on: number; off: number } }

interface ActiveUsersRolling {
  dau: number;
  wau: number;
  mau: number;
  engagedDau: number;
  engagedWau: number;
  engagedMau: number;
  returningMau: number;
  dailyActive: { day: string; all: number; engaged: number }[];
}

type Period = '7d' | '30d' | '90d';

interface FeedbackItem {
  id: string;
  message: string;
  page: string | null;
  created_at: string;
  user_id: string | null;
  app?: string | null;
}

export default function AdminAnalyticsPage() {
  const { user, isAdmin, loading: authLoading } = useSubscription();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('30d');
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/analytics?period=${p}`);
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setData(json);
      } else {
        setError(json.detail ? `${json.error}: ${json.detail}` : json.error ?? `Failed to load analytics (${res.status})`);
      }
    } catch {
      setError('Failed to connect to analytics API');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFeedback = useCallback(async () => {
    try {
      const res = await fetch('/api/feedback?limit=50');
      if (res.ok) {
        const json = await res.json();
        setFeedback(json.feedback ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!authLoading && isAdmin) {
      fetchData(period);
      fetchFeedback();
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [authLoading, isAdmin, period, fetchData, fetchFeedback]);

  // The API's server clock; every "N minutes ago" / "last N days" calculation
  // keys off it so render stays pure (no Date.now() while rendering).
  const now = data?.generatedAt ? Date.parse(data.generatedAt) : 0;

  // Auth loading
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f0f4f8' }}>
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  // Not logged in or not admin
  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ backgroundColor: '#f0f4f8' }}>
        <div className="text-xl font-bold text-gray-900">Access Denied</div>
        <p className="text-gray-500">This page is restricted to administrators.</p>
        <Link href="/" className="text-blue-600 hover:underline text-sm">Back to game</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f0f4f8' }}>
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
              &larr; Back to game
            </Link>
            <h1 className="text-lg font-bold text-gray-900">Analytics</h1>
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {(['7d', '30d', '90d'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
                  period === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading analytics...</div>
        ) : error ? (
          <div className="text-center py-20">
            <div className="text-red-500 font-medium mb-2">⚠️ {error}</div>
            <button onClick={() => fetchData(period)} className="mt-4 text-sm text-blue-600 hover:underline">Retry</button>
          </div>
        ) : !data ? (
          <div className="text-center py-20 text-gray-400">No data available yet. Events will appear once users start visiting.</div>
        ) : (
          <div className="space-y-8">
            {/* A query that fails (e.g. a statement timeout) shows here instead of as silent zeros */}
            {data.warnings && data.warnings.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <div className="font-semibold mb-1">Some numbers didn&rsquo;t load</div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {data.warnings.map(w => <li key={w}>{w}</li>)}
                </ul>
              </div>
            )}

            {/* Is the rollup pipeline (20261025) applied, backfilled and still fed? Loud when not, one quiet line when it is. */}
            <RollupHealthPanel h={data.rollups} timings={data.timingsMs} now={now} />

            {/* All-time — these do NOT move with the period selector. */}
            <div>
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">All time</h2>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <MetricCard label="Registered Accounts" value={data.totalUsers} sub="all time" />
                <MetricCard
                  label="Can Convert"
                  value={data.convertibleUsers}
                  sub={`${fmt(data.grandfatheredUsers)} Founders get Premium free`}
                />
                <MetricCard
                  label="Conversion Rate"
                  value={data.conversionRate === null ? null : `${(data.conversionRate * 100).toFixed(1)}%`}
                  sub={`${data.totalSubscriptions} subs / ${fmt(data.convertibleUsers)} who can buy`}
                />
              </div>
            </div>

            {/* Rolling DAU/WAU/MAU — fixed windows, ignore the period selector. */}
            {data.activeUsersRolling ? (
              <ActiveUsersSection title="BS Football" a={data.activeUsersRolling} />
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide">BS Football · Active users · rolling</h2>
                <p className="text-sm text-amber-700 mt-2">Didn&rsquo;t load — see the warning above.</p>
              </div>
            )}
            {data.hoopsActiveUsersRolling && data.hoopsActiveUsersRolling.mau > 0 && (
              <ActiveUsersSection title="BS Hoops" a={data.hoopsActiveUsersRolling} />
            )}

            {/* Windowed — these all respect the period selector. */}
            <div>
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Last {period}</h2>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <MetricCard label="New Accounts" value={data.newUsers} sub={`in the last ${period}`} />
                <MetricCard label="Active Users" value={data.activeUsers} sub="logged-in only" />
                <MetricCard
                  label="Unique Devices"
                  value={data.uniqueDevices}
                  sub="visited a page · incl. crawlers · upper bound"
                />
                <MetricCard label="Sessions" value={data.sessions} />
                <MetricCard label="Page Views" value={data.pageViews} />
                <MetricCard
                  label="Views / Session"
                  value={data.sessions !== null && data.pageViews !== null && data.sessions > 0 ? (data.pageViews / data.sessions).toFixed(1) : null}
                  sub="engagement depth"
                />
              </div>
            </div>

            {/* 3D live sim launch experiment (free for everyone from 2026-10-23; decide ~2026-11-06) */}
            {data.sim3dCohorts && <Sim3dSection c={data.sim3dCohorts} period={period} />}

            {/* Automatic click / hover / change capture — what people use, ignore, and fight with */}
            <InteractionsSection
              r={data.interactions}
              period={period}
              error={data.warnings?.find(w => w.startsWith('Feature usage'))}
            />

            {/* Signups chart + Top pages side by side */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Signups over time */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-bold text-gray-900 mb-4">New Accounts ({period})</h2>
                {data.signupsByDay ? (
                  <SignupsChart data={data.signupsByDay} period={period} now={now} />
                ) : (
                  <div className="text-sm text-amber-700 py-4 text-center">Didn&rsquo;t load</div>
                )}
              </div>

              {/* Top pages */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-bold text-gray-900 mb-4">Top Pages ({period})</h2>
                {!data.topPages ? (
                  <div className="text-sm text-amber-700 py-4 text-center">Didn&rsquo;t load</div>
                ) : data.topPages.length === 0 ? (
                  <div className="text-sm text-gray-400 py-4 text-center">No page views yet</div>
                ) : (
                  <div className="space-y-2">
                    {data.topPages.map(({ path, count }) => {
                      const max = data.topPages![0].count;
                      return (
                        <div key={path} className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-gray-700 truncate">{path}</div>
                            <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-blue-500"
                                style={{ width: `${(count / max) * 100}%` }}
                              />
                            </div>
                          </div>
                          <div className="text-xs font-medium text-gray-500 w-12 text-right">{count}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Recent activity */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-bold text-gray-900 mb-4">Recent Activity</h2>
              {data.recentEvents.length === 0 ? (
                <div className="text-sm text-gray-400 py-4 text-center">No events yet</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                        <th className="pb-2 pr-4 font-medium">Event</th>
                        <th className="pb-2 pr-4 font-medium">Details</th>
                        <th className="pb-2 pr-4 font-medium">User</th>
                        <th className="pb-2 font-medium">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentEvents.map((ev, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-2 pr-4">
                            <EventBadge event={ev.event} />
                          </td>
                          <td className="py-2 pr-4 text-gray-500 truncate max-w-[200px]">
                            {formatProperties(ev.properties)}
                          </td>
                          <td className="py-2 pr-4 text-gray-400 text-xs font-mono">
                            {ev.user_id ? ev.user_id.slice(0, 8) : 'anon'}
                          </td>
                          <td className="py-2 text-gray-400 text-xs whitespace-nowrap">
                            {timeAgo(ev.created_at, now)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* User Feedback */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-gray-900">User Feedback</h2>
                <span className="text-xs text-gray-400">{feedback.length} messages</span>
              </div>
              {feedback.length === 0 ? (
                <div className="text-sm text-gray-400 py-4 text-center">No feedback yet</div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {feedback.map(fb => (
                    <div key={fb.id} className="border border-gray-100 rounded-lg p-3">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{fb.message}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                        <span>{timeAgo(fb.created_at, now)}</span>
                        {fb.app === 'bs-hoops' && <span className="font-semibold text-orange-600">Hoops</span>}
                        {fb.page && <span className="font-mono">{fb.page}</span>}
                        <span className="font-mono">{fb.user_id ? fb.user_id.slice(0, 8) : 'anon'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function ActiveUsersSection({ title, a }: { title: string; a: ActiveUsersRolling }) {
  const stickiness = a.engagedMau > 0 ? a.engagedDau / a.engagedMau : 0;
  const series = a.dailyActive.slice(-30);
  const max = Math.max(1, ...series.map((d) => d.all));
  return (
    <div>
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">{title} · active users · rolling</h2>
      <p className="text-xs text-gray-400 mb-3">
        Engaged = device with 2+ page views in the window. Raw device counts include crawlers and one-page bounces.
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="DAU (24h)" value={a.engagedDau} sub={`${a.dau.toLocaleString()} raw devices`} />
        <MetricCard label="WAU (7d)" value={a.engagedWau} sub={`${a.wau.toLocaleString()} raw devices`} />
        <MetricCard label="MAU (30d)" value={a.engagedMau} sub={`${a.returningMau.toLocaleString()} returned on 2+ days · ${a.mau.toLocaleString()} raw`} />
        <MetricCard label="Stickiness" value={`${(stickiness * 100).toFixed(0)}%`} sub="engaged DAU / MAU" />
      </div>
      {series.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-900">{title} daily active devices (30d)</h3>
            <div className="flex gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-600" />Engaged</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-100" />Raw</span>
            </div>
          </div>
          <div className="flex items-end gap-[3px] h-32">
            {series.map((d) => (
              <div
                key={d.day}
                className="relative flex-1 h-full flex items-end"
                title={`${d.day}: ${d.engaged} engaged / ${d.all} raw`}
              >
                <div className="absolute bottom-0 w-full rounded-t-sm bg-blue-100" style={{ height: `${(d.all / max) * 100}%` }} />
                <div className="relative w-full rounded-t-sm bg-blue-600" style={{ height: `${(d.engaged / max) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1.5 text-[10px] text-gray-400">
            <span>{series[0].day.slice(5)}</span>
            <span>{series[series.length - 1].day.slice(5)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Sim3dSection({ c, period }: { c: Sim3dCohorts; period: string }) {
  const on = c.cohorts.on, off = c.cohorts.off;
  const rows: { label: string; key: keyof Sim3dCohort; fmt: (v: number) => string; help: string }[] = [
    { label: 'Devices', key: 'devices', fmt: v => String(v), help: 'game-watching devices in the cohort' },
    { label: 'Sessions / device', key: 'sessionsPerDevice', fmt: v => v.toFixed(2), help: '30-min gap sessions' },
    { label: 'Median session', key: 'medianMinutes', fmt: v => `${v} min`, help: 'first to last event; a floor' },
    { label: 'Mean session', key: 'meanMinutes', fmt: v => `${v} min`, help: '' },
    { label: 'Active 2+ days', key: 'pctMultiDay', fmt: v => `${v}%`, help: 'share of devices' },
    { label: 'Returned after 7+ days', key: 'pctReturned7d', fmt: v => `${v}%`, help: 'share of devices; needs a week of data' },
  ];
  const better = (k: keyof Sim3dCohort) => (on && off && on[k] !== off[k] ? (on[k] > off[k] ? 'on' : 'off') : null);
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-sm font-bold">3D Live Sim — launch experiment</h2>
        <span className="text-xs text-gray-500">last {period} · {c.toggles.on} toggled on · {c.toggles.off} off</span>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Free for everyone since Oct 23. Devices that opened a game page, split by whether the 3D sim was ever on. Decide Premium vs free around Nov 6: if the “on” column is clearly ahead on session length and return rate, 3D is a retention feature — keep it free and upsell inside it. If the columns look alike, gate it (flip SIM3D_FREE_FOR_ALL).
      </p>
      {!on && !off ? <div className="text-sm text-gray-500">No game-page events yet in this window.</div> : (
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-gray-500"><th className="text-left font-medium pb-2">Metric</th><th className="text-right font-medium pb-2">3D on</th><th className="text-right font-medium pb-2">3D off</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key} className="border-t border-gray-100">
                <td className="py-1.5">{r.label}{r.help && <span className="block text-[11px] text-gray-400">{r.help}</span>}</td>
                <td className={`py-1.5 text-right tabular-nums ${better(r.key) === 'on' ? 'font-bold text-emerald-700' : ''}`}>{on ? r.fmt(on[r.key]) : '—'}</td>
                <td className={`py-1.5 text-right tabular-nums ${better(r.key) === 'off' ? 'font-bold text-emerald-700' : ''}`}>{off ? r.fmt(off[r.key]) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** null = the query behind this number failed; render a dash, never a fake 0. */
function fmt(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return typeof value === 'number' ? value.toLocaleString() : value;
}

function MetricCard({ label, value, sub }: { label: string; value: string | number | null; sub?: string }) {
  const failed = value === null;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5" title={failed ? 'This query failed — see the warning at the top' : undefined}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${failed ? 'text-gray-300' : 'text-gray-900'}`}>{fmt(value)}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

function RollupHealthPanel({ h, timings, now }: { h?: RollupHealth; timings?: Record<string, number>; now: number }) {
  const slowest = Object.entries(timings ?? {}).sort((a, b) => b[1] - a[1])[0];
  const timing = slowest ? `slowest query: ${slowest[0]} ${(slowest[1] / 1000).toFixed(1)}s` : null;

  const problems: string[] = [];
  if (!h || h.applied === null) {
    problems.push(h?.error ?? 'Rollup health unknown: admin_analytics_health() did not respond.');
  } else if (!h.applied) {
    problems.push('Rollup tables are missing: supabase/migrations/20261025_analytics_rollups.sql has not been applied, so every report scans the raw analytics_events table and times out.');
  } else {
    if (h.trigger !== 'enabled') problems.push(`Rollup trigger is ${h.trigger}: new events are not being rolled up, so these numbers are frozen.`);
    const raw = Object.entries(h.functionsOnRollups ?? {}).filter(([, ok]) => !ok).map(([fn]) => fn);
    if (raw.length) problems.push(`Still reading the raw events table: ${raw.join(', ')}. Re-apply 20261025_analytics_rollups.sql.`);
    const missingFns = ['admin_analytics_summary', 'admin_active_users', 'admin_sim3d_cohorts', 'admin_interaction_report']
      .filter(fn => !(fn in (h.functionsOnRollups ?? {})));
    if (missingFns.length) problems.push(`Report functions missing: ${missingFns.join(', ')}.`);
    if (h.lagSeconds !== null && h.lagSeconds !== undefined && h.lagSeconds > 600) {
      problems.push(`Rollups are ${Math.round(h.lagSeconds / 60)} min behind the newest event (latest rollup minute ${h.latestMinute ?? '?'}).`);
    }
    const earliest = h.earliestMinute ? Date.parse(h.earliestMinute) : NaN;
    const ninetyDaysAgo = now - 90 * 86400000;
    if (Number.isNaN(earliest)) {
      problems.push('Rollup tables are empty: run analytics_backfill_rollups() (see supabase/runbooks/analytics-rollups-prod.sql).');
    } else if (earliest > ninetyDaysAgo) {
      problems.push(`Backfill only reaches back to ${h.earliestMinute!.slice(0, 10)}; the 90d view is incomplete before that. Run analytics_backfill_rollups() for the earlier range.`);
    }
  }

  if (problems.length === 0) {
    const since = h?.earliestMinute ? h.earliestMinute.slice(0, 10) : '?';
    return (
      <p className="text-xs text-gray-400">
        Rollups live · {h?.lagSeconds ?? 0}s behind · history from {since}{timing ? ` · ${timing}` : ''}
      </p>
    );
  }
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <div className="font-semibold mb-1">Analytics rollups need attention</div>
      <ul className="list-disc pl-5 space-y-0.5">
        {problems.map(p => <li key={p}>{p}</li>)}
      </ul>
      {h?.timeouts && (
        <p className="text-xs text-red-700/80 mt-2">
          statement_timeout: {Object.entries(h.timeouts).map(([r, t]) => `${r}=${t}`).join(' · ')}{timing ? ` · ${timing}` : ''}
        </p>
      )}
    </div>
  );
}

function EventBadge({ event }: { event: string }) {
  const colors: Record<string, string> = {
    page_view: 'bg-gray-100 text-gray-600',
    login: 'bg-blue-100 text-blue-700',
    signup: 'bg-green-100 text-green-700',
    session_start: 'bg-purple-100 text-purple-700',
    ui_click: 'bg-sky-50 text-sky-700',
    ui_change: 'bg-sky-50 text-sky-700',
    ui_rage_click: 'bg-red-100 text-red-700',
    ui_dead_click: 'bg-amber-100 text-amber-700',
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors[event] ?? 'bg-gray-100 text-gray-600'}`}>
      {event}
    </span>
  );
}

function formatProperties(props: Record<string, unknown>): string {
  if (props.target) return `${props.target}${props.value ? ` → ${props.value}` : ''} · ${props.path ?? ''}`;
  if (props.path) return String(props.path);
  const entries = Object.entries(props).filter(([, v]) => v != null);
  if (entries.length === 0) return '—';
  return entries.map(([k, v]) => `${k}: ${v}`).join(', ');
}

function timeAgo(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function SignupsChart({ data, period, now }: { data: Record<string, number>; period: Period; now: number }) {
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const labels: string[] = [];
  const values: number[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    labels.push(key);
    values.push(data[key] ?? 0);
  }

  const max = Math.max(...values, 1);

  if (values.every(v => v === 0)) {
    return <div className="text-sm text-gray-400 py-4 text-center">No signups in this period</div>;
  }

  // Pick ~5-7 evenly spaced X-axis labels
  const xLabelCount = Math.min(days <= 7 ? days : 6, labels.length);
  const xLabelStep = Math.max(1, Math.floor(labels.length / xLabelCount));
  const xLabels = labels
    .map((l, i) => ({ label: l, index: i }))
    .filter((_, i) => i % xLabelStep === 0 || i === labels.length - 1);

  // Y-axis ticks
  const yTicks = max <= 3 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, Math.round(max / 2), max];

  return (
    <div className="flex gap-2">
      {/* Y-axis */}
      <div className="flex flex-col justify-between h-32 text-[10px] text-gray-400 text-right w-6 shrink-0 py-0.5">
        {[...yTicks].reverse().map(v => (
          <span key={v}>{v}</span>
        ))}
      </div>
      {/* Chart area */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-end gap-px h-32">
          {values.map((v, i) => (
            <div
              key={labels[i]}
              className="flex-1 bg-blue-500 rounded-t-sm hover:bg-blue-600 transition-colors min-w-[2px]"
              style={{ height: `${(v / max) * 100}%`, minHeight: v > 0 ? '2px' : '0' }}
              title={`${labels[i]}: ${v} signup${v !== 1 ? 's' : ''}`}
            />
          ))}
        </div>
        {/* X-axis */}
        <div className="flex justify-between mt-1.5">
          {xLabels.map(({ label }) => {
            const d = new Date(label + 'T00:00:00');
            const fmt = `${d.getMonth() + 1}/${d.getDate()}`;
            return (
              <span key={label} className="text-[10px] text-gray-400">{fmt}</span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
