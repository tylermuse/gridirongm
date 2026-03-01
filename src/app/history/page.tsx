'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useGameStore } from '@/lib/engine/store';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

const PLAYOFF_LABELS: Record<string, string> = {
  missed: 'Missed Playoffs',
  wildcard: 'Wild Card',
  divisional: 'Divisional',
  conference: 'Conf. Championship',
  runnerup: 'Super Bowl Runner-Up',
  champion: 'CHAMPION',
};

const RESULT_VARIANTS: Record<string, 'green' | 'blue' | 'red' | 'default'> = {
  missed: 'red',
  wildcard: 'default',
  divisional: 'default',
  conference: 'blue',
  runnerup: 'blue',
  champion: 'green',
};

export default function HistoryPage() {
  const { seasonHistory, players, teams, userTeamId, season } = useGameStore();
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);

  const selected = seasonHistory.find(s => s.season === selectedSeason);

  function playerName(playerId: string) {
    const p = players.find(pl => pl.id === playerId);
    return p ? `${p.firstName} ${p.lastName}` : '—';
  }

  function teamAbbr(teamId: string) {
    return teams.find(t => t.id === teamId)?.abbreviation ?? '???';
  }

  function teamColor(teamId: string) {
    return teams.find(t => t.id === teamId)?.primaryColor ?? '#666';
  }

  function teamName(teamId: string) {
    const t = teams.find(t => t.id === teamId);
    return t ? `${t.city} ${t.name}` : '???';
  }

  return (
    <GameShell>
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-black mb-2">Season History</h2>
        <p className="text-[var(--text-sec)] text-sm mb-6">
          Currently in Season {season}. {seasonHistory.length} season{seasonHistory.length !== 1 ? 's' : ''} completed.
        </p>

        {seasonHistory.length === 0 ? (
          <Card>
            <div className="text-center py-16 text-[var(--text-sec)]">
              <div className="text-4xl mb-3">🗃️</div>
              <p>No completed seasons yet. Finish your first season to see history here.</p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-[1fr_1.5fr] gap-6">
            {/* Season list */}
            <div className="space-y-2">
              {[...seasonHistory].reverse().map(summary => {
                const champTeam = teams.find(t => t.id === summary.championTeamId);
                const isActive = selectedSeason === summary.season;
                return (
                  <button
                    key={summary.season}
                    onClick={() => setSelectedSeason(isActive ? null : summary.season)}
                    className={`w-full text-left rounded-xl border p-4 transition-colors ${
                      isActive
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-[var(--border)] bg-[var(--surface)] hover:border-blue-500/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold">Season {summary.season}</span>
                      <Badge variant={RESULT_VARIANTS[summary.userPlayoffResult]} size="sm">
                        {PLAYOFF_LABELS[summary.userPlayoffResult]}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--text-sec)]">
                        Your record: {summary.userRecord.wins}-{summary.userRecord.losses}
                      </span>
                      {champTeam && (
                        <div className="flex items-center gap-1">
                          <div
                            className="w-4 h-4 rounded text-[8px] font-black text-white flex items-center justify-center"
                            style={{ backgroundColor: champTeam.primaryColor }}
                          >
                            {champTeam.abbreviation.slice(0, 2)}
                          </div>
                          <span className="text-xs text-[var(--text-sec)]">{champTeam.abbreviation} won</span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Season detail */}
            <div className="space-y-4">
              {!selected ? (
                <Card>
                  <div className="text-center py-12 text-[var(--text-sec)]">
                    Select a season to view details.
                  </div>
                </Card>
              ) : (
                <>
                  {/* Champion */}
                  <Card>
                    <CardHeader><CardTitle>Season {selected.season} Champion</CardTitle></CardHeader>
                    <div
                      className="rounded-xl p-4 flex items-center gap-3"
                      style={{ backgroundColor: teamColor(selected.championTeamId) + '22', borderLeft: `4px solid ${teamColor(selected.championTeamId)}` }}
                    >
                      <div
                        className="w-10 h-10 rounded-lg font-black text-white flex items-center justify-center text-sm"
                        style={{ backgroundColor: teamColor(selected.championTeamId) }}
                      >
                        {teamAbbr(selected.championTeamId)}
                      </div>
                      <div>
                        <div className="font-bold">{teamName(selected.championTeamId)}</div>
                        <div className="text-xs text-[var(--text-sec)]">Super Bowl Champions</div>
                      </div>
                    </div>
                  </Card>

                  {/* Awards */}
                  {selected.awards.length > 0 && (
                    <Card>
                      <CardHeader><CardTitle>Awards</CardTitle></CardHeader>
                      <div className="space-y-2">
                        {selected.awards.map((a, i) => (
                          <div key={i} className="flex items-center justify-between text-sm border-t border-[var(--border)] pt-2 first:border-t-0 first:pt-0">
                            <div className="text-[var(--text-sec)]">{a.award}</div>
                            <div className="font-semibold">
                              <Link href={`/player/${a.playerId}`} className="hover:text-blue-400 transition-colors">
                                {playerName(a.playerId)}
                              </Link>
                              <span className="ml-1 text-xs text-[var(--text-sec)]">({teamAbbr(a.teamId)})</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* Stat leaders */}
                  <Card>
                    <CardHeader><CardTitle>Stat Leaders</CardTitle></CardHeader>
                    <div className="space-y-2">
                      {Object.entries(selected.statLeaders).map(([cat, data]) => (
                        <div key={cat} className="flex items-center justify-between text-sm border-t border-[var(--border)] pt-2 first:border-t-0 first:pt-0">
                          <div className="text-[var(--text-sec)] capitalize">{cat.replace(/([A-Z])/g, ' $1').trim()}</div>
                          <div>
                            <Link href={`/player/${data.playerId}`} className="font-semibold hover:text-blue-400 transition-colors">
                              {playerName(data.playerId)}
                            </Link>
                            <span className="ml-2 text-xs font-mono text-[var(--text-sec)]">{data.value}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </GameShell>
  );
}
