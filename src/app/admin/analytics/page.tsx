'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSubscription } from '@/components/providers/SubscriptionProvider';
import { InteractionsSection, type InteractionReport } from './InteractionsSection';
import { OverviewSection } from './OverviewSection';
import { RevenueSection } from './RevenueSection';
import { GrowthSection } from './GrowthSection';
import { EngagementSection, type ActiveUsersRolling } from './EngagementSection';
import { Collapsible, SectionHeading, type Period } from './ui';
import type { SubscriberGrowth } from './subscriberGrowth';
import type { AccountsReport, AcquisitionReport, RevenueReport } from './businessMetrics';

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
  /** null until migration 20261106_sim3d_followup is applied (or the query failed) */
  sim3dFollowup?: Sim3dFollowup | null;
  interactions: InteractionReport | null;
  // The four business reports (api/admin/analytics/business.ts). Each is its whole
  // history, independent of `period`, and null when its own query failed.
  subscriberGrowth?: SubscriberGrowth | null;
  revenue?: RevenueReport | null;
  accounts?: AccountsReport | null;
  acquisition?: AcquisitionReport | null;
  rollups?: RollupHealth;
  timingsMs?: Record<string, number>;
  cacheAgeMs?: Record<string, number>;
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
interface Sim3dConversion { freeDevices: number; converted: number; pctConverted: number }
interface Sim3dArm { devices: number; pctHad3dOn: number; pctSwitchedOff: number; sessionsPerDevice: number; pctMultiDay: number; pctReturned7d: number; pctConverted: number }
interface Sim3dFollowup { since: string; conversion: { on?: Sim3dConversion; off?: Sim3dConversion }; defaultTest: { on?: Sim3dArm; off?: Sim3dArm } }

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
          <div className="flex items-center gap-3">
            {data?.generatedAt && (
              <span className="hidden sm:inline text-xs text-gray-400" title="Reports are cached for 5 minutes">
                Updated {new Date(data.generatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
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
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {loading && !data ? (
          <div className="text-center py-20 text-gray-400">Loading analytics...</div>
        ) : error ? (
          <div className="text-center py-20">
            <div className="text-red-500 font-medium mb-2">⚠️ {error}</div>
            <button onClick={() => fetchData(period)} className="mt-4 text-sm text-blue-600 hover:underline">Retry</button>
          </div>
        ) : !data ? (
          <div className="text-center py-20 text-gray-400">No data available yet. Events will appear once users start visiting.</div>
        ) : (
          <div className={`space-y-10 transition-opacity ${loading ? 'opacity-50' : ''}`}>
            {/* What needs a look: failed queries, a stalled rollup pipeline, billing that disagrees with itself. Silent when all is well. */}
            {data.warnings && data.warnings.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <div className="font-semibold mb-1">Some numbers didn&rsquo;t load</div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {data.warnings.map(w => <li key={w}>{w}</li>)}
                </ul>
              </div>
            )}
            <RollupHealthPanel h={data.rollups} timings={data.timingsMs} cacheAge={data.cacheAgeMs} now={now} show="problems" />
            <BillingAlerts g={data.subscriberGrowth ?? null} />

            {/* 1. The five numbers that say how the business is doing, each against the period before. */}
            <OverviewSection
              growth={data.subscriberGrowth ?? null}
              revenue={data.revenue ?? null}
              accounts={data.accounts ?? null}
              engagedMau={{
                football: data.activeUsersRolling?.engagedMau ?? null,
                hoops: data.hoopsActiveUsersRolling?.engagedMau ?? null,
              }}
              period={period}
              now={now}
            />

            {/* 2. Money: who pays, who left, what landed. */}
            <RevenueSection
              growth={data.subscriberGrowth ?? null}
              revenue={data.revenue ?? null}
              conversion={{
                rate: data.conversionRate,
                subscribers: data.totalSubscriptions,
                convertible: data.convertibleUsers,
                founders: data.grandfatheredUsers,
              }}
              period={period}
              now={now}
            />

            {/* 3. Top of the funnel and where it comes from. */}
            <GrowthSection
              visitors={data.uniqueDevices}
              accounts={data.accounts ?? null}
              fallbackSignupsByDay={data.signupsByDay}
              growth={data.subscriberGrowth ?? null}
              acquisition={data.acquisition ?? null}
              period={period}
              now={now}
            />

            {/* 4. Do people come back. */}
            <EngagementSection
              football={data.activeUsersRolling}
              hoops={data.hoopsActiveUsersRolling}
              windowed={{ activeUsers: data.activeUsers, sessions: data.sessions, pageViews: data.pageViews }}
              topPages={data.topPages}
              period={period}
            />

            {/* 5. What players say, in their words. */}
            <div>
              <SectionHeading title="Player feedback" />
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                {feedback.length > 0 && (
                  <div className="text-xs text-gray-400 mb-4">{feedback.length} most recent message{feedback.length === 1 ? '' : 's'}</div>
                )}
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

            {/* 6. Detail for when a number above raises a question. Folded away so the page stays short. */}
            <div className="space-y-6 border-t border-gray-200 pt-8">
              <Collapsible title="Feature usage" note="what people click, ignore and fight with" defaultOpen>
                <InteractionsSection
                  r={data.interactions}
                  period={period}
                  error={data.warnings?.find(w => w.startsWith('Feature usage'))}
                />
              </Collapsible>
              {data.sim3dCohorts && (
                <Collapsible title="3D live sim experiment" note="decided Nov 6: stays free">
                  <Sim3dSection c={data.sim3dCohorts} f={data.sim3dFollowup ?? null} period={period} />
                </Collapsible>
              )}
              <Collapsible title="Live event feed" note="the last 50 raw events">
                <div className="bg-white rounded-xl border border-gray-200 p-5">
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
              </Collapsible>
              <RollupHealthPanel h={data.rollups} timings={data.timingsMs} cacheAge={data.cacheAgeMs} now={now} show="status" />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/** Billing states that cost money or trust if nobody notices them. Renders nothing when there are none. */
function BillingAlerts({ g }: { g: SubscriberGrowth | null }) {
  if (!g) return null;
  const items: string[] = [];
  if (g.stripeOnlyLive > 0) {
    items.push(`${g.stripeOnlyLive} live Stripe subscription${g.stripeOnlyLive === 1 ? ' is' : 's are'} missing from our table: ${g.stripeOnlyLive === 1 ? 'that person is' : 'those people are'} paying, but the app doesn\u2019t know they are Premium.`);
  }
  if (g.pastDue > 0) {
    items.push(`${g.pastDue} subscription${g.pastDue === 1 ? '' : 's'} failed ${g.pastDue === 1 ? 'its' : 'their'} last payment. Stripe is retrying; ${g.pastDue === 1 ? 'it is' : 'they are'} not counted as subscribed until it goes through.`);
  }
  if (g.stripeError) {
    items.push(`Stripe couldn\u2019t be read (${g.stripeError}), so subscriber dates are the approximate ones from our own table and MRR is missing.`);
  }
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      <div className="font-semibold mb-1">Billing needs a look</div>
      <ul className="list-disc pl-5 space-y-0.5">
        {items.map(i => <li key={i}>{i}</li>)}
      </ul>
    </div>
  );
}

function Sim3dSection({ c, f, period }: { c: Sim3dCohorts; f: Sim3dFollowup | null; period: string }) {
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
        <h2 className="text-sm font-bold">3D Live Sim — free for everyone</h2>
        <span className="text-xs text-gray-500">last {period} · {c.toggles.on} toggled on · {c.toggles.off} off</span>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Free since Oct 23; kept free on Nov 6 as a retention feature. Devices that opened a game page, split by whether the 3D sim was ever on. These devices chose 3D themselves, so the gap overstates what 3D causes — the default-on test below is the causal read.
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
            {f && (
              <tr className="border-t border-gray-100">
                <td className="py-1.5">Went Premium<span className="block text-[11px] text-gray-400">of devices free at their first game view</span></td>
                {(['on', 'off'] as const).map(k => {
                  const v = f.conversion[k];
                  const other = f.conversion[k === 'on' ? 'off' : 'on'];
                  const best = v && other && v.pctConverted > other.pctConverted;
                  return <td key={k} className={`py-1.5 text-right tabular-nums ${best ? 'font-bold text-emerald-700' : ''}`}>{v ? `${v.pctConverted}% (${v.converted}/${v.freeDevices})` : '—'}</td>;
                })}
              </tr>
            )}
          </tbody>
        </table>
      )}
      <Sim3dDefaultTest f={f} />
    </div>
  );
}

/** Default-on test (from 2026-11-06): new devices randomly start with 3D on or off. Intent-to-treat by arm. */
function Sim3dDefaultTest({ f }: { f: Sim3dFollowup | null }) {
  if (!f) {
    return (
      <p className="mt-4 text-xs text-gray-400">
        Conversion and the default-on test need supabase/migrations/20261106_sim3d_followup.sql — run it in the Supabase SQL editor.
      </p>
    );
  }
  const on = f.defaultTest.on, off = f.defaultTest.off;
  const rows: { label: string; key: keyof Sim3dArm; fmt: (v: number) => string; help: string }[] = [
    { label: 'Devices', key: 'devices', fmt: v => String(v), help: 'new devices assigned to the arm' },
    { label: 'Had 3D on', key: 'pctHad3dOn', fmt: v => `${v}%`, help: 'at any game' },
    { label: 'Switched 3D off', key: 'pctSwitchedOff', fmt: v => `${v}%`, help: 'toggled it off at least once' },
    { label: 'Sessions / device', key: 'sessionsPerDevice', fmt: v => v.toFixed(2), help: '30-min gap sessions' },
    { label: 'Active 2+ days', key: 'pctMultiDay', fmt: v => `${v}%`, help: '' },
    { label: 'Returned after 7+ days', key: 'pctReturned7d', fmt: v => `${v}%`, help: 'needs a week of data' },
    { label: 'Went Premium', key: 'pctConverted', fmt: v => `${v}%`, help: 'of devices free at first view' },
  ];
  return (
    <div className="mt-5">
      <h3 className="text-xs font-bold text-gray-700 mb-1">Default-on test (since Nov 6)</h3>
      <p className="text-xs text-gray-500 mb-2">
        New devices are randomly started with 3D on or off; everyone can still toggle. Because the split is random, the gap here is what 3D actually causes.
        Read it once each arm has a few hundred devices and a week of data.
      </p>
      {!on && !off ? <div className="text-sm text-gray-500">No new devices in the test yet.</div> : (
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-gray-500"><th className="text-left font-medium pb-2">Metric</th><th className="text-right font-medium pb-2">Starts on</th><th className="text-right font-medium pb-2">Starts off</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key} className="border-t border-gray-100">
                <td className="py-1.5">{r.label}{r.help && <span className="block text-[11px] text-gray-400">{r.help}</span>}</td>
                <td className="py-1.5 text-right tabular-nums">{on ? r.fmt(on[r.key]) : '—'}</td>
                <td className="py-1.5 text-right tabular-nums">{off ? r.fmt(off[r.key]) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * Rendered twice: `show="problems"` at the top of the page (nothing unless
 * something is wrong) and `show="status"` at the bottom (the one quiet line
 * when all is well).
 */
function RollupHealthPanel({ h, timings, cacheAge, now, show }: { h?: RollupHealth; timings?: Record<string, number>; cacheAge?: Record<string, number>; now: number; show: 'problems' | 'status' }) {
  // Cached reports return in ~0 ms, so only queries that actually ran this request count as "slowest".
  const cachedKeys = new Set(Object.keys(cacheAge ?? {}).map(k => k.split(':')[0]));
  const slowest = Object.entries(timings ?? {}).filter(([k]) => !cachedKeys.has(k)).sort((a, b) => b[1] - a[1])[0];
  const timing = slowest ? `slowest query: ${slowest[0]} ${(slowest[1] / 1000).toFixed(1)}s` : null;
  const oldest = Math.max(0, ...Object.values(cacheAge ?? {}));
  const cached = cachedKeys.size
    ? `${cachedKeys.size} report${cachedKeys.size === 1 ? '' : 's'} cached (${oldest < 60000 ? `${Math.round(oldest / 1000)}s` : `${Math.round(oldest / 60000)}m`} old, refreshes every 5m)`
    : null;

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

  if ((problems.length === 0) !== (show === 'status')) return null;
  if (problems.length === 0) {
    const since = h?.earliestMinute ? h.earliestMinute.slice(0, 10) : '?';
    return (
      <p className="text-xs text-gray-400">
        Rollups live · {h?.lagSeconds ?? 0}s behind · history from {since}{timing ? ` · ${timing}` : ''}{cached ? ` · ${cached}` : ''}
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
