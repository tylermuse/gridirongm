/**
 * Basketball-specific types.
 *
 * Promoted from packages/core/src/adapter/sketches/basketball.adapter.sketch.ts
 * during Phase 2A. The sketch was types-only; this is the real implementation
 * that other modules in @bs/sport-basketball consume.
 */

import type { BasePlayer, BaseTeam, PlayerId } from '@bs/core/adapter';

// ============================================================================
// Position
// ============================================================================

export type BasketballPosition = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

export const BASKETBALL_POSITIONS: readonly BasketballPosition[] = [
  'PG', 'SG', 'SF', 'PF', 'C',
] as const;

/** Basketball has one player kind. Hockey/soccer use the discriminator
 *  meaningfully; basketball keeps it 'standard' so the rest of the system
 *  has a uniform code path. */
export type BasketballPlayerKind = 'standard';

// ============================================================================
// Ratings
// ============================================================================

export interface BasketballRatings {
  /** Computed roll-up. 40-99 scale where 99 is generational. */
  overall: number;
  // Physical
  /** Inches. 70 (5'10") to 91 (7'7"). */
  height: number;
  /** Inches. Usually height ± 6. */
  wingspan: number;
  /** 0-100. Speed in the open court. */
  speed: number;
  /** 0-100. Physical strength for post play + finishing through contact. */
  strength: number;
  /** 0-100. Vertical leap, drives finishing/dunking/rebounding. */
  vertical: number;
  // Offense
  /** 0-100. Three-point shooting from beyond the arc. */
  threePoint: number;
  /** 0-100. Mid-range jumpers (10-23 ft). */
  midRange: number;
  /** 0-100. Finishing at the rim. */
  finishing: number;
  /** 0-100. Free throw shooting. */
  freeThrow: number;
  /** 0-100. Post offense — back-to-basket scoring. */
  postScoring: number;
  /** 0-100. Ball handling — drives dribble breakdowns + turnover avoidance. */
  handles: number;
  /** 0-100. Passing + court vision. */
  passing: number;
  // Defense
  /** 0-100. On-ball perimeter defense vs guards/wings. */
  perimeterDefense: number;
  /** 0-100. Post defense + help defense in the paint. */
  interiorDefense: number;
  /** 0-100. Rebounding instinct (positioning + box-out). */
  rebounding: number;
  /** 0-100. Steal generation — anticipation + hands. */
  steal: number;
  /** 0-100. Shot-blocking. */
  block: number;
  // Mental
  /** 0-100. Basketball IQ — affects shot selection, off-ball positioning,
   *  clutch performance. */
  basketballIQ: number;
  /** 0-100. Intangibles — clutch, leadership, locker-room presence.
   *  Small per-game effects, large season-long effects. */
  intangibles: number;
}

// ============================================================================
// Stats
// ============================================================================

export interface BasketballStats {
  gamesPlayed: number;
  gamesStarted: number;
  /** Total minutes played, season aggregate. */
  minutes: number;
  // Scoring
  points: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  threePointsMade: number;
  threePointsAttempted: number;
  freeThrowsMade: number;
  freeThrowsAttempted: number;
  // Possessions
  assists: number;
  turnovers: number;
  // Rebounds
  offensiveRebounds: number;
  defensiveRebounds: number;
  totalRebounds: number;
  // Defense
  steals: number;
  blocks: number;
  personalFouls: number;
  // Advanced (derived but cached for sort speed)
  /** Plus-minus aggregated across all games. */
  plusMinus: number;
  /** Sum of (FGA + 0.44 * FTA) — denominator for True Shooting %. */
  trueShootingAttempts: number;
}

// ============================================================================
// Lineup model
// ============================================================================

/** Basketball uses a rotation model: 5 starters + 7-8 bench in defined
 *  rotation order, with per-position backups as secondary info. */
export interface BasketballLineup {
  /** Starting 5, in canonical position order: PG, SG, SF, PF, C. */
  starters: [PlayerId, PlayerId, PlayerId, PlayerId, PlayerId];
  /** Ordered bench rotation. First N are the rotation guys; later are deep bench. */
  bench: PlayerId[];
  /** Positional fallback for when a starter is out (injury, foul trouble). */
  backupsByPosition: Record<BasketballPosition, PlayerId | null>;
  /** Tactical: starting unit pace preference. Affects sim's possessions-per-game. */
  pace: 'fast' | 'medium' | 'slow';
}

/** Pre-game strategy (stored on team.sportData.gamePlan). Every lever is neutral
 *  at its 'balanced'/'man' default, so an unset or default plan leaves the sim
 *  exactly as it was. The sim reads these per side and biases the box score. */
export interface BasketballGamePlan {
  /** Tempo → possessions per game. */
  pace: 'slow' | 'balanced' | 'fast';
  /** Shot location lean → 3PA vs interior mix. */
  offensiveFocus: 'inside' | 'balanced' | 'perimeter';
  /** Shot difficulty/variance → 3PA + make% trade-off. */
  shotRisk: 'conservative' | 'balanced' | 'hero';
  /** Defensive coverage. */
  defensiveScheme: 'man' | 'zone' | 'switch';
  /** Ball pressure → forced turnovers vs easy buckets allowed. */
  pressure: 'pack' | 'balanced' | 'press';
  /** Minutes lean (reserved for rotation weighting). */
  rotation: 'starters' | 'balanced' | 'bench';
}

export const DEFAULT_GAME_PLAN: BasketballGamePlan = {
  pace: 'balanced',
  offensiveFocus: 'balanced',
  shotRisk: 'balanced',
  defensiveScheme: 'man',
  pressure: 'balanced',
  rotation: 'balanced',
};

// ============================================================================
// Sport-specific extension data (lives in BasePlayer.sportData)
// ============================================================================

export interface BasketballPlayerData {
  /** Primary position. Lives here (not on BasePlayer) because position is
   *  a sport-specific concept — football has 11, basketball has 5, soccer
   *  has 4, etc. BasePlayer stays sport-agnostic. */
  position: BasketballPosition;
  /** Secondary position the player can credibly play. e.g. a PG who can play
   *  SG. Optional; absent for pure position players. */
  secondaryPosition?: BasketballPosition;
  /** Star tier — analog to football's qbTier. Used by recap engine, trade
   *  acceptance AI, and contract negotiation. */
  starTier: 'superstar' | 'star' | 'starter' | 'role' | 'bench';
  /** Years in the league (NBA service time). Caps off rookie scale, drives
   *  veteran minimum, gates Bird rights. */
  yearsInLeague: number;
  /** Bird rights status with the current team. */
  birdRights: 'full' | 'early' | 'none';
  /** True if on a two-way contract (separate salary structure, can spend
   *  limited time on NBA roster). */
  isTwoWay: boolean;
  /** Preferred shooting hand. Affects late-game free throw selection,
   *  matchups, and a few sim edge cases. */
  shootingHand: 'left' | 'right';
  /** Ratings snapshot from before the last offseason's aging — drives the
   *  "what changed" rating deltas on the player page. (Phase 2E-1.) */
  prevRatings?: BasketballRatings;
  /** Compact year-by-year log appended at each rollover. (Phase 2E-1.) */
  seasonLog?: PlayerSeasonLogEntry[];
  /** How the player joined his current team (drives the roster "Acquired"
   *  column). Stamped at the draft / trade / free-agency / initial-roster
   *  join points; absent on old saves (the UI infers from draft fields). */
  acquiredVia?: 'draft' | 'free-agency' | 'trade' | 'initial';
  acquiredSeason?: number;
  /** Overall pick # / round / class year, set when acquired via the draft. */
  draftPick?: number;
  draftRound?: number;
  draftYear?: number;
  /** Consensus big-board rank (1 = best prospect) for a draft-eligible
   *  prospect, stamped at import/migration from the real-world board. Anchors
   *  the AI auto-pick so the draft follows the board top-to-bottom. Absent for
   *  generated future classes and off-board prospects (they fall back to
   *  talent-based scoring). */
  draftProjection?: number;
  /** Headshot URL — stamped at import from BBGM/ZenGM's `imgURL` field.
   *  PlayerAvatar renders it as a circular image when present and falls back
   *  to initials otherwise. Generated players (drafted in-sim, future classes)
   *  never have one. */
  photoUrl?: string;
}

export interface PlayerSeasonLogEntry {
  season: number;
  age: number;
  /** Overall rating during that season (pre-aging snapshot). */
  overall: number;
  gamesPlayed: number;
  ppg: number;
  rpg: number;
  apg: number;
  /** Per-game efficiency rating (NBA "EFF"). Absent on logs written before it
   *  was tracked — callers estimate from ppg/rpg/apg as a fallback. */
  per?: number;
}

export interface BasketballTeamData {
  conference: 'Eastern' | 'Western';
  division: 'Atlantic' | 'Central' | 'Southeast' | 'Northwest' | 'Pacific' | 'Southwest';
  /** Team pace preference. Drives expected possessions per game in the sim. */
  pace: 'fast' | 'medium' | 'slow';
  /** Defensive scheme — affects per-possession shot quality vs perimeter
   *  shooters, vs interior scorers. */
  defensiveScheme: 'switch_everything' | 'drop_coverage' | 'aggressive_trap' | 'conservative';
  /** Lottery odds for next draft. Populated after season ends if team missed
   *  playoffs; null otherwise. */
  lotteryOdds?: { combinations: number; expectedPick: number };
  /** User-set rotation. When present (and still valid for the roster) the sim
   *  uses it instead of the auto-built default lineup. (Phase 2D-7.) */
  lineup?: BasketballLineup;
}

// ============================================================================
// Concrete player + team narrowings (convenience aliases)
// ============================================================================

/** A basketball player, fully typed. Equivalent to
 *  `BasePlayer<BasketballRatings, BasketballStats> & { sportData: BasketballPlayerData }` */
export type BasketballPlayer = BasePlayer<BasketballRatings, BasketballStats> & {
  sportData: BasketballPlayerData;
};

export type BasketballTeam = BaseTeam<BasketballRatings, BasketballStats> & {
  sportData: BasketballTeamData;
};

// ============================================================================
// Helpers
// ============================================================================

/** Construct an empty stats object. Used to initialize new players + as the
 *  zero element for stat aggregation. */
export function emptyBasketballStats(): BasketballStats {
  return {
    gamesPlayed: 0,
    gamesStarted: 0,
    minutes: 0,
    points: 0,
    fieldGoalsMade: 0,
    fieldGoalsAttempted: 0,
    threePointsMade: 0,
    threePointsAttempted: 0,
    freeThrowsMade: 0,
    freeThrowsAttempted: 0,
    assists: 0,
    turnovers: 0,
    offensiveRebounds: 0,
    defensiveRebounds: 0,
    totalRebounds: 0,
    steals: 0,
    blocks: 0,
    personalFouls: 0,
    plusMinus: 0,
    trueShootingAttempts: 0,
  };
}

/** Add stat lines field-by-field. Used by the sim to accumulate per-possession
 *  contributions into per-game stats, and by the season runner to accumulate
 *  per-game stats into season totals. */
export function addBasketballStats(target: BasketballStats, source: Partial<BasketballStats>): BasketballStats {
  return {
    gamesPlayed: target.gamesPlayed + (source.gamesPlayed ?? 0),
    gamesStarted: target.gamesStarted + (source.gamesStarted ?? 0),
    minutes: target.minutes + (source.minutes ?? 0),
    points: target.points + (source.points ?? 0),
    fieldGoalsMade: target.fieldGoalsMade + (source.fieldGoalsMade ?? 0),
    fieldGoalsAttempted: target.fieldGoalsAttempted + (source.fieldGoalsAttempted ?? 0),
    threePointsMade: target.threePointsMade + (source.threePointsMade ?? 0),
    threePointsAttempted: target.threePointsAttempted + (source.threePointsAttempted ?? 0),
    freeThrowsMade: target.freeThrowsMade + (source.freeThrowsMade ?? 0),
    freeThrowsAttempted: target.freeThrowsAttempted + (source.freeThrowsAttempted ?? 0),
    assists: target.assists + (source.assists ?? 0),
    turnovers: target.turnovers + (source.turnovers ?? 0),
    offensiveRebounds: target.offensiveRebounds + (source.offensiveRebounds ?? 0),
    defensiveRebounds: target.defensiveRebounds + (source.defensiveRebounds ?? 0),
    totalRebounds: target.totalRebounds + (source.totalRebounds ?? 0),
    steals: target.steals + (source.steals ?? 0),
    blocks: target.blocks + (source.blocks ?? 0),
    personalFouls: target.personalFouls + (source.personalFouls ?? 0),
    plusMinus: target.plusMinus + (source.plusMinus ?? 0),
    trueShootingAttempts: target.trueShootingAttempts + (source.trueShootingAttempts ?? 0),
  };
}

/** Compute true shooting percentage. Returns 0 if no shot attempts. */
export function trueShootingPct(stats: BasketballStats): number {
  const tsa = stats.fieldGoalsAttempted + 0.44 * stats.freeThrowsAttempted;
  if (tsa === 0) return 0;
  return stats.points / (2 * tsa);
}

/** Compute effective field goal percentage (3PM weighted 1.5×). */
export function effectiveFieldGoalPct(stats: BasketballStats): number {
  if (stats.fieldGoalsAttempted === 0) return 0;
  return (stats.fieldGoalsMade + 0.5 * stats.threePointsMade) / stats.fieldGoalsAttempted;
}

/** Per-game averaging. Returns a stat line scaled to per-game from totals. */
export function perGame(stats: BasketballStats): Partial<BasketballStats> {
  if (stats.gamesPlayed === 0) return {};
  const g = stats.gamesPlayed;
  return {
    minutes: stats.minutes / g,
    points: stats.points / g,
    fieldGoalsMade: stats.fieldGoalsMade / g,
    fieldGoalsAttempted: stats.fieldGoalsAttempted / g,
    threePointsMade: stats.threePointsMade / g,
    threePointsAttempted: stats.threePointsAttempted / g,
    freeThrowsMade: stats.freeThrowsMade / g,
    freeThrowsAttempted: stats.freeThrowsAttempted / g,
    assists: stats.assists / g,
    turnovers: stats.turnovers / g,
    offensiveRebounds: stats.offensiveRebounds / g,
    defensiveRebounds: stats.defensiveRebounds / g,
    totalRebounds: stats.totalRebounds / g,
    steals: stats.steals / g,
    blocks: stats.blocks / g,
    personalFouls: stats.personalFouls / g,
  };
}
