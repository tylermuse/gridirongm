'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore } from '@/lib/engine/store';
import { teamPower } from '@/lib/engine/simulate';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { BoxScore } from '@/components/game/BoxScore';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { PlayerModal } from '@/components/game/PlayerModal';
import { TeamRosterModal } from '@/components/game/TeamRosterModal';
import type { GameResult, Team } from '@/types';

type StandingsView = 'division' | 'conference' | 'league';

function winPct(t: Team) {
  const total = t.record.wins + t.record.losses;
  return total > 0 ? t.record.wins / total : 0;
}

function StandingsTable({ teamList, userTeamId, onTeamClick }: { teamList: Team[]; userTeamId: string | null; onTeamClick: (teamId: string) => void }) {
  return (
    <div className="overflow-x-auto">
    <table className="w-full text-sm min-w-[500px]">
      <thead>
        <tr className="text-[var(--text-sec)] text-xs">
          <th className="text-left pb-1">#</th>
          <th className="text-left pb-1">Team</th>
          <th className="text-center pb-1">W</th>
          <th className="text-center pb-1">L</th>
          <th className="text-center pb-1">PCT</th>
          <th className="text-right pb-1">PF</th>
          <th className="text-right pb-1">PA</th>
          <th className="text-right pb-1">DIFF</th>
        </tr>
      </thead>
      <tbody>
        {teamList.map((t, i) => {
          const total = t.record.wins + t.record.losses;
          const pct = total > 0 ? (t.record.wins / total).toFixed(3) : '.000';
          const diff = t.record.pointsFor - t.record.pointsAgainst;
          return (
            <tr
              key={t.id}
              className={`border-t border-[var(--border)] cursor-pointer hover:bg-[var(--surface-2)] ${t.id === userTeamId ? 'text-blue-600 font-semibold' : ''}`}
              onClick={() => onTeamClick(t.id)}
            >
              <td className="py-1.5 text-[var(--text-sec)] text-xs w-6">{i + 1}</td>
              <td className="py-1.5">
                <div className="flex items-center gap-2">
                  <TeamLogo abbreviation={t.abbreviation} primaryColor={t.primaryColor} secondaryColor={t.secondaryColor} size="sm" />
                  <span className="truncate">{t.city} {t.name}</span>
                </div>
              </td>
              <td className="py-1.5 text-center">{t.record.wins}</td>
              <td className="py-1.5 text-center">{t.record.losses}</td>
              <td className="py-1.5 text-center font-mono text-xs">{pct}</td>
              <td className="py-1.5 text-right">{t.record.pointsFor}</td>
              <td className="py-1.5 text-right">{t.record.pointsAgainst}</td>
              <td className={`py-1.5 text-right font-mono ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : ''}`}>
                {diff > 0 ? '+' : ''}{diff}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </div>
  );
}

export default function StandingsPage() {
  const router = useRouter();
  const { teams, schedule, userTeamId, players, week, phase } = useGameStore();
  const [view, setView] = useState<StandingsView>('division');
  const [tab, setTab] = useState<'standings' | 'schedule'>('standings');
  const [selectedGame, setSelectedGame] = useState<GameResult | null>(null);
  const [viewTeamId, setViewTeamId] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const conferences = ['AC', 'NC'] as const;
  const divisions = ['North', 'South', 'East', 'West'] as const;

  const sortedTeams = (list: Team[]) =>
    [...list].sort((a, b) => {
      const diff = winPct(b) - winPct(a);
      if (diff !== 0) return diff;
      return (b.record.pointsFor - b.record.pointsAgainst) - (a.record.pointsFor - a.record.pointsAgainst);
    });

  // Schedule data
  const teamGames = schedule
    .filter(g => g.homeTeamId === userTeamId || g.awayTeamId === userTeamId)
    .sort((a, b) => a.week - b.week);

  function teamAbbr(id: string) {
    return teams.find(t => t.id === id)?.abbreviation ?? '???';
  }
  function teamColor(id: string) {
    return teams.find(t => t.id === id)?.primaryColor ?? '#666';
  }
  function teamFullName(id: string) {
    const t = teams.find(t => t.id === id);
    return t ? `${t.city} ${t.name}` : '???';
  }

  /** Compute a betting-style spread for an upcoming game. Negative = user favored. */
  function computeSpread(game: GameResult): { spread: number; favored: 'user' | 'opp' | 'even' } {
    const isHome = game.homeTeamId === userTeamId;
    const userRoster = players.filter(p => p.teamId === userTeamId && !p.retired);
    const oppId = isHome ? game.awayTeamId : game.homeTeamId;
    const oppRoster = players.filter(p => p.teamId === oppId && !p.retired);
    const userPow = teamPower(userRoster);
    const oppPow = teamPower(oppRoster);
    const userTotal = userPow.offense + userPow.defense;
    const oppTotal = oppPow.offense + oppPow.defense;
    // Power diff scaled to points, plus 3-point home field advantage
    const homeAdv = isHome ? 3 : -3;
    const rawSpread = ((oppTotal - userTotal) * 0.35) + homeAdv;
    const spread = Math.round(rawSpread * 2) / 2; // round to nearest 0.5
    if (spread < -0.5) return { spread, favored: 'user' };
    if (spread > 0.5) return { spread, favored: 'opp' };
    return { spread: 0, favored: 'even' };
  }

  return (
    <GameShell>
      <div className="max-w-6xl mx-auto">
        {/* Header with tab toggle */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-black">Standings & Schedule</h2>
          <div className="flex bg-[var(--surface-2)] rounded-lg p-0.5">
            <button
              onClick={() => setTab('standings')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === 'standings' ? 'bg-blue-600 text-white' : 'text-[var(--text-sec)] hover:text-[var(--text)]'
              }`}
            >
              Standings
            </button>
            <button
              onClick={() => setTab('schedule')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === 'schedule' ? 'bg-blue-600 text-white' : 'text-[var(--text-sec)] hover:text-[var(--text)]'
              }`}
            >
              Schedule
            </button>
          </div>
        </div>

        {tab === 'standings' && (
          <>
            {/* View toggle */}
            <div className="flex gap-1 mb-4 bg-[var(--surface-2)] rounded-lg p-0.5 w-fit">
              {(['division', 'conference', 'league'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                    view === v ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm' : 'text-[var(--text-sec)] hover:text-[var(--text)]'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>

            {view === 'division' && (
              <div className="grid grid-cols-2 gap-6">
                {conferences.map(conf => (
                  <div key={conf} className="space-y-4">
                    <h3 className="text-lg font-bold text-blue-600">{conf}</h3>
                    {divisions.map(div => {
                      const divTeams = sortedTeams(teams.filter(t => t.conference === conf && t.division === div));
                      return (
                        <Card key={div}>
                          <CardHeader className="mb-2">
                            <CardTitle>{conf} {div}</CardTitle>
                          </CardHeader>
                          <StandingsTable teamList={divTeams} userTeamId={userTeamId} onTeamClick={(id) => setViewTeamId(id)} />
                        </Card>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {view === 'conference' && (
              <div className="grid grid-cols-2 gap-6">
                {conferences.map(conf => {
                  const confTeams = sortedTeams(teams.filter(t => t.conference === conf));
                  return (
                    <Card key={conf}>
                      <CardHeader className="mb-2">
                        <CardTitle>{conf}</CardTitle>
                      </CardHeader>
                      <StandingsTable teamList={confTeams} userTeamId={userTeamId} onTeamClick={(id) => setViewTeamId(id)} />
                    </Card>
                  );
                })}
              </div>
            )}

            {view === 'league' && (
              <Card>
                <CardHeader className="mb-2">
                  <CardTitle>League Standings</CardTitle>
                </CardHeader>
                <StandingsTable teamList={sortedTeams(teams)} userTeamId={userTeamId} onTeamClick={(id) => setViewTeamId(id)} />
              </Card>
            )}
          </>
        )}

        {tab === 'schedule' && (
          <div className="space-y-2">
            {teamGames.length === 0 ? (
              <div className="text-center text-[var(--text-sec)] py-12">
                No games scheduled yet
              </div>
            ) : (
              teamGames.map(game => {
                const isHome = game.homeTeamId === userTeamId;
                const opponentId = isHome ? game.awayTeamId : game.homeTeamId;
                const userScore = isHome ? game.homeScore : game.awayScore;
                const oppScore = isHome ? game.awayScore : game.homeScore;
                const won = game.played && userScore > oppScore;
                const lost = game.played && userScore < oppScore;

                return (
                  <Card
                    key={game.id}
                    className={`flex items-center justify-between py-3 px-5 ${
                      game.played
                        ? won ? 'border-l-2 border-l-green-500' : 'border-l-2 border-l-red-500'
                        : ''
                    }`}
                  >
                    <div className="flex items-center gap-4 w-32">
                      <span className="text-xs text-[var(--text-sec)] w-12">Wk {game.week}</span>
                      <Badge variant={isHome ? 'blue' : 'default'} size="sm">
                        {isHome ? 'HOME' : 'AWAY'}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-3 flex-1">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black text-white"
                        style={{ backgroundColor: teamColor(opponentId) }}
                      >
                        {teamAbbr(opponentId)}
                      </div>
                      <span className="font-semibold text-sm">
                        {isHome ? 'vs' : '@'} {teamFullName(opponentId)}
                      </span>
                    </div>

                    <div className="w-40 text-right">
                      {game.played ? (
                        <div className="flex items-center justify-end gap-3">
                          <span className="font-mono font-bold">
                            {userScore} - {oppScore}
                          </span>
                          <Badge variant={won ? 'green' : 'red'} size="sm">
                            {won ? 'W' : 'L'}
                          </Badge>
                          <button
                            onClick={() => setSelectedGame(game)}
                            className="text-xs text-blue-600 hover:text-blue-400 transition-colors"
                          >
                            Box Score
                          </button>
                        </div>
                      ) : (
                        (() => {
                          const { spread, favored } = computeSpread(game);
                          const spreadText = spread === 0 ? 'EVEN' :
                            favored === 'user' ? `YOU ${spread > 0 ? '+' : ''}${spread}` :
                            `${teamAbbr(isHome ? game.awayTeamId : game.homeTeamId)} ${spread < 0 ? '+' : '-'}${Math.abs(spread)}`;
                          const isCurrentWeek = phase === 'regular' && game.week === week;
                          return (
                            <div className="flex items-center gap-2">
                              {isCurrentWeek && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(`/game/${game.id}`);
                                  }}
                                  className="px-2 py-1 text-[10px] font-bold bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                                >
                                  Watch Live
                                </button>
                              )}
                              <span className={`text-xs font-mono font-medium ${
                                favored === 'user' ? 'text-green-600' :
                                favored === 'opp' ? 'text-red-600' :
                                'text-[var(--text-sec)]'
                              }`}>
                                {spreadText}
                              </span>
                              <span className="text-[10px] text-[var(--text-sec)]">LINE</span>
                            </div>
                          );
                        })()
                      )}
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        )}
      </div>

      {selectedGame && (
        <BoxScore
          game={selectedGame}
          players={players}
          homeTeamName={teamFullName(selectedGame.homeTeamId)}
          awayTeamName={teamFullName(selectedGame.awayTeamId)}
          onClose={() => setSelectedGame(null)}
        />
      )}

      <TeamRosterModal teamId={viewTeamId} onClose={() => setViewTeamId(null)} onPlayerClick={(id) => setSelectedPlayerId(id)} />
      <PlayerModal playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />
    </GameShell>
  );
}
