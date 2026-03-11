'use client';

import { useState } from 'react';
import { useGameStore } from '@/lib/engine/store';
import { PlayerModal } from '@/components/game/PlayerModal';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { TeamLogo } from '@/components/ui/TeamLogo';
import type { SeasonSummary, AllLeagueEntry } from '@/types';

const PLAYOFF_LABELS: Record<string, string> = {
  missed: 'Missed Playoffs',
  wildcard: 'Wild Card',
  divisional: 'Divisional',
  conference: 'Conf. Championship',
  runnerup: 'Championship Runner-Up',
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

function PlayerLink({ playerId, children, onSelect }: { playerId: string; children: React.ReactNode; onSelect: (id: string) => void }) {
  return (
    <button onClick={() => onSelect(playerId)} className="text-blue-600 hover:text-blue-400 transition-colors">
      {children}
    </button>
  );
}

function AllLeagueList({
  title,
  entries,
  playerName,
  teamAbbr,
  onSelectPlayer,
}: {
  title: string;
  entries: AllLeagueEntry[];
  playerName: (id: string) => string;
  teamAbbr: (id: string) => string;
  onSelectPlayer: (id: string) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <div className="space-y-1">
        {entries.map((e, i) => (
          <div key={i} className="flex items-center gap-2 text-sm border-t border-[var(--border)] pt-1.5 first:border-t-0 first:pt-0">
            <span className="text-[var(--text-sec)] w-7 shrink-0 font-mono text-xs">{e.position}</span>
            <PlayerLink playerId={e.playerId} onSelect={onSelectPlayer}>{playerName(e.playerId)}</PlayerLink>
            <span className="text-xs text-[var(--text-sec)]">({teamAbbr(e.teamId)})</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function HistoryPage() {
  const { seasonHistory, players, teams, userTeamId, season } = useGameStore();
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const selected = seasonHistory.find(s => s.season === selectedSeason);

  function playerName(playerId: string) {
    const p = players.find(pl => pl.id === playerId);
    return p ? `${p.firstName} ${p.lastName}` : '—';
  }

  function playerPosition(playerId: string) {
    const p = players.find(pl => pl.id === playerId);
    return p?.position ?? '?';
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
      <div className="max-w-6xl mx-auto">
        <h2 className="text-2xl font-black mb-2">Season History</h2>
        <p className="text-[var(--text-sec)] text-sm mb-6">
          Currently in Season {season}. {seasonHistory.length} season{seasonHistory.length !== 1 ? 's' : ''} completed.
        </p>

        {seasonHistory.length === 0 ? (
          <Card>
            <div className="text-center py-16 text-[var(--text-sec)]">
              <p>No completed seasons yet. Finish your first season to see history here.</p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-[240px_1fr] gap-6">
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
                        {summary.userRecord.wins}-{summary.userRecord.losses}
                      </span>
                      {champTeam && (
                        <div className="flex items-center gap-1">
                          <TeamLogo abbreviation={champTeam.abbreviation} primaryColor={champTeam.primaryColor} secondaryColor={champTeam.secondaryColor} size="xs" />
                          <span className="text-xs text-[var(--text-sec)]">{champTeam.abbreviation} won</span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Season detail */}
            {!selected ? (
              <Card>
                <div className="text-center py-12 text-[var(--text-sec)]">
                  Select a season to view details.
                </div>
              </Card>
            ) : (
              <SeasonDetail
                selected={selected}
                playerName={playerName}
                playerPosition={playerPosition}
                teamAbbr={teamAbbr}
                teamColor={teamColor}
                teamName={teamName}
                onSelectPlayer={setSelectedPlayerId}
              />
            )}
          </div>
        )}
      </div>
      <PlayerModal playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />
    </GameShell>
  );
}

function SeasonDetail({
  selected,
  playerName,
  playerPosition,
  teamAbbr,
  teamColor,
  teamName,
  onSelectPlayer,
}: {
  selected: SeasonSummary;
  playerName: (id: string) => string;
  playerPosition: (id: string) => string;
  teamAbbr: (id: string) => string;
  teamColor: (id: string) => string;
  teamName: (id: string) => string;
  onSelectPlayer: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Column 1: Champs + Awards */}
      <div className="space-y-4">
        {/* League Champs */}
        <Card>
          <CardHeader><CardTitle>League Champs</CardTitle></CardHeader>
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
              <div className="text-xs text-[var(--text-sec)]">Champions</div>
            </div>
          </div>
          {selected.finalsMvpId && (() => {
            const gs = selected.finalsMvpGameStats;
            const pos = playerPosition(selected.finalsMvpId);
            let sbStatLine = '';
            if (gs) {
              if (pos === 'QB') sbStatLine = `${gs.passYards ?? 0} YDS · ${gs.passTDs ?? 0} TD · ${gs.interceptions ?? 0} INT`;
              else if (pos === 'RB') sbStatLine = `${gs.rushYards ?? 0} YDS · ${gs.rushTDs ?? 0} TD · ${gs.receptions ?? 0} REC`;
              else if (pos === 'WR' || pos === 'TE') sbStatLine = `${gs.receptions ?? 0} REC · ${gs.receivingYards ?? 0} YDS · ${gs.receivingTDs ?? 0} TD`;
              else if (pos === 'DL' || pos === 'LB') sbStatLine = `${gs.tackles ?? 0} TKL · ${gs.sacks ?? 0} SCK · ${gs.defensiveINTs ?? 0} INT`;
              else if (pos === 'CB' || pos === 'S') sbStatLine = `${gs.tackles ?? 0} TKL · ${gs.defensiveINTs ?? 0} INT`;
            }
            return (
              <div className="mt-3 text-sm">
                <span className="text-[var(--text-sec)]">Championship MVP: </span>
                <span className="font-semibold">
                  {pos}{' '}
                  <PlayerLink playerId={selected.finalsMvpId} onSelect={onSelectPlayer}>{playerName(selected.finalsMvpId)}</PlayerLink>
                  <span className="ml-1 text-xs text-[var(--text-sec)]">({teamAbbr(selected.championTeamId)})</span>
                </span>
                {sbStatLine && <div className="text-xs text-[var(--text-sec)] mt-0.5">SB: {sbStatLine}</div>}
              </div>
            );
          })()}
        </Card>

        {/* Best Record */}
        {selected.bestRecord && (
          <Card>
            <CardHeader><CardTitle>Best Record</CardTitle></CardHeader>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-sec)]">AC:</span>
                <span className="font-semibold">
                  {teamName(selected.bestRecord.ac.teamId)}{' '}
                  <span className="text-xs text-[var(--text-sec)]">
                    ({selected.bestRecord.ac.wins}-{selected.bestRecord.ac.losses})
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-sec)]">NC:</span>
                <span className="font-semibold">
                  {teamName(selected.bestRecord.nc.teamId)}{' '}
                  <span className="text-xs text-[var(--text-sec)]">
                    ({selected.bestRecord.nc.wins}-{selected.bestRecord.nc.losses})
                  </span>
                </span>
              </div>
            </div>
          </Card>
        )}

        {/* Individual Awards */}
        {selected.awards.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Awards</CardTitle></CardHeader>
            <div className="space-y-2">
              {selected.awards.map((a, i) => (
                <div key={i} className="border-t border-[var(--border)] pt-2 first:border-t-0 first:pt-0">
                  <div className="text-xs text-[var(--text-sec)] mb-0.5">{a.award}</div>
                  <div className="text-sm font-semibold">
                    <PlayerLink playerId={a.playerId} onSelect={onSelectPlayer}>{playerName(a.playerId)}</PlayerLink>
                    <span className="ml-1"><Badge size="sm">{playerPosition(a.playerId)}</Badge></span>
                  </div>
                  <div className="text-xs text-[var(--text-sec)] mt-0.5">{teamName(a.teamId)}</div>
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
                  <PlayerLink playerId={data.playerId} onSelect={onSelectPlayer}>{playerName(data.playerId)}</PlayerLink>
                  <span className="ml-2 text-xs font-mono text-[var(--text-sec)]">{data.value.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Column 2: All-League Teams + Retired */}
      <div className="space-y-4">
        <AllLeagueList
          title="All-League 1st Team"
          entries={selected.allLeagueFirst ?? []}
          playerName={playerName}
          teamAbbr={teamAbbr}
          onSelectPlayer={onSelectPlayer}
        />
        <AllLeagueList
          title="All-League 2nd Team"
          entries={selected.allLeagueSecond ?? []}
          playerName={playerName}
          teamAbbr={teamAbbr}
          onSelectPlayer={onSelectPlayer}
        />
        <AllLeagueList
          title="All-Rookie Team"
          entries={selected.allRookieTeam ?? []}
          playerName={playerName}
          teamAbbr={teamAbbr}
          onSelectPlayer={onSelectPlayer}
        />

        {/* Retired Players */}
        {(selected.retiredPlayers ?? []).length > 0 && (
          <Card>
            <CardHeader><CardTitle>Retired Players</CardTitle></CardHeader>
            <div className="space-y-1">
              {selected.retiredPlayers.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-sm border-t border-[var(--border)] pt-1.5 first:border-t-0 first:pt-0">
                  <span className="text-[var(--text-sec)] w-7 shrink-0 font-mono text-xs">{r.position}</span>
                  <PlayerLink playerId={r.playerId} onSelect={onSelectPlayer}>{r.name}</PlayerLink>
                  {r.teamId && (
                    <span className="text-xs text-[var(--text-sec)]">({teamAbbr(r.teamId)})</span>
                  )}
                  <span className="text-xs text-[var(--text-sec)] ml-auto">age: {r.age}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
