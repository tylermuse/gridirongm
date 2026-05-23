/**
 * basketball.adapter.sketch.ts
 *
 * Second sport sketch. Validates that the SportAdapter interface generalizes
 * past football. Types are concrete enough to prove the contract fits;
 * function bodies are unimplemented (the real implementation will live in
 * @bs/sport-basketball after the interface is locked).
 *
 * Key things this sketch is meant to validate:
 *   - Different roster size (15 active vs football's 53)
 *   - Different position model (5 broad positions vs football's 11)
 *   - Different cap shape (NBA soft cap + luxury tax + apron vs football hard cap)
 *   - Different lineup model ('rotation' vs football's 'depth_chart')
 *   - Different draft (2 rounds + lottery vs football's 7 rounds + reverse standings)
 *   - Different stat schema (basketball is simpler than football)
 *   - Single competition (same as football — this isn't where soccer breaks things)
 */

import type {
  SportAdapter,
  RosterRules,
  SeasonCalendar,
  CompetitionDefinition,
  PlayerGenerator,
  StatsEngine,
  SimEngine,
  ScheduleGenerator,
  DraftSystem,
  DevelopmentSystem,
  PlayerMovementValuator,
  AwardSystem,
  CapRules,
  UiMetadata,
  LineupModelDescriptor,
  CoachingSystem,
} from './SportAdapter';
import type { PlayerId } from './BaseTypes';

// ============================================================================
// Concrete types
// ============================================================================

export type BasketballPosition = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

export type BasketballPlayerKind = 'standard';

export interface BasketballRatings {
  overall: number;
  // Physical
  height: number;
  wingspan: number;
  speed: number;
  strength: number;
  vertical: number;
  // Offense
  threePoint: number;
  midRange: number;
  finishing: number;
  freeThrow: number;
  postScoring: number;
  handles: number;
  passing: number;
  // Defense
  perimeterDefense: number;
  interiorDefense: number;
  rebounding: number;
  steal: number;
  block: number;
  // Mental
  basketballIQ: number;
  intangibles: number;
}

export interface BasketballStats {
  gamesPlayed: number;
  gamesStarted: number;
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
  // Advanced (derived but cached)
  plusMinus: number;
  trueShootingAttempts: number;
}

/** Basketball uses a rotation model: 5 starters + 7-8 bench in defined
 *  rotation order, with per-position depth as secondary info. */
export interface BasketballLineup {
  starters: [PlayerId, PlayerId, PlayerId, PlayerId, PlayerId]; // PG, SG, SF, PF, C
  bench: PlayerId[]; // ordered by rotation priority
  /** Optional positional fallback for when a starter is out. */
  backupsByPosition: Record<BasketballPosition, PlayerId | null>;
}

// ============================================================================
// Sport-specific extension data
// ============================================================================

export interface BasketballPlayerData {
  /** Star tier — analog to football's qbTier. Used by recap engine and trade
   *  acceptance AI. */
  starTier: 'superstar' | 'star' | 'starter' | 'role' | 'bench';
  /** Years in the league (NBA service time). */
  yearsInLeague: number;
  /** Bird rights status. 'full' = Bird, 'early' = Early Bird, 'none'. */
  birdRights: 'full' | 'early' | 'none';
  /** Two-way contract flag (separate from rosterSlot bucket since two-way
   *  contracts have their own salary structure). */
  isTwoWay: boolean;
}

export interface BasketballTeamData {
  conference: 'Eastern' | 'Western';
  division: 'Atlantic' | 'Central' | 'Southeast' | 'Northwest' | 'Pacific' | 'Southwest';
  pace: 'fast' | 'medium' | 'slow';
  defensiveScheme: 'switch_everything' | 'drop_coverage' | 'aggressive_trap' | 'conservative';
  /** Lottery odds for next draft (if in lottery). Set after season ends. */
  lotteryOdds?: { combinations: number; expectedPick: number };
}

// ============================================================================
// Roster rules
// ============================================================================

export const basketballRosterRules: RosterRules<BasketballPosition> = {
  buckets: [
    {
      name: 'active',
      label: 'Active Roster (15)',
      capacity: 15,
      countsAsActive: true,
      countsAgainstCap: true,
      eligibleForLineups: true,
      ownership: 'self',
    },
    {
      name: 'two_way',
      label: 'Two-Way Contracts (3)',
      capacity: 3,
      countsAsActive: false,
      countsAgainstCap: false,
      eligibleForLineups: true,
      ownership: 'self',
    },
    {
      name: 'inactive',
      label: 'Inactive List',
      capacity: Infinity,
      countsAsActive: false,
      countsAgainstCap: true,
      eligibleForLineups: false,
      ownership: 'self',
    },
  ],
  activeRosterSize: 15,
  positionLimits: {
    PG: { min: 2, max: 4 },
    SG: { min: 2, max: 4 },
    SF: { min: 2, max: 4 },
    PF: { min: 2, max: 4 },
    C:  { min: 2, max: 3 },
  },
  validate() { throw new Error('Stub — implement in @bs/sport-basketball'); },
};

// ============================================================================
// Season calendar
// ============================================================================

export const basketballSeasonCalendar: SeasonCalendar = {
  ticksPerSeason: 300, // ~daily ticks across calendar year
  phases: [
    {
      name: 'preseason',
      label: 'Preseason',
      startTick: 1,
      endTick: 20,
      hasGames: true,
      allowedMovements: ['trade', 'free_agency_sign', 'release'],
    },
    {
      name: 'regular_season',
      label: 'Regular Season',
      startTick: 21,
      endTick: 200,
      hasGames: true,
      allowedMovements: ['trade', 'release', 'free_agency_sign'],
    },
    {
      name: 'playoffs',
      label: 'Playoffs',
      startTick: 201,
      endTick: 250,
      hasGames: true,
      allowedMovements: [],
    },
    {
      name: 'offseason',
      label: 'Offseason',
      startTick: 251,
      endTick: 300,
      hasGames: false,
      allowedMovements: ['trade', 'free_agency_sign', 'release'],
    },
  ],
  describeTick() { throw new Error('Stub'); },
  phaseForTick() { throw new Error('Stub'); },
};

// ============================================================================
// Competitions
// ============================================================================

export const basketballCompetitions: readonly CompetitionDefinition[] = [
  {
    id: 'primary',
    displayName: 'BS Hoops',
    format: {
      kind: 'round_robin',
      gamesPerOpponent: 3, // ~82 games over 29 opponents
      followedByPlayoff: {
        rounds: [
          { name: 'Play-In', tieFormat: { type: 'single_match' } },
          { name: 'First Round', tieFormat: { type: 'best_of', games: 7 } },
          { name: 'Conference Semis', tieFormat: { type: 'best_of', games: 7 } },
          { name: 'Conference Finals', tieFormat: { type: 'best_of', games: 7 } },
          { name: 'Finals', tieFormat: { type: 'best_of', games: 7 } },
        ],
        reseededEachRound: false,
      },
    },
    entryRule: 'all_league',
    weight: 1.0,
  },
];

// ============================================================================
// Capability stubs
// ============================================================================

export const basketballPlayerGen: PlayerGenerator<BasketballRatings, BasketballStats> = {
  generatePlayer() { throw new Error('Stub'); },
  generateDraftClass() { throw new Error('Stub'); },
  migrate() { throw new Error('Stub'); },
};

export const basketballStatsEngine: StatsEngine<BasketballStats> = {
  empty() { throw new Error('Stub'); },
  accumulate() { throw new Error('Stub'); },
  derived() {
    // Returns PER, TS%, eFG%, USG%, WS, BPM, VORP, etc.
    throw new Error('Stub');
  },
  format() { throw new Error('Stub'); },
};

export const basketballSimEngine: SimEngine<BasketballRatings, BasketballStats> = {
  simGame() {
    // ~200 possessions per game, possession-based probability tree:
    // shot type (3pt/midrange/finish/post) × shot quality × defender match
    // → made/missed → rebound side → next possession.
    // Stats accumulate per player per possession involvement.
    throw new Error('Stub — see zengm/basketball-gm for reference impl');
  },
};

export const basketballScheduleGenerator: ScheduleGenerator<BasketballRatings, BasketballStats> = {
  generate() {
    // 82 games = 4 vs division (4×4=16) + 4 vs other conf division (4×10=40)
    //         + 3-4 vs out-of-conference (15×2=30 alt) ≈ 82
    // Back-to-back limits, no team plays >4 games in 6 nights.
    throw new Error('Stub');
  },
};

export const basketballDraftSystem: DraftSystem<BasketballRatings, BasketballStats> = {
  rounds: 2,
  draftPhase: 'offseason_early',
  orderRule: 'mixed_lottery_then_reverse',
  computeDraftOrder() {
    // Lottery for picks 1-14, reverse-standings for 15-30 round 1 + all of round 2.
    throw new Error('Stub');
  },
  aiPick() { throw new Error('Stub'); },
  pickValue() {
    // Pick value curve is much steeper than NFL — #1 overall ≈ 4× value of pick #14.
    throw new Error('Stub');
  },
};

export const basketballDevelopment: DevelopmentSystem<BasketballRatings, BasketballStats> = {
  developSeason() { throw new Error('Stub'); },
  shouldRetire() { throw new Error('Stub'); },
  tickPlayer() { throw new Error('Stub'); },
};

export const basketballTradeValuator: PlayerMovementValuator<BasketballRatings, BasketballStats> = {
  playerValue() { throw new Error('Stub'); },
  evaluate() {
    // Must validate NBA salary-matching rules (~125% of outgoing within
    // certain ranges) — done by calling capRules.isLegalContract on the
    // resulting contracts.
    throw new Error('Stub');
  },
  supportedMovementTypes: ['trade', 'free_agency_sign', 'release'],
};

export const basketballAwards: AwardSystem<BasketballStats> = {
  definitions: [
    { id: 'mvp', name: 'MVP', description: 'Most Valuable Player', primaryStatKeys: ['points', 'assists', 'totalRebounds'] },
    { id: 'dpoy', name: 'Defensive Player of the Year', description: 'Top defender', primaryStatKeys: ['steals', 'blocks', 'defensiveRebounds'] },
    { id: 'roy', name: 'Rookie of the Year', description: 'Top rookie', primaryStatKeys: ['points', 'assists'] },
    { id: 'sixth_man', name: 'Sixth Man of the Year', description: 'Top bench player', primaryStatKeys: ['points'] },
    { id: 'mip', name: 'Most Improved Player', description: 'Biggest year-over-year improvement', primaryStatKeys: ['points'] },
    { id: 'coy', name: 'Coach of the Year', description: 'Top coaching performance', primaryStatKeys: [] },
    { id: 'finals_mvp', name: 'Finals MVP', description: 'Best player in the Finals', primaryStatKeys: ['points', 'assists', 'totalRebounds'] },
  ],
  computeWinners() { throw new Error('Stub'); },
};

export const basketballCapRules: CapRules<BasketballRatings, BasketballStats> = {
  currentCap() { throw new Error('Stub — BRI-tied formula'); },
  isLegalContract() {
    // Validates max salary tiers (25/30/35% of cap by years of service),
    // rookie scale, minimum salaries, Bird rights overage.
    throw new Error('Stub');
  },
  isLegalRoster() {
    // Hard apron is the only true ceiling; first apron + tax thresholds
    // have penalties but don't make rosters "illegal."
    throw new Error('Stub');
  },
  deadCapForRelease() {
    // Waive-and-stretch spreads dead money over 2× remaining contract +1
    // years. Otherwise full remaining guaranteed money hits immediately.
    throw new Error('Stub');
  },
  marketSalary() { throw new Error('Stub'); },
  availableCapActions() {
    // 'Use Mid-Level Exception', 'Use Bi-Annual Exception',
    // 'Match RFA Offer Sheet', 'Stretch Released Player',
    // 'Take Back > 125% (if under apron)', etc.
    throw new Error('Stub');
  },
};

export const basketballCoaching: CoachingSystem = {
  roles: ['HC', 'AC', 'PDC', 'ATC'], // Head, Asst, Player Dev, Athletic Trainer
  schemes: {
    HC: ['five_out', 'horns', 'princeton', 'triangle', 'flow'],
  },
  maxStaffSize: 6,
};

export const basketballLineupModel: LineupModelDescriptor<BasketballLineup> = {
  kind: 'rotation',
  buildDefault() { throw new Error('Stub'); },
  validate() { throw new Error('Stub — exactly 5 starters, valid positions'); },
};

export const basketballUi: UiMetadata<
  BasketballRatings,
  BasketballStats,
  BasketballPosition,
  BasketballLineup
> = {
  ratingFields: [
    { key: 'threePoint', label: '3PT', group: 'Shooting' },
    { key: 'midRange', label: 'MID', group: 'Shooting' },
    { key: 'finishing', label: 'FIN', group: 'Shooting' },
    { key: 'freeThrow', label: 'FT', group: 'Shooting' },
    { key: 'postScoring', label: 'POST', group: 'Shooting' },
    { key: 'handles', label: 'HND', group: 'Playmaking' },
    { key: 'passing', label: 'PAS', group: 'Playmaking' },
    { key: 'perimeterDefense', label: 'PRM', group: 'Defense' },
    { key: 'interiorDefense', label: 'INT', group: 'Defense' },
    { key: 'rebounding', label: 'REB', group: 'Defense' },
    { key: 'steal', label: 'STL', group: 'Defense' },
    { key: 'block', label: 'BLK', group: 'Defense' },
    { key: 'speed', label: 'SPD', group: 'Athletic' },
    { key: 'vertical', label: 'VRT', group: 'Athletic' },
    { key: 'strength', label: 'STR', group: 'Athletic' },
    { key: 'basketballIQ', label: 'IQ', group: 'Mental' },
    { key: 'intangibles', label: 'INT', group: 'Mental' },
  ],
  statColumns: [
    { key: 'points', label: 'PTS', category: 'Scoring', format: 'decimal', higherIsBetter: true },
    { key: 'totalRebounds', label: 'REB', category: 'Other', format: 'decimal', higherIsBetter: true },
    { key: 'assists', label: 'AST', category: 'Other', format: 'decimal', higherIsBetter: true },
    { key: 'steals', label: 'STL', category: 'Defense', format: 'decimal', higherIsBetter: true },
    { key: 'blocks', label: 'BLK', category: 'Defense', format: 'decimal', higherIsBetter: true },
    { key: 'turnovers', label: 'TO', category: 'Other', format: 'decimal', higherIsBetter: false },
    { key: 'fieldGoalsMade', label: 'FG', category: 'Shooting', format: 'integer', higherIsBetter: true },
    { key: 'threePointsMade', label: '3PM', category: 'Shooting', format: 'integer', higherIsBetter: true },
    { key: 'plusMinus', label: '+/-', category: 'Other', format: 'decimal', higherIsBetter: true },
  ],
  positionGroups: [
    { label: 'Backcourt', positions: ['PG', 'SG'] },
    { label: 'Wing', positions: ['SF'] },
    { label: 'Frontcourt', positions: ['PF', 'C'] },
  ],
  describeLineup() { throw new Error('Stub'); },
};

// ============================================================================
// The assembled adapter
// ============================================================================

export const basketballAdapter: SportAdapter<
  BasketballRatings,
  BasketballStats,
  BasketballPosition,
  BasketballLineup
> = {
  sportId: 'basketball',
  displayName: 'BS Hoops',
  brandName: 'BS Hoops',
  positions: ['PG', 'SG', 'SF', 'PF', 'C'] as const,
  playerKinds: ['standard'] as const,
  rosterRules: basketballRosterRules,
  seasonCalendar: basketballSeasonCalendar,
  competitions: basketballCompetitions,
  playerGen: basketballPlayerGen,
  statsEngine: basketballStatsEngine,
  simEngine: basketballSimEngine,
  // liveSim: undefined — not built yet, future capability
  scheduleGenerator: basketballScheduleGenerator,
  draftSystem: basketballDraftSystem,
  developmentSystem: basketballDevelopment,
  tradeValuator: basketballTradeValuator,
  awards: basketballAwards,
  ui: basketballUi,
  lineupModel: basketballLineupModel,
  coachingSystem: basketballCoaching,
  capRules: basketballCapRules,
  // promotionRelegation: undefined
};

// ============================================================================
// VALIDATION NOTES — what this sketch proved about the interface
// ============================================================================

/**
 * Things the basketball sketch confirmed the interface handles cleanly:
 *
 * 1. Smaller roster (15 vs 53). RosterRules.activeRosterSize is just a number;
 *    no special handling needed.
 *
 * 2. Two-way contracts as a separate roster bucket with countsAgainstCap = false
 *    and a low capacity. Generalizes football's practice_squad cleanly.
 *
 * 3. Different cap math (NBA soft cap + apron) fits the imperative CapRules
 *    interface fine — the difference lives inside isLegalContract,
 *    isLegalRoster, and availableCapActions function bodies. The interface
 *    doesn't have to know about Bird rights specifically.
 *
 * 4. Rotation lineup model works as a sibling to depth_chart. The lineup
 *    kind discriminator on LineupModelDescriptor is the right abstraction.
 *
 * 5. Draft with lottery + reverse standings fit via orderRule:
 *    'mixed_lottery_then_reverse'. Future Claude sessions may want a more
 *    expressive enum, but 'mixed_lottery_then_reverse' is fine for v1.
 *
 * 6. Playoff format with best-of series — accommodated by PlayoffFormat
 *    .rounds[].tieFormat as { type: 'best_of', games: 7 }. Football uses
 *    { type: 'single_match' }. Soccer cup ties use { type: 'legs', count: 2 }.
 *    (PlayoffFormat originally used a plain `bestOf: number`; this was
 *    generalized to TieFormat during the soccer pressure-test — see
 *    DECISIONS.md Interface Change #2.)
 *
 * NO INTERFACE CHANGES NEEDED for basketball.
 */
