/**
 * Trade logic (Phase 2D-6).
 *
 * Thin app-level wrapper over the engine's `evaluateBasketballTrade` plus an
 * executor that applies the roster moves and logs the deal. v1 is two-team,
 * players-only (teams carry no tradeable picks yet); the evaluator's value /
 * cap / acceptance math is reused verbatim.
 */

import {
  evaluateBasketballTrade,
  type BasketballPlayer,
  type BasketballTradeEvaluation,
  type BasketballTradeProposal,
} from '@bs/sport-basketball';
import type { BaseDraftPick, BaseLeagueState, PlayerId, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import { appendTransaction } from '../transactions';
import { teamStrategy } from './strategy';
import { applyPickMoves, pickFromId, pickShort, pickValueFnFor } from './picks';
import { appendProposal, computeTradeGrade, type ProposalRecord } from './history';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export interface TradeSideInput {
  teamId: TeamId;
  playerIds: PlayerId[];
  /** Pick ids (see picks.ts) this team sends. Optional for back-compat. */
  pickIds?: string[];
}

function teamRosters(league: LeagueState): Map<TeamId, BasketballPlayer[]> {
  const m = new Map<TeamId, BasketballPlayer[]>();
  for (const t of league.teams) {
    m.set(
      t.id,
      t.playerIds
        .map(id => league.players[id] as BasketballPlayer | undefined)
        .filter((p): p is BasketballPlayer => !!p),
    );
  }
  return m;
}

function picksForSide(league: LeagueState, s: TradeSideInput): BaseDraftPick[] {
  return (s.pickIds ?? [])
    .map(id => pickFromId(league, id))
    .filter((p): p is NonNullable<typeof p> => !!p);
}

function toProposal(league: LeagueState, sides: TradeSideInput[]): BasketballTradeProposal {
  return {
    season: league.currentSeason,
    sides: sides.map(s => ({
      teamId: s.teamId,
      playersSent: s.playerIds,
      picksSent: picksForSide(league, s),
      cashSent: 0,
    })),
  };
}

function teamNameOf(league: LeagueState): (id: TeamId) => string {
  const names = new Map<TeamId, string>();
  for (const t of league.teams) names.set(t.id, t.city);
  return id => names.get(id) ?? id;
}

export function evaluateTrade(league: LeagueState, sides: TradeSideInput[]): BasketballTradeEvaluation {
  return evaluateBasketballTrade(toProposal(league, sides), {
    teamRosters: teamRosters(league),
    teamName: teamNameOf(league),
    pickValueFn: pickValueFnFor(league),
    disposition: id => teamStrategy(league, id).disposition,
  });
}

function sideAssetCount(s: TradeSideInput): number {
  return s.playerIds.length + (s.pickIds?.length ?? 0);
}

/** True if the deal has assets on both sides and is legal + accepted by all. */
export function isExecutable(evaluation: BasketballTradeEvaluation, sides: TradeSideInput[]): boolean {
  const hasAssets = sides.length === 2 && sides.every(s => sideAssetCount(s) > 0);
  return hasAssets && evaluation.legal && evaluation.allAccept;
}

export interface ProposeResult {
  league: LeagueState;
  accepted: boolean;
  /** Empty when accepted; otherwise why the AI/cap turned it down. */
  reason: string;
}

function assetSummary(league: LeagueState, s: TradeSideInput) {
  const players = s.playerIds.map(id => {
    const p = league.players[id] as BasketballPlayer | undefined;
    return p ? `${p.firstName} ${p.lastName}` : id;
  });
  const picks = picksForSide(league, s).map(p => pickShort(league, p));
  return { players, picks };
}

/**
 * Send a proposal from the builder. sides[0] is the user. If legal + accepted it
 * executes; either way the proposal (and its outcome) is logged to history.
 * Illegal (salary-mismatch) deals are not sent — the caller blocks those.
 */
export function proposeTrade(league: LeagueState, sides: TradeSideInput[]): ProposeResult {
  const evaluation = evaluateTrade(league, sides);
  const [user, partner] = sides;
  const userOutcome = evaluation.perTeam.find(t => t.teamId === user.teamId);
  const accepted = isExecutable(evaluation, sides);
  const partnerName = teamNameOf(league)(partner.teamId);

  const grade = computeTradeGrade(userOutcome?.valueIn ?? 0, userOutcome?.valueOut ?? 0);
  const reason = accepted
    ? ''
    : !evaluation.legal
    ? userOutcome?.reasoning ?? 'Salaries don’t match.'
    : evaluation.perTeam.find(t => !t.willAccept)?.reasoning ?? 'The deal was turned down.';

  const rec: ProposalRecord = {
    id: `prop-${league.currentSeason}-${league.currentTick}-${user.playerIds.join('')}${partner.playerIds.join('')}`,
    season: league.currentSeason,
    day: league.currentTick,
    partnerTeamId: partner.teamId,
    partnerName,
    sent: assetSummary(league, user),
    received: assetSummary(league, partner),
    outcome: accepted ? 'accepted' : 'rejected',
    grade,
    reason: accepted ? undefined : reason,
  };

  let next = accepted ? executeTrade(league, sides) : league;
  next = appendProposal(next, rec);
  return { league: next, accepted, reason };
}

/**
 * Apply a two-team, players-only trade: swap the players, re-slot them, and log
 * a transaction. Assumes the deal was already validated by `evaluateTrade`.
 */
export function executeTrade(league: LeagueState, sides: TradeSideInput[]): LeagueState {
  if (sides.length !== 2) throw new Error('v1 trades are two-team only.');
  const [a, b] = sides;

  // Draft picks change hands first (pure ownership-registry update).
  const pickMoves = [
    ...picksForSide(league, a).map(pick => ({ pick, toTeamId: b.teamId })),
    ...picksForSide(league, b).map(pick => ({ pick, toTeamId: a.teamId })),
  ];
  const aPickLabels = picksForSide(league, a).map(p => pickShort(league, p));
  const bPickLabels = picksForSide(league, b).map(p => pickShort(league, p));
  league = applyPickMoves(league, pickMoves);

  // player → destination team.
  const moveTo = new Map<PlayerId, TeamId>();
  for (const id of a.playerIds) moveTo.set(id, b.teamId);
  for (const id of b.playerIds) moveTo.set(id, a.teamId);

  const arriving: Record<string, PlayerId[]> = {};
  for (const [pid, toTeam] of moveTo) (arriving[toTeam] ??= []).push(pid);

  const players = { ...league.players };
  const teams = league.teams.map(t => {
    const incoming = arriving[t.id] ?? [];
    const keep = (ids: PlayerId[]) => ids.filter(id => !moveTo.has(id));
    const playerIds = [...keep(t.playerIds), ...incoming];
    const rosterBuckets: Record<string, PlayerId[]> = {};
    for (const [name, ids] of Object.entries(t.rosterBuckets)) {
      rosterBuckets[name] = name === 'active' ? [...keep(ids), ...incoming] : keep(ids);
    }
    return { ...t, playerIds, rosterBuckets };
  });

  // Re-slot every moved player onto its new team + stamp the acquisition.
  for (const team of teams) {
    team.playerIds.forEach((pid, index) => {
      if (moveTo.has(pid)) {
        const prev = players[pid] as BasketballPlayer;
        players[pid] = {
          ...prev,
          rosterSlot: { teamId: team.id, bucket: 'active', index },
          sportData: { ...prev.sportData, acquiredVia: 'trade', acquiredSeason: league.currentSeason },
        };
      }
    });
  }

  const teamName = (id: TeamId) => {
    const t = league.teams.find(x => x.id === id);
    return t ? `${t.city} ${t.name}` : id;
  };
  const assets = (ids: PlayerId[], pickLabels: string[]) => {
    const names = ids.map(id => {
      const p = league.players[id] as BasketballPlayer | undefined;
      return p ? `${p.firstName} ${p.lastName}` : id;
    });
    return [...names, ...pickLabels].join(', ') || 'nothing';
  };

  const moved: LeagueState = { ...league, players, teams };
  return appendTransaction(moved, {
    kind: 'trade',
    season: league.currentSeason,
    teamIds: [a.teamId, b.teamId],
    summary: `Trade: ${teamName(a.teamId)} ↔ ${teamName(b.teamId)}`,
    detail: `${teamName(a.teamId)} send ${assets(a.playerIds, aPickLabels)}; ${teamName(b.teamId)} send ${assets(b.playerIds, bPickLabels)}.`,
  });
}
