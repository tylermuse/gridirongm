'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore } from '@/lib/engine/store';
import { Modal } from '@/components/ui/Modal';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { potentialLabel, potentialColor } from '@/lib/engine/development';
import { calculateDeadCap, calculateCapSavings } from '@/types';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { TeamLogo } from '@/components/ui/TeamLogo';
import type { Position, PlayerRatings } from '@/types';

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

interface PlayerModalProps {
  playerId: string | null;
  onClose: () => void;
}

export function PlayerModal({ playerId, onClose }: PlayerModalProps) {
  const { players, teams, userTeamId, releasePlayer, champions, season, phase, week, leagueSettings } = useGameStore();
  const router = useRouter();
  const [confirmRelease, setConfirmRelease] = useState(false);

  const tradeDeadlineWeek = leagueSettings?.tradeDeadlineWeek ?? 12;
  const offseasonPhases = ['resigning', 'draft', 'freeAgency', 'offseason', 'preseason'];
  const isTradeOpen = offseasonPhases.includes(phase) || (phase === 'regular' && week <= tradeDeadlineWeek + 1);

  // Reset confirm state when player changes
  useEffect(() => {
    setConfirmRelease(false);
  }, [playerId]);

  const player = playerId ? players.find(p => p.id === playerId) : null;

  if (!player) {
    return (
      <Modal isOpen={!!playerId} onClose={onClose} maxWidth="lg">
        <div className="p-8 text-center">
          <p className="text-[var(--text-sec)]">Player not found.</p>
        </div>
      </Modal>
    );
  }

  const team = player.teamId ? teams.find(t => t.id === player.teamId) : null;
  const isOnUserTeam = player.teamId === userTeamId;
  const relevantRatings = POSITION_RELEVANT_RATINGS[player.position] ?? [];
  const currentChamp = champions?.find(c => c.season === season);
  const isChampionPlayer = !!currentChamp && player.teamId === currentChamp.teamId;
  const stats = player.stats;
  const career = player.careerStats;

  function handleRelease() {
    if (!player) return;
    if (confirmRelease) {
      releasePlayer(player.id);
      onClose();
    } else {
      setConfirmRelease(true);
    }
  }

  return (
    <Modal isOpen={!!playerId} onClose={onClose} maxWidth="lg">
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start gap-5">
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <PlayerAvatar player={player} size="md" teamColor={team?.primaryColor ?? '#374151'} />
            {team && <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} logoUrl={team.logoUrl} size="sm" />}
            <div className="text-[10px] font-black text-[var(--text-sec)]">{player.position}</div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black">
                  {player.firstName} {player.lastName}
                  {isChampionPlayer && <span className="ml-1.5 text-lg" title="Championship Ring">💍</span>}
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <Badge>{player.position}</Badge>
                  {player.height && player.weight && (
                    <span className="text-sm text-[var(--text-sec)]">{player.height} · {player.weight} lbs</span>
                  )}
                  <span className="text-sm text-[var(--text-sec)]">Age {player.age}</span>
                  <span className="text-sm text-[var(--text-sec)]">
                    {player.experience === 0 ? 'Rookie' : `Yr ${player.experience}`}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                  {team ? (
                    <span className="text-sm text-[var(--text-sec)]">{team.city} {team.name}</span>
                  ) : (
                    <span className="text-sm text-[var(--text-sec)]">Free Agent</span>
                  )}
                  {player.college && (
                    <span className="text-sm text-[var(--text-sec)]">· {player.college}</span>
                  )}
                  {player.retired && <Badge variant="red">Retired</Badge>}
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className={`text-4xl font-black ${ratingColor(player.ratings.overall)}`}>
                  {player.ratings.overall}
                </div>
                <div className="text-xs text-[var(--text-sec)]">Overall</div>
              </div>
            </div>

            {/* Contract + Potential */}
            <div className="flex items-center gap-4 mt-2">
              {player.contract.yearsLeft > 0 ? (
                <>
                  <span className="text-sm font-semibold">${player.contract.salary}M/yr</span>
                  <span className="text-sm text-[var(--text-sec)]">
                    {player.contract.yearsLeft} yr{player.contract.yearsLeft !== 1 ? 's' : ''} left
                  </span>
                </>
              ) : (
                <span className="text-sm text-[var(--text-sec)]">Expiring contract</span>
              )}
              <span className={`text-sm ${potentialColor(player.potential, player.experience)}`}>
                POT: {potentialLabel(player.potential, player.experience)}
              </span>

              {player.mood !== undefined && (
                <span className={`text-sm ${
                  player.mood >= 75 ? 'text-green-600' :
                  player.mood >= 50 ? 'text-amber-600' :
                  'text-red-600'
                }`}>
                  {player.mood >= 75 ? '😊' : player.mood >= 50 ? '😐' : '😠'} {
                    player.mood >= 90 ? 'Ecstatic' :
                    player.mood >= 75 ? 'Happy' :
                    player.mood >= 60 ? 'Content' :
                    player.mood >= 45 ? 'Unhappy' :
                    player.mood >= 25 ? 'Frustrated' :
                    'Holdout Risk'
                  }
                </span>
              )}
            </div>

            {/* Injury */}
            {player.injury && (
              <div className="mt-2">
                <Badge variant="red">
                  {player.injury.type} — {player.injury.weeksLeft} wk{player.injury.weeksLeft !== 1 ? 's' : ''} remaining
                </Badge>
              </div>
            )}

            {/* Actions */}
            {isOnUserTeam && !player.retired && (
              <div className="mt-3">
                <div className="flex items-center gap-2">
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
                {player.contract.salary > 0 && (() => {
                  const deadCap = calculateDeadCap(player.contract);
                  const savings = calculateCapSavings(player.contract);
                  return deadCap > 0 ? (
                    <div className="text-xs mt-1 space-y-0.5">
                      <div className="text-red-600">Dead cap: ${deadCap}M</div>
                      <div className={savings > 0 ? 'text-green-600' : 'text-red-600'}>
                        Cap savings: ${savings > 0 ? savings : 0}M
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-green-600 mt-1">
                      Saves ${player.contract.salary}M/yr cap space
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Trade for player */}
            {!isOnUserTeam && !player.retired && player.teamId && isTradeOpen && (
              <div className="mt-3">
                <Button
                  size="sm"
                  onClick={() => {
                    onClose();
                    router.push(`/trades?team=${player.teamId}`);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Trade for {player.firstName} {player.lastName}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Combine Stats */}
        {player.combineStats && (
          <div className="flex gap-4 text-xs text-[var(--text-sec)] px-1">
            <span>40yd: <span className="font-bold text-[var(--text)]">{player.combineStats.fortyYard.toFixed(2)}</span></span>
            <span>Bench: <span className="font-bold text-[var(--text)]">{player.combineStats.benchPress}</span></span>
            <span>Vert: <span className="font-bold text-[var(--text)]">{player.combineStats.verticalJump.toFixed(1)}&quot;</span></span>
          </div>
        )}

        {/* Ratings + Stats side by side */}
        <div className="grid grid-cols-2 gap-4">
          {/* Ratings */}
          <Card>
            <CardHeader><CardTitle>Ratings</CardTitle></CardHeader>
            <div className="space-y-1.5">
              {relevantRatings.map(key => {
                const val = player.ratings[key];
                return (
                  <div key={key} className="flex items-center gap-3">
                    <div className="w-20 text-xs text-[var(--text-sec)]">{RATING_LABELS[key]}</div>
                    <div className="flex-1 h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${ratingBarColor(val)}`}
                        style={{ width: `${val}%` }}
                      />
                    </div>
                    <div className={`text-xs font-bold w-7 text-right ${ratingColor(val)}`}>{val}</div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Season Stats */}
          <Card>
            <CardHeader><CardTitle>Season Stats</CardTitle></CardHeader>
            <div className="space-y-1 text-sm">
              {stats.gamesPlayed > 0 ? (
                <>
                  <StatLine label="Games" value={stats.gamesPlayed} />
                  {stats.passAttempts > 0 && (
                    <>
                      <StatLine label="Pass Yds" value={stats.passYards} />
                      <StatLine label="TD / INT" value={`${stats.passTDs} / ${stats.interceptions}`} />
                      <StatLine label="Comp" value={`${stats.passCompletions}/${stats.passAttempts}`} />
                    </>
                  )}
                  {stats.rushAttempts > 0 && (
                    <>
                      <StatLine label="Rush Yds" value={stats.rushYards} />
                      <StatLine label="Rush TD" value={stats.rushTDs} />
                    </>
                  )}
                  {stats.targets > 0 && (
                    <>
                      <StatLine label="Rec" value={`${stats.receptions}/${stats.targets}`} />
                      <StatLine label="Rec Yds" value={stats.receivingYards} />
                      <StatLine label="Rec TD" value={stats.receivingTDs} />
                    </>
                  )}
                  {stats.tackles > 0 && (
                    <>
                      <StatLine label="Tackles" value={stats.tackles} />
                      <StatLine label="Sacks" value={stats.sacks} />
                      <StatLine label="Def INT" value={stats.defensiveINTs} />
                    </>
                  )}
                  {/* Career summary */}
                  <div className="border-t border-[var(--border)] pt-1.5 mt-1.5">
                    <div className="text-[10px] font-bold text-[var(--text-sec)] mb-1">CAREER</div>
                    {career.passAttempts > 0 && <StatLine label="Pass Yds" value={career.passYards} small />}
                    {career.rushAttempts > 0 && <StatLine label="Rush Yds" value={career.rushYards} small />}
                    {career.targets > 0 && <StatLine label="Rec Yds" value={career.receivingYards} small />}
                    {career.tackles > 0 && <StatLine label="Tackles" value={career.tackles} small />}
                  </div>
                </>
              ) : (
                <div className="text-[var(--text-sec)] text-xs">No stats this season.</div>
              )}
            </div>
          </Card>
        </div>

        {/* Rating History */}
        {player.ratingHistory.length >= 1 && (
          <Card>
            <CardHeader><CardTitle>Rating History</CardTitle></CardHeader>
            <div className="flex items-end gap-3 pt-1">
              {player.ratingHistory.map((entry, i) => {
                const prev = i > 0 ? player.ratingHistory[i - 1].overall : entry.overall;
                const delta = entry.overall - prev;
                return (
                  <div key={entry.season} className="flex-1 text-center">
                    <div className={`text-base font-black ${ratingColor(entry.overall)}`}>{entry.overall}</div>
                    {i > 0 && delta !== 0 && (
                      <div className={`text-[10px] ${delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {delta > 0 ? '+' : ''}{delta}
                      </div>
                    )}
                    <div className="text-[10px] text-[var(--text-sec)] mt-0.5">S{entry.season}</div>
                  </div>
                );
              })}
              <div className="flex-1 text-center">
                <div className={`text-base font-black ${ratingColor(player.ratings.overall)} opacity-60`}>
                  {player.ratings.overall}
                </div>
                <div className="text-[10px] text-blue-600">Now</div>
              </div>
            </div>
          </Card>
        )}

        {/* Draft Info */}
        <div className="text-xs text-[var(--text-sec)]">
          {player.draftYear && player.draftPick ? (
            <span>
              Draft: {player.draftYear}
              {player.draftRound ? ` Rd ${player.draftRound}` : ''}
              , Pick #{player.draftPick}
              {(() => {
                const draftTeam = player.draftTeamId ? teams.find(t => t.id === player.draftTeamId) : null;
                return draftTeam ? ` by ${draftTeam.city} ${draftTeam.name}` : '';
              })()}
            </span>
          ) : (
            <span>Undrafted</span>
          )}
        </div>

        {/* Season Log */}
        {player.seasonLog && player.seasonLog.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Career Stats</CardTitle></CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[var(--text-sec)] uppercase tracking-wider">
                    <th className="text-left pb-2">Year</th>
                    <th className="text-left pb-2">Team</th>
                    <th className="text-center pb-2">G</th>
                    {['QB'].includes(player.position) && <><th className="text-center pb-2">YDS</th><th className="text-center pb-2">TD</th><th className="text-center pb-2">INT</th></>}
                    {['RB'].includes(player.position) && <><th className="text-center pb-2">Rush</th><th className="text-center pb-2">YDS</th><th className="text-center pb-2">TD</th></>}
                    {['WR', 'TE'].includes(player.position) && <><th className="text-center pb-2">REC</th><th className="text-center pb-2">YDS</th><th className="text-center pb-2">TD</th></>}
                    {['DL', 'LB'].includes(player.position) && <><th className="text-center pb-2">TKL</th><th className="text-center pb-2">SCK</th><th className="text-center pb-2">INT</th></>}
                    {['CB', 'S'].includes(player.position) && <><th className="text-center pb-2">TKL</th><th className="text-center pb-2">INT</th><th className="text-center pb-2">PD</th></>}
                    {['K'].includes(player.position) && <><th className="text-center pb-2">FGM</th><th className="text-center pb-2">FGA</th><th className="text-center pb-2">FG%</th></>}
                  </tr>
                </thead>
                <tbody>
                  {[...player.seasonLog].reverse().map((entry, i) => {
                    const t = teams.find(tm => tm.id === entry.teamId);
                    const s = entry.stats;
                    return (
                      <tr key={i} className="border-t border-[var(--border)]">
                        <td className="py-1.5">S{entry.season}</td>
                        <td className="py-1.5">{t?.abbreviation ?? '???'}</td>
                        <td className="py-1.5 text-center">{s.gamesPlayed}</td>
                        {['QB'].includes(player.position) && <><td className="py-1.5 text-center font-mono">{s.passYards.toLocaleString()}</td><td className="py-1.5 text-center">{s.passTDs}</td><td className="py-1.5 text-center">{s.interceptions}</td></>}
                        {['RB'].includes(player.position) && <><td className="py-1.5 text-center">{s.rushAttempts}</td><td className="py-1.5 text-center font-mono">{s.rushYards.toLocaleString()}</td><td className="py-1.5 text-center">{s.rushTDs}</td></>}
                        {['WR', 'TE'].includes(player.position) && <><td className="py-1.5 text-center">{s.receptions}</td><td className="py-1.5 text-center font-mono">{s.receivingYards.toLocaleString()}</td><td className="py-1.5 text-center">{s.receivingTDs}</td></>}
                        {['DL', 'LB'].includes(player.position) && <><td className="py-1.5 text-center">{s.tackles}</td><td className="py-1.5 text-center">{s.sacks}</td><td className="py-1.5 text-center">{s.defensiveINTs}</td></>}
                        {['CB', 'S'].includes(player.position) && <><td className="py-1.5 text-center">{s.tackles}</td><td className="py-1.5 text-center">{s.defensiveINTs}</td><td className="py-1.5 text-center">{s.passDeflections}</td></>}
                        {['K'].includes(player.position) && <><td className="py-1.5 text-center">{s.fieldGoalsMade}</td><td className="py-1.5 text-center">{s.fieldGoalAttempts}</td><td className="py-1.5 text-center">{s.fieldGoalAttempts > 0 ? Math.round(s.fieldGoalsMade / s.fieldGoalAttempts * 100) : 0}%</td></>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </Modal>
  );
}

function StatLine({ label, value, small }: { label: string; value: string | number; small?: boolean }) {
  return (
    <div className={`flex justify-between ${small ? 'text-xs' : ''}`}>
      <span className="text-[var(--text-sec)]">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
