'use client';

import { use, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useSubscription } from '@/components/providers/SubscriptionProvider';
import { useGameStore } from '@/lib/engine/store';

interface CareerData {
  userId: string;
  displayName: string;
  teamId: string | null;
  teamName: string | null;
  teamAbbreviation: string | null;
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
  season: number;
  team_name: string | null;
  team_id: string | null;
  wins: number;
  losses: number;
  made_playoffs: boolean;
  won_championship: boolean;
  draft_grade: string | null;
  draft_score: number | null;
  created_at: string;
}

interface AwardRow {
  season: number;
  award_type: string;
  awarded_at: string;
}

interface ProfileData {
  career: CareerData;
  seasons: SeasonRow[];
  awards: AwardRow[];
}

const AWARD_LABELS: Record<string, { label: string; icon: string }> = {
  gm_of_year: { label: 'GM of the Year', icon: '🏅' },
  best_draft: { label: 'Best Draft Class', icon: '🎯' },
  best_trade: { label: 'Best Trade', icon: '🤝' },
  best_rebuild: { label: 'Best Rebuild', icon: '🔨' },
};

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

export default function GmProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  const { user } = useSubscription();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/gm/profile/${userId}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to load profile');
      } else {
        setData(json);
      }
    } catch {
      setError('Failed to fetch GM profile');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const isMe = user?.id === userId;
  const isHallOfFame = (data?.career.championships ?? 0) >= 3;

  // Owner Objectives for the current season live in the local game save
  // (team.approval.objectives), not in the backend profile. They're only
  // meaningful for the GM viewing their own hub, so gate on isMe and surface
  // the active save's current-season objectives. Degrades to nothing when
  // there's no active save, no approval state, or no objectives for the season
  // (e.g. a save created before objectives shipped).
  const { teams, userTeamId, season } = useGameStore();
  const liveObjectives = (() => {
    if (!isMe || !userTeamId) return [];
    const userTeam = teams.find(t => t.id === userTeamId);
    return (userTeam?.approval?.objectives ?? []).filter(o => o.season === season);
  })();

  return (
    <GameShell>
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <Link href="/gm-rankings" className="text-xs text-blue-600 hover:underline">← Back to Leaderboard</Link>
        </div>

        {loading && <Card><div className="text-center py-8 text-[var(--text-sec)]">Loading profile...</div></Card>}

        {error && <Card><div className="text-center py-8 text-red-600">{error}</div></Card>}

        {!loading && !error && data && (
          <>
            {/* Header */}
            <Card>
              <div className="flex items-start gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-2xl font-black">{data.career.displayName}</h2>
                    {isMe && <Badge variant="blue" size="sm">You</Badge>}
                    {isHallOfFame && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-300">
                        🏛️ Hall of Fame
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[var(--text-sec)] mt-1">
                    {data.career.teamName ?? 'Unknown Team'} · {data.career.seasonsPlayed} season{data.career.seasonsPlayed !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {/* Summary stats row */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5">
                <Stat label="Championships" value={String(data.career.championships)} icon="🏆" highlight={data.career.championships > 0} />
                <Stat label="Career W-L" value={`${data.career.wins}-${data.career.losses}`} />
                <Stat label="Win %" value={fmtPct(data.career.winPct)} />
                <Stat label="Playoff Apps" value={String(data.career.playoffAppearances)} />
                <Stat label="Avg Draft" value={data.career.draftsCompleted > 0 ? data.career.avgDraftScore.toFixed(1) : '—'} />
              </div>
            </Card>

            {/* Owner Objectives — current-season goals from the owner, pulled
                from the live save. Only shown on your own hub when the active
                save has objectives for the current season. */}
            {liveObjectives.length > 0 && (
              <Card>
                <CardHeader><CardTitle>Owner Objectives</CardTitle></CardHeader>
                <p className="text-xs text-[var(--text-sec)] mb-3">
                  What ownership expects from you this season ({season}).
                </p>
                <div className="flex flex-col gap-2">
                  {liveObjectives.map(obj => (
                    <div key={obj.id} className="flex items-center gap-2 text-sm">
                      <span className="text-base">
                        {obj.status === 'completed' ? '✅' : obj.status === 'failed' ? '❌' : '⏳'}
                      </span>
                      <span className={obj.status === 'failed' ? 'text-red-600 line-through' : obj.status === 'completed' ? 'text-green-600' : ''}>
                        {obj.description}
                      </span>
                      <span className="ml-auto text-[10px] uppercase tracking-wider text-[var(--text-sec)]">
                        {obj.status === 'completed' ? 'Met' : obj.status === 'failed' ? 'Failed' : 'Active'}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Trophy case */}
            <Card>
              <CardHeader><CardTitle>Trophy Case</CardTitle></CardHeader>
              {data.career.championships === 0 && data.awards.length === 0 ? (
                <div className="text-center py-6 text-xs text-[var(--text-sec)]">
                  No hardware yet. Win a championship or take home an award.
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {/* Championship rings */}
                  {Array.from({ length: data.career.championships }).map((_, i) => (
                    <div
                      key={`ring-${i}`}
                      className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200"
                      title="Championship Ring"
                    >
                      <span className="text-2xl">🏆</span>
                      <span className="text-[9px] font-bold text-amber-700 uppercase">Ring</span>
                    </div>
                  ))}
                  {/* Award badges */}
                  {data.awards.map((a, i) => {
                    const meta = AWARD_LABELS[a.award_type] ?? { label: a.award_type, icon: '🏅' };
                    return (
                      <div
                        key={`award-${i}`}
                        className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200"
                        title={`${meta.label} (S${a.season})`}
                      >
                        <span className="text-2xl">{meta.icon}</span>
                        <span className="text-[9px] font-bold text-blue-700 uppercase text-center">
                          {meta.label.split(' ').slice(0, 2).join(' ')}
                        </span>
                        <span className="text-[9px] text-blue-600">S{a.season}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Season-by-season */}
            <Card>
              <CardHeader><CardTitle>Season History</CardTitle></CardHeader>
              {data.seasons.length === 0 ? (
                <div className="text-center py-6 text-xs text-[var(--text-sec)]">No seasons recorded yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[var(--text-sec)] text-xs uppercase tracking-wider border-b border-[var(--border)]">
                        <th className="text-left py-2 pl-2">Season</th>
                        <th className="text-left py-2">Team</th>
                        <th className="text-right py-2">W-L</th>
                        <th className="text-center py-2">Playoffs</th>
                        <th className="text-center py-2">Champion</th>
                        <th className="text-center py-2 pr-2">Draft</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.seasons.map((s, idx) => (
                        <tr key={`${s.season}-${idx}`} className={`border-t border-[var(--border)] ${s.won_championship ? 'bg-amber-50' : ''}`}>
                          <td className="py-2 pl-2 font-mono font-bold">{s.season}</td>
                          <td className="py-2 text-xs text-[var(--text-sec)]">{s.team_name ?? '—'}</td>
                          <td className="py-2 text-right tabular-nums">{s.wins}-{s.losses}</td>
                          <td className="py-2 text-center">{s.made_playoffs ? '✓' : '—'}</td>
                          <td className="py-2 text-center">{s.won_championship ? '🏆' : '—'}</td>
                          <td className={`py-2 pr-2 text-center font-bold ${gradeColor(s.draft_grade)}`}>{s.draft_grade ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </GameShell>
  );
}

function Stat({ label, value, icon, highlight }: { label: string; value: string; icon?: string; highlight?: boolean }) {
  return (
    <div className={`text-center px-2 py-3 rounded-lg ${highlight ? 'bg-amber-50 border border-amber-200' : 'bg-[var(--surface-2)]'}`}>
      <div className={`text-2xl font-black tabular-nums ${highlight ? 'text-amber-600' : ''}`}>
        {icon && <span className="text-lg mr-1">{icon}</span>}
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-sec)] mt-0.5">{label}</div>
    </div>
  );
}
