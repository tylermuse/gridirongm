'use client';

import { useState, useMemo } from 'react';
import { useGameStore } from '@/lib/engine/store';
import { GameShell } from '@/components/game/GameShell';
import { RankingsTabs } from '@/components/awards/RankingsTabs';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { TeamRosterModal } from '@/components/game/TeamRosterModal';
import { PlayerModal } from '@/components/game/PlayerModal';
import { POSITIONS, ROSTER_LIMITS, type Position } from '@/types';

/** Position groups to rank (exclude P) */
const RANKED_POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K'];

type Tab = 'overview' | 'league';

interface TeamPosRanking {
  teamId: string;
  avgOvr: number;
  rank: number;
}

function rankColor(rank: number): 'green' | 'blue' | 'amber' | 'red' {
  if (rank <= 8) return 'green';
  if (rank <= 16) return 'blue';
  if (rank <= 24) return 'amber';
  return 'red';
}

function rankTextClass(rank: number): string {
  if (rank <= 8) return 'text-green-600';
  if (rank <= 16) return 'text-blue-600';
  if (rank <= 24) return 'text-amber-600';
  return 'text-red-600';
}

function rankBgClass(rank: number): string {
  if (rank <= 8) return 'bg-green-600';
  if (rank <= 16) return 'bg-blue-600';
  if (rank <= 24) return 'bg-amber-600';
  return 'bg-red-600';
}

export default function PowerRankingsPage() {
  const { players, teams, userTeamId } = useGameStore();
  const [tab, setTab] = useState<Tab>('overview');
  const [selectedPos, setSelectedPos] = useState<Position>('QB');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [viewTeamId, setViewTeamId] = useState<string | null>(null);

  // Calculate rankings per position group
  const rankings = useMemo(() => {
    const result: Record<Position, TeamPosRanking[]> = {} as Record<Position, TeamPosRanking[]>;

    for (const pos of RANKED_POSITIONS) {
      const starterCount = ROSTER_LIMITS[pos].min;
      const teamRankings: { teamId: string; avgOvr: number }[] = [];

      for (const team of teams) {
        // Get all non-retired players at this position for this team
        const posPlayers = players
          .filter(p => p.position === pos && p.teamId === team.id && !p.retired)
          .sort((a, b) => b.ratings.overall - a.ratings.overall);

        // Take the top starters
        const starters = posPlayers.slice(0, starterCount);
        const avgOvr = starters.length > 0
          ? starters.reduce((sum, p) => sum + p.ratings.overall, 0) / starters.length
          : 0;

        teamRankings.push({ teamId: team.id, avgOvr });
      }

      // Sort by avgOvr descending and assign ranks
      teamRankings.sort((a, b) => b.avgOvr - a.avgOvr);
      result[pos] = teamRankings.map((tr, i) => ({
        ...tr,
        rank: i + 1,
      }));
    }

    return result;
  }, [players, teams]);

  // Helper to get user team ranking for a position
  function getUserRanking(pos: Position): TeamPosRanking | undefined {
    return rankings[pos]?.find(r => r.teamId === userTeamId);
  }

  // Get league best for a position
  function getLeagueBest(pos: Position): TeamPosRanking | undefined {
    return rankings[pos]?.[0];
  }

  const tabs = [
    { key: 'overview' as Tab, label: 'Your Team' },
    { key: 'league' as Tab, label: 'League-Wide' },
  ];

  return (
    <GameShell>
      <div className="max-w-5xl mx-auto">
        <RankingsTabs />
        <h2 className="text-2xl font-black mb-2 font-display uppercase tracking-tight">
          Position Group Power Rankings
        </h2>
        <p className="text-sm text-[var(--text-sec)] mb-6">
          Average OVR of top starters at each position, ranked across all 32 teams.
        </p>

        {/* Tab bar */}
        <div className="flex gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-1 mb-6 w-fit">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 text-xs rounded font-medium transition-colors ${
                tab === t.key ? 'bg-blue-600 text-white' : 'text-[var(--text-sec)] hover:text-[var(--text)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Overall Rank Hero */}
        {tab === 'overview' && (() => {
          const ranks = RANKED_POSITIONS.map(pos => getUserRanking(pos)?.rank ?? 32);
          const avg = ranks.reduce((s, r) => s + r, 0) / ranks.length;
          const rounded = Math.round(avg);
          const tier = rounded <= 8 ? 'Elite' : rounded <= 16 ? 'Above Average' : rounded <= 24 ? 'Below Average' : 'Bottom Tier';
          return (
            <div className="text-center mb-6">
              <div className={`text-5xl font-black ${rankTextClass(rounded)}`}>#{rounded}</div>
              <div className="text-sm text-[var(--text-sec)] mt-1">{tier} — Overall Power Rank</div>
            </div>
          );
        })()}

        {/* Overview: Your Team */}
        {tab === 'overview' && (
          <Card>
            <CardHeader>
              <CardTitle>Your Position Group Rankings</CardTitle>
            </CardHeader>
            <div className="relative overflow-x-auto">
              <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-[var(--surface)] to-transparent sm:hidden z-10" />
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="text-[var(--text-sec)] text-xs uppercase tracking-wider">
                    <th className="text-left pb-3">Position</th>
                    <th className="text-center pb-3">Your Avg OVR</th>
                    <th className="text-center pb-3">Rank</th>
                    <th className="text-center pb-3">League Best</th>
                    <th className="text-left pb-3 pl-4">Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {RANKED_POSITIONS.map(pos => {
                    const userRank = getUserRanking(pos);
                    const best = getLeagueBest(pos);
                    const bestTeam = best ? teams.find(t => t.id === best.teamId) : undefined;
                    const rank = userRank?.rank ?? 32;
                    const barWidth = Math.max(5, ((33 - rank) / 32) * 100);

                    return (
                      <tr
                        key={pos}
                        className="border-t border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors duration-150"
                      >
                        <td className="py-3">
                          <Badge>{pos}</Badge>
                          <span className="ml-2 text-xs text-[var(--text-sec)]">
                            ({ROSTER_LIMITS[pos].min} starter{ROSTER_LIMITS[pos].min > 1 ? 's' : ''})
                          </span>
                        </td>
                        <td className="py-3 text-center font-mono font-bold">
                          {userRank ? userRank.avgOvr.toFixed(1) : '-'}
                        </td>
                        <td className="py-3 text-center">
                          <span className={`font-bold text-base ${rankTextClass(rank)}`}>
                            #{rank}
                          </span>
                        </td>
                        <td className="py-3 text-center">
                          <span className="font-mono text-[var(--text-sec)]">
                            {best ? best.avgOvr.toFixed(1) : '-'}
                          </span>
                          {bestTeam && (
                            <span className="ml-1 text-xs text-[var(--text-sec)]">
                              ({bestTeam.abbreviation})
                            </span>
                          )}
                        </td>
                        <td className="py-3 pl-4">
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-2 bg-[var(--surface-2)] rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${rankBgClass(rank)}`}
                                style={{ width: `${barWidth}%` }}
                              />
                            </div>
                            <Badge variant={rankColor(rank)} size="sm">
                              {rank <= 8 ? 'Elite' : rank <= 16 ? 'Above Avg' : rank <= 24 ? 'Below Avg' : 'Bottom'}
                            </Badge>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* League-Wide View */}
        {tab === 'league' && (
          <>
            {/* Position selector */}
            <div className="flex flex-wrap gap-1 mb-4">
              {RANKED_POSITIONS.map(pos => (
                <button
                  key={pos}
                  onClick={() => setSelectedPos(pos)}
                  className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                    selectedPos === pos
                      ? 'bg-blue-600 text-white'
                      : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-sec)] hover:text-[var(--text)]'
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{selectedPos} Rankings — All Teams</CardTitle>
                  <span className="text-xs text-[var(--text-sec)]">
                    Top {ROSTER_LIMITS[selectedPos].min} starter{ROSTER_LIMITS[selectedPos].min > 1 ? 's' : ''} avg OVR
                  </span>
                </div>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[500px]">
                  <thead>
                    <tr className="text-[var(--text-sec)] text-xs uppercase tracking-wider">
                      <th className="text-center pb-3 w-8">#</th>
                      <th className="text-left pb-3">Team</th>
                      <th className="text-center pb-3">Avg Starter OVR</th>
                      <th className="text-left pb-3 pl-4">Tier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(rankings[selectedPos] ?? []).map(tr => {
                      const team = teams.find(t => t.id === tr.teamId);
                      if (!team) return null;
                      const isUser = tr.teamId === userTeamId;
                      const barWidth = Math.max(5, ((33 - tr.rank) / 32) * 100);

                      return (
                        <tr
                          key={tr.teamId}
                          className={`border-t border-[var(--border)] ${
                            isUser ? 'bg-blue-500/5 font-semibold' : 'hover:bg-[var(--surface-2)]'
                          } transition-colors duration-150`}
                        >
                          <td className="py-2.5 text-center">
                            <span className={`text-sm font-bold ${rankTextClass(tr.rank)}`}>
                              {tr.rank}
                            </span>
                          </td>
                          <td className="py-2.5">
                            <button
                              onClick={() => setViewTeamId(team.id)}
                              className="flex items-center gap-2 hover:text-blue-600 transition-colors"
                            >
                              <TeamLogo
                                abbreviation={team.abbreviation}
                                primaryColor={team.primaryColor}
                                secondaryColor={team.secondaryColor}
                                logoUrl={team.logoUrl}
                                size="xs"
                              />
                              <span className={isUser ? 'text-blue-600' : ''}>
                                {team.city} {team.name}
                              </span>
                              {isUser && <span className="text-xs text-blue-600">(You)</span>}
                            </button>
                          </td>
                          <td className="py-2.5 text-center font-mono font-bold">
                            {tr.avgOvr.toFixed(1)}
                          </td>
                          <td className="py-2.5 pl-4">
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-2 bg-[var(--surface-2)] rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${rankBgClass(tr.rank)}`}
                                  style={{ width: `${barWidth}%` }}
                                />
                              </div>
                              <Badge variant={rankColor(tr.rank)} size="sm">
                                {tr.rank <= 8 ? 'Elite' : tr.rank <= 16 ? 'Above Avg' : tr.rank <= 24 ? 'Below Avg' : 'Bottom'}
                              </Badge>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>

      <TeamRosterModal
        teamId={viewTeamId}
        onClose={() => setViewTeamId(null)}
        onPlayerClick={(id) => setSelectedPlayerId(id)}
      />
      <PlayerModal
        playerId={selectedPlayerId}
        onClose={() => setSelectedPlayerId(null)}
      />
    </GameShell>
  );
}
