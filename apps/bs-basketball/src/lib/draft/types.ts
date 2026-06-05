/**
 * Draft state (Phase 2D-4). Lives on `league.sportData.draft` during the
 * offseason — plain serializable data, so it survives the Dexie round-trip.
 */

import type { PlayerId, TeamId } from '@bs/core/adapter';

/** Scouting reveals a prospect's true potential; you get this many per draft. */
export const SCOUTS_PER_DRAFT = 8;

export interface DraftPickSlot {
  /** 1..60 overall pick number. */
  overall: number;
  /** 1 or 2. */
  round: number;
  /** 1..30 within the round. */
  pickInRound: number;
  /** Team currently making this pick. Re-resolved from the pick-ownership
   *  registry on every read (see getDraft), so a mid-draft pick trade takes
   *  effect immediately. */
  teamId: TeamId;
  /** The team whose record earned this slot — the stable key into the
   *  pick-ownership registry. Lets ownership be re-resolved after trades.
   *  (Optional at runtime for saves made before this field existed.) */
  originalTeamId: TeamId;
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
  /**
   * Pre-lottery seeding of the lottery teams, worst record first (index 0 =
   * expected #1 pick). Lets the reveal compute who jumped and who fell vs. their
   * odds. Optional for backward-compat with saves drafted before the dramatic
   * reveal landed.
   */
  lotteryOrder?: TeamId[];
  /** Scouting budget left for this draft. */
  scoutsRemaining?: number;
  /** Prospect ids whose true potential has been revealed. */
  scoutedIds?: PlayerId[];
}
