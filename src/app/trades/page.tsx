'use client';

import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useGameStore } from '@/lib/engine/store';
import { PlayerModal } from '@/components/game/PlayerModal';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { TeamRosterModal } from '@/components/game/TeamRosterModal';
import type { Player, DraftPick, Position } from '@/types';
import { POSITIONS, getUnamortizedBonus } from '@/types';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { TeamQuickNav } from '@/components/game/TeamQuickNav';
import { calculateSchemeFit, schemeFitDot, schemeFitColor } from '@/lib/engine/coaching';

function ratingColor(val: number): string {
  if (val >= 80) return 'text-green-600';
  if (val >= 65) return 'text-blue-600';
  if (val >= 50) return 'text-amber-600';
  return 'text-red-600';
}

function statLine(p: Player): string {
  const s = p.stats;
  if (s.gamesPlayed === 0) return '';
  switch (p.position) {
    case 'QB': return `${s.passYards} YDS · ${s.passTDs} TD · ${s.interceptions} INT`;
    case 'RB': return `${s.rushYards} YDS · ${s.rushTDs} TD`;
    case 'WR': case 'TE': return `${s.receptions} REC · ${s.receivingYards} YDS · ${s.receivingTDs} TD`;
    case 'DL': case 'LB': return `${s.tackles} TKL · ${s.sacks.toFixed(1)} SCK`;
    case 'CB': case 'S': return `${s.tackles} TKL · ${s.defensiveINTs} INT`;
    case 'K': return `${s.fieldGoalsMade}/${s.fieldGoalAttempts} FG`;
    default: return `${s.gamesPlayed} GP`;
  }
}

const POSITION_VALUE_MULT: Record<string, number> = {
  QB: 1.3, RB: 0.9, WR: 1.05, TE: 0.85, OL: 1.05,
  DL: 1.1, LB: 1.0, CB: 1.1, S: 0.95, K: 0.15, P: 0.10,
};

function playerTradeValue(player: Player): number {
  const ageMultiplier =
    player.age <= 25 ? 1.3 :
    player.age <= 27 ? 1.15 :
    player.age <= 29 ? 1.0 :
    player.age <= 31 ? 0.85 :
    player.age <= 33 ? 0.65 : 0.45;
  const posMultiplier = POSITION_VALUE_MULT[player.position] ?? 1.0;
  const normalized = Math.max(0, (player.ratings.overall - 40) / 55);
  const base = Math.pow(normalized, 2.5) * 1200;
  const potBonus = Math.max(0, player.potential - player.ratings.overall) * 3;
  const rawValue = (base + potBonus) * ageMultiplier * posMultiplier;
  // Light contract burden: only penalize expensive + long deals
  const contractCost = Math.max(0, player.contract.salary - 8) * player.contract.yearsLeft * 0.8;
  return Math.round(rawValue - contractCost);
}

const PICK_VALUES = [150, 90, 55, 35, 20, 10, 5];
function pickTradeValue(pick: DraftPick): number {
  return PICK_VALUES[(pick.round - 1)] ?? 5;
}

function getTeamStrategy(team: { record: { wins: number; losses: number }; totalPayroll: number; salaryCap: number }, roster: { age: number }[]): string {
  const total = team.record.wins + team.record.losses;
  const winPct = total > 0 ? team.record.wins / total : 0.5;
  const avgAge = roster.length > 0 ? roster.reduce((s, p) => s + p.age, 0) / roster.length : 26;
  const capPct = team.totalPayroll / team.salaryCap;

  if (winPct < 0.35) return 'Rebuilding';
  if (winPct >= 0.6 && capPct > 0.9) return 'Win Now';
  if (winPct >= 0.5 && avgAge < 26) return 'Developing';
  if (winPct >= 0.5) return 'Contending';
  if (avgAge < 26) return 'Developing';
  return 'Rebuilding';
}

function StrategyBadge({ label }: { label: string }) {
  const color = label === 'Win Now' ? 'text-red-600' : label === 'Contending' ? 'text-green-600' : label === 'Developing' ? 'text-blue-600' : 'text-[var(--text-sec)]';
  return <span className={`text-[10px] font-medium ${color}`}>{label}</span>;
}

function ValueAssessmentBadge({ assessment }: { assessment: string }) {
  if (assessment === 'fair') return <Badge variant="green">Fair</Badge>;
  if (assessment === 'lopsided-you-win') return <Badge variant="blue">You Win</Badge>;
  return <Badge variant="red">They Win</Badge>;
}

// ---------------------------------------------------------------------------
// Trade Finder — scans AI rosters for tradeable players
// ---------------------------------------------------------------------------

interface TradeablePlayer {
  player: Player;
  teamId: string;
  tradeValue: number;
  estimatedCost: string; // human-readable
  whyAvailable: string[]; // tags for why this player might be available
}

function findTradeablePlayers(
  players: Player[],
  teams: { id: string; abbreviation: string }[],
  userTeamId: string | null,
): TradeablePlayer[] {
  const all: TradeablePlayer[] = [];

  for (const team of teams) {
    if (team.id === userTeamId) continue;

    const roster = players
      .filter(p => p.teamId === team.id && !p.retired)
      .sort((a, b) => b.ratings.overall - a.ratings.overall);

    if (roster.length === 0) continue;

    // Top 3 players by OVR are untouchable
    const top3Ids = new Set(roster.slice(0, 3).map(p => p.id));

    // Group by position to find depth surplus
    const byPos = new Map<string, Player[]>();
    for (const p of roster) {
      const list = byPos.get(p.position) ?? [];
      list.push(p);
      byPos.set(p.position, list);
    }

    // Team strategy for "why available" tags
    const fullTeam = teams.find(t => t.id === team.id) as any;
    const strategy = fullTeam?.record ? getTeamStrategy(fullTeam, roster) : 'Developing';

    for (const p of roster) {
      // Skip top 3
      if (top3Ids.has(p.id)) continue;

      // Skip K/P — almost never worth trading for
      if (p.position === 'K' || p.position === 'P') continue;

      // Skip very low value players
      const tv = playerTradeValue(p);
      if (tv < 30) continue;

      // Determine if this position has depth surplus (>= 2 at position above them)
      const posPlayers = byPos.get(p.position) ?? [];
      const betterAtPos = posPlayers.filter(pp => pp.ratings.overall > p.ratings.overall).length;
      const isDepthSurplus = betterAtPos >= 2;

      // Only include players that are NOT the #1 at their position (unless surplus)
      const isStarter = betterAtPos === 0;
      if (isStarter && !isDepthSurplus) continue;

      // Estimate cost in human-readable terms
      let estimatedCost: string;
      if (tv >= 120) estimatedCost = '1st + player';
      else if (tv >= 90) estimatedCost = '1st round pick';
      else if (tv >= 55) estimatedCost = '2nd round pick';
      else if (tv >= 35) estimatedCost = '3rd-4th round pick';
      else estimatedCost = 'Late round pick';

      // "Why available?" tags
      const whyAvailable: string[] = [];
      if (isDepthSurplus) whyAvailable.push('Depth surplus');
      if (strategy === 'Rebuilding') whyAvailable.push('Rebuilding');
      if (p.contract.yearsLeft <= 1) whyAvailable.push('Expiring');
      if (p.contract.salary > 15 && fullTeam?.totalPayroll > fullTeam?.salaryCap * 0.9) whyAvailable.push('Cap dump');

      all.push({ player: p, teamId: team.id, tradeValue: tv, estimatedCost, whyAvailable });
    }
  }

  // Sort by trade value descending
  all.sort((a, b) => b.tradeValue - a.tradeValue);
  return all;
}

// ---------------------------------------------------------------------------
// Trade Recommendations — AI-suggested trades based on user needs
// ---------------------------------------------------------------------------

interface TradeRecommendation {
  target: Player;
  targetTeamId: string;
  why: string;
  estimatedCostLabel: string;
  suggestedSendPlayerIds: string[];
  suggestedSendPickIds: string[];
  score: number;
}

function generateRecommendedTrades(
  allTradeable: TradeablePlayer[],
  userRoster: Player[],
  userTeam: any, // full team object
  weakPositions: string[],
  players: Player[],
): TradeRecommendation[] {
  if (!userTeam || weakPositions.length === 0) return [];

  const recommendations: TradeRecommendation[] = [];
  const usedPositions = new Map<string, number>(); // track per-position count

  for (const tp of allTradeable) {
    const pos = tp.player.position;
    const isNeed = weakPositions.includes(pos);
    if (!isNeed) continue;

    // Max 2 per position for diversity
    const posCount = usedPositions.get(pos) ?? 0;
    if (posCount >= 2) continue;

    // Score: OVR base + scheme fit + age bonus - salary penalty
    const schemeFit = calculateSchemeFit(tp.player, userTeam);
    const schemeFitBonus = schemeFit === 'great' ? 20 : schemeFit === 'poor' ? -10 : 0;
    const ageBonus = tp.player.age <= 26 ? 15 : tp.player.age >= 31 ? -10 : 0;
    const salaryPenalty = Math.max(0, tp.player.contract.salary - 10) * 1.5;
    const score = tp.player.ratings.overall * 1.5 + schemeFitBonus + ageBonus - salaryPenalty;

    // Build "WHY" reason
    const needRank = weakPositions.indexOf(pos) + 1;
    const reasons: string[] = [];
    reasons.push(`Your #${needRank} need is ${pos}`);
    if (schemeFit === 'great') reasons.push('fits your scheme');
    if (tp.player.age <= 26) reasons.push('young and developing');
    else if (tp.player.contract.yearsLeft <= 1) reasons.push('expiring deal');

    const targetTeamRoster = players.filter(p => p.teamId === tp.teamId && !p.retired);
    const targetFullTeam = { record: (userTeam as any), ...tp } as any;
    // Check if selling team is rebuilding
    const sellerTeam = useGameStore.getState().teams.find(t => t.id === tp.teamId);
    if (sellerTeam) {
      const sellerStrategy = getTeamStrategy(sellerTeam, targetTeamRoster);
      if (sellerStrategy === 'Rebuilding') reasons.push('seller is rebuilding');
    }

    // Suggest trade package from user's assets
    const suggestedSendPlayerIds: string[] = [];
    const suggestedSendPickIds: string[] = [];
    const tv = tp.tradeValue;

    // Map estimated cost to user's actual picks
    const availablePicks = userTeam.draftPicks
      .filter((pk: any) => pk.year >= useGameStore.getState().season && !pk.playerId)
      .sort((a: any, b: any) => a.round - b.round);

    if (tv >= 120 && availablePicks.length > 0) {
      // 1st + player: find a low-OVR bench player at a surplus position
      const firstRound = availablePicks.find((pk: any) => pk.round === 1);
      if (firstRound) suggestedSendPickIds.push(firstRound.id);
      // Find a low-value bench player to sweeten
      const surplusPlayer = userRoster
        .filter(p => !weakPositions.includes(p.position) && p.ratings.overall < 70)
        .sort((a, b) => a.ratings.overall - b.ratings.overall)[0];
      if (surplusPlayer) suggestedSendPlayerIds.push(surplusPlayer.id);
    } else if (tv >= 90) {
      const firstRound = availablePicks.find((pk: any) => pk.round === 1);
      if (firstRound) suggestedSendPickIds.push(firstRound.id);
    } else if (tv >= 55) {
      const secondRound = availablePicks.find((pk: any) => pk.round === 2);
      if (secondRound) suggestedSendPickIds.push(secondRound.id);
      else if (availablePicks.length > 0) suggestedSendPickIds.push(availablePicks[0].id);
    } else if (tv >= 35) {
      const midRound = availablePicks.find((pk: any) => pk.round >= 3 && pk.round <= 4);
      if (midRound) suggestedSendPickIds.push(midRound.id);
      else if (availablePicks.length > 0) suggestedSendPickIds.push(availablePicks[availablePicks.length - 1].id);
    } else {
      const lateRound = availablePicks.find((pk: any) => pk.round >= 5);
      if (lateRound) suggestedSendPickIds.push(lateRound.id);
      else if (availablePicks.length > 0) suggestedSendPickIds.push(availablePicks[availablePicks.length - 1].id);
    }

    recommendations.push({
      target: tp.player,
      targetTeamId: tp.teamId,
      why: reasons.join(' · '),
      estimatedCostLabel: tp.estimatedCost,
      suggestedSendPlayerIds,
      suggestedSendPickIds,
      score,
    });

    usedPositions.set(pos, posCount + 1);
  }

  // Sort by score, take top 5
  return recommendations.sort((a, b) => b.score - a.score).slice(0, 5);
}

type SortOption = 'value' | 'ovr' | 'fit' | 'cheapest' | 'youngest';

function TradeFinderContent({
  players,
  teams,
  userTeamId,
  isTradeOpen,
  phase,
  week,
  season,
  tradeDeadlineWeek,
  onPlayerClick,
  onTeamClick,
  onProposeTrade,
}: {
  players: Player[];
  teams: { id: string; name: string; city: string; abbreviation: string; primaryColor: string; secondaryColor: string; record: { wins: number; losses: number }; totalPayroll: number; salaryCap: number; draftPicks: DraftPick[] }[];
  userTeamId: string | null;
  isTradeOpen: boolean;
  phase: string;
  week: number;
  season: number;
  tradeDeadlineWeek: number;
  onPlayerClick: (id: string) => void;
  onTeamClick: (id: string) => void;
  onProposeTrade: (teamId: string, playerIds: string[], sendPlayerIds?: string[], sendPickIds?: string[]) => void;
}) {
  // Get full user team for scheme fit calculation
  const fullUserTeam = useGameStore.getState().teams.find(t => t.id === userTeamId);

  // Find user's top 4 weakest positions
  const userRoster = players.filter(p => p.teamId === userTeamId && !p.retired);
  const ROSTER_MIN: Record<string, number> = { QB: 2, RB: 2, WR: 3, TE: 2, OL: 5, DL: 4, LB: 3, CB: 3, S: 2, K: 1, P: 1 };
  const posNeeds: { pos: string; urgency: number }[] = [];
  for (const pos of POSITIONS) {
    const atPos = userRoster.filter(p => p.position === pos).sort((a, b) => b.ratings.overall - a.ratings.overall);
    const bestOvr = atPos[0]?.ratings.overall ?? 0;
    const count = atPos.length;
    const minCount = ROSTER_MIN[pos] ?? 2;
    let urgency = 0;
    if (count === 0) urgency = 100;
    else if (count < minCount) urgency = 80 + (minCount - count) * 5;
    else if (bestOvr < 70) urgency = 70 - bestOvr;
    if (urgency > 0) posNeeds.push({ pos, urgency });
  }
  const weakPositions = posNeeds.sort((a, b) => b.urgency - a.urgency).slice(0, 4).map(n => n.pos);

  const defaultPos = weakPositions[0] as Position | undefined;
  const [posFilter, setPosFilter] = useState<Position | ''>(defaultPos ?? '');
  const [sortBy, setSortBy] = useState<SortOption>('value');
  const [browseLimit, setBrowseLimit] = useState(25);

  if (!isTradeOpen) {
    return (
      <Card>
        <div className="text-center py-8 text-[var(--text-sec)]">
          <p className="font-semibold">Trade window is closed.</p>
          <p className="text-sm mt-1">The Trade Finder is available when trades are open.</p>
        </div>
      </Card>
    );
  }

  const userTeam = teams.find(t => t.id === userTeamId);
  const allTradeable = findTradeablePlayers(players, teams, userTeamId);

  // Generate recommended trades
  const recommendations = fullUserTeam
    ? generateRecommendedTrades(allTradeable, userRoster, fullUserTeam, weakPositions, players)
    : [];

  // Filter & sort for browse
  let browsePlayers = posFilter
    ? allTradeable.filter(t => t.player.position === posFilter)
    : [...allTradeable];

  // Sort
  if (sortBy === 'ovr') browsePlayers.sort((a, b) => b.player.ratings.overall - a.player.ratings.overall);
  else if (sortBy === 'fit' && fullUserTeam) {
    const fitOrder = { great: 0, neutral: 1, poor: 2 } as const;
    browsePlayers.sort((a, b) => {
      const fa = fitOrder[calculateSchemeFit(a.player, fullUserTeam)];
      const fb = fitOrder[calculateSchemeFit(b.player, fullUserTeam)];
      return fa - fb || b.tradeValue - a.tradeValue;
    });
  } else if (sortBy === 'cheapest') browsePlayers.sort((a, b) => a.player.contract.salary - b.player.contract.salary);
  else if (sortBy === 'youngest') browsePlayers.sort((a, b) => a.player.age - b.player.age);
  // 'value' is already the default sort from findTradeablePlayers

  const displayPlayers = browsePlayers.slice(0, browseLimit);

  // Cap space
  const capSpace = userTeam ? userTeam.salaryCap - userTeam.totalPayroll : 0;
  const userPicks = userTeam?.draftPicks.filter(pk => pk.year === season && !pk.playerId) ?? [];

  return (
    <div className="space-y-6">
      {/* ── YOUR SITUATION ── */}
      <Card>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              {userTeam && (
                <TeamLogo abbreviation={userTeam.abbreviation} primaryColor={userTeam.primaryColor} secondaryColor={userTeam.secondaryColor} size="sm" />
              )}
              <div>
                <h3 className="font-bold text-sm">{userTeam?.city} {userTeam?.name}</h3>
                <span className="text-xs text-[var(--text-sec)]">
                  {userTeam?.record.wins}-{userTeam?.record.losses}
                  {phase === 'regular' && ` · Week ${week}`}
                </span>
              </div>
            </div>
            {weakPositions.length > 0 && (
              <div className="flex items-center gap-1.5 mt-2">
                <span className="text-[10px] font-bold text-[var(--text-sec)] uppercase">Needs:</span>
                {weakPositions.map(pos => (
                  <Badge key={pos} size="sm" variant="amber">{pos}</Badge>
                ))}
              </div>
            )}
          </div>
          <div className="text-right text-xs space-y-1">
            <div>
              <span className="text-[var(--text-sec)]">Cap Space: </span>
              <span className={`font-bold ${capSpace < 5 ? 'text-red-600' : capSpace < 15 ? 'text-amber-600' : 'text-green-600'}`}>
                ${Math.round(capSpace)}M
              </span>
            </div>
            <div>
              <span className="text-[var(--text-sec)]">Draft Picks: </span>
              <span className="font-medium">{userPicks.length > 0 ? userPicks.map(pk => `R${pk.round}`).join(', ') : 'None'}</span>
            </div>
            {phase === 'regular' && (
              <div>
                <span className="text-[var(--text-sec)]">Deadline: </span>
                <span className="font-medium">{Math.max(0, tradeDeadlineWeek + 1 - week)} week{tradeDeadlineWeek + 1 - week !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* ── RECOMMENDED TRADES ── */}
      {recommendations.length > 0 && (
        <div>
          <h3 className="text-sm font-bold uppercase text-[var(--text-sec)] mb-3">Recommended Trades</h3>
          <div className="space-y-3">
            {recommendations.map(rec => {
              const team = teams.find(t => t.id === rec.targetTeamId);
              if (!team) return null;
              const fit = fullUserTeam ? calculateSchemeFit(rec.target, fullUserTeam) : 'neutral';
              return (
                <Card key={rec.target.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge size="sm" variant="amber">{rec.target.position}</Badge>
                        <button
                          onClick={() => onPlayerClick(rec.target.id)}
                          className="font-bold text-sm hover:text-blue-600 transition-colors"
                        >
                          {rec.target.firstName} {rec.target.lastName}
                        </button>
                        <span className={`text-xs font-bold ${ratingColor(rec.target.ratings.overall)}`}>
                          {rec.target.ratings.overall} OVR
                        </span>
                        {fit !== 'neutral' && (
                          <span className={`text-[10px] ${schemeFitColor(fit)}`}>
                            {schemeFitDot(fit)}
                          </span>
                        )}
                        <span className="text-[10px] text-[var(--text-sec)]">{rec.target.age}y</span>
                        <span className="text-[10px] text-[var(--text-sec)]">${rec.target.contract.salary.toFixed(1)}M · {rec.target.contract.yearsLeft}yr</span>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <button
                          onClick={() => onTeamClick(rec.targetTeamId)}
                          className="text-[10px] text-[var(--text-sec)] hover:text-blue-600 transition-colors"
                        >
                          {team.abbreviation}
                        </button>
                        <span className="text-[10px] text-[var(--text-sec)]">·</span>
                        <span className="text-[10px] text-[var(--text-sec)]">Est. cost: {rec.estimatedCostLabel}</span>
                      </div>
                      <p className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded inline-block">
                        {rec.why}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => onProposeTrade(
                        rec.targetTeamId,
                        [rec.target.id],
                        rec.suggestedSendPlayerIds,
                        rec.suggestedSendPickIds,
                      )}
                    >
                      Propose Trade
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ── BROWSE ALL ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold uppercase text-[var(--text-sec)]">Browse Players</h3>
          <div className="flex items-center gap-2">
            <select
              value={posFilter}
              onChange={e => { setPosFilter(e.target.value as Position | ''); setBrowseLimit(25); }}
              className="px-2 py-1 text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-lg"
            >
              <option value="">All Positions</option>
              {POSITIONS.map(pos => (
                <option key={pos} value={pos}>{pos}{weakPositions.includes(pos) ? ' (need)' : ''}</option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortOption)}
              className="px-2 py-1 text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-lg"
            >
              <option value="value">Best Value</option>
              <option value="ovr">Best OVR</option>
              <option value="fit">Best Scheme Fit</option>
              <option value="cheapest">Cheapest</option>
              <option value="youngest">Youngest</option>
            </select>
          </div>
        </div>

        <Card>
          {/* Header row */}
          <div className="flex items-center gap-2 py-1 px-2 text-[10px] font-bold text-[var(--text-sec)] uppercase border-b border-[var(--border)] mb-1">
            <span className="w-8">Pos</span>
            <span className="flex-1">Player</span>
            <span className="w-10 text-right">OVR</span>
            <span className="w-6 text-center">Fit</span>
            <span className="w-8 text-right">Age</span>
            <span className="w-24 text-right">Contract</span>
            <span className="w-16 text-right">Cost</span>
            <span className="w-24 text-right">Team</span>
            <span className="w-24"></span>
          </div>

          <div className="space-y-0">
            {displayPlayers.map(tp => {
              const isNeed = weakPositions.includes(tp.player.position);
              const team = teams.find(t => t.id === tp.teamId);
              const fit = fullUserTeam ? calculateSchemeFit(tp.player, fullUserTeam) : 'neutral';
              return (
                <div key={tp.player.id} className={`flex items-center gap-2 py-1.5 px-2 rounded hover:bg-[var(--surface-2)] ${isNeed ? 'bg-amber-50/50' : ''}`}>
                  <Badge size="sm" variant={isNeed ? 'amber' : 'default'}>{tp.player.position}</Badge>
                  <button
                    onClick={() => onPlayerClick(tp.player.id)}
                    className="text-sm hover:text-blue-600 transition-colors flex-1 text-left truncate"
                  >
                    {tp.player.firstName} {tp.player.lastName}
                  </button>
                  <span className={`text-xs font-bold w-10 text-right ${ratingColor(tp.player.ratings.overall)}`}>
                    {tp.player.ratings.overall}
                  </span>
                  <span className="w-6 text-center text-[10px]">
                    {fit !== 'neutral' && (
                      <span className={schemeFitColor(fit)} title={fit === 'great' ? 'Great scheme fit' : 'Poor scheme fit'}>
                        {schemeFitDot(fit)}
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] text-[var(--text-sec)] w-8 text-right">{tp.player.age}y</span>
                  <span className="text-[10px] text-[var(--text-sec)] w-24 text-right">${tp.player.contract.salary.toFixed(1)}M · {tp.player.contract.yearsLeft}yr</span>
                  <span className="text-[10px] text-[var(--text-sec)] w-16 text-right">{tp.estimatedCost}</span>
                  <button
                    onClick={() => onTeamClick(tp.teamId)}
                    className="text-[10px] text-[var(--text-sec)] hover:text-blue-600 w-24 text-right truncate"
                  >
                    {team?.abbreviation}
                    {tp.whyAvailable.length > 0 && (
                      <span className="ml-1 text-[9px] text-amber-600">
                        {tp.whyAvailable[0]}
                      </span>
                    )}
                  </button>
                  <div className="w-24 flex justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onProposeTrade(tp.teamId, [tp.player.id])}
                      className="text-[10px] px-2 py-0.5"
                    >
                      Propose
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {browsePlayers.length > browseLimit && (
            <button
              onClick={() => setBrowseLimit(prev => prev + 25)}
              className="w-full text-center text-xs text-blue-600 hover:underline mt-3 py-2"
            >
              Show more ({browsePlayers.length - browseLimit} remaining)
            </button>
          )}

          {browsePlayers.length === 0 && (
            <div className="text-center py-8 text-[var(--text-sec)]">
              No tradeable players found{posFilter ? ` at ${posFilter}` : ''}.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function TradesPageWrapper() {
  return (
    <Suspense>
      <TradesPage />
    </Suspense>
  );
}

function TradesPage() {
  const router = useRouter();
  const fromDraftRef = useRef(false);
  const {
    phase, week, season, players, teams, userTeamId,
    draftOrder, tradeProposals, executeTrade, generateCounterOffer, respondToTradeProposal, rejectAllTradeProposals,
    solicitTradingBlockProposals, leagueSettings, tradeRumors,
  } = useGameStore();

  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [offeredPlayerIds, setOfferedPlayerIds] = useState<string[]>([]);
  const [offeredPickIds, setOfferedPickIds] = useState<string[]>([]);
  const [receivedPlayerIds, setReceivedPlayerIds] = useState<string[]>([]);
  const [receivedPickIds, setReceivedPickIds] = useState<string[]>([]);
  const [tradeResult, setTradeResult] = useState<'accepted' | 'rejected' | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'incoming' | 'propose' | 'block' | 'finder'>('incoming');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [viewTeamId, setViewTeamId] = useState<string | null>(null);

  // Counter-offer state
  const [counteringProposalId, setCounteringProposalId] = useState<string | null>(null);
  const [counterOfferedPlayerIds, setCounterOfferedPlayerIds] = useState<string[]>([]);
  const [counterOfferedPickIds, setCounterOfferedPickIds] = useState<string[]>([]);
  const [counterReceivedPlayerIds, setCounterReceivedPlayerIds] = useState<string[]>([]);
  const [counterReceivedPickIds, setCounterReceivedPickIds] = useState<string[]>([]);
  const [counterResult, setCounterResult] = useState<'accepted' | 'rejected' | null>(null);

  // Trading block state
  const [blockedPlayerIds, setBlockedPlayerIds] = useState<string[]>([]);
  const [blockedPickIds, setBlockedPickIds] = useState<string[]>([]);
  const [seekPositions, setSeekPositions] = useState<Position[]>([]);
  const [seekDraftPicks, setSeekDraftPicks] = useState(false);
  const [blockSolicited, setBlockSolicited] = useState(false);

  // Handle ?block=PLAYER_ID from roster page or ?counter=PROPOSAL_ID from popup
  const searchParams = useSearchParams();
  useEffect(() => {
    const blockPlayerId = searchParams.get('block');
    if (blockPlayerId) {
      setBlockedPlayerIds(prev => prev.includes(blockPlayerId) ? prev : [...prev, blockPlayerId]);
      setActiveTab('block');
    }
    const counterProposalId = searchParams.get('counter');
    if (counterProposalId) {
      const proposal = tradeProposals.find(p => p.id === counterProposalId && p.status === 'pending');
      if (proposal) {
        setActiveTab('incoming');
        handleStartCounter(counterProposalId);
      }
    }
    // Handle ?team=TEAM_ID&pick=PICK_ID from draft page (pre-populate trade for a specific pick)
    const teamParam = searchParams.get('team');
    const pickParam = searchParams.get('pick');
    const ownPick = searchParams.get('own') === '1'; // trading away our own pick
    if (pickParam) {
      if (ownPick) {
        // Trading away our own pick — pre-add to offered picks, no team pre-selected
        setOfferedPickIds(prev => prev.includes(pickParam) ? prev : [...prev, pickParam]);
      } else if (teamParam) {
        // Trading for another team's pick — pre-select team and add to received picks
        setSelectedTeamId(teamParam);
        setReceivedPickIds(prev => prev.includes(pickParam) ? prev : [...prev, pickParam]);
      }
      setActiveTab('propose');
    }
    if (searchParams.get('from') === 'draft') {
      fromDraftRef.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const userTeam = teams.find(t => t.id === userTeamId);
  const aiTeams = teams.filter(t => t.id !== userTeamId).sort((a, b) => a.abbreviation.localeCompare(b.abbreviation));
  const selectedAITeam = teams.find(t => t.id === selectedTeamId);

  // Compute pick number label (e.g., "#21") for current-year picks during/after draft ordering
  const pickNumberMap = useMemo(() => {
    const map = new Map<string, number>(); // pickId → overall pick number
    if (phase !== 'draft' || !draftOrder || draftOrder.length === 0) return map;
    const numTeams = teams.length;
    const totalPicks = numTeams * 7;
    // draftOrder contains remaining picks; already-drafted picks are gone
    // Reconstruct full order from all teams' draftPicks for current season
    const allPicks = teams.flatMap(t =>
      t.draftPicks.filter(pk => pk.year === season && !pk.playerId),
    );
    // Sort same way as store: by round, then by original team record (worst first)
    const teamRecords = new Map(teams.map(t => [t.id, t.record]));
    const winPct = (r: { wins: number; losses: number }) => r.wins + r.losses > 0 ? r.wins / (r.wins + r.losses) : 0;
    allPicks.sort((a, b) => {
      if (a.round !== b.round) return a.round - b.round;
      const aWp = winPct(teamRecords.get(a.originalTeamId) ?? { wins: 0, losses: 0 });
      const bWp = winPct(teamRecords.get(b.originalTeamId) ?? { wins: 0, losses: 0 });
      return aWp - bWp;
    });
    // Already-drafted picks offset
    const draftedCount = totalPicks - draftOrder.length;
    allPicks.forEach((pk, i) => {
      map.set(pk.id, draftedCount + i + 1);
    });
    return map;
  }, [phase, draftOrder, teams, season]);

  function pickLabel(pk: { id: string; year: number; round: number; originalTeamId: string; ownerTeamId: string }) {
    const num = pickNumberMap.get(pk.id);
    const origTeam = pk.originalTeamId !== pk.ownerTeamId ? teams.find(t => t.id === pk.originalTeamId) : null;
    const via = origTeam ? ` (via ${origTeam.abbreviation})` : '';
    if (num) return `${pk.year} Round ${pk.round}, Pick #${num}${via}`;
    return `${pk.year} Round ${pk.round}${via}`;
  }

  // Compute team average OVR (top 22 starters, like a real depth chart)
  function teamAvgOvr(teamId: string, addPlayerIds: string[] = [], removePlayerIds: string[] = []): number {
    const removeSet = new Set(removePlayerIds);
    const roster = players
      .filter(p => p.teamId === teamId && !p.retired && !removeSet.has(p.id))
      .concat(addPlayerIds.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[])
      .sort((a, b) => b.ratings.overall - a.ratings.overall)
      .slice(0, 22);
    if (roster.length === 0) return 0;
    return Math.round(roster.reduce((s, p) => s + p.ratings.overall, 0) / roster.length * 10) / 10;
  }

  const userRoster = players
    .filter(p => p.teamId === userTeamId && !p.retired)
    .sort((a, b) => b.ratings.overall - a.ratings.overall);

  const aiRoster = selectedAITeam
    ? players.filter(p => p.teamId === selectedAITeam.id && !p.retired)
        .sort((a, b) => b.ratings.overall - a.ratings.overall)
    : [];

  // Trades allowed during regular season (before deadline) and all offseason phases
  const offseasonPhases = ['resigning', 'draft', 'freeAgency', 'offseason', 'preseason'];
  const tradeDeadlineWeek = leagueSettings?.tradeDeadlineWeek ?? 12;
  // Trades stay open through the deadline week + 1 (close after simming the week after deadline)
  const isTradeOpen = offseasonPhases.includes(phase) || (phase === 'regular' && week <= tradeDeadlineWeek + 1);
  const userTeamObj = teams.find(t => t.id === userTeamId);
  const pendingProposals = tradeProposals.filter(p => {
    if (p.status !== 'pending') return false;
    // Expire proposals older than 3 weeks
    if (p.season === season && week - p.week > 3) return false;
    if (p.season < season) return false;
    // Hide stale proposals: requested players must still be on user's team
    const playersValid = p.requestedPlayerIds.every(pid => {
      const player = players.find(pl => pl.id === pid);
      return player && player.teamId === userTeamId;
    });
    // Requested picks must still be owned
    const picksValid = p.requestedPickIds.every(pkId =>
      userTeamObj?.draftPicks.some(pk => pk.id === pkId),
    );
    return playersValid && picksValid;
  });

  function togglePlayerSelect(
    playerId: string,
    list: string[],
    setter: (ids: string[]) => void,
  ) {
    if (list.includes(playerId)) setter(list.filter(id => id !== playerId));
    else setter([...list, playerId]);
  }

  function togglePickSelect(
    pickId: string,
    list: string[],
    setter: (ids: string[]) => void,
  ) {
    if (list.includes(pickId)) setter(list.filter(id => id !== pickId));
    else setter([...list, pickId]);
  }

  const offeredValue = offeredPlayerIds.reduce((sum, id) => {
    const p = players.find(pl => pl.id === id);
    return sum + (p ? playerTradeValue(p) : 0);
  }, 0) + offeredPickIds.reduce((sum, id) => {
    const pick = userTeam?.draftPicks.find(pk => pk.id === id);
    return sum + (pick ? pickTradeValue(pick) : 0);
  }, 0);

  const receivedValue = receivedPlayerIds.reduce((sum, id) => {
    const p = players.find(pl => pl.id === id);
    return sum + (p ? playerTradeValue(p) : 0);
  }, 0) + receivedPickIds.reduce((sum, id) => {
    const pick = selectedAITeam?.draftPicks.find(pk => pk.id === id);
    return sum + (pick ? pickTradeValue(pick) : 0);
  }, 0);

  const valueDiff = receivedValue - offeredValue;
  const valueLabel =
    Math.abs(valueDiff) < Math.max(offeredValue, receivedValue, 1) * 0.1 ? 'Fair trade' :
    valueDiff > 0 ? `You gain ~${Math.round(valueDiff).toLocaleString()} pts` :
    `You lose ~${Math.round(Math.abs(valueDiff)).toLocaleString()} pts`;

  function handleSendTrade() {
    if (!selectedTeamId) return;
    const result = executeTrade(
      offeredPlayerIds, offeredPickIds,
      receivedPlayerIds, receivedPickIds,
      selectedTeamId,
    );
    setTradeResult(result.success ? 'accepted' : 'rejected');
    setRejectionReason(result.reason ?? null);
    if (result.success) {
      setOfferedPlayerIds([]);
      setOfferedPickIds([]);
      setReceivedPlayerIds([]);
      setReceivedPickIds([]);
      // Auto-redirect back to draft page if trade was initiated from there
      if (fromDraftRef.current) {
        setTimeout(() => router.push('/draft'), 1500);
      }
    }
  }

  function handleWhatMakesThisWork() {
    if (!selectedTeamId) return;
    if (receivedPlayerIds.length === 0 && receivedPickIds.length === 0) return;
    const counter = generateCounterOffer(receivedPlayerIds, receivedPickIds, selectedTeamId);
    if (counter) {
      setOfferedPlayerIds(counter.sendPlayerIds);
      setOfferedPickIds(counter.sendPickIds);
      setTradeResult(null);
      setRejectionReason(null);
    } else {
      setRejectionReason('"We don\'t see a package that works. You may not have enough assets to acquire these players."');
    }
  }

  function handleStartCounter(proposalId: string) {
    const proposal = tradeProposals.find(p => p.id === proposalId);
    if (!proposal) return;
    setCounteringProposalId(proposalId);
    // Pre-fill: what user sends (requested in proposal) and what user receives (offered in proposal)
    setCounterOfferedPlayerIds([...proposal.requestedPlayerIds]);
    setCounterOfferedPickIds([...proposal.requestedPickIds]);
    setCounterReceivedPlayerIds([...proposal.offeredPlayerIds]);
    setCounterReceivedPickIds([...proposal.offeredPickIds]);
    setCounterResult(null);
  }

  function handleCancelCounter() {
    setCounteringProposalId(null);
    setCounterOfferedPlayerIds([]);
    setCounterOfferedPickIds([]);
    setCounterReceivedPlayerIds([]);
    setCounterReceivedPickIds([]);
    setCounterResult(null);
  }

  function handleSubmitCounter() {
    const proposal = tradeProposals.find(p => p.id === counteringProposalId);
    if (!proposal) return;
    const result = executeTrade(
      counterOfferedPlayerIds, counterOfferedPickIds,
      counterReceivedPlayerIds, counterReceivedPickIds,
      proposal.proposingTeamId,
    );
    setCounterResult(result.success ? 'accepted' : 'rejected');
    if (result.success) {
      // Reject the original proposal since we completed a counter
      respondToTradeProposal(proposal.id, false);
      handleCancelCounter();
    }
  }

  const counterTeam = counteringProposalId
    ? teams.find(t => t.id === tradeProposals.find(p => p.id === counteringProposalId)?.proposingTeamId)
    : null;
  const counterTeamRoster = counterTeam
    ? players.filter(p => p.teamId === counterTeam.id && !p.retired).sort((a, b) => b.ratings.overall - a.ratings.overall)
    : [];

  const counterOfferedValue = counterOfferedPlayerIds.reduce((sum, id) => {
    const p = players.find(pl => pl.id === id);
    return sum + (p ? playerTradeValue(p) : 0);
  }, 0) + counterOfferedPickIds.reduce((sum, id) => {
    const pick = userTeam?.draftPicks.find(pk => pk.id === id);
    return sum + (pick ? pickTradeValue(pick) : 0);
  }, 0);

  const counterReceivedValue = counterReceivedPlayerIds.reduce((sum, id) => {
    const p = players.find(pl => pl.id === id);
    return sum + (p ? playerTradeValue(p) : 0);
  }, 0) + counterReceivedPickIds.reduce((sum, id) => {
    const pick = counterTeam?.draftPicks.find(pk => pk.id === id);
    return sum + (pick ? pickTradeValue(pick) : 0);
  }, 0);

  const counterValueDiff = counterReceivedValue - counterOfferedValue;
  const counterValueLabel =
    Math.abs(counterValueDiff) < Math.max(counterOfferedValue, counterReceivedValue, 1) * 0.1 ? 'Fair trade' :
    counterValueDiff > 0 ? `You gain ~${Math.round(counterValueDiff).toLocaleString()} pts` :
    `You lose ~${Math.round(Math.abs(counterValueDiff)).toLocaleString()} pts`;

  function handleSolicitProposals() {
    solicitTradingBlockProposals(blockedPlayerIds, blockedPickIds, seekPositions, seekDraftPicks);
    setBlockSolicited(true);
  }

  return (
    <GameShell>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <TeamQuickNav currentPage="trades" />
            <h2 className="text-2xl font-black">Trade Center</h2>
          </div>
          <div className="text-sm text-[var(--text-sec)]">
            {isTradeOpen
              ? `Trade deadline: After Week ${tradeDeadlineWeek + 1} (${Math.max(0, tradeDeadlineWeek + 1 - week)} week${tradeDeadlineWeek + 1 - week !== 1 ? 's' : ''} left)`
              : phase === 'regular' ? 'Trade deadline has passed. Trading reopens during the draft.' : 'Trade window closed'}
          </div>
        </div>

        {/* Trade Rumors */}
        {(tradeRumors ?? []).length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Trade Rumors</CardTitle>
                {(() => {
                  const resolved = (tradeRumors ?? []).filter(r => r.resolved);
                  const accurate = resolved.filter(r => r.outcome === 'accurate').length;
                  return resolved.length > 0 ? (
                    <span className="text-xs text-[var(--text-sec)]">
                      Season Accuracy: {accurate}/{resolved.length} ({Math.round(accurate / resolved.length * 100)}%)
                    </span>
                  ) : null;
                })()}
              </div>
            </CardHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[...(tradeRumors ?? [])].reverse().slice(0, 6).map(rumor => {
                const rumorTeam = teams.find(t => t.id === rumor.teamId);
                const targetTeam = rumor.targetTeamId ? teams.find(t => t.id === rumor.targetTeamId) : null;
                const rumorPlayers = rumor.playerIds.map(id => players.find(p => p.id === id)).filter(Boolean);
                return (
                  <div key={rumor.id} className={`rounded-lg border px-3 py-2.5 ${
                    rumor.resolved
                      ? rumor.outcome === 'accurate' ? 'border-green-300 bg-green-50/50' : 'border-gray-200 bg-gray-50/50 opacity-60'
                      : rumor.type === 'deadline_buzz' ? 'border-orange-300 bg-orange-50/40' : 'border-[var(--border)] bg-[var(--surface)]'
                  }`}>
                    <div className="flex items-center gap-2 mb-1">
                      {rumorTeam && <TeamLogo abbreviation={rumorTeam.abbreviation} primaryColor={rumorTeam.primaryColor} secondaryColor={rumorTeam.secondaryColor} size="sm" />}
                      {targetTeam && <><span className="text-[10px] text-[var(--text-sec)]">&</span><TeamLogo abbreviation={targetTeam.abbreviation} primaryColor={targetTeam.primaryColor} secondaryColor={targetTeam.secondaryColor} size="sm" /></>}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-[var(--text-sec)]">Week {rumor.week}</div>
                      </div>
                      {rumor.type === 'deadline_buzz' && !rumor.resolved && <span className="text-[10px] font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded">HOT</span>}
                      {rumor.resolved && rumor.outcome === 'accurate' && <span className="text-[10px] font-bold text-green-600 bg-green-100 px-1.5 py-0.5 rounded">CONFIRMED</span>}
                      {rumor.resolved && rumor.outcome === 'false_alarm' && <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">COLD</span>}
                    </div>
                    <div className="text-sm font-semibold leading-tight">{rumor.headline}</div>
                    <div className="text-xs text-[var(--text-sec)] mt-1 leading-snug">{rumor.detail}</div>
                    {rumorPlayers.length > 0 && (
                      <div className="flex gap-1 mt-1.5">
                        {rumorPlayers.map(p => p && (
                          <button key={p.id} onClick={() => setSelectedPlayerId(p.id)} className="text-[10px] text-blue-600 hover:underline">
                            {p.firstName[0]}. {p.lastName} ({p.ratings.overall})
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-1 mb-6 w-fit">
          {(['incoming', 'block', 'propose', 'finder'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${
                activeTab === tab ? 'bg-blue-600 text-white' : 'text-[var(--text-sec)] hover:text-[var(--text)]'
              }`}
            >
              {tab === 'incoming' ? (
                <span>
                  Incoming Offers
                  {pendingProposals.length > 0 && (
                    <span className="ml-1.5 bg-red-600 text-white rounded-full px-1.5 text-[10px]">
                      {pendingProposals.length}
                    </span>
                  )}
                </span>
              ) : tab === 'block' ? 'Trading Block' : tab === 'finder' ? '🔍 Trade Finder' : 'Propose Trade'}
            </button>
          ))}
        </div>

        {/* ─── Incoming offers ─── */}
        {activeTab === 'incoming' && (
          <div className="space-y-4">
            {pendingProposals.length > 1 && (
              <div className="flex justify-end">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    if (!confirm(`Reject all ${pendingProposals.length} pending trade offers?`)) return;
                    rejectAllTradeProposals();
                  }}
                >
                  Reject All ({pendingProposals.length})
                </Button>
              </div>
            )}
            {pendingProposals.length === 0 ? (
              <Card>
                <div className="text-center py-12 text-[var(--text-sec)]">
                  <p>No incoming trade proposals.</p>
                  {isTradeOpen && (
                    <p className="text-sm mt-1">Use the Trading Block to solicit offers, or AI teams may propose trades during the season.</p>
                  )}
                </div>
              </Card>
            ) : (
              pendingProposals.map(proposal => {
                const proposingTeam = teams.find(t => t.id === proposal.proposingTeamId);
                const offPlayers = proposal.offeredPlayerIds.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];
                const reqPlayers = proposal.requestedPlayerIds.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];
                const offPicks = proposal.offeredPickIds.map(id =>
                  proposingTeam?.draftPicks.find(pk => pk.id === id),
                ).filter(Boolean) as DraftPick[];
                const reqPicks = proposal.requestedPickIds.map(id =>
                  userTeam?.draftPicks.find(pk => pk.id === id),
                ).filter(Boolean) as DraftPick[];

                // Compute starter-weighted OVR (top 22 starters, not full 53-man roster)
                // This makes trades of key players show meaningful OVR changes
                const starterOvr = (roster: Player[]) => {
                  if (roster.length === 0) return 60;
                  // Take top N at each position to approximate starters
                  const starterCounts: Record<string, number> = {
                    QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, DL: 3, LB: 3, CB: 2, S: 2, K: 0, P: 0,
                  };
                  const starters: Player[] = [];
                  for (const [pos, count] of Object.entries(starterCounts)) {
                    const atPos = roster.filter(p => p.position === pos).sort((a, b) => b.ratings.overall - a.ratings.overall);
                    starters.push(...atPos.slice(0, count));
                  }
                  if (starters.length === 0) return Math.round(roster.reduce((s, p) => s + p.ratings.overall, 0) / roster.length);
                  return Math.round(starters.reduce((s, p) => s + p.ratings.overall, 0) / starters.length);
                };

                const userRoster = players.filter(p => p.teamId === userTeamId && !p.retired);
                const currentUserOvr = starterOvr(userRoster);
                const afterUserRoster = [
                  ...userRoster.filter(p => !reqPlayers.find(rp => rp.id === p.id)),
                  ...offPlayers,
                ];
                const afterUserOvr = starterOvr(afterUserRoster);

                // Other team's OVR change
                const otherRoster = players.filter(p => p.teamId === proposal.proposingTeamId && !p.retired);
                const currentOtherOvr = starterOvr(otherRoster);
                const afterOtherRoster = [
                  ...otherRoster.filter(p => !offPlayers.find(op => op.id === p.id)),
                  ...reqPlayers,
                ];
                const afterOtherOvr = starterOvr(afterOtherRoster);

                const userOvrDelta = afterUserOvr - currentUserOvr;

                return (
                  <Card key={proposal.id}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => proposingTeam && setViewTeamId(proposingTeam.id)}
                          className="shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          {proposingTeam && <TeamLogo abbreviation={proposingTeam.abbreviation} primaryColor={proposingTeam.primaryColor} secondaryColor={proposingTeam.secondaryColor} size="sm" />}
                        </button>
                        <button onClick={() => proposingTeam && setViewTeamId(proposingTeam.id)} className="font-bold hover:text-blue-600 transition-colors">{proposingTeam?.city} {proposingTeam?.name}</button>
                        <span className="text-xs text-[var(--text-sec)]">Week {proposal.week}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                          userOvrDelta > 0 ? 'bg-green-100 text-green-600' :
                          userOvrDelta < 0 ? 'bg-red-100 text-red-600' :
                          'bg-amber-50 text-amber-600'
                        }`}>
                          Your OVR: {currentUserOvr} → {afterUserOvr}
                        </span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                          afterOtherOvr > currentOtherOvr ? 'bg-green-100 text-green-600' :
                          afterOtherOvr < currentOtherOvr ? 'bg-red-100 text-red-600' :
                          'bg-amber-50 text-amber-600'
                        }`}>
                          Their OVR: {currentOtherOvr} → {afterOtherOvr}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <div className="text-xs font-bold text-green-600 mb-2">You Receive</div>
                        {offPlayers.map(p => {
                          const stats = statLine(p);
                          return (
                            <div key={p.id} className="mb-1.5">
                              <div className="flex items-center gap-2">
                                <Badge size="sm">{p.position}</Badge>
                                <button onClick={() => setSelectedPlayerId(p.id)} className="text-sm hover:text-blue-600">
                                  {p.firstName} {p.lastName}
                                </button>
                                <span className={`text-xs font-bold ${ratingColor(p.ratings.overall)}`}>{p.ratings.overall} OVR</span>
                                <span className="text-[10px] text-[var(--text-sec)]">Age {p.age}</span>
                                <span className="text-[10px] text-[var(--text-sec)]">${p.contract.salary.toFixed(1)}M · {p.contract.yearsLeft}yr</span>
                              </div>
                              {stats && <div className="text-[10px] text-[var(--text-sec)] ml-7 mt-0.5">{stats}</div>}
                            </div>
                          );
                        })}
                        {offPicks.map(pk => (
                          <div key={pk.id} className="flex items-center gap-2 mb-1 text-sm">
                            <Badge size="sm" variant="default">Pick</Badge>
                            <span>{pickLabel(pk)}</span>
                          </div>
                        ))}
                        {offPlayers.length === 0 && offPicks.length === 0 && (
                          <span className="text-sm text-[var(--text-sec)]">Nothing</span>
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-red-600 mb-2">You Send</div>
                        {reqPlayers.map(p => {
                          const stats = statLine(p);
                          return (
                            <div key={p.id} className="mb-1.5">
                              <div className="flex items-center gap-2">
                                <Badge size="sm">{p.position}</Badge>
                                <button onClick={() => setSelectedPlayerId(p.id)} className="text-sm hover:text-blue-600">
                                  {p.firstName} {p.lastName}
                                </button>
                                <span className={`text-xs font-bold ${ratingColor(p.ratings.overall)}`}>{p.ratings.overall} OVR</span>
                                <span className="text-[10px] text-[var(--text-sec)]">Age {p.age}</span>
                                <span className="text-[10px] text-[var(--text-sec)]">${p.contract.salary.toFixed(1)}M · {p.contract.yearsLeft}yr</span>
                              </div>
                              {stats && <div className="text-[10px] text-[var(--text-sec)] ml-7 mt-0.5">{stats}</div>}
                            </div>
                          );
                        })}
                        {reqPicks.map(pk => (
                          <div key={pk.id} className="flex items-center gap-2 mb-1 text-sm">
                            <Badge size="sm" variant="default">Pick</Badge>
                            <span>{pickLabel(pk)}</span>
                          </div>
                        ))}
                        {reqPlayers.length === 0 && reqPicks.length === 0 && (
                          <span className="text-sm text-[var(--text-sec)]">Nothing</span>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          const success = respondToTradeProposal(proposal.id, true);
                          if (!success) alert('Trade failed — you may be over the salary cap or the players are no longer available.');
                        }}
                        disabled={!isTradeOpen}
                      >
                        Accept Trade
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleStartCounter(proposal.id)}
                        disabled={!isTradeOpen || counteringProposalId === proposal.id}
                      >
                        Counter
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => respondToTradeProposal(proposal.id, false)}
                      >
                        Reject
                      </Button>
                    </div>

                    {/* Counter-offer UI */}
                    {counteringProposalId === proposal.id && (
                      <div className="mt-4 pt-4 border-t border-[var(--border)]">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-bold">Counter Offer to {proposingTeam?.city} {proposingTeam?.name}</h3>
                          <Button size="sm" variant="ghost" onClick={handleCancelCounter}>Cancel</Button>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-4">
                          {/* Your offer */}
                          <div className="bg-[var(--surface-2)] rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-bold text-red-600 uppercase">You Send</span>
                              <span className="text-xs text-[var(--text-sec)]">{Math.round(counterOfferedValue)} pts</span>
                            </div>
                            <div className="text-xs font-bold text-[var(--text-sec)] uppercase mb-1">Players</div>
                            <div className="max-h-[250px] overflow-y-auto space-y-0 mb-2">
                              {userRoster.map(p => (
                                <label key={p.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-[var(--surface)] rounded px-1">
                                  <input
                                    type="checkbox"
                                    checked={counterOfferedPlayerIds.includes(p.id)}
                                    onChange={() => togglePlayerSelect(p.id, counterOfferedPlayerIds, setCounterOfferedPlayerIds)}
                                    className="accent-blue-500"
                                  />
                                  <Badge size="sm">{p.position}</Badge>
                                  <span className="text-xs flex-1 truncate">{p.firstName} {p.lastName}</span>
                                  <span className={`text-[10px] font-bold ${ratingColor(p.ratings.overall)}`}>{p.ratings.overall}</span>
                                </label>
                              ))}
                            </div>
                            {userTeam && userTeam.draftPicks.filter(pk => pk.year >= (useGameStore.getState().season) && !pk.playerId).length > 0 && (
                              <>
                                <div className="text-xs font-bold text-[var(--text-sec)] uppercase mb-1">Draft Picks</div>
                                {userTeam.draftPicks
                                  .filter(pk => pk.year >= (useGameStore.getState().season) && !pk.playerId)
                                  .sort((a, b) => a.year - b.year || a.round - b.round)
                                  .map(pk => (
                                  <label key={pk.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-[var(--surface)] rounded px-1">
                                    <input
                                      type="checkbox"
                                      checked={counterOfferedPickIds.includes(pk.id)}
                                      onChange={() => togglePickSelect(pk.id, counterOfferedPickIds, setCounterOfferedPickIds)}
                                      className="accent-blue-500"
                                    />
                                    <span className="text-xs flex-1">{pickLabel(pk)}</span>
                                    <span className="text-[10px] text-[var(--text-sec)]">~{Math.round(pickTradeValue(pk))}</span>
                                  </label>
                                ))}
                              </>
                            )}
                          </div>

                          {/* You receive */}
                          <div className="bg-[var(--surface-2)] rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-bold text-green-600 uppercase">You Receive</span>
                              <span className="text-xs text-[var(--text-sec)]">{Math.round(counterReceivedValue)} pts</span>
                            </div>
                            <div className="text-xs font-bold text-[var(--text-sec)] uppercase mb-1">Players</div>
                            <div className="max-h-[250px] overflow-y-auto space-y-0 mb-2">
                              {counterTeamRoster.map(p => (
                                <label key={p.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-[var(--surface)] rounded px-1">
                                  <input
                                    type="checkbox"
                                    checked={counterReceivedPlayerIds.includes(p.id)}
                                    onChange={() => togglePlayerSelect(p.id, counterReceivedPlayerIds, setCounterReceivedPlayerIds)}
                                    className="accent-blue-500"
                                  />
                                  <Badge size="sm">{p.position}</Badge>
                                  <span className="text-xs flex-1 truncate">{p.firstName} {p.lastName}</span>
                                  <span className={`text-[10px] font-bold ${ratingColor(p.ratings.overall)}`}>{p.ratings.overall}</span>
                                </label>
                              ))}
                            </div>
                            {counterTeam && counterTeam.draftPicks.filter(pk => pk.year >= (useGameStore.getState().season) && !pk.playerId).length > 0 && (
                              <>
                                <div className="text-xs font-bold text-[var(--text-sec)] uppercase mb-1">Draft Picks</div>
                                {counterTeam.draftPicks
                                  .filter(pk => pk.year >= (useGameStore.getState().season) && !pk.playerId)
                                  .sort((a, b) => a.year - b.year || a.round - b.round)
                                  .map(pk => (
                                  <label key={pk.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-[var(--surface)] rounded px-1">
                                    <input
                                      type="checkbox"
                                      checked={counterReceivedPickIds.includes(pk.id)}
                                      onChange={() => togglePickSelect(pk.id, counterReceivedPickIds, setCounterReceivedPickIds)}
                                      className="accent-blue-500"
                                    />
                                    <span className="text-xs flex-1">{pickLabel(pk)}</span>
                                    <span className="text-[10px] text-[var(--text-sec)]">~{Math.round(pickTradeValue(pk))}</span>
                                  </label>
                                ))}
                              </>
                            )}
                          </div>
                        </div>

                        {/* Counter summary */}
                        <div className="flex items-center justify-between bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
                          <div>
                            <div className="text-sm font-semibold">
                              Value: {Math.round(counterOfferedValue).toLocaleString()} → {Math.round(counterReceivedValue).toLocaleString()} pts
                              <span className={`ml-2 text-xs ${
                                Math.abs(counterValueDiff) < Math.max(counterOfferedValue, counterReceivedValue, 1) * 0.1 ? 'text-green-600' :
                                counterValueDiff > 0 ? 'text-blue-600' : 'text-amber-600'
                              }`}>
                                ({counterValueLabel})
                              </span>
                            </div>
                            {counterResult === 'rejected' && (
                              <p className="text-sm text-red-600 mt-1">Counter rejected — offer more value or adjust your asks.</p>
                            )}
                          </div>
                          <Button
                            size="sm"
                            onClick={handleSubmitCounter}
                            disabled={
                              (counterOfferedPlayerIds.length === 0 && counterOfferedPickIds.length === 0) &&
                              (counterReceivedPlayerIds.length === 0 && counterReceivedPickIds.length === 0)
                            }
                          >
                            Submit Counter
                          </Button>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })
            )}

            {/* Rejected/accepted history */}
            {tradeProposals.filter(p => p.status !== 'pending').length > 0 && (
              <details className="text-sm">
                <summary className="text-[var(--text-sec)] cursor-pointer py-2">
                  Past proposals ({tradeProposals.filter(p => p.status !== 'pending').length})
                </summary>
                <div className="space-y-2 mt-2">
                  {tradeProposals.filter(p => p.status !== 'pending').map(proposal => {
                    const t = teams.find(tm => tm.id === proposal.proposingTeamId);
                    return (
                      <div key={proposal.id} className="flex items-center gap-2 text-[var(--text-sec)] p-2 rounded border border-[var(--border)]">
                        <span>{proposal.status === 'accepted' ? '✅' : '❌'}</span>
                        <span>{t?.abbreviation} — Week {proposal.week}</span>
                        <Badge size="sm" variant={proposal.status === 'accepted' ? 'green' : 'default'}>
                          {proposal.status}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </details>
            )}
          </div>
        )}

        {/* ─── Trading Block ─── */}
        {activeTab === 'block' && (
          <div>
            {!isTradeOpen ? (
              <Card>
                <div className="text-center py-8 text-[var(--text-sec)]">
                  <p className="font-semibold">Trade window is closed.</p>
                  <p className="text-sm mt-1">Trades are allowed during Weeks 1-12 of the regular season.</p>
                </div>
              </Card>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-[var(--text-sec)]">
                  Select players and picks to put on the trading block, choose what you want in return, then ask for proposals.
                </p>

                <div className="grid grid-cols-[1fr_280px] gap-4">
                  {/* Left: Players + Picks to put on block */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Players &amp; Picks on the Block</CardTitle>
                      <span className="text-xs text-[var(--text-sec)]">
                        {blockedPlayerIds.length} player{blockedPlayerIds.length !== 1 ? 's' : ''},
                        {' '}{blockedPickIds.length} pick{blockedPickIds.length !== 1 ? 's' : ''}
                      </span>
                    </CardHeader>

                    <div className="mb-3">
                      <div className="text-xs font-bold text-[var(--text-sec)] uppercase mb-2">Players</div>
                      <div className="max-h-[400px] overflow-y-auto space-y-0">
                        {userRoster.map(p => (
                          <label key={p.id} className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-[var(--surface-2)] rounded px-1">
                            <input
                              type="checkbox"
                              checked={blockedPlayerIds.includes(p.id)}
                              onChange={() => togglePlayerSelect(p.id, blockedPlayerIds, setBlockedPlayerIds)}
                              className="accent-blue-500"
                            />
                            <Badge size="sm">{p.position}</Badge>
                            <span className="text-sm flex-1">{p.firstName} {p.lastName}</span>
                            <span className={`text-xs font-bold ${ratingColor(p.ratings.overall)}`}>{p.ratings.overall}</span>
                            <span className="text-xs text-[var(--text-sec)] w-10 text-right">{p.age}y</span>
                            <span className="text-xs text-[var(--text-sec)] w-14 text-right">${p.contract.salary}M</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {userTeam && userTeam.draftPicks.filter(pk => pk.year >= (useGameStore.getState().season) && !pk.playerId).length > 0 && (
                      <div>
                        <div className="text-xs font-bold text-[var(--text-sec)] uppercase mb-2">Draft Picks</div>
                        {userTeam.draftPicks
                          .filter(pk => pk.year >= (useGameStore.getState().season) && !pk.playerId)
                          .sort((a, b) => a.year - b.year || a.round - b.round)
                          .map(pk => (
                          <label key={pk.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-[var(--surface-2)] rounded px-1">
                            <input
                              type="checkbox"
                              checked={blockedPickIds.includes(pk.id)}
                              onChange={() => togglePickSelect(pk.id, blockedPickIds, setBlockedPickIds)}
                              className="accent-blue-500"
                            />
                            <span className="text-sm flex-1">{pickLabel(pk)}</span>
                            <span className="text-xs text-[var(--text-sec)]">~{Math.round(pickTradeValue(pk))} pts</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </Card>

                  {/* Right: Seek preferences + Submit */}
                  <div className="space-y-4">
                    <Card>
                      <CardHeader><CardTitle>Seeking in Return</CardTitle></CardHeader>
                      <p className="text-xs text-[var(--text-sec)] mb-3">
                        Select what you want back. AI teams will prioritize offering these.
                      </p>
                      <div className="text-xs font-bold text-[var(--text-sec)] uppercase mb-1">Positions</div>
                      <div className="grid grid-cols-3 gap-1 mb-3">
                        {POSITIONS.map(pos => (
                          <label key={pos} className="flex items-center gap-1.5 py-1 cursor-pointer hover:bg-[var(--surface-2)] rounded px-1">
                            <input
                              type="checkbox"
                              checked={seekPositions.includes(pos)}
                              onChange={() => {
                                if (seekPositions.includes(pos)) {
                                  setSeekPositions(seekPositions.filter(p => p !== pos));
                                } else {
                                  setSeekPositions([...seekPositions, pos]);
                                }
                              }}
                              className="accent-blue-500"
                            />
                            <span className="text-xs font-medium">{pos}</span>
                          </label>
                        ))}
                      </div>
                      <div className="border-t border-[var(--border)] pt-2">
                        <label className="flex items-center gap-1.5 py-1 cursor-pointer hover:bg-[var(--surface-2)] rounded px-1">
                          <input
                            type="checkbox"
                            checked={seekDraftPicks}
                            onChange={() => setSeekDraftPicks(!seekDraftPicks)}
                            className="accent-blue-500"
                          />
                          <span className="text-xs font-medium">Draft Picks</span>
                        </label>
                      </div>
                    </Card>

                    <Card>
                      <div className="text-center">
                        <div className="text-sm text-[var(--text-sec)] mb-3">
                          {blockedPlayerIds.length + blockedPickIds.length === 0
                            ? 'Select players or picks to put on the block'
                            : `${blockedPlayerIds.length + blockedPickIds.length} asset${blockedPlayerIds.length + blockedPickIds.length !== 1 ? 's' : ''} on the block`}
                        </div>
                        <Button
                          onClick={handleSolicitProposals}
                          disabled={blockedPlayerIds.length === 0 && blockedPickIds.length === 0}
                          className="w-full"
                        >
                          {blockSolicited ? 'Refresh Proposals' : 'Ask for Proposals'}
                        </Button>
                      </div>
                    </Card>
                  </div>
                </div>

              {/* ── Inline proposals from trading block ── */}
              {blockSolicited && (() => {
                const blockProposals = tradeProposals.filter(p => p.status === 'pending');
                return blockProposals.length > 0 ? (
                  <div className="mt-6 space-y-3">
                    <h3 className="text-lg font-bold">Proposals ({blockProposals.length})</h3>
                    {blockProposals.map(proposal => {
                      const proposingTeam = teams.find(t => t.id === proposal.proposingTeamId);
                      const offPlayers = proposal.offeredPlayerIds.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];
                      const offPicks = proposal.offeredPickIds.map(id =>
                        proposingTeam?.draftPicks.find(pk => pk.id === id),
                      ).filter(Boolean) as DraftPick[];
                      // OVR impact
                      const userOvrBefore = teamAvgOvr(userTeamId);
                      const userOvrAfter = teamAvgOvr(userTeamId, proposal.offeredPlayerIds, proposal.requestedPlayerIds);
                      const userDelta = Math.round((userOvrAfter - userOvrBefore) * 10) / 10;
                      const theirOvrBefore = proposingTeam ? teamAvgOvr(proposingTeam.id) : 0;
                      const theirOvrAfter = proposingTeam ? teamAvgOvr(proposingTeam.id, proposal.requestedPlayerIds, proposal.offeredPlayerIds) : 0;
                      const theirDelta = Math.round((theirOvrAfter - theirOvrBefore) * 10) / 10;
                      return (
                        <Card key={proposal.id}>
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge size="sm">{proposingTeam?.abbreviation}</Badge>
                                <span className="font-bold text-sm">{proposingTeam?.city} {proposingTeam?.name}</span>
                                {proposal.valueAssessment && <ValueAssessmentBadge assessment={proposal.valueAssessment} />}
                              </div>
                              <div className="text-xs text-[var(--text-sec)] uppercase font-bold mb-1">They Offer</div>
                              <div className="space-y-0.5 mb-2">
                                {offPlayers.map(p => (
                                  <div key={p.id} className="flex items-center gap-2 text-sm">
                                    <Badge size="sm">{p.position}</Badge>
                                    <button onClick={() => setSelectedPlayerId(p.id)} className="hover:underline cursor-pointer">{p.firstName} {p.lastName}</button>
                                    <span className={`text-xs font-bold ${ratingColor(p.ratings.overall)}`}>{p.ratings.overall}</span>
                                    <span className="text-xs text-[var(--text-sec)]">{p.age}y · ${p.contract.salary}M</span>
                                  </div>
                                ))}
                                {offPicks.map(pk => (
                                  <div key={pk.id} className="flex items-center gap-2 text-sm">
                                    <Badge size="sm" variant="default">Pick</Badge>
                                    <span>{pickLabel(pk)}</span>
                                  </div>
                                ))}
                              </div>
                              {/* OVR Impact */}
                              <div className="flex gap-4 mt-2 pt-2 border-t border-[var(--border)]">
                                <div className="text-xs">
                                  <span className="text-[var(--text-sec)]">Your OVR: </span>
                                  <span className="font-bold">{userOvrBefore}</span>
                                  <span className="text-[var(--text-sec)]"> → </span>
                                  <span className="font-bold">{userOvrAfter}</span>
                                  <span className={`ml-1 font-bold ${userDelta > 0 ? 'text-green-600' : userDelta < 0 ? 'text-red-600' : 'text-[var(--text-sec)]'}`}>
                                    ({userDelta > 0 ? '+' : ''}{userDelta})
                                  </span>
                                </div>
                                <div className="text-xs">
                                  <span className="text-[var(--text-sec)]">Their OVR: </span>
                                  <span className="font-bold">{theirOvrBefore}</span>
                                  <span className="text-[var(--text-sec)]"> → </span>
                                  <span className="font-bold">{theirOvrAfter}</span>
                                  <span className={`ml-1 font-bold ${theirDelta > 0 ? 'text-green-600' : theirDelta < 0 ? 'text-red-600' : 'text-[var(--text-sec)]'}`}>
                                    ({theirDelta > 0 ? '+' : ''}{theirDelta})
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => {
                                const success = respondToTradeProposal(proposal.id, true);
                                if (success) {
                                  // Reject all other pending proposals and redirect
                                  const otherPending = tradeProposals.filter(p => p.id !== proposal.id && p.status === 'pending');
                                  for (const op of otherPending) respondToTradeProposal(op.id, false);
                                  setBlockSolicited(false);
                                  router.push('/');
                                } else {
                                  alert('Trade failed — you may be over the salary cap.');
                                }
                              }}>Accept</Button>
                              <Button size="sm" variant="ghost" onClick={() => respondToTradeProposal(proposal.id, false)}>Reject</Button>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-6 text-center text-sm text-[var(--text-sec)]">
                    No teams were interested. Try adjusting your assets or preferences.
                  </div>
                );
              })()}
            </div>
            )}
          </div>
        )}

        {/* ─── Propose trade ─── */}
        {activeTab === 'propose' && (
          <div>
            {!isTradeOpen && (
              <Card>
                <div className="text-center py-8 text-[var(--text-sec)]">
                  <p className="font-semibold">Trade window is closed.</p>
                  <p className="text-sm mt-1">Trades are allowed during Weeks 1-12 of the regular season.</p>
                </div>
              </Card>
            )}

            {isTradeOpen && (
              <>
                {/* Team selector */}
                <Card className="mb-4">
                  <CardHeader><CardTitle>Select Trade Partner</CardTitle></CardHeader>
                  <select
                    value={selectedTeamId}
                    onChange={e => {
                      setSelectedTeamId(e.target.value);
                      setReceivedPlayerIds([]);
                      setReceivedPickIds([]);
                      setTradeResult(null);
                    }}
                    className="w-full px-3 py-2 text-sm bg-[var(--surface-2)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-blue-500"
                  >
                    <option value="">— Choose a team —</option>
                    {aiTeams.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.city} {t.name} ({t.record.wins}-{t.record.losses})
                      </option>
                    ))}
                  </select>
                  {selectedTeamId && (() => {
                    const st = teams.find(t => t.id === selectedTeamId);
                    if (!st) return null;
                    const stRoster = players.filter(p => p.teamId === selectedTeamId && !p.retired);
                    const strategy = getTeamStrategy(st, stRoster);
                    return (
                      <div className="mt-2 text-xs text-[var(--text-sec)]">
                        Strategy: <StrategyBadge label={strategy} />
                        {strategy === 'Rebuilding' && ' — may accept picks for veterans'}
                        {strategy === 'Win Now' && ' — looking for proven talent'}
                        {strategy === 'Developing' && ' — building for the future'}
                        {strategy === 'Contending' && ' — open to win-now moves'}
                      </div>
                    );
                  })()}
                </Card>

                {/* Trade panels */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {/* Your offer */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Your Offer</CardTitle>
                      <span className="text-xs text-[var(--text-sec)]">{Math.round(offeredValue)} trade pts</span>
                    </CardHeader>
                    <div className="mb-3">
                      <div className="text-xs font-bold text-[var(--text-sec)] uppercase mb-2">Players</div>
                      {userRoster.map(p => (
                        <label key={p.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-[var(--surface-2)] rounded px-1">
                          <input
                            type="checkbox"
                            checked={offeredPlayerIds.includes(p.id)}
                            onChange={() => togglePlayerSelect(p.id, offeredPlayerIds, setOfferedPlayerIds)}
                            className="accent-blue-500"
                          />
                          <Badge size="sm">{p.position}</Badge>
                          <span className="text-sm flex-1">{p.firstName} {p.lastName}</span>
                          <span className={`text-xs font-bold ${ratingColor(p.ratings.overall)}`}>{p.ratings.overall}</span>
                          {userTeam && calculateSchemeFit(p, userTeam) === 'poor' && (
                            <span className="text-[9px] text-red-500 font-bold px-1 py-0.5 bg-red-50 rounded">Poor Fit</span>
                          )}
                          <span className="text-[10px] text-[var(--text-sec)] w-20 text-right">${p.contract.salary.toFixed(1)}M · {p.contract.yearsLeft}yr</span>
                          <span className="text-xs text-[var(--text-sec)]">~{Math.round(playerTradeValue(p)).toLocaleString()}</span>
                        </label>
                      ))}
                    </div>
                    {userTeam && userTeam.draftPicks.filter(pk => pk.year >= (useGameStore.getState().season) && !pk.playerId).length > 0 && (
                      <div>
                        <div className="text-xs font-bold text-[var(--text-sec)] uppercase mb-2">Draft Picks</div>
                        {userTeam.draftPicks
                          .filter(pk => pk.year >= (useGameStore.getState().season) && !pk.playerId)
                          .sort((a, b) => a.year - b.year || a.round - b.round)
                          .map(pk => (
                          <label key={pk.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-[var(--surface-2)] rounded px-1">
                            <input
                              type="checkbox"
                              checked={offeredPickIds.includes(pk.id)}
                              onChange={() => togglePickSelect(pk.id, offeredPickIds, setOfferedPickIds)}
                              className="accent-blue-500"
                            />
                            <span className="text-sm flex-1">{pickLabel(pk)}</span>
                            <span className="text-xs text-[var(--text-sec)]">~{Math.round(pickTradeValue(pk))}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </Card>

                  {/* Receiving */}
                  <Card>
                    <CardHeader>
                      <CardTitle>You Receive</CardTitle>
                      <span className="text-xs text-[var(--text-sec)]">{Math.round(receivedValue)} trade pts</span>
                    </CardHeader>
                    {!selectedAITeam ? (
                      <p className="text-sm text-[var(--text-sec)]">Select a trade partner first.</p>
                    ) : (
                      <>
                        <div className="mb-3">
                          <div className="text-xs font-bold text-[var(--text-sec)] uppercase mb-2">Players</div>
                          {aiRoster.map(p => (
                            <label key={p.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-[var(--surface-2)] rounded px-1">
                              <input
                                type="checkbox"
                                checked={receivedPlayerIds.includes(p.id)}
                                onChange={() => togglePlayerSelect(p.id, receivedPlayerIds, setReceivedPlayerIds)}
                                className="accent-blue-500"
                              />
                              <Badge size="sm">{p.position}</Badge>
                              <span className="text-sm flex-1">{p.firstName} {p.lastName}</span>
                              <span className={`text-xs font-bold ${ratingColor(p.ratings.overall)}`}>{p.ratings.overall}</span>
                              <span className="text-[10px] text-[var(--text-sec)] w-20 text-right">${p.contract.salary.toFixed(1)}M · {p.contract.yearsLeft}yr</span>
                              <span className="text-xs text-[var(--text-sec)]">~{Math.round(playerTradeValue(p)).toLocaleString()}</span>
                            </label>
                          ))}
                        </div>
                        {selectedAITeam.draftPicks.filter(pk => pk.year >= (useGameStore.getState().season) && !pk.playerId).length > 0 && (
                          <div>
                            <div className="text-xs font-bold text-[var(--text-sec)] uppercase mb-2">Draft Picks</div>
                            {selectedAITeam.draftPicks
                              .filter(pk => pk.year >= (useGameStore.getState().season) && !pk.playerId)
                              .sort((a, b) => a.year - b.year || a.round - b.round)
                              .map(pk => (
                              <label key={pk.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-[var(--surface-2)] rounded px-1">
                                <input
                                  type="checkbox"
                                  checked={receivedPickIds.includes(pk.id)}
                                  onChange={() => togglePickSelect(pk.id, receivedPickIds, setReceivedPickIds)}
                                  className="accent-blue-500"
                                />
                                <span className="text-sm flex-1">{pickLabel(pk)}</span>
                                <span className="text-xs text-[var(--text-sec)]">~{Math.round(pickTradeValue(pk))}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </Card>
                </div>

                {/* Trade summary */}
                <Card>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">
                        Value: {Math.round(offeredValue).toLocaleString()} → {Math.round(receivedValue).toLocaleString()} pts
                        <span className={`ml-2 text-xs ${
                          Math.abs(valueDiff) < Math.max(offeredValue, receivedValue, 1) * 0.1 ? 'text-green-600' :
                          valueDiff > 0 ? 'text-blue-600' : 'text-amber-600'
                        }`}>
                          ({valueLabel})
                        </span>
                      </div>
                      {/* Dead money warning for restructured players being traded */}
                      {(() => {
                        const tradeDeadCap = offeredPlayerIds.reduce((sum, id) => {
                          const p = players.find(pl => pl.id === id);
                          return sum + (p ? getUnamortizedBonus(p.contract) : 0);
                        }, 0);
                        if (tradeDeadCap <= 0) return null;
                        return (
                          <p className="text-xs text-red-600 mt-1">
                            Trading creates ${Math.round(tradeDeadCap * 10) / 10}M dead money from restructured contracts
                          </p>
                        );
                      })()}
                      {tradeResult === 'rejected' && (
                        <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-3">
                          <p className="text-sm text-red-700 italic">
                            {rejectionReason ?? 'Trade rejected.'}
                          </p>
                        </div>
                      )}
                      {tradeResult === 'accepted' && (
                        <p className="text-sm text-green-600 mt-1">Trade accepted!</p>
                      )}
                    </div>
                    <div className="flex gap-2 items-center">
                      {selectedTeamId && (receivedPlayerIds.length > 0 || receivedPickIds.length > 0) && tradeResult !== 'accepted' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={handleWhatMakesThisWork}
                        >
                          What makes this work?
                        </Button>
                      )}
                      <Button
                        onClick={handleSendTrade}
                        disabled={
                          !selectedTeamId ||
                          (offeredPlayerIds.length === 0 && offeredPickIds.length === 0 &&
                           receivedPlayerIds.length === 0 && receivedPickIds.length === 0)
                        }
                      >
                        Send Offer
                      </Button>
                    </div>
                  </div>
                </Card>
              </>
            )}
          </div>
        )}
        {/* ─── Trade Finder ─── */}
        {activeTab === 'finder' && (
          <TradeFinderContent
            players={players}
            teams={teams}
            userTeamId={userTeamId}
            isTradeOpen={isTradeOpen}
            phase={phase}
            week={week}
            season={season}
            tradeDeadlineWeek={tradeDeadlineWeek}
            onPlayerClick={setSelectedPlayerId}
            onTeamClick={setViewTeamId}
            onProposeTrade={(teamId: string, playerIds: string[], sendPlayerIds?: string[], sendPickIds?: string[]) => {
              setSelectedTeamId(teamId);
              setReceivedPlayerIds(playerIds);
              if (sendPlayerIds?.length) setOfferedPlayerIds(sendPlayerIds);
              if (sendPickIds?.length) setOfferedPickIds(sendPickIds);
              setActiveTab('propose');
            }}
          />
        )}
      </div>
      <TeamRosterModal teamId={viewTeamId} onClose={() => setViewTeamId(null)} onPlayerClick={(id) => setSelectedPlayerId(id)} />
      <PlayerModal playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />
    </GameShell>
  );
}
