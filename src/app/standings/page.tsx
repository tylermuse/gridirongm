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
import { TeamQuickNav } from '@/components/game/TeamQuickNav';

type StandingsView = 'division' | 'conference' | 'league';

function winPct(t: Team) {
  const total = t.record.wins + t.record.losses;
  return total > 0 ? t.record.wins / total : 0;
}

function clinchIndicator(team: Team, allTeams: Team[], schedule: GameResult[], maxWeek: number, currentWeek: number): string {
  const conf = team.conference;
  const div = team.division;

  // Remaining games for a team
  const remaining = (t: Team) => schedule.filter(g => !g.played && (g.homeTeamId === t.id || g.awayTeamId === t.id)).length;

  const teamMaxWins = team.record.wins + remaining(team);

  // Division teams
  const divTeams = allTeams.filter(t => t.conference === conf && t.division === div);
  const confTeams = allTeams.filter(t => t.conference === conf);

  // y = clinched division: team's wins > all other div teams' max possible wins
  const clinchedDiv = divTeams.every(t => t.id === team.id || team.record.wins > t.record.wins + remaining(t));

  // z = clinched #1 seed: clinched division AND wins > all other conf teams' max possible wins
  const confTeamsThatCouldPass = confTeams.filter(t => t.id !== team.id && (t.record.wins + remaining(t)) >= team.record.wins).length;
  if (clinchedDiv && confTeamsThatCouldPass === 0) return 'z';

  if (clinchedDiv) return 'y';

  // x = clinched playoff: team's wins exceed max possible wins of enough conf teams
  // 7 playoff spots per conference; if at most 6 conf teams could surpass this team, clinched
  if (confTeamsThatCouldPass < 7) return 'x';

  // e = eliminated: team's max wins < current 7th-best conf record
  const confSorted = [...confTeams].sort((a, b) => b.record.wins - a.record.wins);
  const seventhBestWins = confSorted[6]?.record.wins ?? 0;
  if (teamMaxWins < seventhBestWins) return 'e';

  return '';
}

function StandingsTable({ teamList, userTeamId, onTeamClick, expanded, allTeams, schedule, maxWeek, currentWeek }: { teamList: Team[]; userTeamId: string | null; onTeamClick: (teamId: string) => void; expanded?: boolean; allTeams?: Team[]; schedule?: GameResult[]; maxWeek?: number; currentWeek?: number }) {
  const leaderWins = teamList[0]?.record.wins ?? 0;
  return (
    <div className="overflow-x-auto">
    <table className="w-full text-sm min-w-[500px] sticky-col">
      <thead>
        <tr className="text-[var(--text-sec)] text-xs">
          <th className="text-left pb-1">#</th>
          <th className="text-left pb-1">Team</th>
          <th className="text-center pb-1">W</th>
          <th className="text-center pb-1">L</th>
          <th className="text-center pb-1">PCT</th>
          <th className="text-center pb-1">GB</th>
          <th className="text-right pb-1 hidden sm:table-cell">PF</th>
          <th className="text-right pb-1 hidden sm:table-cell">PA</th>
          <th className="text-right pb-1">DIFF</th>
          <th className="text-center pb-1">STRK</th>
          {expanded && (
            <>
              <th className="text-center pb-1 hidden lg:table-cell">HOME</th>
              <th className="text-center pb-1 hidden lg:table-cell">AWAY</th>
              <th className="text-center pb-1 hidden lg:table-cell">DIV</th>
              <th className="text-center pb-1 hidden lg:table-cell">CONF</th>
              <th className="text-center pb-1 hidden lg:table-cell">ATS</th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {teamList.map((t, i) => {
          const total = t.record.wins + t.record.losses;
          const pct = total > 0 ? (t.record.wins / total).toFixed(3) : '.000';
          const diff = t.record.pointsFor - t.record.pointsAgainst;
          const gb = leaderWins - t.record.wins;
          const streak = t.record.streak;
          const streakStr = streak === 0 ? '-' : streak > 0 ? `W${streak}` : `L${Math.abs(streak)}`;
          const clinch = allTeams && schedule ? clinchIndicator(t, allTeams, schedule, maxWeek ?? 18, currentWeek ?? 1) : '';
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
                  <span className="truncate">
                    {t.city} {t.name}
                    {clinch && (
                      <span className={`ml-1 text-[10px] font-bold ${clinch === 'e' ? 'text-red-500' : 'text-green-600'}`}>
                        {clinch}
                      </span>
                    )}
                  </span>
                </div>
              </td>
              <td className="py-1.5 text-center">{t.record.wins}</td>
              <td className="py-1.5 text-center">{t.record.losses}</td>
              <td className="py-1.5 text-center font-mono text-xs">{pct}</td>
              <td className="py-1.5 text-center text-xs text-[var(--text-sec)]">{gb === 0 ? '-' : gb}</td>
              <td className="py-1.5 text-right hidden sm:table-cell">{t.record.pointsFor}</td>
              <td className="py-1.5 text-right hidden sm:table-cell">{t.record.pointsAgainst}</td>
              <td className={`py-1.5 text-right font-mono ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : ''}`}>
                {diff > 0 ? '+' : ''}{diff}
              </td>
              <td className={`py-1.5 text-center text-xs font-medium ${streak > 0 ? 'text-green-600' : streak < 0 ? 'text-red-600' : ''}`}>
                {streakStr}
              </td>
              {expanded && (
                <>
                  <td className="py-1.5 text-center text-xs hidden lg:table-cell">{t.record.homeWins ?? 0}-{t.record.homeLosses ?? 0}</td>
                  <td className="py-1.5 text-center text-xs hidden lg:table-cell">{t.record.awayWins ?? 0}-{t.record.awayLosses ?? 0}</td>
                  <td className="py-1.5 text-center text-xs hidden lg:table-cell">{t.record.divisionWins}-{t.record.divisionLosses}</td>
                  <td className="py-1.5 text-center text-xs hidden lg:table-cell">{t.record.conferenceWins ?? 0}-{t.record.conferenceLosses ?? 0}</td>
                  <td className="py-1.5 text-center text-xs hidden lg:table-cell font-mono">{t.record.atsWins ?? 0}-{t.record.atsLosses ?? 0}{(t.record.atsPushes ?? 0) > 0 ? `-${t.record.atsPushes}` : ''}</td>
                </>
              )}
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

  const maxWeek = schedule.length > 0 ? Math.max(...schedule.map(g => g.week)) : 18;
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
          <div>
            <TeamQuickNav currentPage="standings" />
            <h2 className="text-2xl font-black">Standings & Schedule</h2>
          </div>
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                          <StandingsTable teamList={divTeams} userTeamId={userTeamId} onTeamClick={(id) => setViewTeamId(id)} allTeams={teams} schedule={schedule} maxWeek={maxWeek} currentWeek={week} />
                        </Card>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {view === 'conference' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {conferences.map(conf => {
                  const confTeams = sortedTeams(teams.filter(t => t.conference === conf));
                  return (
                    <Card key={conf}>
                      <CardHeader className="mb-2">
                        <CardTitle>{conf}</CardTitle>
                      </CardHeader>
                      <StandingsTable teamList={confTeams} userTeamId={userTeamId} onTeamClick={(id) => setViewTeamId(id)} allTeams={teams} schedule={schedule} maxWeek={maxWeek} currentWeek={week} expanded />
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
                <StandingsTable teamList={sortedTeams(teams)} userTeamId={userTeamId} onTeamClick={(id) => setViewTeamId(id)} allTeams={teams} schedule={schedule} maxWeek={maxWeek} currentWeek={week} expanded />
              </Card>
            )}

            {/* Clinch legend */}
            {phase === 'regular' && week > 1 && (
              <div className="flex gap-4 mt-3 text-[10px] text-[var(--text-sec)]">
                <span><span className="font-bold text-green-600">z</span> = #1 seed</span>
                <span><span className="font-bold text-green-600">y</span> = clinched division</span>
                <span><span className="font-bold text-green-600">x</span> = clinched playoff</span>
                <span><span className="font-bold text-red-500">e</span> = eliminated</span>
              </div>
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

                    <div className="w-56 text-right">
                      {game.played ? (
                        <div className="flex items-center justify-end gap-3">
                          <span className="font-mono font-bold">
                            {userScore} - {oppScore}
                          </span>
                          <Badge variant={won ? 'green' : 'red'} size="sm">
                            {won ? 'W' : 'L'}
                          </Badge>
                          {game.bettingLine && (
                            <span className={`text-[10px] font-mono ${
                              (isHome && game.spreadCover === 'home') || (!isHome && game.spreadCover === 'away')
                                ? 'text-green-600' : game.spreadCover === 'push' ? 'text-[var(--text-sec)]' : 'text-red-500'
                            }`}>
                              ATS {(isHome && game.spreadCover === 'home') || (!isHome && game.spreadCover === 'away') ? 'W' : game.spreadCover === 'push' ? 'P' : 'L'}
                            </span>
                          )}
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
                          const spreadText = spread === 0 ? 'PK' :
                            favored === 'user' ? `YOU ${spread > 0 ? '+' : ''}${spread}` :
                            `${teamAbbr(isHome ? game.awayTeamId : game.homeTeamId)} ${spread < 0 ? '+' : '-'}${Math.abs(spread)}`;
                          const isCurrentWeek = phase === 'regular' && game.week === week;
                          // O/U from computeSpread — estimate from team power
                          const userRoster = players.filter(p => p.teamId === userTeamId && !p.retired);
                          const oppId = isHome ? game.awayTeamId : game.homeTeamId;
                          const oppRoster = players.filter(p => p.teamId === oppId && !p.retired);
                          const uPow = teamPower(userRoster);
                          const oPow = teamPower(oppRoster);
                          const combinedOff = (uPow.offense + oPow.offense) / 2;
                          const ou = Math.round((38 + (combinedOff - 50) * 0.4) * 2) / 2;
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
                              <span className="text-[10px] text-[var(--text-sec)] font-mono">O/U {ou}</span>
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
          homeTeamId={selectedGame.homeTeamId}
          awayTeamId={selectedGame.awayTeamId}
          homeColor={teams.find(t => t.id === selectedGame.homeTeamId)?.primaryColor}
          awayColor={teams.find(t => t.id === selectedGame.awayTeamId)?.primaryColor}
          onClose={() => setSelectedGame(null)}
        />
      )}

      <TeamRosterModal teamId={viewTeamId} onClose={() => setViewTeamId(null)} onPlayerClick={(id) => setSelectedPlayerId(id)} />
      <PlayerModal playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />
    </GameShell>
  );
}
