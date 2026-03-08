'use client';

import { useState, useEffect } from 'react';
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
  const { players, teams, userTeamId, releasePlayer, champions, season } = useGameStore();
  const [confirmRelease, setConfirmRelease] = useState(false);

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
            {team && <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="sm" />}
            <div className="text-[10px] font-black text-[var(--text-sec)]">{player.position}</div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black">
                  {player.firstName} {player.lastName}
                  {isChampionPlayer && <span className="ml-1.5 text-lg" title="Championship Ring">💍</span>}
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <Badge>{player.position}</Badge>
                  <span className="text-sm text-[var(--text-sec)]">Age {player.age}</span>
                  <span className="text-sm text-[var(--text-sec)]">
                    {player.experience === 0 ? 'Rookie' : `Yr ${player.experience}`}
                  </span>
                  {team ? (
                    <span className="text-sm text-[var(--text-sec)]">{team.city} {team.name}</span>
                  ) : (
                    <span className="text-sm text-[var(--text-sec)]">Free Agent</span>
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
          </div>
        </div>

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
            <span>Drafted {player.draftYear}, Pick #{player.draftPick}</span>
          ) : (
            <span>Undrafted</span>
          )}
        </div>
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
