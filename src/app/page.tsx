'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useGameStore } from '@/lib/engine/store';
import { PlayerModal } from '@/components/game/PlayerModal';
import { TeamRosterModal } from '@/components/game/TeamRosterModal';
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
  const [viewTeamId, setViewTeamId] = useState<string | null>(null);
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
                    className={`border-t border-[var(--border)] ${t.id === userTeamId ? 'text-blue-400 font-semibold' : ''} cursor-pointer hover:bg-[var(--surface-2)]`}
                    onClick={() => setViewTeamId(t.id)}
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

          {/* Team Leaders */}
          <Card>
            <CardHeader><CardTitle>Team Leaders</CardTitle></CardHeader>
            <div className="space-y-3">
              {(() => {
                const gp = Math.max(1, userTeam.record.wins + userTeam.record.losses);
                const qb = roster.filter(p => p.position === 'QB').sort((a, b) => b.stats.passYards - a.stats.passYards)[0];
                const rb = roster.filter(p => p.position === 'RB').sort((a, b) => b.stats.rushYards - a.stats.rushYards)[0];
                const wr = roster.filter(p => ['WR', 'TE'].includes(p.position)).sort((a, b) => b.stats.receivingYards - a.stats.receivingYards)[0];
                const def = roster.filter(p => ['DL', 'LB', 'CB', 'S'].includes(p.position)).sort((a, b) => b.stats.tackles - a.stats.tackles)[0];
                const leaders = [
                  qb && { label: 'Passing', player: qb, stat: `${qb.stats.passYards} YDS, ${qb.stats.passTDs} TD` },
                  rb && { label: 'Rushing', player: rb, stat: `${rb.stats.rushYards} YDS, ${rb.stats.rushTDs} TD` },
                  wr && { label: 'Receiving', player: wr, stat: `${wr.stats.receivingYards} YDS, ${wr.stats.receivingTDs} TD` },
                  def && { label: 'Defense', player: def, stat: `${def.stats.tackles} TKL, ${def.stats.sacks} SCK` },
                ].filter(Boolean) as { label: string; player: typeof qb; stat: string }[];
                return leaders.map(l => (
                  <div key={l.label} className="flex items-center justify-between text-sm">
                    <div>
                      <div className="text-xs text-[var(--text-sec)]">{l.label}</div>
                      <button onClick={() => setSelectedPlayerId(l.player!.id)} className="font-semibold hover:text-blue-400 transition-colors">
                        {l.player!.firstName} {l.player!.lastName}
                      </button>
                    </div>
                    <div className="text-xs text-right text-[var(--text-sec)]">{l.stat}</div>
                  </div>
                ));
              })()}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* Team Stats */}
          <Card>
            <CardHeader><CardTitle>Team Stats</CardTitle></CardHeader>
            {(() => {
              const gp = Math.max(1, userTeam.record.wins + userTeam.record.losses);
              const ppg = userTeam.record.pointsFor / gp;
              const pag = userTeam.record.pointsAgainst / gp;
              const totalPassYds = roster.reduce((s, p) => s + p.stats.passYards, 0);
              const totalRushYds = roster.reduce((s, p) => s + p.stats.rushYards, 0);
              const passPerGame = totalPassYds / gp;
              const rushPerGame = totalRushYds / gp;
              const totalYds = totalPassYds + totalRushYds;

              // Compute league rankings
              const teamStatsList = teams.map(t => {
                const tgp = Math.max(1, t.record.wins + t.record.losses);
                const tRoster = players.filter(p => p.teamId === t.id);
                const tPass = tRoster.reduce((s, p) => s + p.stats.passYards, 0);
                const tRush = tRoster.reduce((s, p) => s + p.stats.rushYards, 0);
                return {
                  id: t.id,
                  ppg: t.record.pointsFor / tgp,
                  pag: t.record.pointsAgainst / tgp,
                  passPerGame: tPass / tgp,
                  rushPerGame: tRush / tgp,
                  totalYds: tPass + tRush,
                };
              });
              const rank = (arr: { id: string; val: number }[], desc = true) => {
                const sorted = [...arr].sort((a, b) => desc ? b.val - a.val : a.val - b.val);
                return sorted.findIndex(x => x.id === userTeamId) + 1;
              };
              const ppgRank = rank(teamStatsList.map(t => ({ id: t.id, val: t.ppg })));
              const pagRank = rank(teamStatsList.map(t => ({ id: t.id, val: t.pag })), false); // lower is better
              const passRank = rank(teamStatsList.map(t => ({ id: t.id, val: t.passPerGame })));
              const rushRank = rank(teamStatsList.map(t => ({ id: t.id, val: t.rushPerGame })));
              const ydsRank = rank(teamStatsList.map(t => ({ id: t.id, val: t.totalYds })));

              const ordinal = (n: number) => {
                const s = ['th', 'st', 'nd', 'rd'];
                const v = n % 100;
                return n + (s[(v - 20) % 10] || s[v] || s[0]);
              };

              return (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-[var(--text-sec)]">PPG</span><span className="font-bold">{ppg.toFixed(1)} <span className="text-xs text-[var(--text-sec)] font-normal">({ordinal(ppgRank)})</span></span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-sec)]">Opp PPG</span><span className="font-bold">{pag.toFixed(1)} <span className="text-xs text-[var(--text-sec)] font-normal">({ordinal(pagRank)})</span></span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-sec)]">Pass YDS/G</span><span className="font-bold">{passPerGame.toFixed(0)} <span className="text-xs text-[var(--text-sec)] font-normal">({ordinal(passRank)})</span></span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-sec)]">Rush YDS/G</span><span className="font-bold">{rushPerGame.toFixed(0)} <span className="text-xs text-[var(--text-sec)] font-normal">({ordinal(rushRank)})</span></span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-sec)]">Total YDS</span><span className="font-bold">{totalYds.toLocaleString()} <span className="text-xs text-[var(--text-sec)] font-normal">({ordinal(ydsRank)})</span></span></div>
                </div>
              );
            })()}
          </Card>

          {/* Finances */}
          <Card>
            <CardHeader><CardTitle>Finances</CardTitle></CardHeader>
            {(() => {
              const capSpace = Math.round((userTeam.salaryCap - userTeam.totalPayroll) * 10) / 10;
              const deadCapTotal = (userTeam.deadCap ?? []).reduce((sum: number, dc: { amount: number }) => sum + dc.amount, 0);
              return (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-[var(--text-sec)]">Salary Cap</span><span className="font-bold">${userTeam.salaryCap}M</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-sec)]">Payroll</span><span className="font-bold">${Math.round(userTeam.totalPayroll)}M</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-sec)]">Cap Space</span><span className={`font-bold ${capSpace < 10 ? 'text-red-400' : 'text-green-400'}`}>${capSpace}M</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-sec)]">Dead Cap</span><span className="font-bold text-amber-400">${Math.round(deadCapTotal * 10) / 10}M</span></div>
                  <div className="flex justify-between"><span className="text-[var(--text-sec)]">Roster</span><span className="font-bold">{roster.length} / 53</span></div>
                </div>
              );
            })()}
          </Card>

          {/* League Leaders */}
          <Card>
            <CardHeader><CardTitle>League Leaders</CardTitle></CardHeader>
            <div className="space-y-3">
              {(() => {
                const allActive = players.filter(p => p.teamId && !p.retired);
                const passLeader = allActive.filter(p => p.position === 'QB').sort((a, b) => b.stats.passYards - a.stats.passYards)[0];
                const rushLeader = allActive.sort((a, b) => b.stats.rushYards - a.stats.rushYards)[0];
                const recLeader = allActive.sort((a, b) => b.stats.receivingYards - a.stats.receivingYards)[0];
                const sackLeader = allActive.sort((a, b) => b.stats.sacks - a.stats.sacks)[0];
                const leaders = [
                  passLeader && { label: 'Pass YDS', player: passLeader, stat: `${passLeader.stats.passYards}` },
                  rushLeader && { label: 'Rush YDS', player: rushLeader, stat: `${rushLeader.stats.rushYards}` },
                  recLeader && { label: 'Rec YDS', player: recLeader, stat: `${recLeader.stats.receivingYards}` },
                  sackLeader && { label: 'Sacks', player: sackLeader, stat: `${sackLeader.stats.sacks}` },
                ].filter(Boolean) as { label: string; player: typeof passLeader; stat: string }[];
                return leaders.map(l => {
                  const t = teams.find(t => t.id === l.player!.teamId);
                  return (
                    <div key={l.label} className="flex items-center justify-between text-sm">
                      <div>
                        <div className="text-xs text-[var(--text-sec)]">{l.label}</div>
                        <button onClick={() => setSelectedPlayerId(l.player!.id)} className="font-semibold hover:text-blue-400 transition-colors">
                          {l.player!.firstName[0]}. {l.player!.lastName}
                        </button>
                        <span className="text-xs text-[var(--text-sec)] ml-1">{t?.abbreviation}</span>
                      </div>
                      <div className="text-xs font-bold">{l.stat}</div>
                    </div>
                  );
                });
              })()}
            </div>
          </Card>
        </div>
      </div>

      {/* Team Roster Modal */}
      <TeamRosterModal teamId={viewTeamId} onClose={() => setViewTeamId(null)} onPlayerClick={(id) => setSelectedPlayerId(id)} />

      <PlayerModal playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />
    </GameShell>
  );
}

export default function Home() {
  const initialized = useGameStore(s => s.initialized);
  return initialized ? <Dashboard /> : <TeamPicker />;
}
