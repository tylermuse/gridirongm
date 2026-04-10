'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { useSubscription } from '@/components/providers/SubscriptionProvider';

interface AllTimeRow {
  userId: string;
  displayName: string;
  teamAbbreviation: string | null;
  teamName: string | null;
  wins: number;
  losses: number;
  winPct: number;
  championships: number;
  playoffAppearances: number;
  avgDraftScore: number;
  draftsCompleted: number;
  seasonsPlayed: number;
}

interface SeasonRow {
  userId: string;
  displayName: string;
  teamName: string | null;
  wins: number;
  losses: number;
  winPct: number;
  madePlayoffs: boolean;
  draftGrade: string | null;
}

interface LeaderboardData {
  latestSeason: number | null;
  allTime: AllTimeRow[];
  thisSeason: SeasonRow[];
}

type Tab = 'all-time' | 'this-season' | 'categories';

function fmtPct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

function gradeColor(grade: string | null): string {
  if (!grade) return 'text-[var(--text-sec)]';
  if (grade.startsWith('A')) return 'text-green-600';
  if (grade.startsWith('B')) return 'text-blue-600';
  if (grade.startsWith('C')) return 'text-amber-600';
  return 'text-red-600';
}

export default function GmRankingsPage() {
  const { user } = useSubscription();
  const [tab, setTab] = useState<Tab>('all-time');
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/gm/leaderboard');
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to load leaderboard');
      } else {
        setData(json);
      }
    } catch {
      setError('Failed to fetch leaderboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <GameShell>
      <div className="max-w-5xl mx-auto space-y-4">
        <div>
          <h2 className="text-2xl font-black">🏆 GM Rankings</h2>
          <p className="text-sm text-[var(--text-sec)] mt-1">
            Leaderboard of every GM in BS Football. Compete for championships, draft grades, and bragging rights.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-1 w-fit overflow-x-auto max-w-full">
          {([
            { key: 'all-time', label: 'All-Time' },
            { key: 'this-season', label: data?.latestSeason ? `Season ${data.latestSeason}` : 'This Season' },
            { key: 'categories', label: 'Categories' },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 text-xs rounded font-medium transition-colors whitespace-nowrap ${
                tab === t.key ? 'bg-blue-600 text-white' : 'text-[var(--text-sec)] hover:text-[var(--text)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && (
          <Card>
            <div className="text-center py-8 text-[var(--text-sec)]">Loading leaderboard...</div>
          </Card>
        )}

        {error && (
          <Card>
            <div className="text-center py-8 text-red-600">{error}</div>
          </Card>
        )}

        {!loading && !error && data && (
          <>
            {/* All-Time tab */}
            {tab === 'all-time' && (
              <Card>
                <CardHeader><CardTitle>All-Time Leaderboard</CardTitle></CardHeader>
                {data.allTime.length === 0 ? (
                  <div className="text-center py-8 text-[var(--text-sec)] text-sm">
                    No GMs have completed a season yet. Be the first!
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[var(--text-sec)] text-xs uppercase tracking-wider border-b border-[var(--border)]">
                          <th className="text-left py-2 pl-2">#</th>
                          <th className="text-left py-2">GM</th>
                          <th className="text-center py-2">Team</th>
                          <th className="text-center py-2">🏆</th>
                          <th className="text-right py-2">W-L</th>
                          <th className="text-right py-2">Win %</th>
                          <th className="text-center py-2">Playoffs</th>
                          <th className="text-right py-2 pr-2">Avg Draft</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.allTime.map((row, idx) => {
                          const isMe = user?.id === row.userId;
                          return (
                            <tr key={row.userId} className={`border-t border-[var(--border)] ${isMe ? 'bg-blue-50' : ''} hover:bg-[var(--surface-2)]`}>
                              <td className="py-2 pl-2 text-[var(--text-sec)] font-mono">{idx + 1}</td>
                              <td className="py-2 font-semibold">
                                <Link href={`/gm/${row.userId}`} className="hover:text-blue-600 transition-colors">
                                  {row.displayName}
                                  {isMe && <span className="ml-1.5 text-[10px] text-blue-600 font-bold">(You)</span>}
                                </Link>
                              </td>
                              <td className="py-2 text-center text-xs text-[var(--text-sec)]">{row.teamAbbreviation ?? '—'}</td>
                              <td className="py-2 text-center font-bold">{row.championships > 0 ? row.championships : '—'}</td>
                              <td className="py-2 text-right tabular-nums">{row.wins}-{row.losses}</td>
                              <td className="py-2 text-right tabular-nums">{fmtPct(row.winPct)}</td>
                              <td className="py-2 text-center tabular-nums">{row.playoffAppearances}</td>
                              <td className="py-2 pr-2 text-right tabular-nums">{row.draftsCompleted > 0 ? row.avgDraftScore.toFixed(1) : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}

            {/* This Season tab */}
            {tab === 'this-season' && (
              <Card>
                <CardHeader><CardTitle>{data.latestSeason ? `Season ${data.latestSeason}` : 'This Season'}</CardTitle></CardHeader>
                {data.thisSeason.length === 0 ? (
                  <div className="text-center py-8 text-[var(--text-sec)] text-sm">
                    No GM seasons recorded yet for this period.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[var(--text-sec)] text-xs uppercase tracking-wider border-b border-[var(--border)]">
                          <th className="text-left py-2 pl-2">#</th>
                          <th className="text-left py-2">GM</th>
                          <th className="text-center py-2">Team</th>
                          <th className="text-right py-2">W-L</th>
                          <th className="text-right py-2">Win %</th>
                          <th className="text-center py-2">Playoffs</th>
                          <th className="text-center py-2 pr-2">Draft</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.thisSeason.map((row, idx) => {
                          const isMe = user?.id === row.userId;
                          return (
                            <tr key={row.userId} className={`border-t border-[var(--border)] ${isMe ? 'bg-blue-50' : ''} hover:bg-[var(--surface-2)]`}>
                              <td className="py-2 pl-2 text-[var(--text-sec)] font-mono">{idx + 1}</td>
                              <td className="py-2 font-semibold">
                                <Link href={`/gm/${row.userId}`} className="hover:text-blue-600 transition-colors">
                                  {row.displayName}
                                  {isMe && <span className="ml-1.5 text-[10px] text-blue-600 font-bold">(You)</span>}
                                </Link>
                              </td>
                              <td className="py-2 text-center text-xs text-[var(--text-sec)]">{row.teamName ?? '—'}</td>
                              <td className="py-2 text-right tabular-nums">{row.wins}-{row.losses}</td>
                              <td className="py-2 text-right tabular-nums">{fmtPct(row.winPct)}</td>
                              <td className="py-2 text-center">{row.madePlayoffs ? '✓' : '—'}</td>
                              <td className={`py-2 pr-2 text-center font-bold ${gradeColor(row.draftGrade)}`}>{row.draftGrade ?? '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}

            {/* Categories tab */}
            {tab === 'categories' && (
              <CategoriesTab allTime={data.allTime} userId={user?.id ?? null} />
            )}
          </>
        )}
      </div>
    </GameShell>
  );
}

function CategoriesTab({ allTime, userId }: { allTime: AllTimeRow[]; userId: string | null }) {
  // Compute top-10 lists per category
  const mostChampionships = [...allTime].sort((a, b) => b.championships - a.championships).slice(0, 10);
  const bestWinPct = [...allTime].filter(r => r.seasonsPlayed >= 2).sort((a, b) => b.winPct - a.winPct).slice(0, 10);
  const bestDraftScore = [...allTime].filter(r => r.draftsCompleted >= 2).sort((a, b) => b.avgDraftScore - a.avgDraftScore).slice(0, 10);
  const mostPlayoffs = [...allTime].sort((a, b) => b.playoffAppearances - a.playoffAppearances).slice(0, 10);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <CategoryCard title="🏆 Most Championships" rows={mostChampionships} valueKey="championships" valueLabel="rings" userId={userId} />
      <CategoryCard title="📈 Best Career Win %" rows={bestWinPct} valueKey="winPct" valueLabel="win%" userId={userId} subtitle="Min 2 seasons" />
      <CategoryCard title="🎯 Best Avg Draft Score" rows={bestDraftScore} valueKey="avgDraftScore" valueLabel="pts" userId={userId} subtitle="Min 2 drafts" />
      <CategoryCard title="🏈 Most Playoff Appearances" rows={mostPlayoffs} valueKey="playoffAppearances" valueLabel="appearances" userId={userId} />
    </div>
  );
}

function CategoryCard({
  title, rows, valueKey, valueLabel, userId, subtitle,
}: {
  title: string;
  rows: AllTimeRow[];
  valueKey: 'championships' | 'winPct' | 'avgDraftScore' | 'playoffAppearances';
  valueLabel: string;
  userId: string | null;
  subtitle?: string;
}) {
  function fmtVal(row: AllTimeRow): string {
    const v = row[valueKey];
    if (valueKey === 'winPct') return `${(v * 100).toFixed(1)}%`;
    if (valueKey === 'avgDraftScore') return v.toFixed(1);
    return String(v);
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {subtitle && <span className="text-[10px] text-[var(--text-sec)]">{subtitle}</span>}
      </CardHeader>
      {rows.length === 0 ? (
        <div className="text-center py-6 text-xs text-[var(--text-sec)]">No qualifying GMs yet.</div>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((row, idx) => {
            const isMe = userId === row.userId;
            return (
              <li
                key={row.userId}
                className={`flex items-center justify-between text-sm px-2 py-1 rounded ${isMe ? 'bg-blue-50 font-bold' : ''}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[var(--text-sec)] font-mono w-6 text-xs">{idx + 1}.</span>
                  <Link href={`/gm/${row.userId}`} className="truncate hover:text-blue-600 transition-colors">
                    {row.displayName}
                  </Link>
                </div>
                <span className="text-xs tabular-nums shrink-0">{fmtVal(row)} {valueLabel}</span>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
