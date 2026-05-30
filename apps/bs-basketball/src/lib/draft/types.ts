/**
 * Draft state (Phase 2D-4). Lives on `league.sportData.draft` during the
 * offseason — plain serializable data, so it survives the Dexie round-trip.
 */

import type { PlayerId, TeamId } from '@bs/core/adapter';

export interface DraftPickSlot {
  /** 1..60 overall pick number. */
  overall: number;
  /** 1 or 2. */
  round: number;
  /** 1..30 within the round. */
  pickInRound: number;
  /** Team making this pick (draft order, post-lottery). */
  teamId: TeamId;
  /** Lottery picks are 1..14. */
  isLottery: boolean;
  /** Prospect taken, or null if not yet made. */
  prospectId: PlayerId | null;
}

export interface DraftState {
  /** Season the rookies sign for (the upcoming season). */
  season: number;
  /** 60 picks in order. */
  picks: DraftPickSlot[];
  /** Remaining undrafted prospect ids. */
  poolIds: PlayerId[];
  /** Index of the pick on the clock; === picks.length when complete. */
  currentPick: number;
  complete: boolean;
  /** Whether the lottery order has been revealed (cosmetic gate). */
  lotteryRevealed: boolean;
}
