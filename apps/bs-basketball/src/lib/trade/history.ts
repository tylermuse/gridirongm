/**
 * Past-proposals history (P2.3).
 *
 * Every offer the user sends from the builder — whether the AI accepts or turns
 * it down — is logged to `league.sportData.tradeHistory` so the trade page can
 * show a "Past proposals (N)" list with outcomes, mirroring football. Accepted
 * proposals also flow through executeTrade (which logs a transaction); this is
 * the negotiation record, not the roster move.
 */

import type { BaseLeagueState, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export type TradeGrade = 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F';

export interface ProposalAssetSummary {
  players: string[];
  picks: string[];
}

export interface ProposalRecord {
  id: string;
  season: number;
  day: number;
  partnerTeamId: TeamId;
  partnerName: string;
  /** From the user's perspective. */
  sent: ProposalAssetSummary;
  received: ProposalAssetSummary;
  outcome: 'accepted' | 'rejected';
  grade: TradeGrade;
  /** Rejection reason, when declined. */
  reason?: string;
}

interface HistoryData {
  tradeHistory?: ProposalRecord[];
  [key: string]: unknown;
}

/** Letter grade for a deal from the value the user receives vs. sends (PTS). */
export function computeTradeGrade(receive: number, send: number): TradeGrade {
  const total = Math.max(receive + send, 1);
  const pct = ((receive - send) / total) * 200;
  if (pct > 25) return 'A+';
  if (pct > 15) return 'A';
  if (pct > 5) return 'B+';
  if (pct > -5) return 'B';
  if (pct > -15) return 'C';
  if (pct > -25) return 'D';
  return 'F';
}

export function appendProposal(league: LeagueState, rec: ProposalRecord): LeagueState {
  const sport = (league.sportData as HistoryData | undefined) ?? {};
  const list = sport.tradeHistory ?? [];
  return { ...league, sportData: { ...sport, tradeHistory: [rec, ...list].slice(0, 50) } };
}

/** Proposals this season, newest first. */
export function getProposalHistory(league: LeagueState): ProposalRecord[] {
  const sport = (league.sportData as HistoryData | undefined) ?? {};
  return (sport.tradeHistory ?? []).filter(r => r.season === league.currentSeason);
}
