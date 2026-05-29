/**
 * Basketball trade evaluator.
 *
 * Given a proposed multi-team trade, returns whether it is:
 *   - Cap-legal (salary-matching rules per team)
 *   - "Fair" (value-in vs value-out for each team)
 *   - Accepted by each team's AI (combines fairness + need)
 *
 * NBA salary-matching rules (v1 implementation):
 *   - Teams under the cap: can take back any amount up to (outgoing + capRoom).
 *   - Teams over the cap follow the tiered 125% rule:
 *       - Outgoing salary ≤ $7.5M:  take back ≤ 200% + $250k
 *       - $7.5M < outgoing ≤ $29M:  take back ≤ outgoing + $7.5M
 *       - Outgoing > $29M:           take back ≤ 125% + $250k
 *
 * Player value model:
 *   - Player's market salary is the base value (computed via marketSalary)
 *   - Contract surplus value (player's market salary - actual cap hit) is
 *     added — a cheap deal is more valuable than an expensive same-OVR
 *     player.
 *
 * v1 simplifications:
 *   - No apron-specific trade rules (first apron: no aggregation; second
 *     apron: hard 1:1 ceiling). Surfaced via warnings only.
 *   - No traded-player-exception generation (multi-team trades that net
 *     a team under-paying create a TPE; v2 should track + use).
 *   - No base-year compensation (sign-and-trade BYC math). v2.
 *   - No outgoing-team retained salary (deferred).
 *   - Cash-sent is treated as a value transfer only, not a cap charge.
 *     NBA limits cash to ~$7.5M/season per team — v1 doesn't enforce.
 *   - AI acceptance is a simple value-delta check; v2 should weight
 *     positional need, team timeline (rebuild vs contender), etc.
 */

import type { TeamId, PlayerId, BaseDraftPick } from '@bs/core/adapter';
import type { BasketballPlayer } from '../types';
import {
  basketballMarketSalary,
  basketballSalaryCap,
  basketballTeamCapStatus,
  basketballContractYearForSeason,
  basketballPickValue,
} from '../index';

// ===========================================================================
// Public types
// ===========================================================================

export interface BasketballTradeSide {
  teamId: TeamId;
  /** IDs of players being sent away. */
  playersSent: PlayerId[];
  /** Draft picks being sent. */
  picksSent: BaseDraftPick[];
  /** Cash transferred. NBA limits ~$7.5M/season per team; not enforced in v1. */
  cashSent?: number;
}

export interface BasketballTradeProposal {
  sides: BasketballTradeSide[];
  /** Season the trade executes in. Drives cap math. */
  season: number;
}

export interface BasketballTradeContext {
  /** Full roster per team — used to look up player objects + compute
   *  current cap status. Each value is the team's full active+inactive
   *  player list (whatever your store treats as "on the roster"). */
  teamRosters: Map<TeamId, BasketballPlayer[]>;
  /** Optional: pick value override for non-standard pick-value heuristics. */
  pickValueFn?: (pick: BaseDraftPick) => number;
}

export interface TeamTradeOutcome {
  teamId: TeamId;
  /** Total dollar value coming in (players + picks + cash). */
  valueIn: number;
  /** Total dollar value going out. */
  valueOut: number;
  /** Positive = team gains value, negative = team loses value. */
  netValue: number;
  /** Will the AI accept this side of the deal? Based on netValue plus
   *  a small fairness tolerance. */
  willAccept: boolean;
  /** Did the team pass cap salary-matching rules? */
  capCompliant: boolean;
  /** Human-readable explanation of the per-team outcome. */
  reasoning: string;
  /** Cap-relevant numbers for UI display. */
  capDetail: {
    outgoingSalary: number;
    incomingSalary: number;
    maxIncomingAllowed: number;
    isOverCap: boolean;
  };
}

export interface BasketballTradeEvaluation {
  /** True if every side is cap-compliant. Illegal trades cannot execute. */
  legal: boolean;
  /** True if every team's AI would accept. Fair trades execute without
   *  further negotiation; unfair ones may need a counter-offer. */
  allAccept: boolean;
  /** Per-team breakdown of the trade. */
  perTeam: TeamTradeOutcome[];
  /** Single-line summary. */
  summary: string;
  /** Any warnings that don't block the trade but the UI should surface. */
  warnings: string[];
}

// ===========================================================================
// Main entry
// ===========================================================================

/**
 * Evaluate a proposed trade. Returns legality + per-team value math +
 * AI acceptance decisions.
 */
export function evaluateBasketballTrade(
  proposal: BasketballTradeProposal,
  context: BasketballTradeContext,
): BasketballTradeEvaluation {
  const warnings: string[] = [];
  const perTeam: TeamTradeOutcome[] = [];
  const pickValueFn = context.pickValueFn ?? ((p: BaseDraftPick) => basketballPickValue(p.round));

  // Build a quick (teamId,playerId) → player lookup
  const allPlayers = new Map<PlayerId, BasketballPlayer>();
  for (const players of context.teamRosters.values()) {
    for (const p of players) allPlayers.set(p.id, p);
  }

  // For each side: compute outgoing + incoming
  for (const side of proposal.sides) {
    const outgoing = collectOutgoing(side, allPlayers, proposal.season, pickValueFn);

    // Incoming = sum of all OTHER sides' outgoing flowing TO this team.
    // v1 simplification: trades are partitioned per-side; we assume the
    // proposed flow is balanced (i.e., everything one side sends out goes
    // somewhere). For 2-team trades, incoming = the other side's outgoing.
    // For 3+ team trades, the caller's split determines flow.
    const incoming = collectIncomingForSide(
      side,
      proposal,
      allPlayers,
      pickValueFn,
      proposal.season,
    );

    const teamRoster = context.teamRosters.get(side.teamId) ?? [];
    const capStatus = basketballTeamCapStatus(teamRoster, proposal.season);
    const cap = basketballSalaryCap(proposal.season);

    const isOverCap = capStatus.payroll > cap;
    const maxIncomingAllowed = computeMaxIncomingSalary(
      outgoing.salary,
      capStatus.capRoom,
      isOverCap,
    );
    const capCompliant = incoming.salary <= maxIncomingAllowed + 1; // +1 for float fuzz

    const netValue = incoming.totalValue - outgoing.totalValue;
    const fairnessTolerance = Math.max(2_000_000, outgoing.totalValue * 0.15);
    const willAccept = netValue >= -fairnessTolerance;

    let reasoning: string;
    if (!capCompliant) {
      reasoning = `Cap violation: taking back $${(incoming.salary / 1e6).toFixed(1)}M exceeds max $${(maxIncomingAllowed / 1e6).toFixed(1)}M for $${(outgoing.salary / 1e6).toFixed(1)}M outgoing.`;
    } else if (netValue >= 1_500_000) {
      reasoning = `Team gains ~$${(netValue / 1e6).toFixed(1)}M in value — clear win.`;
    } else if (netValue >= -fairnessTolerance) {
      reasoning = `Roughly even value (within $${(Math.abs(netValue) / 1e6).toFixed(1)}M).`;
    } else {
      reasoning = `Team loses ~$${(Math.abs(netValue) / 1e6).toFixed(1)}M in value — unlikely to accept.`;
    }

    perTeam.push({
      teamId: side.teamId,
      valueIn: incoming.totalValue,
      valueOut: outgoing.totalValue,
      netValue,
      willAccept,
      capCompliant,
      reasoning,
      capDetail: {
        outgoingSalary: outgoing.salary,
        incomingSalary: incoming.salary,
        maxIncomingAllowed,
        isOverCap,
      },
    });
  }

  // Apron warnings — non-blocking
  for (const outcome of perTeam) {
    const status = basketballTeamCapStatus(
      context.teamRosters.get(outcome.teamId) ?? [],
      proposal.season,
    );
    if (status.isOverFirstApron && outcome.capDetail.incomingSalary > outcome.capDetail.outgoingSalary + 1) {
      warnings.push(
        `${outcome.teamId} is over the first apron — taking back more salary than sending may not be permitted in real CBA (v1 doesn't enforce).`,
      );
    }
  }

  const legal = perTeam.every(t => t.capCompliant);
  const allAccept = perTeam.every(t => t.willAccept);

  let summary: string;
  if (!legal) {
    summary = 'Trade is not cap-legal.';
  } else if (allAccept) {
    summary = 'Trade is legal and accepted by all teams.';
  } else {
    const rejecting = perTeam.filter(t => !t.willAccept).map(t => t.teamId).join(', ');
    summary = `Trade is legal but rejected by: ${rejecting}.`;
  }

  return { legal, allAccept, perTeam, summary, warnings };
}

// ===========================================================================
// Salary-matching rule (v1: tiered 125% rule)
// ===========================================================================

function computeMaxIncomingSalary(
  outgoing: number,
  capRoom: number,
  isOverCap: boolean,
): number {
  if (!isOverCap) {
    // Under cap: outgoing + remaining cap room
    return outgoing + Math.max(0, capRoom);
  }
  // Over cap — tiered NBA rule (v1 approximation):
  // outgoing ≤ $7.5M: 200% + $250k
  // $7.5M < outgoing ≤ $29M: outgoing + $7.5M
  // > $29M: 125% + $250k
  if (outgoing <= 7_500_000) {
    return outgoing * 2 + 250_000;
  }
  if (outgoing <= 29_000_000) {
    return outgoing + 7_500_000;
  }
  return outgoing * 1.25 + 250_000;
}

// ===========================================================================
// Value collection helpers
// ===========================================================================

interface CollectedAssets {
  /** Total dollar value (players + picks + cash). Used for "fairness." */
  totalValue: number;
  /** Salary-only sum (just the cap hits of player years for this season).
   *  Used for cap matching. */
  salary: number;
}

function collectOutgoing(
  side: BasketballTradeSide,
  allPlayers: Map<PlayerId, BasketballPlayer>,
  season: number,
  pickValueFn: (p: BaseDraftPick) => number,
): CollectedAssets {
  let totalValue = 0;
  let salary = 0;
  for (const id of side.playersSent) {
    const p = allPlayers.get(id);
    if (!p) continue;
    totalValue += playerValue(p, season);
    salary += currentSeasonSalary(p, season);
  }
  for (const pick of side.picksSent) {
    totalValue += pickValueFn(pick) * 100_000; // scale pick "points" to dollars-ish
  }
  totalValue += side.cashSent ?? 0;
  return { totalValue, salary };
}

/** For a given side, sum the outgoing of OTHER sides as incoming. */
function collectIncomingForSide(
  side: BasketballTradeSide,
  proposal: BasketballTradeProposal,
  allPlayers: Map<PlayerId, BasketballPlayer>,
  pickValueFn: (p: BaseDraftPick) => number,
  season: number,
): CollectedAssets {
  let totalValue = 0;
  let salary = 0;
  for (const other of proposal.sides) {
    if (other.teamId === side.teamId) continue;
    const out = collectOutgoing(other, allPlayers, season, pickValueFn);
    // v1: split incoming equally across all OTHER teams' outgoing for
    // multi-team trades. For 2-team trades this is exact. For 3+ team
    // trades, the caller can refine by setting up the sides so flow is
    // implicit; v2 should allow explicit per-side recipients.
    totalValue += out.totalValue / Math.max(1, proposal.sides.length - 1);
    salary += out.salary / Math.max(1, proposal.sides.length - 1);
  }
  return { totalValue, salary };
}

/** Player value for fairness math: market salary + contract surplus. */
function playerValue(player: BasketballPlayer, season: number): number {
  const market = basketballMarketSalary(player, { season });
  const currentSalary = currentSeasonSalary(player, season);
  // Surplus value = how much team is "saving" vs market rate.
  // A $5M player on a $1M deal has $4M of surplus value.
  const surplus = Math.max(0, market - currentSalary);
  return market + surplus * 1.5; // weight surplus higher than nominal market
}

function currentSeasonSalary(player: BasketballPlayer, season: number): number {
  if (!player.contract) return 0;
  const y = basketballContractYearForSeason(player.contract, season);
  return y ? y.baseSalary + y.proratedBonus : 0;
}
