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
import type { BaseLeagueState, PlayerId, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

interface LeagueSportData {
  transactions?: TransactionEntry[];
  [key: string]: unknown;
}

export interface TransactionEntry {
  kind: 'trade';
  season: number;
  summary: string;
  detail: string;
}

export interface TradeSideInput {
  teamId: TeamId;
  playerIds: PlayerId[];
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

function toProposal(league: LeagueState, sides: TradeSideInput[]): BasketballTradeProposal {
  return {
    season: league.currentSeason,
    sides: sides.map(s => ({ teamId: s.teamId, playersSent: s.playerIds, picksSent: [], cashSent: 0 })),
  };
}

export function evaluateTrade(league: LeagueState, sides: TradeSideInput[]): BasketballTradeEvaluation {
  return evaluateBasketballTrade(toProposal(league, sides), { teamRosters: teamRosters(league) });
}

/** True if the deal has assets on both sides and is legal + accepted by all. */
export function isExecutable(evaluation: BasketballTradeEvaluation, sides: TradeSideInput[]): boolean {
  const hasAssets = sides.length === 2 && sides.every(s => s.playerIds.length > 0);
  return hasAssets && evaluation.legal && evaluation.allAccept;
}

/**
 * Apply a two-team, players-only trade: swap the players, re-slot them, and log
 * a transaction. Assumes the deal was already validated by `evaluateTrade`.
 */
export function executeTrade(league: LeagueState, sides: TradeSideInput[]): LeagueState {
  if (sides.length !== 2) throw new Error('v1 trades are two-team only.');
  const [a, b] = sides;

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

  // Re-slot every moved player onto its new team.
  for (const team of teams) {
    team.playerIds.forEach((pid, index) => {
      if (moveTo.has(pid)) {
        players[pid] = {
          ...(players[pid] as BasketballPlayer),
          rosterSlot: { teamId: team.id, bucket: 'active', index },
        };
      }
    });
  }

  const teamName = (id: TeamId) => {
    const t = league.teams.find(x => x.id === id);
    return t ? `${t.city} ${t.name}` : id;
  };
  const names = (ids: PlayerId[]) =>
    ids.map(id => {
      const p = league.players[id] as BasketballPlayer | undefined;
      return p ? `${p.firstName} ${p.lastName}` : id;
    }).join(', ') || 'nothing';

  const entry: TransactionEntry = {
    kind: 'trade',
    season: league.currentSeason,
    summary: `Trade: ${teamName(a.teamId)} ↔ ${teamName(b.teamId)}`,
    detail: `${teamName(a.teamId)} send ${names(a.playerIds)}; ${teamName(b.teamId)} send ${names(b.playerIds)}.`,
  };
  const sd = league.sportData as LeagueSportData;
  const transactions = [entry, ...(sd.transactions ?? [])].slice(0, 100);

  return {
    ...league,
    players,
    teams,
    sportData: { ...sd, transactions },
  };
}
