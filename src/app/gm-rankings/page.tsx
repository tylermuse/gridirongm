'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { GameShell } from '@/components/game/GameShell';
import { RankingsTabs } from '@/components/awards/RankingsTabs';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { careerScoreToGrade } from '@/lib/engine/draftScore';
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

type Tab = 'all-time' | 'this-season' | 'categories' | 'awards';

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
        <RankingsTabs />
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
            { key: 'awards', label: '🏆 Awards' },
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
            {tab === 'all-time' && (() => {
              const qualifiedAllTime = data.allTime.filter(r => r.seasonsPlayed >= 5);
              return (
                <Card>
                  <CardHeader>
                    <CardTitle>All-Time Leaderboard</CardTitle>
                    <span className="text-[10px] text-[var(--text-sec)]">Min 5 seasons</span>
                  </CardHeader>
                  {qualifiedAllTime.length === 0 ? (
                    <div className="text-center py-8 text-[var(--text-sec)] text-sm">
                      No GMs have completed 5 seasons yet. Keep playing.
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
                            <th className="text-right py-2 pr-2">Draft</th>
                          </tr>
                        </thead>
                        <tbody>
                          {qualifiedAllTime.map((row, idx) => {
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
                                <td className="py-2 pr-2 text-right font-bold">{row.draftsCompleted > 0 ? careerScoreToGrade(row.avgDraftScore) : '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              );
            })()}

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

            {/* Awards tab */}
            {tab === 'awards' && (
              <AwardsTab latestSeason={data.latestSeason} userId={user?.id ?? null} />
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
  const bestWinPct = [...allTime].filter(r => r.seasonsPlayed >= 5).sort((a, b) => b.winPct - a.winPct).slice(0, 10);
  const bestDraftScore = [...allTime].filter(r => r.draftsCompleted >= 2).sort((a, b) => b.avgDraftScore - a.avgDraftScore).slice(0, 10);
  const mostPlayoffs = [...allTime].sort((a, b) => b.playoffAppearances - a.playoffAppearances).slice(0, 10);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <CategoryCard title="🏆 Most Championships" rows={mostChampionships} valueKey="championships" valueLabel="rings" userId={userId} />
      <CategoryCard title="📈 Best Career Win %" rows={bestWinPct} valueKey="winPct" valueLabel="win%" userId={userId} subtitle="Min 5 seasons" />
      <CategoryCard title="🎯 Best Avg Draft Score" rows={bestDraftScore} valueKey="avgDraftScore" valueLabel="" userId={userId} subtitle="Min 2 drafts" />
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
    if (valueKey === 'avgDraftScore') return careerScoreToGrade(v);
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

// ---------------------------------------------------------------------------
// Awards tab — opt-in voting for season awards (GM of the Year, etc.)
// ---------------------------------------------------------------------------

interface Nominee {
  userId: string;
  displayName: string;
  teamName: string | null;
  primaryStat: string;
  secondaryStat?: string;
}

interface NomineesData {
  season: number;
  categories: {
    gm_of_year: Nominee[];
    best_draft: Nominee[];
    best_rebuild: Nominee[];
  };
}

const AWARD_META = {
  gm_of_year: { label: 'GM of the Year', icon: '🏅', desc: 'Best overall season performance' },
  best_draft: { label: 'Best Draft Class', icon: '🎯', desc: 'Top haul from this offseason' },
  best_rebuild: { label: 'Best Rebuild', icon: '🔨', desc: 'Most improved team vs. last year' },
} as const;

type AwardKey = keyof typeof AWARD_META;
const AWARDS: AwardKey[] = ['gm_of_year', 'best_draft', 'best_rebuild'];

function AwardsTab({ latestSeason, userId }: { latestSeason: number | null; userId: string | null }) {
  const [nominees, setNominees] = useState<NomineesData | null>(null);
  const [votes, setVotes] = useState<Partial<Record<AwardKey, string>>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (latestSeason == null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNominees(null);
    setVotes({});
    setSubmitted(false);
    (async () => {
      try {
        const res = await fetch(`/api/gm/awards/nominees?season=${latestSeason}`);
        const json = await res.json();
        if (!res.ok) {
          if (!cancelled) setError(json.error ?? 'Failed to load nominees');
        } else if (!cancelled) {
          setNominees(json);
        }
      } catch {
        if (!cancelled) setError('Failed to fetch nominees');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [latestSeason]);

  function handleVoteSelect(award: AwardKey, nomineeUserId: string) {
    setVotes(prev => ({ ...prev, [award]: nomineeUserId }));
  }

  async function handleSubmit() {
    if (latestSeason == null || !userId) return;
    setSubmitting(true);
    for (const award of AWARDS) {
      const nomineeId = votes[award];
      if (!nomineeId) continue;
      try {
        await fetch('/api/gm/awards/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ season: latestSeason, awardType: award, nomineeUserId: nomineeId }),
        });
      } catch { /* ignore individual vote errors */ }
    }
    setSubmitting(false);
    setSubmitted(true);
  }

  if (latestSeason == null) {
    return (
      <Card>
        <div className="text-center py-8 text-sm text-[var(--text-sec)]">
          Awards will be available after the first season finishes.
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>🏆 Season {latestSeason} Awards</CardTitle>
      </CardHeader>

      <p className="text-xs text-[var(--text-sec)] -mt-1 mb-4">
        Cast your vote in any category. {userId ? 'Voting is optional — pick the categories you care about.' : 'Sign in to make your vote count.'}
      </p>

      {loading && (
        <div className="text-center py-8 text-sm text-[var(--text-sec)]">Loading nominees...</div>
      )}
      {error && (
        <div className="text-center py-8 text-sm text-red-600">{error}</div>
      )}

      {nominees && (
        <div className="space-y-5">
          {AWARDS.map(award => {
            const meta = AWARD_META[award];
            const catNominees = nominees.categories[award];
            return (
              <div key={award}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{meta.icon}</span>
                  <div className="flex-1">
                    <div className="text-sm font-bold">{meta.label}</div>
                    <div className="text-[10px] text-[var(--text-sec)]">{meta.desc}</div>
                  </div>
                </div>

                {catNominees.length === 0 ? (
                  <div className="text-xs text-[var(--text-sec)] italic ml-7">No eligible nominees this season.</div>
                ) : (
                  <div className="space-y-1.5">
                    {catNominees.map(nom => {
                      const isSelected = votes[award] === nom.userId;
                      return (
                        <button
                          key={nom.userId}
                          onClick={() => handleVoteSelect(award, nom.userId)}
                          disabled={!userId}
                          className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                            isSelected
                              ? 'bg-blue-50 border-blue-300'
                              : 'bg-[var(--surface-2)] border-[var(--border)] hover:bg-[var(--surface-2)]/70'
                          } ${!userId ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-bold truncate">
                                {nom.displayName}
                                {userId === nom.userId && <span className="ml-1.5 text-[10px] text-blue-600">(You)</span>}
                              </div>
                              <div className="text-[10px] text-[var(--text-sec)] truncate">{nom.teamName ?? '—'}</div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-xs font-bold tabular-nums">{nom.primaryStat}</div>
                              {nom.secondaryStat && (
                                <div className="text-[10px] text-[var(--text-sec)] tabular-nums">{nom.secondaryStat}</div>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
            {submitted && <span className="text-xs text-green-600">Votes submitted ✓</span>}
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={submitting || !userId || Object.keys(votes).length === 0}
            >
              {submitting ? 'Submitting…' : 'Submit Votes'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
