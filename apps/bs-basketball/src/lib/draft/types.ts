/**
 * Draft state (Phase 2D-4). Lives on `league.sportData.draft` during the
 * offseason — plain serializable data, so it survives the Dexie round-trip.
 */

import type { PlayerId, TeamId } from '@bs/core/adapter';

/**
 * LEGACY: the old flat budget (8 scouts, each revealing true potential). Kept so
 * saves made before tiered scouting can be converted — see scoutPointsLeft().
 */
export const SCOUTS_PER_DRAFT = 8;

/** Tiered scouting budget (points) per draft. */
export const SCOUT_POINTS_PER_DRAFT = 30;

/** 1 = Quick look, 2 = Workout, 3 = Full evaluation. 0 = unscouted. */
export type ScoutLevel = 0 | 1 | 2 | 3;

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

/**
 * A pick/player swap the user made during this draft, recorded for the post-draft
 * report's "Trade Activity" panel. Pick numbers are the overall slot (1..60);
 * player names are captured at trade time so the report doesn't have to chase
 * roster moves. (FEAT: draft report.)
 */
export interface DraftTradeRecord {
  partnerId: TeamId;
  partnerLabel: string;
  sentPicks: number[];
  receivedPicks: number[];
  sentPlayers: string[];
  receivedPlayers: string[];
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
  /** True for the one-off draft an imported league starts with — on completion
   *  it tips into the current season's preseason instead of rolling the year. */
  inaugural?: boolean;
  /**
   * Pre-lottery seeding of the lottery teams, worst record first (index 0 =
   * expected #1 pick). Lets the reveal compute who jumped and who fell vs. their
   * odds. Optional for backward-compat with saves drafted before the dramatic
   * reveal landed.
   */
  lotteryOrder?: TeamId[];
  /** LEGACY flat-scout budget (pre-tiered saves). Read only for conversion. */
  scoutsRemaining?: number;
  /** LEGACY: prospects revealed under the flat system — treated as fully
   *  evaluated (level 3). Never written by new code. */
  scoutedIds?: PlayerId[];
  /** Tiered scouting points left. Absent on legacy saves (derived lazily). */
  scoutPoints?: number;
  /** Highest scouting tier reached per prospect id. */
  scoutLevels?: Record<string, ScoutLevel>;
  /** User's starred prospects (watchlist). */
  watchlist?: PlayerId[];
  /** Pick/player swaps the user made during the draft, oldest first. Drives the
   *  post-draft report's Trade Activity panel. Absent on saves with no trades. */
  trades?: DraftTradeRecord[];
}
