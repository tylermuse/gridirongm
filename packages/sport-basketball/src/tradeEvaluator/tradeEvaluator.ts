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
  basketballSalaryCap,
  basketballTeamCapStatus,
  basketballContractYearForSeason,
  type TeamCapStatus,
} from '../capRules';
import { basketballTradeValue, basketballPickTradeValue } from './tradeValue';

/** AI disposition used to weight trade acceptance (see P1.4). */
export type TeamDisposition = 'Rebuilding' | 'Developing' | 'Contending' | 'Win Now';

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
  /** Optional: pick value override (PTS). Defaults to a round-midpoint
   *  estimate; the app passes a standings-aware version. */
  pickValueFn?: (pick: BaseDraftPick) => number;
  /** Optional: id → display name, so verdicts read "Atlanta" not a raw id. */
  teamName?: (id: TeamId) => string;
  /** Optional: per-team AI disposition. Tilts acceptance — a rebuilder prizes
   *  youth + picks, a win-now team prizes proven on-court value. */
  disposition?: (id: TeamId) => TeamDisposition | undefined;
}

export interface TeamTradeOutcome {
  teamId: TeamId;
  /** Total trade value (PTS) coming in (players + picks + cash). */
  valueIn: number;
  /** Total trade value (PTS) going out. */
  valueOut: number;
  /** Positive = team gains value, negative = team loses value. PTS. */
  netValue: number;
  /** Will the AI accept this side of the deal? Based on netValue plus
   *  a fairness tolerance, tilted by the team's disposition. */
  willAccept: boolean;
  /** Did the team pass cap salary-matching rules? */
  capCompliant: boolean;
  /** Human-readable explanation of the per-team outcome. */
  reasoning: string;
  /** The team's disposition used in the decision, if provided. */
  disposition?: TeamDisposition;
  /** Cap-relevant numbers (dollars) for UI display. */
  capDetail: {
    outgoingSalary: number;
    incomingSalary: number;
    maxIncomingAllowed: number;
    isOverCap: boolean;
  };
  /** Full cap status AFTER the trade resolves — drives the apron/tax summary. */
  postCap: TeamCapStatus;
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
  // Default pick value: estimate the slot from the round midpoint (the app
  // passes a standings-aware fn that knows the original team's projected slot).
  const pickValueFn =
    context.pickValueFn ?? ((p: BaseDraftPick) => basketballPickTradeValue((p.round - 1) * 30 + 15));
  const nameOf = (id: TeamId) => context.teamName?.(id) ?? id;

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

    // Post-trade cap status: roster minus outgoing players plus incoming ones.
    const incomingPlayers = incomingPlayersFor(side, proposal, allPlayers);
    const sentSet = new Set(side.playersSent);
    const postRoster = teamRoster.filter(p => !sentSet.has(p.id)).concat(incomingPlayers);
    const postCap = basketballTeamCapStatus(postRoster, proposal.season);

    // Value math is in PTS now (see tradeValue.ts).
    const disposition = context.disposition?.(side.teamId);
    const netValue = incoming.totalValue - outgoing.totalValue;
    // Base tolerance: ~12% of outgoing value, floored at 150 PTS. Disposition
    // shifts the bar — rebuilders are pickier on value-for-value, win-now teams
    // will pay a premium for proven talent.
    const dispShift = dispositionTolerance(disposition, incoming, outgoing);
    const fairnessTolerance = Math.max(150, outgoing.totalValue * 0.12) + dispShift;
    const willAccept = netValue >= -fairnessTolerance;

    let reasoning: string;
    if (!capCompliant) {
      reasoning = `Salary doesn't match — taking back $${(incoming.salary / 1e6).toFixed(1)}M exceeds the $${(maxIncomingAllowed / 1e6).toFixed(1)}M ceiling for $${(outgoing.salary / 1e6).toFixed(1)}M out.`;
    } else if (netValue >= Math.max(150, outgoing.totalValue * 0.05)) {
      reasoning = `${nameOf(side.teamId)} gains ~${Math.round(netValue).toLocaleString()} pts of value — clear win.`;
    } else if (willAccept) {
      reasoning = `Roughly even value (within ${Math.round(Math.abs(netValue)).toLocaleString()} pts)${disposition ? ` — fits a ${disposition.toLowerCase()} plan` : ''}.`;
    } else {
      reasoning = `${nameOf(side.teamId)} loses ~${Math.round(Math.abs(netValue)).toLocaleString()} pts of value — unlikely to accept.`;
    }

    perTeam.push({
      teamId: side.teamId,
      valueIn: incoming.totalValue,
      valueOut: outgoing.totalValue,
      netValue,
      willAccept,
      capCompliant,
      reasoning,
      disposition,
      capDetail: {
        outgoingSalary: outgoing.salary,
        incomingSalary: incoming.salary,
        maxIncomingAllowed,
        isOverCap,
      },
      postCap,
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
        `${nameOf(outcome.teamId)} is over the first apron — taking back more salary than they send out may not be permitted under the real CBA (v1 doesn't block it).`,
      );
    }
    if (outcome.postCap.isOverSecondApron && !status.isOverSecondApron) {
      warnings.push(
        `This deal pushes ${nameOf(outcome.teamId)} over the second apron ($${(outcome.postCap.payroll / 1e6).toFixed(1)}M) — hard-cap territory.`,
      );
    }
  }

  const legal = perTeam.every(t => t.capCompliant);
  const allAccept = perTeam.every(t => t.willAccept);

  let summary: string;
  if (!legal) {
    summary = 'Trade is not cap-legal — salaries don’t match.';
  } else if (allAccept) {
    summary = 'Trade is legal and accepted by both sides.';
  } else {
    const rejecting = perTeam.filter(t => !t.willAccept).map(t => nameOf(t.teamId)).join(', ');
    summary = `Trade is legal but rejected by ${rejecting}.`;
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
  /** Total trade value in PTS (players + picks). Used for fairness + totals. */
  totalValue: number;
  /** Salary-only sum in dollars (cap hits for this season). Cap matching. */
  salary: number;
  /** Value (PTS) attributable to proven veterans (age ≥ 28). Lets a win-now
   *  team pay a premium specifically for win-ready talent. */
  vetValue: number;
}

/** Age at/after which a contributor counts as a "proven vet" for win-now teams. */
const VET_AGE = 28;

function collectOutgoing(
  side: BasketballTradeSide,
  allPlayers: Map<PlayerId, BasketballPlayer>,
  season: number,
  pickValueFn: (p: BaseDraftPick) => number,
): CollectedAssets {
  let totalValue = 0;
  let salary = 0;
  let vetValue = 0;
  for (const id of side.playersSent) {
    const p = allPlayers.get(id);
    if (!p) continue;
    const v = basketballTradeValue(p, { season });
    totalValue += v;
    if (p.age >= VET_AGE) vetValue += v;
    salary += currentSeasonSalary(p, season);
  }
  for (const pick of side.picksSent) {
    totalValue += pickValueFn(pick); // already in PTS
  }
  // Cash is a value transfer only (not cap-charged in v1); treated as PTS-neutral.
  return { totalValue, salary, vetValue };
}

/** Players flowing INTO this side — the union of every other side's outgoing
 *  players (exact for 2-team trades). */
function incomingPlayersFor(
  side: BasketballTradeSide,
  proposal: BasketballTradeProposal,
  allPlayers: Map<PlayerId, BasketballPlayer>,
): BasketballPlayer[] {
  const players: BasketballPlayer[] = [];
  for (const other of proposal.sides) {
    if (other.teamId === side.teamId) continue;
    for (const id of other.playersSent) {
      const p = allPlayers.get(id);
      if (p) players.push(p);
    }
  }
  return players;
}

/** Disposition tilt (PTS) on the acceptance bar. A rebuilder leans into youth
 *  and picks; a win-now team leans into proven, win-ready talent. Returns extra
 *  tolerance — how many more PTS of "loss" the team will stomach for a fit. */
function dispositionTolerance(
  disposition: TeamDisposition | undefined,
  incoming: CollectedAssets,
  _outgoing: CollectedAssets,
): number {
  if (!disposition) return 0;
  // Modest, value-relative nudge so disposition flavors — but never dominates —
  // the value check. Capped so a lopsided deal still gets rejected.
  const swing = Math.min(400, incoming.totalValue * 0.1);
  switch (disposition) {
    case 'Rebuilding':
    case 'Developing':
      return swing; // friendlier to taking on assets/upside
    case 'Win Now': {
      // Win-now teams pay a premium specifically for proven veterans — the more
      // win-ready talent coming back, the more "loss" they'll stomach for it.
      const vetPremium = Math.min(500, incoming.vetValue * 0.18);
      return swing * 0.6 + vetPremium;
    }
    default:
      return 0;
  }
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
  let vetValue = 0;
  for (const other of proposal.sides) {
    if (other.teamId === side.teamId) continue;
    const out = collectOutgoing(other, allPlayers, season, pickValueFn);
    // v1: split incoming equally across all OTHER teams' outgoing for
    // multi-team trades. For 2-team trades this is exact. For 3+ team
    // trades, the caller can refine by setting up the sides so flow is
    // implicit; v2 should allow explicit per-side recipients.
    const share = Math.max(1, proposal.sides.length - 1);
    totalValue += out.totalValue / share;
    salary += out.salary / share;
    vetValue += out.vetValue / share;
  }
  return { totalValue, salary, vetValue };
}

function currentSeasonSalary(player: BasketballPlayer, season: number): number {
  if (!player.contract) return 0;
  const y = basketballContractYearForSeason(player.contract, season);
  return y ? y.baseSalary + y.proratedBonus : 0;
}
