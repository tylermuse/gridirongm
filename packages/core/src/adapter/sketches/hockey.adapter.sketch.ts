/**
 * hockey.adapter.sketch.ts
 *
 * Third sport sketch. Validates two things the football+basketball sketches
 * did not: (1) discriminated PlayerKinds for skaters vs goalies (different
 * rating and stat shapes within one sport), and (2) the 'lines' lineup model
 * (forward lines + defense pairs + goalie rotation, structurally distinct
 * from depth charts and rotations).
 *
 * AHL affiliate decision: simple minors-stash roster bucket per the plan
 * default. The interface is shaped to accept a future "real AHL parallel
 * league" upgrade without contract changes — the hockey adapter would just
 * (a) add an AHL CompetitionDefinition, (b) flip the minors bucket's
 * eligibleForLineups to true within AHL-scoped game contexts. Core changes:
 * zero.
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
} from '../SportAdapter';
import type { PlayerId } from '../BaseTypes';

// ============================================================================
// Concrete types
// ============================================================================

export type HockeyPosition = 'C' | 'LW' | 'RW' | 'D' | 'G';

/** Hockey's PlayerKind discriminator. Goalies have a completely separate
 *  rating set and stat set from skaters — this is the first sport in the
 *  portfolio that needs the discriminator to be load-bearing. */
export type HockeyPlayerKind = 'skater' | 'goalie';

// ----- Discriminated rating types -----

export interface SkaterRatings {
  kind: 'skater';
  overall: number;
  // Skating
  skating: number;
  acceleration: number;
  agility: number;
  // Shooting
  wristShot: number;
  slapShot: number;
  shotAccuracy: number;
  // Playmaking
  passing: number;
  puckControl: number;
  vision: number;
  // Physical
  strength: number;
  checking: number;
  fighting: number;
  // Defense
  defensiveAwareness: number;
  stickChecking: number;
  shotBlocking: number;
  // Mental
  hockeyIQ: number;
  composure: number;
  faceoff: number; // centers especially
}

export interface GoalieRatings {
  kind: 'goalie';
  overall: number;
  // Technical
  reflexes: number;
  positioning: number;
  reboundControl: number;
  glove: number;
  blocker: number;
  // Movement
  skatingForGoalies: number; // (different scale than skater skating)
  recovery: number;
  // Mental
  composure: number;
  puckHandling: number;
  hockeyIQ: number;
}

export type HockeyRatings = SkaterRatings | GoalieRatings;

// ----- Discriminated stat types -----

export interface SkaterStats {
  kind: 'skater';
  gamesPlayed: number;
  goals: number;
  assists: number;
  points: number; // derived = goals + assists, but cached
  plusMinus: number;
  pim: number; // penalty minutes
  shotsOnGoal: number;
  hits: number;
  blocks: number;
  takeaways: number;
  giveaways: number;
  faceoffWins: number;
  faceoffLosses: number;
  // Time on ice
  timeOnIceTotal: number; // seconds
  powerPlayTime: number;
  shortHandedTime: number;
  // Situational
  powerPlayGoals: number;
  shortHandedGoals: number;
  gameWinningGoals: number;
  shootoutGoals: number;
  shootoutAttempts: number;
}

export interface GoalieStats {
  kind: 'goalie';
  gamesPlayed: number;
  gamesStarted: number;
  wins: number;
  losses: number;
  otLosses: number;
  shotsAgainst: number;
  goalsAgainst: number;
  saves: number;
  shutouts: number;
  timeOnIceTotal: number;
  // Derived but cached: SV%, GAA — computed by StatsEngine.derived()
}

export type HockeyStats = SkaterStats | GoalieStats;

/** Hockey lineup model: 4 forward lines (3 skaters each), 3 defense pairs
 *  (2 skaters each), 2 goalies (starter + backup). 12+6+2 = 20 game roster. */
export interface HockeyLineup {
  forwardLines: [
    { lw: PlayerId; c: PlayerId; rw: PlayerId }, // 1st line
    { lw: PlayerId; c: PlayerId; rw: PlayerId }, // 2nd line
    { lw: PlayerId; c: PlayerId; rw: PlayerId }, // 3rd line
    { lw: PlayerId; c: PlayerId; rw: PlayerId }, // 4th line
  ];
  defensePairs: [
    { ld: PlayerId; rd: PlayerId }, // 1st pair
    { ld: PlayerId; rd: PlayerId }, // 2nd pair
    { ld: PlayerId; rd: PlayerId }, // 3rd pair
  ];
  starter: PlayerId; // goalie
  backup: PlayerId;  // goalie
  /** Special teams units. */
  powerPlay: {
    unit1: { skaters: PlayerId[] }; // typically 4 fwd + 1 D
    unit2: { skaters: PlayerId[] };
  };
  penaltyKill: {
    unit1: { skaters: PlayerId[] }; // typically 2 fwd + 2 D
    unit2: { skaters: PlayerId[] };
  };
}

// ============================================================================
// Sport-specific extension data
// ============================================================================

export interface HockeyPlayerData {
  handedness: 'L' | 'R';
  shootsLeft: boolean;
  /** Waiver eligibility per NHL rules — depends on age + pro experience. */
  waiverExempt: boolean;
  /** Junior or college team if not yet pro. Affects draft+1 / draft+2 logic. */
  amateurAffiliation?: string;
  /** Long-Term Injured Reserve flag. */
  onLTIR: boolean;
}

export interface HockeyTeamData {
  conference: 'Eastern' | 'Western';
  division: 'Atlantic' | 'Metropolitan' | 'Central' | 'Pacific';
  /** Per default decision: AHL handled as simple roster bucket. The team
   *  carries an affiliate name for cosmetic/news purposes only. */
  ahlAffiliateName: string;
  /** Tactical style. */
  systemStyle: 'forecheck' | 'trap' | 'aggressive_pinch' | 'shot_volume';
  /** LTIR pool — cap relief currently being used. */
  ltirPoolInUse: number;
}

// ============================================================================
// Roster rules
// ============================================================================

export const hockeyRosterRules: RosterRules<HockeyPosition> = {
  buckets: [
    {
      name: 'active',
      label: 'NHL Roster (23)',
      capacity: 23,
      countsAsActive: true,
      countsAgainstCap: true,
      eligibleForLineups: true,
      ownership: 'self',
      positionLimits: {
        C:  { min: 4, max: 7 },
        LW: { min: 3, max: 5 },
        RW: { min: 3, max: 5 },
        D:  { min: 6, max: 8 },
        G:  { min: 2, max: 3 },
      },
    },
    {
      // Default decision: minors as a simple stash, no parallel league
      // simulated. The interface accepts this as just another roster bucket.
      name: 'minors',
      label: 'AHL / Minors',
      capacity: Infinity,
      countsAsActive: false,
      countsAgainstCap: false,
      eligibleForLineups: false,
      ownership: 'self',
    },
    {
      name: 'injured_reserve',
      label: 'Injured Reserve',
      capacity: Infinity,
      countsAsActive: false,
      countsAgainstCap: true,
      eligibleForLineups: false,
      ownership: 'self',
    },
    {
      name: 'ltir',
      label: 'Long-Term Injured Reserve',
      capacity: Infinity,
      countsAsActive: false,
      countsAgainstCap: false, // LTIR provides relief — handled by capRules
      eligibleForLineups: false,
      ownership: 'self',
    },
  ],
  activeRosterSize: 23,
  positionLimits: {
    C:  { min: 4, max: 7 },
    LW: { min: 3, max: 5 },
    RW: { min: 3, max: 5 },
    D:  { min: 6, max: 8 },
    G:  { min: 2, max: 3 },
  },
  validate() { throw new Error('Stub'); },
};

// ============================================================================
// Season calendar
// ============================================================================

export const hockeySeasonCalendar: SeasonCalendar = {
  ticksPerSeason: 280,
  phases: [
    {
      name: 'preseason',
      label: 'Preseason / Training Camp',
      startTick: 1,
      endTick: 20,
      hasGames: true,
      allowedMovements: ['trade', 'free_agency_sign', 'release', 'waiver'],
    },
    {
      name: 'regular_season',
      label: 'Regular Season',
      startTick: 21,
      endTick: 200,
      hasGames: true,
      allowedMovements: ['trade', 'release', 'waiver', 'free_agency_sign'],
    },
    {
      name: 'playoffs',
      label: 'Stanley Cup Playoffs',
      startTick: 201,
      endTick: 260,
      hasGames: true,
      allowedMovements: [],
    },
    {
      name: 'offseason',
      label: 'Offseason',
      startTick: 261,
      endTick: 280,
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

export const hockeyCompetitions: readonly CompetitionDefinition[] = [
  {
    id: 'primary',
    displayName: 'BS Hockey',
    format: {
      kind: 'round_robin',
      gamesPerOpponent: 3, // ~82 games
      followedByPlayoff: {
        rounds: [
          { name: 'First Round', tieFormat: { type: 'best_of', games: 7 } },
          { name: 'Second Round', tieFormat: { type: 'best_of', games: 7 } },
          { name: 'Conference Finals', tieFormat: { type: 'best_of', games: 7 } },
          { name: 'Stanley Cup Finals', tieFormat: { type: 'best_of', games: 7 } },
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

export const hockeyPlayerGen: PlayerGenerator<HockeyRatings, HockeyStats> = {
  generatePlayer(opts) {
    // Branches on opts.kind: 'skater' generates SkaterRatings,
    // 'goalie' generates GoalieRatings. Default 'skater'.
    throw new Error(`Stub — generate for kind: ${opts.kind ?? 'skater'}`);
  },
  generateDraftClass() {
    // Mix of skaters (~85%) and goalies (~15%) in a typical NHL draft.
    throw new Error('Stub');
  },
  migrate() { throw new Error('Stub'); },
};

export const hockeyStatsEngine: StatsEngine<HockeyStats> = {
  empty(kind) {
    // Caller MUST provide kind context. Returns SkaterStats for 'skater',
    // GoalieStats for 'goalie'. Throws on missing/invalid kind.
    if (kind !== 'skater' && kind !== 'goalie') {
      throw new Error(`Stub — hockey empty() requires kind 'skater' | 'goalie', got: ${kind}`);
    }
    throw new Error('Stub — implementation returns kind-shaped empty');
  },
  accumulate() {
    // Must verify same kind on both target + source, throw on mismatch.
    throw new Error('Stub');
  },
  derived() {
    // For goalies: SV% = saves / shotsAgainst, GAA = (goalsAgainst * 60 * 60) / timeOnIceTotal
    // For skaters: points (cached), Corsi/Fenwick if tracked, P/60
    throw new Error('Stub');
  },
  format() { throw new Error('Stub'); },
};

export const hockeySimEngine: SimEngine<HockeyRatings, HockeyStats> = {
  simGame() {
    // Period-based sim with ~30 shot attempts per side, special teams
    // multipliers (PP/PK), goalie save % vs. shot quality, OT shootout.
    throw new Error('Stub');
  },
};

export const hockeyScheduleGenerator: ScheduleGenerator<HockeyRatings, HockeyStats> = {
  generate() {
    // 82 games, division/conference rotation, back-to-backs allowed but
    // no 3-in-3, OT loss = 1 point in standings.
    throw new Error('Stub');
  },
};

export const hockeyDraftSystem: DraftSystem<HockeyRatings, HockeyStats> = {
  rounds: 7,
  draftPhase: 'offseason_early',
  orderRule: 'mixed_lottery_then_reverse',
  computeDraftOrder() {
    // Lottery for top 16 (non-playoff teams), reverse standings after.
    throw new Error('Stub');
  },
  aiPick() { throw new Error('Stub'); },
  pickValue() { throw new Error('Stub'); },
};

export const hockeyDevelopment: DevelopmentSystem<HockeyRatings, HockeyStats> = {
  developSeason() {
    // Hockey players develop later than basketball/football — peak 25-29.
    // Goalies have completely different curves (often peak 28-33).
    throw new Error('Stub');
  },
  shouldRetire() { throw new Error('Stub'); },
  tickPlayer() { throw new Error('Stub'); },
};

export const hockeyTradeValuator: PlayerMovementValuator<HockeyRatings, HockeyStats> = {
  playerValue() {
    // Position-weighted: top-pair D ≈ top-line F ≈ #1 goalie value-wise.
    // Cap-hit weighted (cheaper deals more valuable).
    throw new Error('Stub');
  },
  evaluate() {
    // Validates cap compliance (hard cap, no overage). Retained salary
    // capability handled by capNotes on TradeMovement.
    throw new Error('Stub');
  },
  supportedMovementTypes: ['trade', 'free_agency_sign', 'release', 'waiver'],
};

export const hockeyAwards: AwardSystem<HockeyStats> = {
  definitions: [
    { id: 'hart', name: 'Hart Trophy', description: 'Most Valuable Player', primaryStatKeys: ['points'] },
    { id: 'norris', name: 'Norris Trophy', description: 'Best Defenseman', primaryStatKeys: ['points', 'plusMinus'], positionRestricted: ['D'] },
    { id: 'vezina', name: 'Vezina Trophy', description: 'Best Goaltender', primaryStatKeys: ['wins', 'shutouts'], positionRestricted: ['G'] },
    { id: 'calder', name: 'Calder Trophy', description: 'Rookie of the Year', primaryStatKeys: ['points'] },
    { id: 'selke', name: 'Selke Trophy', description: 'Best Defensive Forward', primaryStatKeys: ['takeaways', 'blocks'] },
    { id: 'art_ross', name: 'Art Ross Trophy', description: 'Points Leader', primaryStatKeys: ['points'] },
    { id: 'rocket_richard', name: 'Rocket Richard Trophy', description: 'Goals Leader', primaryStatKeys: ['goals'] },
    { id: 'conn_smythe', name: 'Conn Smythe Trophy', description: 'Playoff MVP', primaryStatKeys: ['points'] },
  ],
  computeWinners() { throw new Error('Stub'); },
};

export const hockeyCapRules: CapRules<HockeyRatings, HockeyStats> = {
  currentCap() { throw new Error('Stub — hard cap, league-set annually'); },
  isLegalContract() {
    // Max length 7 years (8 for re-sign), max AAV 20% of cap, no signing
    // bonus restrictions for younger players. Two-way SPC support needed.
    throw new Error('Stub');
  },
  isLegalRoster() {
    // Hard cap with LTIR exception: if a player is on LTIR, team can
    // exceed cap by their cap hit while they're out.
    throw new Error('Stub');
  },
  deadCapForRelease() {
    // Buyout = 2/3 of remaining contract spread over 2x remaining years
    // (or 1/3 if player <26). Counts against cap.
    throw new Error('Stub');
  },
  marketSalary() { throw new Error('Stub'); },
  availableCapActions() {
    // 'Place on LTIR', 'Recall from LTIR', 'Buyout Contract',
    // 'Bury in Minors (cap hit minus league min)', 'Retain Salary in Trade'
    throw new Error('Stub');
  },
};

export const hockeyCoaching: CoachingSystem = {
  roles: ['HC', 'AC', 'GC'], // Head, Assistant, Goalie Coach
  schemes: {
    HC: ['forecheck', 'trap', 'aggressive', 'safe', 'transition'],
  },
  maxStaffSize: 5,
};

export const hockeyLineupModel: LineupModelDescriptor<HockeyLineup> = {
  kind: 'lines',
  buildDefault() {
    // Sort skaters into top→bottom 4 lines + 3 pairs based on rating,
    // handedness for D pairs (1 LD + 1 RD per pair preferred).
    throw new Error('Stub');
  },
  validate() {
    // 12 unique forwards, 6 unique defensemen, 2 goalies. PP/PK units
    // can overlap with even-strength lineup.
    throw new Error('Stub');
  },
};

export const hockeyUi: UiMetadata<
  HockeyRatings,
  HockeyStats,
  HockeyPosition,
  HockeyLineup
> = {
  ratingFields: [
    // NOTE: which ratings show depends on player.kind. The UI reads
    // player.kind and filters this list. Skater ratings vs goalie ratings
    // are completely disjoint sets.
    { key: 'skating', label: 'SKT', group: 'Skater · Athletic' },
    { key: 'wristShot', label: 'WRI', group: 'Skater · Shooting' },
    { key: 'slapShot', label: 'SLP', group: 'Skater · Shooting' },
    { key: 'passing', label: 'PAS', group: 'Skater · Playmaking' },
    { key: 'checking', label: 'CHK', group: 'Skater · Physical' },
    { key: 'defensiveAwareness', label: 'DEF', group: 'Skater · Defense' },
    { key: 'faceoff', label: 'FO', group: 'Skater · Special' },
    // Goalie ratings:
    { key: 'reflexes', label: 'REF', group: 'Goalie · Technical' },
    { key: 'positioning', label: 'POS', group: 'Goalie · Technical' },
    { key: 'reboundControl', label: 'REB', group: 'Goalie · Technical' },
    { key: 'glove', label: 'GLV', group: 'Goalie · Technical' },
    { key: 'blocker', label: 'BLK', group: 'Goalie · Technical' },
  ],
  statColumns: [
    // Skater columns
    { key: 'goals', label: 'G', category: 'Skater Scoring', format: 'integer', higherIsBetter: true },
    { key: 'assists', label: 'A', category: 'Skater Scoring', format: 'integer', higherIsBetter: true },
    { key: 'points', label: 'PTS', category: 'Skater Scoring', format: 'integer', higherIsBetter: true },
    { key: 'plusMinus', label: '+/-', category: 'Skater Other', format: 'integer', higherIsBetter: true },
    { key: 'pim', label: 'PIM', category: 'Skater Other', format: 'integer', higherIsBetter: false },
    { key: 'hits', label: 'HIT', category: 'Skater Physical', format: 'integer', higherIsBetter: true },
    // Goalie columns
    { key: 'wins', label: 'W', category: 'Goalie', format: 'integer', higherIsBetter: true },
    { key: 'saves', label: 'SV', category: 'Goalie', format: 'integer', higherIsBetter: true },
    { key: 'shutouts', label: 'SO', category: 'Goalie', format: 'integer', higherIsBetter: true },
    // Derived (computed by StatsEngine.derived())
    // sv_pct, gaa not in TStats — computed on the fly
  ],
  positionGroups: [
    { label: 'Forwards', positions: ['C', 'LW', 'RW'] },
    { label: 'Defense', positions: ['D'] },
    { label: 'Goaltenders', positions: ['G'] },
  ],
  describeLineup() { throw new Error('Stub — convert HockeyLineup to LineupDescription with 4 lines + 3 pairs + 2 goalies'); },
};

// ============================================================================
// The assembled adapter
// ============================================================================

export const hockeyAdapter: SportAdapter<
  HockeyRatings,
  HockeyStats,
  HockeyPosition,
  HockeyLineup
> = {
  sportId: 'hockey',
  displayName: 'BS Hockey',
  brandName: 'BS Hockey',
  positions: ['C', 'LW', 'RW', 'D', 'G'] as const,
  playerKinds: ['skater', 'goalie'] as const,
  rosterRules: hockeyRosterRules,
  seasonCalendar: hockeySeasonCalendar,
  competitions: hockeyCompetitions,
  playerGen: hockeyPlayerGen,
  statsEngine: hockeyStatsEngine,
  simEngine: hockeySimEngine,
  scheduleGenerator: hockeyScheduleGenerator,
  draftSystem: hockeyDraftSystem,
  developmentSystem: hockeyDevelopment,
  tradeValuator: hockeyTradeValuator,
  awards: hockeyAwards,
  ui: hockeyUi,
  lineupModel: hockeyLineupModel,
  coachingSystem: hockeyCoaching,
  capRules: hockeyCapRules,
};

// ============================================================================
// VALIDATION NOTES — what the hockey sketch proved
// ============================================================================

/**
 * Things the hockey sketch confirmed:
 *
 * 1. Discriminated PlayerKind works. HockeyRatings = SkaterRatings | GoalieRatings
 *    with kind: 'skater' | 'goalie' as the discriminator. TypeScript narrowing
 *    in sim/development/stats engines works cleanly. StatsEngine.empty() needed
 *    a kind param to construct the right shape — flagged here, applied during
 *    the soccer pass (Interface Change #3). Football and basketball ignore the
 *    new optional param since their kind is always 'standard'.
 *
 * 2. 'lines' lineup model fits as a sibling to 'depth_chart' and 'rotation'.
 *    The lineup kind enum on LineupModelDescriptor handles all three cleanly.
 *
 * 3. Special teams (PP/PK units) fit inside the lineup as additional unit
 *    fields. The sim engine reads them when sim state enters PP/PK phases.
 *    No interface change needed — the lineup TLineup is opaque to the core.
 *
 * 4. LTIR cap relief fits into capRules — it's a CapAction
 *    ('Place on LTIR') that mutates capState.sportData.ltirPoolInUse. The
 *    core doesn't need to know about LTIR specifically; the adapter's cap
 *    functions handle it.
 *
 * 5. Per-position award restrictions (Norris for D only, Vezina for G only)
 *    fit via AwardDefinition.positionRestricted. Verified the field exists.
 *
 * INTERFACE CHANGES FORCED: 1 minor — StatsEngine.empty() needed an optional
 * kind hint for sports with discriminated stat types. APPLIED during the
 * soccer pressure-test pass (soccer has the same need for outfield/keeper).
 * See DECISIONS.md "Interface change log" for the full reasoning.
 */
