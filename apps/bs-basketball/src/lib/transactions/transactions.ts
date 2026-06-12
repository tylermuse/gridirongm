/**
 * Transaction log (Phase 2E-3).
 *
 * A single newest-first list on `league.sportData.transactions` capturing every
 * roster move — trades, free-agent signings, releases, and draft picks. Plain
 * serializable data (consistent with how the rest of league state persists), so
 * no extra Dexie table is needed. `teamIds` lets the team page filter to its own
 * activity.
 */

import type { BaseLeagueState, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export type TransactionKind = 'trade' | 'signing' | 'release' | 'draft' | 'pick';

export interface TransactionEntry {
  kind: TransactionKind;
  season: number;
  /** Day-of-season the move happened. Auto-stamped by appendTransaction so the
   *  news feed can place trades on the right day. Optional for older saves. */
  day?: number;
  /** Teams involved — used for the per-team activity feed. */
  teamIds: TeamId[];
  /** Short headline. */
  summary: string;
  /** Full description. */
  detail: string;
}

/** Keep the log bounded; the draft alone adds 60 entries per offseason. */
const MAX_TRANSACTIONS = 500;

interface LeagueSportData {
  transactions?: TransactionEntry[];
  [key: string]: unknown;
}

export function getTransactions(league: LeagueState): TransactionEntry[] {
  return (league.sportData as LeagueSportData | undefined)?.transactions ?? [];
}

/** Prepend an entry (newest first) and return a new league. Stamps the current
 *  day-of-season when the caller didn't set one. */
export function appendTransaction(league: LeagueState, entry: TransactionEntry): LeagueState {
  const sd = league.sportData as LeagueSportData;
  const stamped: TransactionEntry = { ...entry, day: entry.day ?? league.currentTick };
  const transactions = [stamped, ...(sd.transactions ?? [])].slice(0, MAX_TRANSACTIONS);
  return { ...league, sportData: { ...sd, transactions } };
}
