'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useGameStore } from '@/lib/engine/store';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { potentialLabel, potentialColor } from '@/lib/engine/development';
import { generateCoachEvaluation, generateRosterEvaluation, type CoachEvaluation, type RosterEvaluation } from '@/lib/engine/personnelReport';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { TeamLogo } from '@/components/ui/TeamLogo';
import type { Position, PlayerRatings } from '@/types';
import { getCapHit, getUnamortizedBonus } from '@/types';

function ratingColor(val: number) {
  if (val >= 85) return 'text-green-600';
  if (val >= 70) return 'text-blue-600';
  if (val >= 55) return 'text-amber-600';
  return 'text-red-600';
}

function ratingBarColor(val: number) {
  if (val >= 85) return 'bg-green-500';
  if (val >= 70) return 'bg-blue-500';
  if (val >= 55) return 'bg-amber-500';
  return 'bg-red-500';
}

// Ratings relevant per position
const POSITION_RELEVANT_RATINGS: Record<Position, (keyof Omit<PlayerRatings, 'overall'>)[]> = {
  QB:  ['throwing', 'awareness', 'speed', 'agility', 'strength', 'stamina'],
  RB:  ['carrying', 'speed', 'agility', 'strength', 'awareness', 'stamina'],
  WR:  ['catching', 'speed', 'agility', 'awareness', 'stamina'],
  TE:  ['catching', 'blocking', 'strength', 'speed', 'awareness', 'stamina'],
  OL:  ['blocking', 'strength', 'awareness', 'stamina', 'agility'],
  DL:  ['passRush', 'strength', 'tackling', 'speed', 'agility', 'stamina'],
  LB:  ['tackling', 'coverage', 'speed', 'strength', 'awareness', 'stamina'],
  CB:  ['coverage', 'speed', 'agility', 'awareness', 'stamina'],
  S:   ['coverage', 'tackling', 'speed', 'awareness', 'agility', 'stamina'],
  K:   ['kicking', 'awareness'],
  P:   ['kicking', 'awareness'],
};

const RATING_LABELS: Record<keyof Omit<PlayerRatings, 'overall'>, string> = {
  speed: 'Speed', strength: 'Strength', agility: 'Agility', awareness: 'Awareness',
  stamina: 'Stamina', throwing: 'Throwing', catching: 'Catching', carrying: 'Carrying',
  blocking: 'Blocking', tackling: 'Tackling', coverage: 'Coverage', passRush: 'Pass Rush',
  kicking: 'Kicking',
};

export default function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { players, teams, userTeamId, releasePlayer } = useGameStore();
  const [confirmRelease, setConfirmRelease] = useState(false);

  const player = players.find(p => p.id === id);

  if (!player) {
    return (
      <GameShell>
        <div className="max-w-4xl mx-auto text-center py-20">
          <h2 className="text-2xl font-black mb-4">Player Not Found</h2>
          <p className="text-[var(--text-sec)]">This player doesn't exist or has been removed.</p>
        </div>
      </GameShell>
    );
  }

  const team = player.teamId ? teams.find(t => t.id === player.teamId) : null;
  const isOnUserTeam = player.teamId === userTeamId;
  const relevantRatings = POSITION_RELEVANT_RATINGS[player.position] ?? [];

  // Generate personnel evaluations for rostered players
  const userTeam = teams.find(t => t.id === userTeamId);
  const teammates = isOnUserTeam ? players.filter(p => p.teamId === userTeamId && !p.retired) : [];
  const coachEval = isOnUserTeam ? generateCoachEvaluation(player) : null;
  const rosterEval = isOnUserTeam && userTeam ? generateRosterEvaluation(player, teammates, userTeam.salaryCap) : null;

  const stats = player.stats;
  const career = player.careerStats;

  function handleRelease() {
    if (!player) return;
    if (confirmRelease) {
      releasePlayer(player.id);
    } else {
      setConfirmRelease(true);
    }
  }

  return (
    <GameShell>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Breadcrumb */}
        <div className="text-xs text-[var(--text-sec)]">
          <Link href="/roster" className="hover:text-[var(--text)]">Roster</Link>
          {' / '}
          <span>{player.firstName} {player.lastName}</span>
        </div>

        {/* Header */}
        <Card>
          <div className="flex items-start gap-6">
            {/* Avatar / Jersey */}
            <div className="flex flex-col items-center gap-2 shrink-0">
              <PlayerAvatar player={player} size="lg" teamColor={team?.primaryColor ?? '#374151'} />
              {team && <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} logoUrl={team.logoUrl} size="lg" />}
              <div className="text-xs font-black text-[var(--text-sec)]">{player.position}</div>
            </div>

            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-3xl font-black">{player.firstName} {player.lastName}</h1>
                  <div className="flex items-center gap-3 mt-2">
                    <Badge>{player.position}</Badge>
                    <span className="text-sm text-[var(--text-sec)]">Age {player.age}</span>
                    <span className="text-sm text-[var(--text-sec)]">
                      {player.experience === 0 ? 'Rookie' : `${player.experience}${player.experience === 1 ? 'st' : player.experience === 2 ? 'nd' : player.experience === 3 ? 'rd' : 'th'} Year`}
                    </span>
                    {team ? (
                      <Link href={`/standings`} className="text-sm hover:text-blue-600 transition-colors">
                        {team.city} {team.name}
                      </Link>
                    ) : (
                      <span className="text-sm text-[var(--text-sec)]">Free Agent</span>
                    )}
                    {player.retired && <Badge variant="red">Retired</Badge>}
                  </div>
                </div>

                {/* Overall rating */}
                <div className="text-right">
                  <div className={`text-5xl font-black ${ratingColor(player.ratings.overall)}`}>
                    {player.ratings.overall}
                  </div>
                  <div className="text-xs text-[var(--text-sec)]">Overall</div>
                </div>
              </div>

              {/* Contract */}
              <div className="flex items-center gap-4 mt-3">
                {player.contract.yearsLeft > 0 ? (
                  <>
                    <span className="text-sm font-semibold">${player.contract.salary}M/yr</span>
                    <span className="text-sm text-[var(--text-sec)]">{player.contract.yearsLeft} year{player.contract.yearsLeft !== 1 ? 's' : ''} remaining</span>
                  </>
                ) : (
                  <span className="text-sm text-[var(--text-sec)]">Expiring contract</span>
                )}
                <span className={`text-sm ${potentialColor(player.potential, player.experience)}`}>
                  Potential: {potentialLabel(player.potential, player.experience)}
                </span>
              </div>

              {/* Contract Year-by-Year Breakdown (restructured contracts) */}
              {player.contract.contractYears && player.contract.contractYears.some(y => y.proratedBonus > 0) && (
                <div className="mt-3 border border-[var(--border)] rounded-lg overflow-hidden">
                  <div className="bg-[var(--surface-2)] px-3 py-1.5 text-xs font-bold text-[var(--text-sec)] uppercase flex justify-between items-center">
                    <span>Contract Breakdown</span>
                    <span className="text-amber-600 normal-case font-medium">Restructured</span>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-[var(--text-sec)]">
                        <th className="text-left px-3 py-1">Year</th>
                        <th className="text-right px-3 py-1">Base</th>
                        <th className="text-right px-3 py-1">Bonus</th>
                        <th className="text-right px-3 py-1">Cap Hit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {player.contract.contractYears.map((yr, i) => (
                        <tr key={i} className={`border-b border-[var(--border)] last:border-0 ${yr.isVoidYear ? 'text-gray-400 bg-gray-50' : i === 0 ? 'bg-green-50' : ''}`}>
                          <td className="px-3 py-1 font-medium">{yr.isVoidYear ? `Void ${i + 1}` : `Year ${i + 1}`}</td>
                          <td className="px-3 py-1 text-right">${yr.baseSalary.toFixed(1)}M</td>
                          <td className="px-3 py-1 text-right text-amber-600">{yr.proratedBonus > 0 ? `$${yr.proratedBonus.toFixed(1)}M` : '—'}</td>
                          <td className="px-3 py-1 text-right font-medium">${(yr.baseSalary + yr.proratedBonus).toFixed(1)}M</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-3 py-1.5 bg-amber-50 text-xs text-amber-700">
                    Dead money if cut/traded: ${getUnamortizedBonus(player.contract).toFixed(1)}M
                  </div>
                </div>
              )}

              {/* Injury status */}
              {player.injury && (
                <div className="mt-2">
                  <Badge variant="red">{player.injury.type} — {player.injury.weeksLeft} wk{player.injury.weeksLeft !== 1 ? 's' : ''} remaining</Badge>
                </div>
              )}

              {/* Actions */}
              {isOnUserTeam && !player.retired && (
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    variant={confirmRelease ? 'danger' : 'secondary'}
                    onClick={handleRelease}
                  >
                    {confirmRelease ? 'Confirm Release?' : 'Release Player'}
                  </Button>
                  {confirmRelease && (
                    <Button size="sm" variant="ghost" onClick={() => setConfirmRelease(false)}>
                      Cancel
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-6">
          {/* Ratings */}
          <Card>
            <CardHeader><CardTitle>Ratings</CardTitle></CardHeader>
            <div className="space-y-2">
              {relevantRatings.map(key => {
                const val = player.ratings[key];
                return (
                  <div key={key} className="flex items-center gap-3">
                    <div className="w-24 text-xs text-[var(--text-sec)]">{RATING_LABELS[key]}</div>
                    <div className="flex-1 h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${ratingBarColor(val)}`}
                        style={{ width: `${val}%` }}
                      />
                    </div>
                    <div className={`text-xs font-bold w-8 text-right ${ratingColor(val)}`}>{val}</div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Season stats */}
          <Card>
            <CardHeader><CardTitle>Season Stats</CardTitle></CardHeader>
            <div className="space-y-1.5 text-sm">
              {stats.gamesPlayed > 0 ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-sec)]">Games Played</span>
                    <span className="font-mono">{stats.gamesPlayed}</span>
                  </div>
                  {stats.passAttempts > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-sec)]">Pass Yards</span>
                        <span className="font-mono">{stats.passYards}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-sec)]">Pass TDs / INT</span>
                        <span className="font-mono">{stats.passTDs} / {stats.interceptions}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-sec)]">Completions</span>
                        <span className="font-mono">{stats.passCompletions}/{stats.passAttempts}</span>
                      </div>
                    </>
                  )}
                  {stats.rushAttempts > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-sec)]">Rush Yards</span>
                        <span className="font-mono">{stats.rushYards}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-sec)]">Rush TDs</span>
                        <span className="font-mono">{stats.rushTDs}</span>
                      </div>
                    </>
                  )}
                  {stats.targets > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-sec)]">Receptions / Targets</span>
                        <span className="font-mono">{stats.receptions}/{stats.targets}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-sec)]">Rec Yards</span>
                        <span className="font-mono">{stats.receivingYards}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-sec)]">Rec TDs</span>
                        <span className="font-mono">{stats.receivingTDs}</span>
                      </div>
                    </>
                  )}
                  {stats.tackles > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-sec)]">Tackles</span>
                        <span className="font-mono">{stats.tackles}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-sec)]">Sacks</span>
                        <span className="font-mono">{stats.sacks}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-sec)]">Def INTs</span>
                        <span className="font-mono">{stats.defensiveINTs}</span>
                      </div>
                    </>
                  )}
                  <div className="border-t border-[var(--border)] pt-2 mt-2">
                    <div className="text-xs font-bold text-[var(--text-sec)] mb-1">Career</div>
                    {career.passAttempts > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-[var(--text-sec)]">Career Pass Yards</span>
                        <span className="font-mono">{career.passYards}</span>
                      </div>
                    )}
                    {career.rushAttempts > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-[var(--text-sec)]">Career Rush Yards</span>
                        <span className="font-mono">{career.rushYards}</span>
                      </div>
                    )}
                    {career.targets > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-[var(--text-sec)]">Career Rec Yards</span>
                        <span className="font-mono">{career.receivingYards}</span>
                      </div>
                    )}
                    {career.tackles > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-[var(--text-sec)]">Career Tackles</span>
                        <span className="font-mono">{career.tackles}</span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-[var(--text-sec)]">No stats this season.</div>
              )}
            </div>
          </Card>
        </div>

        {/* Coach's Evaluation — only for user's rostered players */}
        {coachEval && (
          <Card>
            <CardHeader><CardTitle>Coach&apos;s Evaluation</CardTitle></CardHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-[var(--surface-2)] rounded-lg px-3 py-2 text-center">
                  <div className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider">Locker Room</div>
                  <div className={`text-xs font-bold mt-1 ${
                    coachEval.lockerRoomPresence === 'Team Captain Material' ? 'text-green-600' :
                    coachEval.lockerRoomPresence === 'Positive Influence' ? 'text-blue-600' :
                    coachEval.lockerRoomPresence === 'Potential Distraction' ? 'text-red-600' :
                    'text-[var(--text)]'
                  }`}>
                    {coachEval.lockerRoomPresence}
                  </div>
                </div>
                <div className="bg-[var(--surface-2)] rounded-lg px-3 py-2 text-center">
                  <div className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider">Work Ethic</div>
                  <div className={`text-xs font-bold mt-1 ${
                    coachEval.workEthic === 'First In, Last Out' ? 'text-green-600' :
                    coachEval.workEthic === 'Above Average' ? 'text-blue-600' :
                    coachEval.workEthic === 'Concerning' || coachEval.workEthic === 'Inconsistent' ? 'text-red-600' :
                    'text-[var(--text)]'
                  }`}>
                    {coachEval.workEthic}
                  </div>
                </div>
                <div className="bg-[var(--surface-2)] rounded-lg px-3 py-2 text-center">
                  <div className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider">Coachability</div>
                  <div className={`text-xs font-bold mt-1 ${
                    coachEval.coachability === 'Extremely Coachable' ? 'text-green-600' :
                    coachEval.coachability === 'Receptive' ? 'text-blue-600' :
                    coachEval.coachability === 'Difficult' || coachEval.coachability === 'Stubborn' ? 'text-red-600' :
                    'text-[var(--text)]'
                  }`}>
                    {coachEval.coachability}
                  </div>
                </div>
                <div className="bg-[var(--surface-2)] rounded-lg px-3 py-2 text-center">
                  <div className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider">Game Prep</div>
                  <div className="text-xs mt-1 text-[var(--text)]">{coachEval.gamePreparation.length > 50 ? coachEval.gamePreparation.slice(0, 50) + '…' : coachEval.gamePreparation}</div>
                </div>
              </div>

              <div>
                <div className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider mb-1">Practice Report</div>
                <p className="text-sm text-[var(--text)]">{coachEval.practiceHabits}</p>
              </div>

              <div className="border-l-2 border-amber-400 pl-3">
                <p className="text-sm italic text-[var(--text)]">{coachEval.coachQuote}</p>
                <span className="text-[10px] text-[var(--text-sec)]">— Head Coach</span>
              </div>
            </div>
          </Card>
        )}

        {/* Front Office Evaluation — only for user's rostered players */}
        {rosterEval && (
          <Card>
            <CardHeader><CardTitle>Front Office Assessment</CardTitle></CardHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-[var(--surface-2)] rounded-lg px-3 py-2 text-center">
                  <div className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider">Roster Status</div>
                  <div className={`text-xs font-bold mt-1 ${
                    rosterEval.rosterStatus === 'Franchise Cornerstone' ? 'text-green-600' :
                    rosterEval.rosterStatus === 'Core Starter' ? 'text-blue-600' :
                    rosterEval.rosterStatus === 'On the Bubble' ? 'text-red-600' :
                    'text-[var(--text)]'
                  }`}>
                    {rosterEval.rosterStatus}
                  </div>
                </div>
                <div className="bg-[var(--surface-2)] rounded-lg px-3 py-2 text-center">
                  <div className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider">Contract Value</div>
                  <div className={`text-xs font-bold mt-1 ${
                    rosterEval.contractValue === 'Elite Value' || rosterEval.contractValue === 'Good Value' ? 'text-green-600' :
                    rosterEval.contractValue === 'Overpaid' || rosterEval.contractValue === 'Significantly Overpaid' ? 'text-red-600' :
                    'text-[var(--text)]'
                  }`}>
                    {rosterEval.contractValue}
                  </div>
                </div>
                <div className="bg-[var(--surface-2)] rounded-lg px-3 py-2 text-center">
                  <div className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider">Trade Value</div>
                  <div className={`text-xs font-bold mt-1 ${
                    rosterEval.tradeValue === 'Untouchable' || rosterEval.tradeValue === 'High' ? 'text-green-600' :
                    rosterEval.tradeValue === 'Minimal' ? 'text-red-600' :
                    'text-[var(--text)]'
                  }`}>
                    {rosterEval.tradeValue}
                  </div>
                </div>
                <div className={`rounded-lg px-3 py-2 text-center border ${
                  rosterEval.recommendation === 'Extend Now' ? 'bg-green-50 border-green-200' :
                  rosterEval.recommendation === 'Keep & Develop' ? 'bg-blue-50 border-blue-200' :
                  rosterEval.recommendation === 'Consider Release' || rosterEval.recommendation === 'Explore Trade Value' ? 'bg-red-50 border-red-200' :
                  'bg-[var(--surface-2)] border-transparent'
                }`}>
                  <div className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider">Recommendation</div>
                  <div className={`text-xs font-bold mt-1 ${
                    rosterEval.recommendation === 'Extend Now' ? 'text-green-600' :
                    rosterEval.recommendation === 'Keep & Develop' ? 'text-blue-600' :
                    rosterEval.recommendation === 'Consider Release' || rosterEval.recommendation === 'Explore Trade Value' ? 'text-red-600' :
                    'text-[var(--text)]'
                  }`}>
                    {rosterEval.recommendation}
                  </div>
                </div>
              </div>

              <div className="border-l-2 border-blue-400 pl-3">
                <p className="text-sm italic text-[var(--text)]">{rosterEval.foQuote}</p>
                <span className="text-[10px] text-[var(--text-sec)]">— General Manager</span>
              </div>
            </div>
          </Card>
        )}

        {/* Rating history */}
        {player.ratingHistory.length >= 1 && (
          <Card>
            <CardHeader><CardTitle>Rating History</CardTitle></CardHeader>
            <div className="flex items-end gap-3 pt-2">
              {player.ratingHistory.map((entry, i) => {
                const prev = i > 0 ? player.ratingHistory[i - 1].overall : entry.overall;
                const delta = entry.overall - prev;
                return (
                  <div key={entry.season} className="flex-1 text-center">
                    <div className={`text-lg font-black ${ratingColor(entry.overall)}`}>{entry.overall}</div>
                    {i > 0 && delta !== 0 && (
                      <div className={`text-xs ${delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {delta > 0 ? '+' : ''}{delta}
                      </div>
                    )}
                    <div className="text-xs text-[var(--text-sec)] mt-1">S{entry.season}</div>
                  </div>
                );
              })}
              {/* Current season */}
              <div className="flex-1 text-center">
                <div className={`text-lg font-black ${ratingColor(player.ratings.overall)} opacity-60`}>{player.ratings.overall}</div>
                <div className="text-xs text-blue-600">Current</div>
              </div>
            </div>
          </Card>
        )}

        {/* Measurables */}
        {(player.combineStats || player.height || player.weight) && (
          <Card>
            <CardHeader><CardTitle>Measurables</CardTitle></CardHeader>
            <div className="grid grid-cols-3 gap-4">
              {player.combineStats && (
                <>
                  <div className="text-center bg-[var(--surface-2)] rounded-lg py-3">
                    <div className="text-2xl font-black">{player.combineStats.fortyYard.toFixed(2)}</div>
                    <div className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider mt-1">40-Yard Dash</div>
                  </div>
                  <div className="text-center bg-[var(--surface-2)] rounded-lg py-3">
                    <div className="text-2xl font-black">{player.combineStats.benchPress}</div>
                    <div className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider mt-1">Bench Press</div>
                  </div>
                  <div className="text-center bg-[var(--surface-2)] rounded-lg py-3">
                    <div className="text-2xl font-black">{player.combineStats.verticalJump.toFixed(1)}&quot;</div>
                    <div className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider mt-1">Vertical Jump</div>
                  </div>
                </>
              )}
            </div>
            {(player.height || player.weight || player.college) && (
              <div className="flex gap-4 mt-3 text-sm text-[var(--text-sec)]">
                {player.height && <span>{player.height}</span>}
                {player.weight && <span>{player.weight} lbs</span>}
                {player.college && <span>{player.college}</span>}
              </div>
            )}
          </Card>
        )}

        {/* Draft info */}
        <Card>
          <CardHeader><CardTitle>Draft Info</CardTitle></CardHeader>
          <div className="text-sm">
            {player.draftYear && player.draftPick ? (
              <span>
                Drafted in <strong>{player.draftYear}</strong>, Overall Pick <strong>#{player.draftPick}</strong>
              </span>
            ) : (
              <span className="text-[var(--text-sec)]">Undrafted</span>
            )}
          </div>
        </Card>
      </div>
    </GameShell>
  );
}
