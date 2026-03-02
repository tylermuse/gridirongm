'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useGameStore } from '@/lib/engine/store';
import { PlayerModal } from '@/components/game/PlayerModal';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { NFL_TEAMS } from '@/lib/data/teams';

function TeamPicker() {
  const { newLeague } = useGameStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePick(abbr: string) {
    setLoading(true);
    setError(null);
    try {
      await newLeague(abbr);
    } catch {
      setError('Failed to start league. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="text-center mb-12">
        <h1 className="text-5xl font-black tracking-tight mb-3">
          <span className="text-blue-400">GRIDIRON</span> GM
        </h1>
        <p className="text-[var(--text-sec)] text-lg">Build your dynasty. Choose your franchise.</p>
      </div>

      {error && (
        <div className="mb-6 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-3 text-[var(--text-sec)]">
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          Loading league data...
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3 max-w-4xl">
          {NFL_TEAMS.map(team => (
            <button
              key={team.abbreviation}
              onClick={() => handlePick(team.abbreviation)}
              className="group flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]
                         hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/10 transition-all text-left"
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-black text-white shrink-0"
                style={{ backgroundColor: team.primaryColor }}
              >
                {team.abbreviation}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold truncate">{team.city}</div>
                <div className="text-xs text-[var(--text-sec)] truncate">{team.name}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Dashboard() {
  const { teams, userTeamId, players, schedule, week, season, phase, playoffBracket, champions } = useGameStore();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const userTeam = teams.find(t => t.id === userTeamId)!;
  const roster = players.filter(p => p.teamId === userTeamId);

  const nextGame = schedule.find(
    g => !g.played && (g.homeTeamId === userTeamId || g.awayTeamId === userTeamId),
  );
  const lastGame = [...schedule]
    .filter(g => g.played && (g.homeTeamId === userTeamId || g.awayTeamId === userTeamId))
    .pop();

  const conferenceTeams = teams
    .filter(t => t.conference === userTeam.conference)
    .sort((a, b) => {
      const aWp = a.record.wins / Math.max(1, a.record.wins + a.record.losses);
      const bWp = b.record.wins / Math.max(1, b.record.wins + b.record.losses);
      return bWp - aWp;
    })
    .slice(0, 8);

  const topPlayers = roster
    .filter(p => p.position === 'QB' || p.position === 'RB' || p.position === 'WR')
    .sort((a, b) => b.ratings.overall - a.ratings.overall)
    .slice(0, 5);

  function teamName(id: string) {
    const t = teams.find(t => t.id === id);
    return t ? `${t.city} ${t.name}` : 'Unknown';
  }

  function teamAbbr(id: string) {
    return teams.find(t => t.id === id)?.abbreviation ?? '???';
  }

  const capPct = userTeam.totalPayroll / userTeam.salaryCap;

  return (
    <GameShell>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Team header */}
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black text-white"
            style={{ backgroundColor: userTeam.primaryColor }}
          >
            {userTeam.abbreviation}
          </div>
          <div>
            <h2 className="text-2xl font-black">{userTeam.city} {userTeam.name}</h2>
            <div className="flex items-center gap-3 mt-1">
              <Badge variant={userTeam.record.wins > userTeam.record.losses ? 'green' : userTeam.record.wins < userTeam.record.losses ? 'red' : 'default'} size="md">
                {userTeam.record.wins}-{userTeam.record.losses}
              </Badge>
              <span className="text-sm text-[var(--text-sec)]">
                {userTeam.conference} {userTeam.division}
              </span>
              <span className={`text-sm ${capPct > 0.95 ? 'text-red-400' : 'text-[var(--text-sec)]'}`}>
                Cap: ${Math.round(userTeam.totalPayroll)}M / ${userTeam.salaryCap}M
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* Last game */}
          <Card>
            <CardHeader><CardTitle>Last Game</CardTitle></CardHeader>
            {lastGame ? (
              <div className="text-center">
                <div className="text-xs text-[var(--text-sec)] mb-2">Week {lastGame.week}</div>
                <div className="flex items-center justify-center gap-4">
                  <div className="text-right">
                    <div className="text-xs text-[var(--text-sec)]">{teamAbbr(lastGame.homeTeamId)}</div>
                    <div className="text-2xl font-black">{lastGame.homeScore}</div>
                  </div>
                  <div className="text-[var(--text-sec)] text-sm">vs</div>
                  <div className="text-left">
                    <div className="text-xs text-[var(--text-sec)]">{teamAbbr(lastGame.awayTeamId)}</div>
                    <div className="text-2xl font-black">{lastGame.awayScore}</div>
                  </div>
                </div>
                {(() => {
                  const isHome = lastGame.homeTeamId === userTeamId;
                  const won = isHome ? lastGame.homeScore > lastGame.awayScore : lastGame.awayScore > lastGame.homeScore;
                  return (
                    <Badge variant={won ? 'green' : 'red'} size="sm">
                      {won ? 'WIN' : 'LOSS'}
                    </Badge>
                  );
                })()}
              </div>
            ) : (
              <div className="text-sm text-[var(--text-sec)] text-center">No games played yet</div>
            )}
          </Card>

          {/* Next game */}
          <Card>
            <CardHeader><CardTitle>Next Game</CardTitle></CardHeader>
            {nextGame ? (
              <div className="text-center">
                <div className="text-xs text-[var(--text-sec)] mb-2">Week {nextGame.week}</div>
                <div className="text-sm font-semibold">
                  {nextGame.homeTeamId === userTeamId ? 'vs' : '@'}{' '}
                  {teamName(nextGame.homeTeamId === userTeamId ? nextGame.awayTeamId : nextGame.homeTeamId)}
                </div>
                <Badge variant="blue" size="sm">
                  {nextGame.homeTeamId === userTeamId ? 'HOME' : 'AWAY'}
                </Badge>
              </div>
            ) : phase === 'playoffs' ? (
              <div className="text-center">
                {(() => {
                  const sbWinner = playoffBracket?.find(m => m.id === 'super-bowl')?.winnerId;
                  const champion = sbWinner ? teams.find(t => t.id === sbWinner) : null;
                  if (champion) {
                    return (
                      <>
                        <div className="text-xs text-[var(--text-sec)] mb-1">Season Champion</div>
                        <div
                          className="w-8 h-8 rounded-lg mx-auto mb-1 flex items-center justify-center text-xs font-black text-white"
                          style={{ backgroundColor: champion.primaryColor }}
                        >
                          {champion.abbreviation}
                        </div>
                        <div className="text-sm font-bold">{champion.city}</div>
                        <Link href="/playoffs">
                          <Badge variant="green" size="sm">View Bracket</Badge>
                        </Link>
                      </>
                    );
                  }
                  const nextPlayoffGame = playoffBracket
                    ?.filter(m => !m.winnerId && m.homeTeamId && m.awayTeamId)
                    .sort((a, b) => a.round - b.round)[0];
                  return (
                    <>
                      <div className="text-xs text-[var(--text-sec)] mb-2">Playoffs In Progress</div>
                      {nextPlayoffGame && (
                        <div className="text-xs mb-2">
                          {teams.find(t => t.id === nextPlayoffGame.homeTeamId)?.abbreviation} vs{' '}
                          {teams.find(t => t.id === nextPlayoffGame.awayTeamId)?.abbreviation}
                        </div>
                      )}
                      <Link href="/playoffs">
                        <Badge variant="blue" size="sm">View Playoffs →</Badge>
                      </Link>
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="text-sm text-[var(--text-sec)] text-center">Season complete</div>
            )}
          </Card>

          {/* Roster snapshot */}
          <Card>
            <CardHeader><CardTitle>Roster</CardTitle></CardHeader>
            <div className="text-3xl font-black text-center">{roster.length}</div>
            <div className="text-xs text-[var(--text-sec)] text-center">players</div>
            {champions.length > 0 && (
              <div className="mt-3 text-center">
                <div className="text-xs text-[var(--text-sec)]">Champions won</div>
                <div className="text-lg font-black text-amber-400">{champions.filter(c => c.teamId === userTeamId).length}</div>
              </div>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Conference standings */}
          <Card>
            <CardHeader><CardTitle>{userTeam.conference} Standings</CardTitle></CardHeader>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--text-sec)] text-xs">
                  <th className="text-left pb-2">Team</th>
                  <th className="text-center pb-2">W</th>
                  <th className="text-center pb-2">L</th>
                  <th className="text-right pb-2">PF</th>
                  <th className="text-right pb-2">PA</th>
                </tr>
              </thead>
              <tbody>
                {conferenceTeams.map((t, i) => (
                  <tr
                    key={t.id}
                    className={`border-t border-[var(--border)] ${t.id === userTeamId ? 'text-blue-400 font-semibold' : ''}`}
                  >
                    <td className="py-1.5 text-left">{i + 1}. {t.abbreviation}</td>
                    <td className="py-1.5 text-center">{t.record.wins}</td>
                    <td className="py-1.5 text-center">{t.record.losses}</td>
                    <td className="py-1.5 text-right">{t.record.pointsFor}</td>
                    <td className="py-1.5 text-right">{t.record.pointsAgainst}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Key players */}
          <Card>
            <CardHeader><CardTitle>Key Players</CardTitle></CardHeader>
            <div className="space-y-2">
              {topPlayers.map(p => (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <div>
                    <button onClick={() => setSelectedPlayerId(p.id)} className="font-semibold hover:text-blue-400 transition-colors">
                      {p.firstName} {p.lastName}
                    </button>
                    <Badge variant="default" size="sm">{p.position}</Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-[var(--text-sec)]">OVR</span>
                    <span className={`font-bold ${p.ratings.overall >= 80 ? 'text-green-400' : p.ratings.overall >= 65 ? 'text-amber-400' : 'text-[var(--text-sec)]'}`}>
                      {p.ratings.overall}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
      <PlayerModal playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />
    </GameShell>
  );
}

export default function Home() {
  const initialized = useGameStore(s => s.initialized);
  return initialized ? <Dashboard /> : <TeamPicker />;
}
