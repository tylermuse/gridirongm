'use client';

import { useState } from 'react';
import { useGameStore } from '@/lib/engine/store';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { BoxScore } from '@/components/game/BoxScore';
import type { GameResult, Team } from '@/types';

type StandingsView = 'division' | 'conference' | 'league';

function winPct(t: Team) {
  const total = t.record.wins + t.record.losses;
  return total > 0 ? t.record.wins / total : 0;
}

function StandingsTable({ teamList, userTeamId }: { teamList: Team[]; userTeamId: string | null }) {
  return (
    <table className="w-full text-sm">
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
              className={`border-t border-[var(--border)] ${t.id === userTeamId ? 'text-blue-400 font-semibold' : ''}`}
            >
              <td className="py-1.5 text-[var(--text-sec)] text-xs w-6">{i + 1}</td>
              <td className="py-1.5">
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded flex items-center justify-center text-[9px] font-black text-white shrink-0"
                    style={{ backgroundColor: t.primaryColor }}
                  >
                    {t.abbreviation}
                  </div>
                  <span className="truncate">{t.city} {t.name}</span>
                </div>
              </td>
              <td className="py-1.5 text-center">{t.record.wins}</td>
              <td className="py-1.5 text-center">{t.record.losses}</td>
              <td className="py-1.5 text-center font-mono text-xs">{pct}</td>
              <td className="py-1.5 text-right">{t.record.pointsFor}</td>
              <td className="py-1.5 text-right">{t.record.pointsAgainst}</td>
              <td className={`py-1.5 text-right font-mono ${diff > 0 ? 'text-green-400' : diff < 0 ? 'text-red-400' : ''}`}>
                {diff > 0 ? '+' : ''}{diff}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function StandingsPage() {
  const { teams, schedule, userTeamId, players } = useGameStore();
  const [view, setView] = useState<StandingsView>('division');
  const [tab, setTab] = useState<'standings' | 'schedule'>('standings');
  const [selectedGame, setSelectedGame] = useState<GameResult | null>(null);

  const conferences = ['AFC', 'NFC'] as const;
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
                    <h3 className="text-lg font-bold text-blue-400">{conf}</h3>
                    {divisions.map(div => {
                      const divTeams = sortedTeams(teams.filter(t => t.conference === conf && t.division === div));
                      return (
                        <Card key={div}>
                          <CardHeader className="mb-2">
                            <CardTitle>{conf} {div}</CardTitle>
                          </CardHeader>
                          <StandingsTable teamList={divTeams} userTeamId={userTeamId} />
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
                      <StandingsTable teamList={confTeams} userTeamId={userTeamId} />
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
                <StandingsTable teamList={sortedTeams(teams)} userTeamId={userTeamId} />
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
                            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            Box Score
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--text-sec)]">Upcoming</span>
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
    </GameShell>
  );
}
