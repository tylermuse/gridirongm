'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSubscription } from '@/components/providers/SubscriptionProvider';

interface AnalyticsData {
  period: string;
  totalUsers: number;
  activeUsers: number;
  pageViews: number;
  conversionRate: number;
  totalSubscriptions: number;
  signupsByDay: Record<string, number>;
  topPages: { path: string; count: number }[];
  recentEvents: { event: string; properties: Record<string, unknown>; created_at: string; user_id: string | null }[];
}

type Period = '7d' | '30d' | '90d';

interface FeedbackItem {
  id: string;
  message: string;
  page: string | null;
  created_at: string;
  user_id: string | null;
}

export default function AdminAnalyticsPage() {
  const { user, isAdmin, loading: authLoading } = useSubscription();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('30d');
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);

  const fetchData = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/analytics?period=${p}`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // Failed to fetch
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
        ) : !data ? (
          <div className="text-center py-20 text-gray-400">No data available yet. Events will appear once users start visiting.</div>
        ) : (
          <div className="space-y-8">
            {/* Overview cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard label="Total Users" value={data.totalUsers} />
              <MetricCard label={`Active Users (${period})`} value={data.activeUsers} />
              <MetricCard label={`Page Views (${period})`} value={data.pageViews} />
              <MetricCard
                label="Conversion Rate"
                value={`${(data.conversionRate * 100).toFixed(1)}%`}
                sub={`${data.totalSubscriptions} subscriptions`}
              />
            </div>

            {/* Signups chart + Top pages side by side */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Signups over time */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-bold text-gray-900 mb-4">Signups ({period})</h2>
                <SignupsChart data={data.signupsByDay} period={period} />
              </div>

              {/* Top pages */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-bold text-gray-900 mb-4">Top Pages ({period})</h2>
                {data.topPages.length === 0 ? (
                  <div className="text-sm text-gray-400 py-4 text-center">No page views yet</div>
                ) : (
                  <div className="space-y-2">
                    {data.topPages.map(({ path, count }) => {
                      const max = data.topPages[0].count;
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
                            {timeAgo(ev.created_at)}
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
                        <span>{timeAgo(fb.created_at)}</span>
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

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-900">{typeof value === 'number' ? value.toLocaleString() : value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

function EventBadge({ event }: { event: string }) {
  const colors: Record<string, string> = {
    page_view: 'bg-gray-100 text-gray-600',
    login: 'bg-blue-100 text-blue-700',
    signup: 'bg-green-100 text-green-700',
    session_start: 'bg-purple-100 text-purple-700',
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors[event] ?? 'bg-gray-100 text-gray-600'}`}>
      {event}
    </span>
  );
}

function formatProperties(props: Record<string, unknown>): string {
  if (props.path) return String(props.path);
  const entries = Object.entries(props).filter(([, v]) => v != null);
  if (entries.length === 0) return '—';
  return entries.map(([k, v]) => `${k}: ${v}`).join(', ');
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function SignupsChart({ data, period }: { data: Record<string, number>; period: Period }) {
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const labels: string[] = [];
  const values: number[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    labels.push(key);
    values.push(data[key] ?? 0);
  }

  const max = Math.max(...values, 1);

  if (values.every(v => v === 0)) {
    return <div className="text-sm text-gray-400 py-4 text-center">No signups in this period</div>;
  }

  return (
    <div className="flex items-end gap-px h-32">
      {values.map((v, i) => (
        <div
          key={labels[i]}
          className="flex-1 bg-blue-500 rounded-t-sm hover:bg-blue-600 transition-colors group relative min-w-[2px]"
          style={{ height: `${(v / max) * 100}%`, minHeight: v > 0 ? '2px' : '0' }}
          title={`${labels[i]}: ${v} signup${v !== 1 ? 's' : ''}`}
        />
      ))}
    </div>
  );
}
