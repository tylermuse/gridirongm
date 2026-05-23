/**
 * football.adapter.ts
 *
 * Reference adapter for BS Football. Types are concrete; function bodies are
 * stubs that point to the live implementations in ../src/lib/engine/. This
 * file's job is to prove that the SportAdapter interface fits what's already
 * built — if it doesn't, the interface is wrong.
 *
 * When this adapter is "promoted" to a real @bs/sport-football package, every
 * `throw new Error('see <path>')` body gets replaced with an import from the
 * referenced engine file. The signatures, types, and capability composition
 * stay exactly as drafted here.
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
  LiveSimEngine,
  UiMetadata,
  LineupModelDescriptor,
  CoachingSystem,
} from '../SportAdapter';
import type {
  BasePlayer,
  BaseTeam,
  BaseGameResult,
  BaseLeagueState,
  PlayerId,
  TeamId,
} from '../BaseTypes';

// ============================================================================
// Concrete types — narrowed from BaseTypes generics
// ============================================================================

export type FootballPosition =
  | 'QB' | 'RB' | 'WR' | 'TE' | 'OL'
  | 'DL' | 'LB' | 'CB' | 'S'
  | 'K' | 'P';

/** Football has one player kind. Hockey/soccer use this discriminator
 *  meaningfully; football keeps it 'standard' so the rest of the system
 *  has a uniform code path. */
export type FootballPlayerKind = 'standard';

/** Matches the existing PlayerRatings interface in ../src/types/index.ts
 *  exactly. When this adapter is promoted, the file move is a rename, not
 *  a redesign. */
export interface FootballRatings {
  overall: number;
  speed: number;
  strength: number;
  agility: number;
  awareness: number;
  stamina: number;
  // Offense
  throwing: number;
  catching: number;
  carrying: number;
  blocking: number;
  // Defense
  tackling: number;
  coverage: number;
  passRush: number;
  // Special
  kicking: number;
}

/** Matches PlayerStats in ../src/types/index.ts. Football has the heaviest
 *  stats schema of any planned sport; other sports' TStats will be smaller. */
export interface FootballStats {
  gamesPlayed: number;
  // Passing
  passAttempts: number;
  passCompletions: number;
  passYards: number;
  passTDs: number;
  interceptions: number;
  // Rushing
  rushAttempts: number;
  rushYards: number;
  rushTDs: number;
  fumbles: number;
  // Receiving
  targets: number;
  receptions: number;
  receivingYards: number;
  receivingTDs: number;
  // Defense
  tackles: number;
  tacklesForLoss: number;
  sacks: number;
  defensiveINTs: number;
  passDeflections: number;
  forcedFumbles: number;
  // Offensive line
  sacksAllowed: number;
  passBlocks: number;
  // Kicking
  fieldGoalAttempts: number;
  fieldGoalsMade: number;
  extraPointAttempts: number;
  extraPointsMade: number;
  // Punting
  puntAttempts: number;
  puntYards: number;
  puntsInside20: number;
  touchbacks: number;
  // Kick/Punt Returns
  kickReturns: number;
  kickReturnYards: number;
  kickReturnTDs: number;
  puntReturns: number;
  puntReturnYards: number;
  puntReturnTDs: number;
  snaps: number;
}

/** Football depth chart. Maps each position to an ordered list of player IDs
 *  (starter at index 0). This is exactly the shape currently stored on
 *  Team.depthChart in ../src/types/index.ts. */
export type FootballLineup = Record<FootballPosition, PlayerId[]>;

// ============================================================================
// Sport-specific extension data stored in player/team sportData slots
// ============================================================================

export interface FootballPlayerData {
  /** Detailed position. e.g. OL → 'OT' | 'OG' | 'C'. Lives here, not on the
   *  universal player. See deriveSubPosition() in ../src/types/index.ts. */
  subPosition: string;
  /** QB-only. From qbTierPyramid.ts. */
  qbTier?: 'Elite' | 'Franchise' | 'Bridge' | 'Game Manager' | 'Backup' | 'Camp Arm';
  /** Personality archetype. From the BS Mode design. */
  personality?: 'irrational_confidence' | 'steady' | 'pressure_fold' | 'clutch';
  /** Accrued seasons (NFL service time) for FA eligibility, vet minimums. */
  accruedSeasons: number;
  /** True if this player is currently on IR. Mirrored on team.rosterBuckets
   *  but kept on the player too for fast lookup. */
  onIR: boolean;
  /** True if playing through an injury. */
  playingThroughInjury?: boolean;
}

export interface FootballTeamData {
  conference: 'AC' | 'NC';
  division: 'North' | 'South' | 'East' | 'West';
  /** Defensive base formation. From ../src/types/index.ts Team.baseFormation. */
  baseFormation: '3-4' | '4-3' | 'Nickel';
  /** Owner personality. */
  ownerPersonality: 'frugal' | 'balanced' | 'win-now';
  /** Franchise tag use this season. */
  franchiseTagUsed: boolean;
  /** Retired jersey numbers. */
  retiredNumbers: { number: number; playerId: PlayerId; playerName: string; season: number }[];
}

// ============================================================================
// Roster rules
// ============================================================================

export const footballRosterRules: RosterRules<FootballPosition> = {
  buckets: [
    {
      name: 'active',
      label: 'Active Roster (53)',
      capacity: 53,
      countsAsActive: true,
      countsAgainstCap: true,
      eligibleForLineups: true,
      ownership: 'self',
    },
    {
      name: 'practice_squad',
      label: 'Practice Squad (16)',
      capacity: 16,
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
  ],
  activeRosterSize: 53,
  positionLimits: {
    QB: { min: 1, max: 3 },
    RB: { min: 2, max: 4 },
    WR: { min: 3, max: 6 },
    TE: { min: 1, max: 3 },
    OL: { min: 5, max: 10 },
    DL: { min: 4, max: 10 },
    LB: { min: 3, max: 8 },
    CB: { min: 3, max: 6 },
    S: { min: 2, max: 5 },
    K: { min: 1, max: 1 },
    P: { min: 1, max: 1 },
  },
  validate() {
    throw new Error('See ROSTER_LIMITS validation logic in ../src/lib/engine/roster.ts and store.ts');
  },
};

// ============================================================================
// Season calendar
// ============================================================================

export const footballSeasonCalendar: SeasonCalendar = {
  // 4 preseason weeks + 18 regular season + 4 playoff weeks + offseason
  ticksPerSeason: 52,
  phases: [
    {
      name: 'preseason',
      label: 'Preseason',
      startTick: 1,
      endTick: 4,
      hasGames: true,
      allowedMovements: ['trade', 'free_agency_sign', 'release', 'waiver'],
    },
    {
      name: 'regular_season',
      label: 'Regular Season',
      startTick: 5,
      endTick: 22,
      hasGames: true,
      allowedMovements: ['trade', 'release', 'waiver', 'free_agency_sign'],
    },
    {
      name: 'playoffs',
      label: 'Playoffs',
      startTick: 23,
      endTick: 26,
      hasGames: true,
      allowedMovements: ['release'], // Practice squad signings only
    },
    {
      name: 'offseason',
      label: 'Offseason',
      startTick: 27,
      endTick: 52,
      hasGames: false,
      allowedMovements: ['trade', 'free_agency_sign', 'release'],
    },
  ],
  describeTick() {
    throw new Error('See ../src/lib/engine/schedule.ts for week labeling');
  },
  phaseForTick() {
    throw new Error('Simple range check against phases[]');
  },
};

// ============================================================================
// Competitions
// ============================================================================

/** Football has a single competition: the regular season followed by playoffs.
 *  This is the trivial case for the multi-competition abstraction. */
export const footballCompetitions: readonly CompetitionDefinition[] = [
  {
    id: 'primary',
    displayName: 'BS Football',
    format: {
      kind: 'round_robin',
      gamesPerOpponent: 1,
      followedByPlayoff: {
        rounds: [
          { name: 'Wild Card', tieFormat: { type: 'single_match' } },
          { name: 'Divisional', tieFormat: { type: 'single_match' } },
          { name: 'Conference Championship', tieFormat: { type: 'single_match' } },
          { name: 'BS Bowl', tieFormat: { type: 'single_match' } },
        ],
        reseededEachRound: true,
      },
    },
    entryRule: 'all_league',
    weight: 1.0,
  },
];

// ============================================================================
// Capability implementations (signatures only, body refs existing files)
// ============================================================================

export const footballPlayerGen: PlayerGenerator<FootballRatings, FootballStats> = {
  generatePlayer() { throw new Error('See ../src/lib/engine/playerGen.ts'); },
  generateDraftClass() { throw new Error('See generateDraftClassPreview() in ../src/lib/engine/store.ts'); },
  migrate() { throw new Error('Save migration logic in ../src/lib/engine/store.ts (SAVE_VERSION = 33)'); },
};

export const footballStatsEngine: StatsEngine<FootballStats> = {
  empty() { throw new Error('Construct from PlayerStats interface in ../src/types/index.ts'); },
  accumulate() { throw new Error('See addStats() in ../src/lib/engine/store.ts'); },
  derived() { throw new Error('See calcPasserRating() in ../src/types/index.ts'); },
  format() { throw new Error('Inline in stats UI; centralize here'); },
};

export const footballSimEngine: SimEngine<FootballRatings, FootballStats> = {
  simGame() { throw new Error('See teamPower() and game simulation in ../src/lib/engine/simulate.ts'); },
};

export const footballLiveSim: LiveSimEngine<FootballRatings, FootballStats> = {
  startGame() { throw new Error('See ../src/lib/engine/playByPlay.ts and liveCoachEngine.ts'); },
  advance() { throw new Error('See playByPlay.ts event loop'); },
  resolve() { throw new Error('Convert running drive state to final GameResult'); },
};

export const footballScheduleGenerator: ScheduleGenerator<FootballRatings, FootballStats> = {
  generate() { throw new Error('See generateSchedule() in ../src/lib/engine/schedule.ts'); },
};

export const footballDraftSystem: DraftSystem<FootballRatings, FootballStats> = {
  rounds: 7,
  draftPhase: 'offseason_early',
  orderRule: 'reverse_standings',
  computeDraftOrder() { throw new Error('See draft order logic in ../src/lib/engine/store.ts'); },
  aiPick() { throw new Error('See autoDraftPlayerId() in ../src/lib/engine/store.ts'); },
  pickValue() { throw new Error('See pickTradeValue() and draftPickPointValue() in ../src/lib/engine/store.ts'); },
};

export const footballDevelopment: DevelopmentSystem<FootballRatings, FootballStats> = {
  developSeason() { throw new Error('See ../src/lib/engine/development.ts'); },
  shouldRetire() { throw new Error('Age + ratings + accrued seasons check'); },
  tickPlayer() { throw new Error('Injury healing + fatigue; see store.ts decrementInjuryWeeks()'); },
};

export const footballTradeValuator: PlayerMovementValuator<FootballRatings, FootballStats> = {
  playerValue() { throw new Error('See playerTradeValue() in ../src/lib/engine/store.ts'); },
  evaluate() { throw new Error('Trade-acceptance AI logic in store.ts'); },
  supportedMovementTypes: ['trade', 'free_agency_sign', 'release', 'waiver'],
};

export const footballAwards: AwardSystem<FootballStats> = {
  definitions: [
    { id: 'mvp', name: 'MVP', description: 'Most Valuable Player', primaryStatKeys: ['passYards', 'passTDs', 'rushYards', 'rushTDs'] },
    { id: 'opoy', name: 'Offensive Player of the Year', description: 'Top offensive performer', primaryStatKeys: ['passYards', 'rushYards', 'receivingYards'] },
    { id: 'dpoy', name: 'Defensive Player of the Year', description: 'Top defensive performer', primaryStatKeys: ['sacks', 'defensiveINTs', 'tackles'] },
    { id: 'oroy', name: 'Offensive Rookie of the Year', description: 'Top rookie on offense', primaryStatKeys: ['passYards', 'rushYards', 'receivingYards'] },
    { id: 'droy', name: 'Defensive Rookie of the Year', description: 'Top rookie on defense', primaryStatKeys: ['sacks', 'defensiveINTs', 'tackles'] },
    { id: 'coy', name: 'Coach of the Year', description: 'Top coaching performance', primaryStatKeys: [] },
    { id: 'cpoy', name: 'Comeback Player of the Year', description: 'Best return from setback', primaryStatKeys: [] },
  ],
  computeWinners() { throw new Error('See ../src/lib/engine/awards.ts'); },
};

export const footballCapRules: CapRules<FootballRatings, FootballStats> = {
  currentCap() { throw new Error('See capInflationFactor() in ../src/lib/engine/salary.ts'); },
  isLegalContract() { throw new Error('See contract validation in salary.ts and store.ts'); },
  isLegalRoster() { throw new Error('Payroll <= cap is the only rule in NFL'); },
  deadCapForRelease() { throw new Error('See deadCap logic in salary.ts; pre/post-June 1 rules apply'); },
  marketSalary() { throw new Error('See estimateSalary() in ../src/lib/engine/salary.ts'); },
  availableCapActions() {
    throw new Error('Franchise tag, transition tag, restructure, post-June-1 release; logic across store.ts');
  },
};

export const footballCoaching: CoachingSystem = {
  roles: ['HC', 'OC', 'DC', 'QB', 'RB', 'WR', 'OL', 'DL', 'DB'],
  schemes: {
    OC: ['spread', 'west_coast', 'power_run', 'air_raid', 'rpo'],
    DC: ['cover_3', 'man_press', 'tampa_2', 'blitz_34', 'zone_blitz'],
  },
  maxStaffSize: 9,
};

export const footballLineupModel: LineupModelDescriptor<FootballLineup> = {
  kind: 'depth_chart',
  buildDefault() { throw new Error('See buildDefaultDepthChart() in ../src/lib/engine/store.ts'); },
  validate() { throw new Error('11 starters per side, position constraints'); },
};

export const footballUi: UiMetadata<FootballRatings, FootballStats, FootballPosition, FootballLineup> = {
  ratingFields: [
    { key: 'speed', label: 'SPD', group: 'Athletic' },
    { key: 'strength', label: 'STR', group: 'Athletic' },
    { key: 'agility', label: 'AGI', group: 'Athletic' },
    { key: 'awareness', label: 'AWR', group: 'Mental' },
    { key: 'stamina', label: 'STA', group: 'Mental' },
    { key: 'throwing', label: 'THR', group: 'Offense' },
    { key: 'catching', label: 'CTH', group: 'Offense' },
    { key: 'carrying', label: 'CAR', group: 'Offense' },
    { key: 'blocking', label: 'BLK', group: 'Offense' },
    { key: 'tackling', label: 'TKL', group: 'Defense' },
    { key: 'coverage', label: 'COV', group: 'Defense' },
    { key: 'passRush', label: 'RUSH', group: 'Defense' },
    { key: 'kicking', label: 'KCK', group: 'Special' },
  ],
  statColumns: [
    { key: 'passYards', label: 'PASS YDS', category: 'Passing', format: 'integer', higherIsBetter: true },
    { key: 'passTDs', label: 'PASS TD', category: 'Passing', format: 'integer', higherIsBetter: true },
    { key: 'rushYards', label: 'RUSH YDS', category: 'Rushing', format: 'integer', higherIsBetter: true },
    { key: 'receivingYards', label: 'REC YDS', category: 'Receiving', format: 'integer', higherIsBetter: true },
    { key: 'sacks', label: 'SACK', category: 'Defense', format: 'decimal', higherIsBetter: true },
    { key: 'defensiveINTs', label: 'INT', category: 'Defense', format: 'integer', higherIsBetter: true },
    { key: 'tackles', label: 'TKL', category: 'Defense', format: 'integer', higherIsBetter: true },
    // ... ~30 more from FootballStats
  ],
  positionGroups: [
    { label: 'Offense', positions: ['QB', 'RB', 'WR', 'TE', 'OL'] },
    { label: 'Defense', positions: ['DL', 'LB', 'CB', 'S'] },
    { label: 'Special Teams', positions: ['K', 'P'] },
  ],
  describeLineup() { throw new Error('Convert depth chart to LineupDescription'); },
};

// ============================================================================
// The assembled adapter
// ============================================================================

export const footballAdapter: SportAdapter<
  FootballRatings,
  FootballStats,
  FootballPosition,
  FootballLineup
> = {
  sportId: 'football',
  displayName: 'BS Football',
  brandName: 'BS Football',
  positions: [
    'QB', 'RB', 'WR', 'TE', 'OL',
    'DL', 'LB', 'CB', 'S',
    'K', 'P',
  ] as const,
  playerKinds: ['standard'] as const,
  rosterRules: footballRosterRules,
  seasonCalendar: footballSeasonCalendar,
  competitions: footballCompetitions,
  playerGen: footballPlayerGen,
  statsEngine: footballStatsEngine,
  simEngine: footballSimEngine,
  liveSim: footballLiveSim,
  scheduleGenerator: footballScheduleGenerator,
  draftSystem: footballDraftSystem,
  developmentSystem: footballDevelopment,
  tradeValuator: footballTradeValuator,
  awards: footballAwards,
  ui: footballUi,
  lineupModel: footballLineupModel,
  coachingSystem: footballCoaching,
  capRules: footballCapRules,
  // promotionRelegation: undefined — football has none
};

// ============================================================================
// Mapping table: existing file → adapter capability
// ============================================================================

/**
 * For future Claude sessions doing the actual migration. When promoting this
 * adapter to @bs/sport-football, the existing engine files map as follows:
 *
 * EXISTING FILE                            → ADAPTER CAPABILITY
 * ───────────────────────────────────────────────────────────────
 * src/types/index.ts (PlayerRatings, PlayerStats, Position)
 *                                          → FootballRatings, FootballStats,
 *                                            FootballPosition exports here
 * src/types/index.ts (deriveSubPosition,
 *   assignOlSlots, calcPasserRating)       → static football helpers, called
 *                                            internally by adapter capabilities
 * src/lib/engine/playerGen.ts              → footballPlayerGen.generatePlayer
 * src/lib/engine/development.ts            → footballDevelopment.developSeason
 * src/lib/engine/schedule.ts               → footballScheduleGenerator.generate
 * src/lib/engine/salary.ts                 → footballCapRules.*
 * src/lib/engine/simulate.ts               → footballSimEngine.simGame
 * src/lib/engine/playByPlay.ts             → footballLiveSim.startGame/advance
 * src/lib/engine/liveCoachEngine.ts        → footballLiveSim (internal)
 * src/lib/engine/awards.ts                 → footballAwards.computeWinners
 * src/lib/engine/draftScoutEval.ts         → footballDraftSystem (internal)
 * src/lib/engine/draftGrades.ts            → footballDraftSystem (post-draft analytics)
 * src/lib/engine/coaching.ts               → footballCoaching (internal)
 * src/lib/engine/qbTierPyramid.ts          → football helper, called by stats/sim
 * src/lib/engine/expansionDraft.ts         → moves to @bs/sport-football helpers
 *                                            (rare event handler, not in adapter contract)
 *
 * GOES TO @bs/core (sport-agnostic):
 * src/lib/engine/negotiation.ts            → core (uses adapter.tradeValuator
 *                                            + adapter.capRules?.marketSalary)
 * src/lib/engine/approval.ts               → core (universal)
 * src/lib/engine/objectives.ts             → core (universal)
 * src/lib/engine/social.ts                 → core (universal)
 * src/lib/engine/recap.ts                  → core (with adapter-provided
 *                                            sport-specific phrase banks)
 * src/lib/engine/debate.ts                 → core (with phrase banks per sport)
 * src/lib/engine/gmSync.ts                 → core
 * src/lib/engine/achievements.ts           → core (achievements declared
 *                                            per-sport via adapter.awards-adjacent)
 * src/lib/engine/aiSpotlight.ts            → core (uses adapter UI metadata)
 *
 * STAYS IN @bs/core/store.ts (after sport-pluggable refactor):
 * src/lib/engine/store.ts                  → split: ~7k lines into core orchestration,
 *                                            ~3k lines into football-specific helpers
 *                                            (depth chart slotting, OL position assignment,
 *                                            franchise tag, post-June-1 mechanics)
 */
