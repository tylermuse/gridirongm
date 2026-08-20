'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useGameStore } from '@/lib/engine/store';
import { Modal } from '@/components/ui/Modal';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { potentialLabel, potentialColor } from '@/lib/engine/development';
import { calculateSchemeFit } from '@/lib/engine/coaching';
import { calculateDeadCap, calculateCapSavings, SUB_POSITION_PIN_OPTIONS } from '@/types';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { getOvrColor, getOvrBgColor } from '@/lib/ovrColor';
import { initNegotiation, processOffer, type NegotiationState } from '@/lib/engine/negotiation';
import { estimateSalary, capInflationFactor, LEAGUE_MINIMUM_SALARY } from '@/lib/engine/store';
import type { Position, PlayerRatings } from '@/types';

function ratingColor(val: number) {
  if (val >= 85) return 'text-green-600';
  if (val >= 75) return 'text-emerald-600';
  if (val >= 65) return 'text-yellow-600';
  if (val >= 55) return 'text-orange-500';
  if (val >= 45) return 'text-orange-600';
  return 'text-red-600';
}

function ratingBarColor(val: number) {
  if (val >= 85) return 'bg-green-500';
  if (val >= 75) return 'bg-emerald-500';
  if (val >= 65) return 'bg-yellow-500';
  if (val >= 55) return 'bg-orange-400';
  if (val >= 45) return 'bg-orange-600';
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

const AWARD_ICONS: Record<string, string> = {
  'MVP': '\u{1F3C6}',
  'Defensive POY': '\u{1F6E1}\uFE0F',
  'Offensive POY': '\u26A1',
  'Offensive ROY': '\u{1F31F}',
  'Defensive ROY': '\u{1F31F}',
  'All-League 1st Team': '\u2B50',
  'All-League 2nd Team': '\u2B50',
  'All-Rookie Team': '\u{1F530}',
  'Championship MVP': '\u{1F48D}',
};

interface PlayerModalProps {
  playerId: string | null;
  onClose: () => void;
}

export function PlayerModal({ playerId, onClose }: PlayerModalProps) {
  const { players, teams, userTeamId, releasePlayer, editPlayer, restructureContract, champions, season, phase, week, leagueSettings, setSubPositionOverride } = useGameStore();
  const isSpectator = useGameStore(s => s.isSpectator ?? false);
  const router = useRouter();
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showRestructure, setShowRestructure] = useState(false);
  const godMode = leagueSettings?.godMode ?? false;
  const [extensionNeg, setExtensionNeg] = useState<NegotiationState | null>(null);
  const [extOfferSalary, setExtOfferSalary] = useState(0);
  const [extOfferYears, setExtOfferYears] = useState(3);

  const tradeDeadlineWeek = leagueSettings?.tradeDeadlineWeek ?? 12;
  const offseasonPhases = ['resigning', 'draft', 'freeAgency', 'offseason', 'preseason'];
  const isTradeOpen = offseasonPhases.includes(phase) || (phase === 'regular' && week <= tradeDeadlineWeek + 1);

  // Reset confirm state when a different player is opened. This is an
  // intentional synchronous reset keyed on playerId — clearing an in-progress
  // release confirmation and extension negotiation when the modal swaps
  // players — not a cascading-render smell, so the set-state-in-effect rule is
  // scoped-off for just this effect. (Surfaced now because this file entered a
  // changeset for the first time since the rule was added; the DL/LB pin fix
  // below is the actual change.)
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect --
       intentional synchronous reset when the modal swaps to a different
       player; keyed on playerId, not a cascading-render smell. */
    setConfirmRelease(false);
    setExtensionNeg(null);
    /* eslint-enable react-hooks/set-state-in-effect */
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
  // Spectator mode hides every action — no "user team" exists in observe-only
  // leagues, so isOnUserTeam folds away the manage rail entirely.
  const isOnUserTeam = !isSpectator && player.teamId === userTeamId;
  const relevantRatings = POSITION_RELEVANT_RATINGS[player.position] ?? [];

  const archetypeMap: Record<string, { label: string; emoji: string }> = {
    throwing: { label: 'Gunslinger', emoji: '🎯' },
    awareness: { label: 'Field General', emoji: '🧠' },
    speed: { label: 'Speedster', emoji: '⚡' },
    strength: { label: 'Power Player', emoji: '💪' },
    catching: { label: 'Reliable Hands', emoji: '🙌' },
    blocking: { label: 'Trench Warrior', emoji: '🛡️' },
    tackling: { label: 'Heat Seeker', emoji: '💥' },
    coverage: { label: 'Lockdown', emoji: '🔒' },
    passRush: { label: 'Edge Rusher', emoji: '🌪️' },
    carrying: { label: 'Workhorse', emoji: '🐎' },
    agility: { label: 'Elusive', emoji: '🦎' },
    kicking: { label: 'Clutch Leg', emoji: '🦵' },
  };
  const primaryRatingKeys: (keyof Omit<PlayerRatings, 'overall'>)[] = [
    'throwing', 'carrying', 'catching', 'coverage', 'passRush', 'blocking',
    'tackling', 'kicking', 'speed', 'strength', 'agility', 'awareness',
  ];
  const topRatingKey = primaryRatingKeys.reduce((best, key) =>
    (player.ratings[key] ?? 0) > (player.ratings[best] ?? 0) ? key : best
  , primaryRatingKeys[0]);
  const archetype = archetypeMap[topRatingKey];

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
            <div className="relative">
              <PlayerAvatar player={player} size="lg" teamColor={team?.primaryColor ?? '#374151'} />
              {godMode && !player.photoUrl && (
                <button
                  onClick={() => {
                    const reroll = (useGameStore.getState() as unknown as { rerollPortrait?: (id: string) => void }).rerollPortrait;
                    reroll?.(player.id);
                  }}
                  title="Re-roll portrait (God Mode)"
                  aria-label="Re-roll portrait"
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-md hover:bg-blue-700 active:scale-95 transition-all"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                </button>
              )}
            </div>
            {team && <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} logoUrl={team.logoUrl} size="sm" />}
            <div className="text-[10px] font-black text-[var(--text-sec)]">
              {player.position}
              {player.subPosition && player.subPosition !== player.position && (
                <span className="ml-1 text-[10px] font-bold text-[var(--text-sec)]/70">({player.subPosition})</span>
              )}
            </div>
            {/* Manual sub-position pin — mirrors /player/[id] treatment.
                Owner-only. Options come from the shared SUB_POSITION_PIN_OPTIONS
                map (OL: OT/OG, DL: EDGE/DT, LB: MLB/OLB, S: FS/SS) so this popup and the
                full player page expose the identical control. The modal is where
                launcher_18 (msg 1522270257169961180) and, after PR #393 only
                touched the player page, tofftanaut + jslusser1945 (8/18) were
                landing when they reported "not there" — the DL/LB pin never
                lived on this surface. Writes subPositionOverride so it survives
                the load backfill. */}
            {isOnUserTeam && !player.retired && SUB_POSITION_PIN_OPTIONS[player.position] && (
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold text-[var(--text-sec)]">Position:</span>
                {(SUB_POSITION_PIN_OPTIONS[player.position] ?? []).map(sp => (
                  <button
                    key={sp}
                    type="button"
                    onClick={() => setSubPositionOverride(player.id, sp)}
                    title={`Set position to ${sp}`}
                    className={`text-xs font-bold px-2 py-1 rounded ${
                      player.subPosition === sp
                        ? 'bg-blue-600 text-white'
                        : 'border border-[var(--border)] text-[var(--text-sec)] hover:text-[var(--text)]'
                    }`}
                  >
                    {sp}
                  </button>
                ))}
                {player.subPositionOverride && (
                  <button
                    type="button"
                    onClick={() => setSubPositionOverride(player.id, null)}
                    title="Clear manual position — use ratings"
                    className="text-xs font-bold px-2 py-1 rounded border border-[var(--border)] text-[var(--text-sec)] hover:text-[var(--text)]"
                  >
                    Auto
                  </button>
                )}
              </div>
            )}
            {/* Off-roster viewers see why there's no pin control (owner-only). */}
            {!isOnUserTeam && !player.retired && SUB_POSITION_PIN_OPTIONS[player.position] && (
              <div className="text-[10px] text-[var(--text-sec)]/70">(Owner controls only)</div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black">
                  {player.jerseyNumber != null && (
                    <span className="text-[var(--text-sec)] mr-2">#{player.jerseyNumber}</span>
                  )}
                  {player.firstName} {player.lastName}
                  {isChampionPlayer && <span className="ml-1.5 text-lg" title="Championship Ring">💍</span>}
                </h2>
                {archetype && (
                  <div className="mt-0.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-xs font-medium text-indigo-700">
                      <span>{archetype.emoji}</span> {archetype.label}
                    </span>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <Link href={`/players?position=${player.position}`} className="hover:opacity-75 transition-opacity">
                    <Badge>{player.position}</Badge>
                  </Link>
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

              <div className="text-right shrink-0 flex flex-col items-center">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center ${getOvrBgColor(player.ratings.overall)}`}>
                  <span className="text-2xl font-black text-white tabular-nums">{player.ratings.overall}</span>
                </div>
                <div className="text-xs text-[var(--text-sec)] mt-1">Overall</div>
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
              <span
                className={`text-sm ${potentialColor(player.potential, player.experience)}`}
                title={player.potential < player.ratings.overall ? `Decline phase — ${player.firstName} has reached his ceiling and his potential will gradually decrease as he ages.` : `Potential ceiling: ${player.potential} OVR`}
              >
                POT: {potentialLabel(player.potential, player.experience)}
                {player.potential < player.ratings.overall && <span className="ml-1 text-orange-500" title="Decline phase">📉</span>}
              </span>

              {player.mood !== undefined && (() => {
                const mood = player.mood;
                const label = mood >= 90 ? 'Ecstatic' : mood >= 75 ? 'Happy' : mood >= 60 ? 'Content' : mood >= 45 ? 'Unhappy' : mood >= 25 ? 'Frustrated' : 'Holdout Risk';
                const emoji = mood >= 75 ? '😊' : mood >= 50 ? '😐' : '😠';
                const color = mood >= 90 ? 'text-green-500' : mood >= 75 ? 'text-green-600' : mood >= 60 ? 'text-yellow-600' : mood >= 45 ? 'text-orange-500' : mood >= 25 ? 'text-red-500' : 'text-red-700';

                // Build mood reasons
                const reasons: string[] = [];
                if (team) {
                  const gp = team.record.wins + team.record.losses;
                  const wp = gp > 0 ? team.record.wins / gp : 0.5;
                  if (wp >= 0.6) reasons.push('Team winning');
                  else if (wp <= 0.35) reasons.push('Losing record');
                  if (team.record.streak >= 3) reasons.push(`${team.record.streak}-game win streak`);
                  else if (team.record.streak <= -3) reasons.push(`${Math.abs(team.record.streak)}-game losing streak`);
                  const dc = team.depthChart[player.position as import('@/types').Position] ?? [];
                  const depthIdx = dc.indexOf(player.id);
                  if (depthIdx === 0) reasons.push('Starting');
                  else if (depthIdx > 2) reasons.push('Wants more playing time');
                }
                if (player.contract.yearsLeft <= 1 && player.ratings.overall >= 70) reasons.push('Wants extension');
                if (player.holdout) reasons.push('Holding out');
                const marketEst = player.ratings.overall * 0.3;
                if (player.contract.salary < marketEst * 0.6) reasons.push('Underpaid');

                return (
                  <div>
                    <span className={`text-sm ${color}`}>{emoji} {label}</span>
                    {reasons.length > 0 && (
                      <div className="text-[10px] text-[var(--text-sec)] mt-0.5">{reasons.join(' · ')}</div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Scheme Fit */}
            {(() => {
              const userTeam = teams.find(t => t.id === userTeamId);
              if (!userTeam) return null;
              const fit = calculateSchemeFit(player, userTeam);
              if (!fit) return null;
              return (
                <div className="flex items-center gap-2 mt-1">
                  <span className={`w-2.5 h-2.5 rounded-full ${fit === 'great' ? 'bg-green-500' : fit === 'poor' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                  <span className="text-xs text-[var(--text-sec)]">
                    {fit === 'great' ? 'Great' : fit === 'poor' ? 'Poor' : 'Neutral'} Scheme Fit
                    {fit === 'great' && <span className="ml-1 font-bold text-green-600">(+2 OVR)</span>}
                    {fit === 'poor' && <span className="ml-1 font-bold text-red-600">(-1 OVR)</span>}
                  </span>
                </div>
              );
            })()}

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
                <div className="flex items-center gap-2 flex-wrap">
                  {isTradeOpen && !confirmRelease && (
                    <Button
                      size="sm"
                      onClick={() => {
                        onClose();
                        router.push(`/trades?block=${player.id}&from=player`);
                      }}
                    >
                      Add to Trading Block
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={confirmRelease ? 'danger' : 'ghost'}
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

            {/* Restructure Contract */}
            {isOnUserTeam && !player.retired && player.contract.yearsLeft >= 2 && player.lastRestructuredSeason !== season && !showRestructure && (
              <div className="mt-2">
                <Button size="sm" variant="secondary" onClick={() => setShowRestructure(true)}>
                  Restructure Contract
                </Button>
              </div>
            )}
            {showRestructure && (
              <RestructureInline
                player={player}
                season={season}
                onRestructure={(amount, voidYears) => {
                  restructureContract(player.id, amount, voidYears);
                  setShowRestructure(false);
                }}
                onCancel={() => setShowRestructure(false)}
              />
            )}

            {/* Extend Contract */}
            {isOnUserTeam && !player.retired && player.contract.yearsLeft >= 1 && !player.holdout && player.lastRestructuredSeason !== season && !extensionNeg && (() => {
              const extensionsUsed = (useGameStore.getState() as unknown as Record<string, unknown>).extensionsUsedThisSeason as number | undefined;
              return (extensionsUsed ?? 0) < 3;
            })() && (
              <div className="mt-2">
                <button
                  onClick={() => {
                    const userTeam = teams.find(t => t.id === userTeamId);
                    const ci = userTeam ? capInflationFactor(userTeam.salaryCap) : 1.0;
                    const market = estimateSalary(player.ratings.overall, player.position, player.age, player.potential, ci);
                    const premium = 1.10;
                    const askingSalary = Math.round(market * premium * 10) / 10;
                    const neg = initNegotiation(player, askingSalary, 'extension' as 'resigning');
                    setExtensionNeg(neg);
                    setExtOfferSalary(neg.askingSalary);
                    setExtOfferYears(neg.askingYears);
                  }}
                  className="px-3 py-1.5 text-xs font-medium border border-green-200 text-green-600 rounded-lg hover:bg-green-50 transition-colors"
                >
                  Extend Contract
                </button>
              </div>
            )}

            {/* Extension Negotiation Panel */}
            {extensionNeg && (
              <div className="mt-4 border-t border-[var(--border)] pt-4">
                <h3 className="text-sm font-bold mb-2">Contract Extension Negotiation</h3>

                {/* Messages */}
                <div className="space-y-2 mb-3 max-h-32 overflow-y-auto">
                  {extensionNeg.messages.map((msg, i) => (
                    <div key={i} className={`text-xs p-2 rounded ${msg.sender === 'player' ? 'bg-[var(--surface-2)]' : 'bg-blue-50'}`}>
                      <span className="font-bold">{msg.sender === 'player' ? extensionNeg.playerName : 'You'}:</span> {msg.text}
                    </div>
                  ))}
                </div>

                {extensionNeg.outcome === 'pending' && (
                  <div className="flex items-center gap-3">
                    <div>
                      <label className="text-[10px] text-[var(--text-sec)]">Salary</label>
                      <input type="number" step="0.1" value={extOfferSalary}
                        onChange={e => setExtOfferSalary(Number(e.target.value))}
                        className="w-24 px-2 py-1 text-sm border rounded" />
                    </div>
                    <div>
                      <label className="text-[10px] text-[var(--text-sec)]">Years</label>
                      <input type="number" min="1" max="6" value={extOfferYears}
                        onChange={e => setExtOfferYears(Number(e.target.value))}
                        className="w-16 px-2 py-1 text-sm border rounded" />
                    </div>
                    <button
                      onClick={() => {
                        const updated = processOffer(extensionNeg, extOfferSalary, extOfferYears);
                        setExtensionNeg(updated);
                        if (updated.outcome === 'accepted') {
                          const { extendPlayer } = useGameStore.getState() as unknown as Record<string, unknown>;
                          if (typeof extendPlayer === 'function') {
                            // extendPlayer returns {success, reason} as of 5/15 — the
                            // render gate above (extensionsUsed < 3) keeps the user
                            // out of this path when capped, so we don't need to
                            // surface the reason here. Type signature matches the
                            // store interface so any future refactor stays honest.
                            (extendPlayer as (id: string, salary: number, years: number) => { success: boolean; reason?: string })(player.id, extOfferSalary, extOfferYears);
                          }
                        }
                      }}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-green-600 rounded-lg hover:bg-green-700"
                    >
                      Offer
                    </button>
                    <button
                      onClick={() => setExtensionNeg(null)}
                      className="px-3 py-1.5 text-xs text-[var(--text-sec)] hover:text-[var(--text)]"
                    >
                      Walk Away
                    </button>
                  </div>
                )}

                {extensionNeg.outcome === 'accepted' && (
                  <div className="text-sm text-green-600 font-bold">
                    Extension signed! {extensionNeg.playerName} committed for ${extOfferSalary}M/yr, {extOfferYears} years. (+15 mood)
                  </div>
                )}

                {extensionNeg.outcome === 'rejected' && (
                  <div className="text-sm text-red-600 font-bold">
                    {extensionNeg.playerName} will play out his current deal.
                  </div>
                )}
              </div>
            )}

            {/* God Mode: Edit Player */}
            {godMode && !player.retired && !editing && (
              <div className="mt-2">
                <Button
                  size="sm"
                  onClick={() => setEditing(true)}
                  className="bg-yellow-500 hover:bg-yellow-600 text-white"
                >
                  Edit Player
                </Button>
              </div>
            )}

            {/* God Mode: Player Editor */}
            {godMode && editing && (
              <PlayerEditor player={player} teams={teams} onSave={(updates) => {
                editPlayer(player.id, updates);
                setEditing(false);
              }} onCancel={() => setEditing(false)} />
            )}

            {/* Trade for player */}
            {!isOnUserTeam && !player.retired && player.teamId && isTradeOpen && (
              <div className="mt-3">
                <Button
                  size="sm"
                  onClick={() => {
                    onClose();
                    router.push(`/trades?team=${player.teamId}&target=${player.id}`);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Trade for {player.firstName} {player.lastName}
                </Button>
              </div>
            )}

            {/* Retire Jersey Number — only for franchise legends: retired
                player OR active career player ≥85 OVR who played for user's
                team. Hidden once the number is already retired. */}
            {(() => {
              const userTeam = teams.find(t => t.id === userTeamId);
              if (!userTeam) return null;
              if (player.jerseyNumber == null) return null;
              const playedForUs = player.teamId === userTeamId || player.draftTeamId === userTeamId;
              if (!playedForUs) return null;
              const qualifies = player.retired || player.ratings.overall >= 85;
              if (!qualifies) return null;
              const alreadyRetired = (userTeam.retiredNumbers ?? []).some(
                r => r.number === player.jerseyNumber,
              );
              if (alreadyRetired) {
                return (
                  <div className="mt-3 text-xs px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 font-bold">
                    🎖️ #{player.jerseyNumber} retired by the {userTeam.city} {userTeam.name}.
                  </div>
                );
              }
              return (
                <div className="mt-3">
                  <Button
                    size="sm"
                    onClick={() => {
                      const err = (useGameStore.getState() as unknown as {
                        retireJerseyNumber: (id: string) => string;
                      }).retireJerseyNumber(player.id);
                      if (err) alert(err);
                    }}
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    🎖️ Retire #{player.jerseyNumber}
                  </Button>
                </div>
              );
            })()}
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

        {/* College Stats */}
        {player.collegeStats && (
          <div className="px-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase tracking-wider text-[var(--text-sec)] font-bold">College Career</span>
              {player.heismanWinner && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-bold">Heisman Winner</span>}
              {player.college && <span className="text-[10px] text-[var(--text-sec)]">{player.college}</span>}
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-[var(--text-sec)]">
              <span>{player.collegeStats.seasons}yr · {player.collegeStats.gamesPlayed}G</span>
              {player.collegeStats.passYards != null && <span>Pass: <span className="font-bold text-[var(--text)]">{player.collegeStats.passYards.toLocaleString()}</span> yds · <span className="font-bold text-[var(--text)]">{player.collegeStats.passTDs}</span> TD · {player.collegeStats.passINTs} INT</span>}
              {player.collegeStats.rushYards != null && <span>Rush: <span className="font-bold text-[var(--text)]">{player.collegeStats.rushYards.toLocaleString()}</span> yds · <span className="font-bold text-[var(--text)]">{player.collegeStats.rushTDs}</span> TD</span>}
              {player.collegeStats.receptions != null && <span>Rec: <span className="font-bold text-[var(--text)]">{player.collegeStats.receptions}</span> · <span className="font-bold text-[var(--text)]">{player.collegeStats.recYards?.toLocaleString()}</span> yds · <span className="font-bold text-[var(--text)]">{player.collegeStats.recTDs}</span> TD</span>}
              {player.collegeStats.tackles != null && <span>TKL: <span className="font-bold text-[var(--text)]">{player.collegeStats.tackles}</span></span>}
              {player.collegeStats.sacks != null && <span>SCK: <span className="font-bold text-[var(--text)]">{player.collegeStats.sacks}</span></span>}
              {player.collegeStats.interceptions != null && <span>INT: <span className="font-bold text-[var(--text)]">{player.collegeStats.interceptions}</span></span>}
              {player.collegeStats.forcedFumbles != null && <span>FF: <span className="font-bold text-[var(--text)]">{player.collegeStats.forcedFumbles}</span></span>}
              {player.collegeStats.fieldGoalPct != null && <span>FG%: <span className="font-bold text-[var(--text)]">{player.collegeStats.fieldGoalPct}%</span></span>}
            </div>
          </div>
        )}

        {/* Ratings + Stats side by side */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Ratings */}
          <Card>
            <CardHeader><CardTitle>Ratings</CardTitle></CardHeader>
            <div className="space-y-1.5">
              {relevantRatings.map(key => {
                const val = player.ratings[key];
                const tierLabel = val >= 85 ? 'Elite' : val >= 70 ? 'Good' : val >= 55 ? 'Avg' : 'Poor';
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
                    <div className={`text-[10px] w-8 ${ratingColor(val)}`}>{tierLabel}</div>
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
                      <StatLine label="TFL" value={stats.tacklesForLoss} />
                      <StatLine label="Sacks" value={stats.sacks} />
                      <StatLine label="Def INT" value={stats.defensiveINTs} />
                      <StatLine label="Pass Defl" value={stats.passDeflections} />
                      <StatLine label="FF" value={stats.forcedFumbles} />
                    </>
                  )}
                  {player.position === 'OL' && stats.gamesPlayed > 0 && stats.tackles === 0 && (
                    <>
                      <StatLine label="Pass Blocks" value={stats.passBlocks} />
                      <StatLine label="Sacks Allowed" value={stats.sacksAllowed} />
                      <StatLine label="Sack Rate" value={stats.passBlocks > 0 ? `${(stats.sacksAllowed / stats.passBlocks * 100).toFixed(1)}%` : '0.0%'} />
                    </>
                  )}
                  {/* Career summary */}
                  <div className="border-t border-[var(--border)] pt-1.5 mt-1.5">
                    <div className="text-[10px] font-bold text-[var(--text-sec)] mb-1">CAREER</div>
                    <StatLine label="Games" value={career.gamesPlayed} small />
                    {career.passAttempts > 0 && <StatLine label="Pass Yds" value={career.passYards.toLocaleString()} small />}
                    {career.rushAttempts > 0 && <StatLine label="Rush Yds" value={career.rushYards.toLocaleString()} small />}
                    {career.targets > 0 && <StatLine label="Rec Yds" value={career.receivingYards.toLocaleString()} small />}
                    {career.tackles > 0 && (
                      <>
                        <StatLine label="Tackles" value={career.tackles} small />
                        <StatLine label="TFL" value={career.tacklesForLoss} small />
                        <StatLine label="Sacks" value={career.sacks} small />
                      </>
                    )}
                    {player.position === 'OL' && career.passBlocks > 0 && (
                      <>
                        <StatLine label="Pass Blocks" value={career.passBlocks} small />
                        <StatLine label="Sacks Allowed" value={career.sacksAllowed} small />
                        <StatLine label="Sack Rate" value={`${(career.sacksAllowed / career.passBlocks * 100).toFixed(1)}%`} small />
                      </>
                    )}
                    {career.fieldGoalAttempts > 0 && (
                      <StatLine label="FG" value={`${career.fieldGoalsMade}/${career.fieldGoalAttempts} (${Math.round(career.fieldGoalsMade / career.fieldGoalAttempts * 100)}%)`} small />
                    )}
                    {career.puntAttempts > 0 && (
                      <StatLine label="Punt Avg" value={`${(career.puntYards / career.puntAttempts).toFixed(1)}`} small />
                    )}
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
            {/* Sparkline */}
            {(() => {
              const history = [...player.ratingHistory, { season: season, overall: player.ratings.overall }];
              if (history.length >= 2) {
                const overalls = history.map(h => h.overall);
                const minOvr = Math.min(...overalls);
                const maxOvr = Math.max(...overalls);
                const points = history.map((h, i) => {
                  const x = (i / Math.max(1, history.length - 1)) * 200;
                  const y = 48 - ((h.overall - minOvr) / Math.max(1, maxOvr - minOvr)) * 48;
                  return `${x},${y}`;
                }).join(' ');
                return (
                  <div className="flex justify-center pb-2">
                    <svg width={200} height={48}>
                      <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                );
              }
              return null;
            })()}
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

        {/* Awards */}
        {player.awards && player.awards.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xs font-bold text-[var(--text-sec)] uppercase tracking-wider mb-2">Awards</h3>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(
                player.awards.reduce((acc, a) => {
                  acc[a.award] = [...(acc[a.award] ?? []), a.season];
                  return acc;
                }, {} as Record<string, number[]>)
              ).map(([award, seasons]) => (
                <span
                  key={award}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-50 border border-amber-200 text-amber-700"
                  title={seasons.map(s => `S${s}`).join(', ')}
                >
                  {AWARD_ICONS[award] ?? '\u{1F3C5}'} {seasons.length > 1 ? `${seasons.length}x ` : ''}{award}
                </span>
              ))}
            </div>
          </div>
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
              {player.college && <> · {player.college}</>}
            </span>
          ) : (
            <span>Undrafted{player.college && <> · {player.college}</>}</span>
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
                    {['DL', 'LB'].includes(player.position) && <><th className="text-center pb-2">TKL</th><th className="text-center pb-2">TFL</th><th className="text-center pb-2">SCK</th><th className="text-center pb-2">INT</th></>}
                    {['CB', 'S'].includes(player.position) && <><th className="text-center pb-2">TKL</th><th className="text-center pb-2">TFL</th><th className="text-center pb-2">INT</th><th className="text-center pb-2">PD</th></>}
                    {['OL'].includes(player.position) && <><th className="text-center pb-2">PB</th><th className="text-center pb-2">SA</th><th className="text-center pb-2">SK%</th></>}
                    {['K'].includes(player.position) && <><th className="text-center pb-2">FGM</th><th className="text-center pb-2">FGA</th><th className="text-center pb-2">FG%</th></>}
                    {['P'].includes(player.position) && <><th className="text-center pb-2">Punts</th><th className="text-center pb-2">YDS</th><th className="text-center pb-2">Avg</th></>}
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
                        {['DL', 'LB'].includes(player.position) && <><td className="py-1.5 text-center">{s.tackles}</td><td className="py-1.5 text-center">{s.tacklesForLoss}</td><td className="py-1.5 text-center">{s.sacks}</td><td className="py-1.5 text-center">{s.defensiveINTs}</td></>}
                        {['CB', 'S'].includes(player.position) && <><td className="py-1.5 text-center">{s.tackles}</td><td className="py-1.5 text-center">{s.tacklesForLoss}</td><td className="py-1.5 text-center">{s.defensiveINTs}</td><td className="py-1.5 text-center">{s.passDeflections}</td></>}
                        {['OL'].includes(player.position) && <><td className="py-1.5 text-center">{s.passBlocks}</td><td className="py-1.5 text-center">{s.sacksAllowed}</td><td className="py-1.5 text-center">{s.passBlocks > 0 ? `${(s.sacksAllowed / s.passBlocks * 100).toFixed(1)}%` : '0.0%'}</td></>}
                        {['K'].includes(player.position) && <><td className="py-1.5 text-center">{s.fieldGoalsMade}</td><td className="py-1.5 text-center">{s.fieldGoalAttempts}</td><td className="py-1.5 text-center">{s.fieldGoalAttempts > 0 ? Math.round(s.fieldGoalsMade / s.fieldGoalAttempts * 100) : 0}%</td></>}
                        {['P'].includes(player.position) && <><td className="py-1.5 text-center">{s.puntAttempts}</td><td className="py-1.5 text-center font-mono">{s.puntYards.toLocaleString()}</td><td className="py-1.5 text-center">{s.puntAttempts > 0 ? (s.puntYards / s.puntAttempts).toFixed(1) : '0.0'}</td></>}
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

// ---------------------------------------------------------------------------
// God Mode: Player Editor
// ---------------------------------------------------------------------------

import type { Player, Team } from '@/types';
import { POSITIONS } from '@/types';
import { POSITION_WEIGHTS } from '@/lib/engine/playerGen';

// ---------------------------------------------------------------------------
// Restructure Contract Inline
// ---------------------------------------------------------------------------

function RestructureInline({
  player,
  season,
  onRestructure,
  onCancel,
}: {
  player: Player;
  season: number;
  onRestructure: (amount: number, voidYears: number) => void;
  onCancel: () => void;
}) {
  const baseSalary = player.contract.salary;
  const maxConvert = Math.max(1, Math.round((baseSalary - 0.75) * 10) / 10);
  const [amount, setAmount] = useState(Math.min(Math.round(baseSalary / 2 * 10) / 10, maxConvert));
  const [voidYears, setVoidYears] = useState(0);

  const newCapHit = Math.round((baseSalary - amount + amount / (player.contract.yearsLeft + voidYears)) * 10) / 10;
  const savings = Math.round((baseSalary - newCapHit) * 10) / 10;

  return (
    <div className="mt-2 border border-amber-300/40 rounded-lg bg-amber-50/50 p-3 space-y-2">
      <div className="text-sm font-bold text-amber-700">Restructure Contract</div>
      <p className="text-xs text-[var(--text-sec)]">
        Convert base salary to signing bonus, spreading the cap hit over remaining years.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-[var(--text-sec)] uppercase">Convert ($M)</label>
          <input
            type="number"
            className="w-full text-sm border rounded px-2 py-1"
            value={amount}
            min={0.5}
            max={maxConvert}
            step={0.5}
            onChange={e => setAmount(Math.min(parseFloat(e.target.value) || 0.5, maxConvert))}
          />
        </div>
        <div>
          <label className="text-[10px] text-[var(--text-sec)] uppercase">Void Years</label>
          <input
            type="number"
            className="w-full text-sm border rounded px-2 py-1"
            value={voidYears}
            min={0}
            max={3}
            onChange={e => setVoidYears(parseInt(e.target.value) || 0)}
          />
        </div>
      </div>
      <div className="text-xs space-y-0.5">
        <div>Current cap hit: <span className="font-mono font-bold">${baseSalary}M</span></div>
        <div>New cap hit: <span className="font-mono font-bold text-green-600">${newCapHit}M</span></div>
        <div className="text-green-600 font-medium">Saves ${savings}M this year</div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onRestructure(amount, voidYears)}>
          Restructure
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

const ALL_RATING_KEYS: (keyof Omit<PlayerRatings, 'overall'>)[] = [
  'speed', 'strength', 'agility', 'awareness', 'stamina',
  'throwing', 'catching', 'carrying', 'blocking',
  'tackling', 'coverage', 'passRush', 'kicking',
];

function PlayerEditor({
  player,
  teams,
  onSave,
  onCancel,
}: {
  player: Player;
  teams: Team[];
  onSave: (updates: Partial<Player>) => void;
  onCancel: () => void;
}) {
  const [firstName, setFirstName] = useState(player.firstName);
  const [lastName, setLastName] = useState(player.lastName);
  const [position, setPosition] = useState<Position>(player.position);
  const [age, setAge] = useState(player.age);
  const [potential, setPotential] = useState(player.potential);
  const [salary, setSalary] = useState(player.contract.salary);
  const [yearsLeft, setYearsLeft] = useState(player.contract.yearsLeft);
  const [ratings, setRatings] = useState({ ...player.ratings });
  const [ovrOverride, setOvrOverride] = useState<number | null>(null);
  const [teamId, setTeamId] = useState<string | null>(player.teamId);

  const relevantRatings = POSITION_RELEVANT_RATINGS[position] ?? [];

  // Auto-recalculate OVR preview from current ratings + position
  // Uses same formula as the store
  const autoOvr = (() => {
    const weights = POSITION_WEIGHTS[position] ?? {};
    const allKeys: (keyof Omit<PlayerRatings, 'overall'>)[] = [
      'speed', 'strength', 'agility', 'awareness', 'stamina',
      'throwing', 'catching', 'carrying', 'blocking',
      'tackling', 'coverage', 'passRush', 'kicking',
    ];
    const weightedSum = allKeys.reduce((sum, key) => {
      const w = (weights[key] ?? 0) || 0.2;
      return sum + ratings[key] * w;
    }, 0);
    const totalWeight = allKeys.reduce((sum, key) => sum + ((weights[key] ?? 0) || 0.2), 0);
    return Math.max(20, Math.min(99, Math.round(weightedSum / totalWeight)));
  })();

  const displayOvr = ovrOverride ?? autoOvr;

  function handleSave() {
    // Build final ratings: merge edited ratings with the OVR value
    const finalRatings = { ...ratings, overall: displayOvr };
    onSave({
      firstName, lastName, position, age,
      potential,
      ratings: finalRatings,
      teamId,
      contract: { ...player.contract, salary, yearsLeft },
    });
  }

  return (
    <div className="mt-3 border border-yellow-400/40 rounded-lg bg-yellow-50/50 p-3 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-bold text-yellow-700">Edit Player</span>
      </div>

      {/* Name */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-[var(--text-sec)] uppercase">First Name</label>
          <input className="w-full text-sm border rounded px-2 py-1" value={firstName} onChange={e => setFirstName(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] text-[var(--text-sec)] uppercase">Last Name</label>
          <input className="w-full text-sm border rounded px-2 py-1" value={lastName} onChange={e => setLastName(e.target.value)} />
        </div>
      </div>

      {/* Position, Age, Team */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] text-[var(--text-sec)] uppercase">Position</label>
          <select className="w-full text-sm border rounded px-2 py-1" value={position} onChange={e => setPosition(e.target.value as Position)}>
            {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-[var(--text-sec)] uppercase">Age</label>
          <input type="number" className="w-full text-sm border rounded px-2 py-1" value={age} min={18} max={50} onChange={e => setAge(parseInt(e.target.value) || 22)} />
        </div>
        <div>
          <label className="text-[10px] text-[var(--text-sec)] uppercase">Team</label>
          <select className="w-full text-sm border rounded px-1 py-1 text-xs" value={teamId ?? ''} onChange={e => setTeamId(e.target.value || null)}>
            <option value="">Free Agent</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.abbreviation}</option>)}
          </select>
        </div>
      </div>

      {/* OVR, POT, Contract */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <label className="text-[10px] text-[var(--text-sec)] uppercase">OVR</label>
          <input type="number" className="w-full text-sm border rounded px-2 py-1 font-bold" value={displayOvr} min={30} max={99} onChange={e => setOvrOverride(parseInt(e.target.value) || 50)} />
        </div>
        <div>
          <label className="text-[10px] text-[var(--text-sec)] uppercase">POT</label>
          <input type="number" className="w-full text-sm border rounded px-2 py-1" value={potential} min={30} max={99} onChange={e => setPotential(parseInt(e.target.value) || 60)} />
        </div>
        <div>
          <label className="text-[10px] text-[var(--text-sec)] uppercase">Salary ($M)</label>
          <input type="number" className="w-full text-sm border rounded px-2 py-1" value={salary} min={0} step={0.1} onChange={e => setSalary(parseFloat(e.target.value) || 0.75)} />
        </div>
        <div>
          <label className="text-[10px] text-[var(--text-sec)] uppercase">Years</label>
          <input type="number" className="w-full text-sm border rounded px-2 py-1" value={yearsLeft} min={0} max={8} onChange={e => setYearsLeft(parseInt(e.target.value) || 1)} />
        </div>
      </div>

      {/* Ratings — all 13, with primary ones highlighted */}
      <div>
        <label className="text-[10px] text-[var(--text-sec)] uppercase mb-1 block">Ratings</label>
        {/* Single column on mobile so the slider has room to grab; two
            columns once we hit `sm` (640px). Min-width:0 on the row lets
            the flex children shrink properly inside the grid track. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
          {([...relevantRatings, ...ALL_RATING_KEYS.filter(k => !relevantRatings.includes(k))] as (keyof Omit<PlayerRatings, 'overall'>)[]).map(key => (
            <div key={key} className={`flex items-center gap-2 min-w-0 ${relevantRatings.includes(key) ? '' : 'opacity-50'}`}>
              <span className="text-xs text-[var(--text-sec)] w-16 shrink-0">{RATING_LABELS[key]}</span>
              <input
                type="range"
                min={20} max={99}
                value={ratings[key]}
                onChange={e => { setRatings(r => ({ ...r, [key]: parseInt(e.target.value) })); setOvrOverride(null); }}
                className="flex-1 min-w-0 accent-yellow-500 h-2"
              />
              <span className="text-xs font-mono w-6 text-right shrink-0">{ratings[key]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={handleSave} className="bg-yellow-500 hover:bg-yellow-600 text-white">
          Save Changes
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
