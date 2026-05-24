/**
 * SportAdapter.ts
 *
 * The contract every BS sport implements. @bs/core consumes this interface
 * and is sport-agnostic; @bs/sport-<name> packages implement it.
 *
 * READ DECISIONS.md BEFORE MODIFYING. Many of the design choices here are
 * load-bearing — capabilities are optional rather than mandatory because of
 * specific sport requirements documented there.
 *
 * Mental model: the core knows about leagues, teams, players, games, seasons,
 * and movement of players between teams. The adapter tells the core how those
 * abstractions look for one specific sport.
 */

import type {
  SportId,
  BasePlayer,
  BaseTeam,
  BaseLeagueState,
  BaseGameResult,
  BaseContract,
  BaseDraftPick,
  BaseCoach,
  PlayerMovement,
  CapAction,
  ValidationResult,
  CompetitionFormat,
  RosterSlotRef,
  PlayerId,
  TeamId,
  CoachId,
} from './BaseTypes';

// ============================================================================
// The main contract
// ============================================================================

/**
 * Generic over:
 *   TRatings  — per-sport player ratings shape (often a discriminated union)
 *   TStats    — per-sport player stats shape
 *   TPosition — per-sport position enum (e.g. 'QB' | 'RB' | ... for football)
 *   TLineup   — per-sport lineup model (depth chart, rotation, lines, formation)
 *
 * A sport's concrete adapter narrows all four type parameters.
 */
export interface SportAdapter<TRatings, TStats, TPosition extends string, TLineup> {
  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------

  readonly sportId: SportId;
  readonly displayName: string;
  /** Short brand name for headers and titles. "BS Football", "BS Hoops". */
  readonly brandName: string;

  // ---------------------------------------------------------------------------
  // Player + team shape
  // ---------------------------------------------------------------------------

  readonly positions: readonly TPosition[];

  /** Discriminator values for the player.kind field. ['standard'] for
   *  uniform-shape sports; ['skater', 'goalie'] for hockey; etc. */
  readonly playerKinds: readonly string[];

  // ---------------------------------------------------------------------------
  // Roster rules
  // ---------------------------------------------------------------------------

  readonly rosterRules: RosterRules<TPosition>;

  // ---------------------------------------------------------------------------
  // Season structure
  // ---------------------------------------------------------------------------

  readonly seasonCalendar: SeasonCalendar;

  // ---------------------------------------------------------------------------
  // Competitions this sport participates in
  // ---------------------------------------------------------------------------

  /** US sports: a single 'primary' competition (regular season + playoffs).
   *  Soccer: a 'primary' competition (league) plus 2-3 additional cups
   *  running in parallel. The core schedules them all and the adapter
   *  decides how teams are entered into each. */
  readonly competitions: readonly CompetitionDefinition[];

  // ---------------------------------------------------------------------------
  // Capabilities (sub-systems the adapter provides)
  // ---------------------------------------------------------------------------

  readonly playerGen: PlayerGenerator<TRatings, TStats>;
  readonly statsEngine: StatsEngine<TStats>;
  readonly simEngine: SimEngine<TRatings, TStats>;
  readonly scheduleGenerator: ScheduleGenerator<TRatings, TStats>;
  readonly draftSystem: DraftSystem<TRatings, TStats>;
  readonly developmentSystem: DevelopmentSystem<TRatings, TStats>;
  readonly tradeValuator: PlayerMovementValuator<TRatings, TStats>;
  readonly awards: AwardSystem<TStats>;
  readonly ui: UiMetadata<TRatings, TStats, TPosition, TLineup>;
  readonly lineupModel: LineupModelDescriptor<TLineup>;
  readonly coachingSystem: CoachingSystem;

  /** Optional. Sports without a salary cap (soccer) omit this. The core
   *  checks `if (adapter.capRules)` before doing cap math. */
  readonly capRules?: CapRules<TRatings, TStats>;

  /** Optional. Live possession-by-possession / play-by-play sim. Football
   *  has it; basketball/hockey/soccer ship without it initially and add
   *  later without touching the contract. */
  readonly liveSim?: LiveSimEngine<TRatings, TStats>;

  /** Optional. Sports with promotion/relegation (soccer) implement this.
   *  US sports leave it undefined. */
  readonly promotionRelegation?: PromotionRelegationSystem<TRatings, TStats>;
}

// ============================================================================
// Roster rules
// ============================================================================

export interface RosterRules<TPosition extends string> {
  /** Named roster buckets a team has. Order matters for UI display. */
  readonly buckets: readonly RosterBucketDefinition<TPosition>[];

  /** Total active player limit across all 'active' buckets. The "53-man" /
   *  "15-man" number. */
  readonly activeRosterSize: number;

  /** Minimum and maximum players per position on the active roster. Used
   *  to gate sim-time depth chart slotting and to keep the draft AI from
   *  drafting only one position. */
  readonly positionLimits: Partial<Record<TPosition, { min: number; max: number }>>;

  /** Validates a team's current roster against all rules. Called by the
   *  core before sim-time, before saves, and on user-initiated changes. */
  validate(
    team: BaseTeam<unknown, unknown>,
    leagueState: BaseLeagueState<unknown, unknown>,
  ): ValidationResult;
}

export interface RosterBucketDefinition<TPosition extends string> {
  /** Machine name used as the key in team.rosterBuckets. Lowercase snake_case. */
  readonly name: string;
  /** Display label shown in roster UI. */
  readonly label: string;
  /** Maximum players this bucket can hold. Infinity = no cap (typical for IR). */
  readonly capacity: number;
  /** Whether players in this bucket count toward the team's active roster
   *  size for sim purposes. */
  readonly countsAsActive: boolean;
  /** Whether players in this bucket count against the team's salary cap. */
  readonly countsAgainstCap: boolean;
  /** Whether players in this bucket are eligible to be selected for game
   *  lineups. */
  readonly eligibleForLineups: boolean;
  /** Ownership semantics. 'self' = standard (we own them). 'other' = they
   *  belong to another team but are registered with us (soccer loaned_in).
   *  'self_registered_elsewhere' = we own them but they're registered with
   *  another team (soccer loaned_out). */
  readonly ownership: 'self' | 'other' | 'self_registered_elsewhere';
  /** Per-position constraints inside this bucket, if any. */
  readonly positionLimits?: Partial<Record<TPosition, { min: number; max: number }>>;
}

// ============================================================================
// Season calendar
// ============================================================================

export interface SeasonCalendar {
  /** Total ticks per season. A tick is whatever advance unit the sport uses:
   *  football tick = week, basketball tick = day, soccer tick = day. */
  readonly ticksPerSeason: number;

  /** Phase machine — universal phases plus sport-specific sub-phases.
   *  The core walks this list when advancing the calendar. */
  readonly phases: readonly PhaseDefinition[];

  /** Convert tick number → human-readable position. e.g. football 3 → 'Week 3',
   *  basketball 45 → 'Game 45 of regular season'. */
  describeTick(tick: number): string;

  /** What phase a given tick falls into. */
  phaseForTick(tick: number): string;
}

export interface PhaseDefinition {
  /** Machine name: 'preseason' | 'regular_season' | 'playoffs' | 'offseason'
   *  plus sport-specific extensions like 'winter_transfer_window' (soccer)
   *  or 'expansion_draft_window' (NHL expansion year). */
  readonly name: string;
  readonly label: string;
  /** Tick range this phase occupies. */
  readonly startTick: number;
  readonly endTick: number;
  /** Whether games are played during this phase. */
  readonly hasGames: boolean;
  /** Allowed player-movement types during this phase. Off-season allows
   *  signings + trades; in-season may restrict to claims + waivers. */
  readonly allowedMovements: readonly PlayerMovement['type'][];
}

// ============================================================================
// Competitions
// ============================================================================

export interface CompetitionDefinition {
  /** Machine name. 'primary' is reserved for the main league competition. */
  readonly id: string;
  readonly displayName: string;
  readonly format: CompetitionFormat;
  /** How teams enter this competition. 'all_league' = every team in the
   *  league. 'qualified' = based on prior-season finish. 'draw' = open
   *  cup with all entrants. */
  readonly entryRule: 'all_league' | 'qualified' | 'draw';
  /** Importance weight for the awards/recap engines. Primary = 1.0;
   *  cup competitions weight lower. */
  readonly weight: number;
}

// ============================================================================
// Player generator
// ============================================================================

export interface PlayerGenerator<TRatings, TStats> {
  /** Generate a single player. Used for free agents, fictional players,
   *  emergency injury replacements. */
  generatePlayer(opts: PlayerGenOptions): BasePlayer<TRatings, TStats>;

  /** Generate a full draft class for a given season. Quantity and quality
   *  distribution are adapter-defined. */
  generateDraftClass(season: number, count: number): BasePlayer<TRatings, TStats>[];

  /** Backfill missing/legacy fields on a player loaded from an older save.
   *  Called by the core's migration system. */
  migrate(rawPlayer: unknown, fromVersion: number): BasePlayer<TRatings, TStats>;
}

export interface PlayerGenOptions {
  age?: number;
  position?: string;
  kind?: string;
  /** Target overall rating. Generator may deviate slightly. */
  targetOverall?: number;
  /** Bias toward a specific archetype within the position. */
  archetype?: string;
}

// ============================================================================
// Stats engine
// ============================================================================

export interface StatsEngine<TStats> {
  /** Return a zeroed stats object. Used to initialize new players.
   *
   *  Sports whose TStats is a discriminated union (hockey skater/goalie,
   *  soccer outfield/keeper) MUST pass the `kind` hint so the right shape
   *  is constructed. Sports with uniform shape (football, basketball)
   *  ignore the param.
   *
   *  INTERFACE CHANGE #3 from soccer pressure-test — see DECISIONS.md. */
  empty(kind?: string): TStats;

  /** Add `source` into `target` field-by-field. Used when merging per-game
   *  box scores into season totals. */
  accumulate(target: TStats, source: Partial<TStats>): TStats;

  /** Compute derived display stats (passer rating, PER, save percentage,
   *  xG). The core uses this for stat tables and award computations. */
  derived(stats: TStats): Record<string, number | string>;

  /** Format a numeric stat for display: rounding, percentages, decimals.
   *  Returns the formatted string. */
  format(statKey: keyof TStats | string, value: number): string;
}

// ============================================================================
// Sim engine
// ============================================================================

export interface SimEngine<TRatings, TStats> {
  /** Simulate a single game and return the result. The core calls this once
   *  per scheduled game when the calendar advances. */
  simGame(
    home: TeamSnapshot<TRatings, TStats>,
    away: TeamSnapshot<TRatings, TStats>,
    ctx: GameContext,
  ): BaseGameResult<TStats>;
}

/** A frozen team view passed to sim functions. The adapter sees only what
 *  it needs for sim — the full team object with UI state and cap state is
 *  filtered down by the core before calling. */
export interface TeamSnapshot<TRatings, TStats> {
  team: BaseTeam<TRatings, TStats>;
  /** Players in lineup order. */
  availablePlayers: BasePlayer<TRatings, TStats>[];
  /** Active lineup (depth chart / rotation / lines / formation). */
  lineup: unknown; // narrowed to TLineup by the concrete adapter
  /** Head coach modifiers, if any. */
  coach: BaseCoach | null;
}

export interface GameContext {
  season: number;
  tick: number;
  competitionId: string;
  isPlayoff: boolean;
  /** Home court / home field advantage multiplier, if the sport uses one. */
  homeAdvantage: number;
  /** RNG seed. Deterministic so a sim can be replayed. */
  rngSeed: string;
}

// ============================================================================
// Live sim (optional capability)
// ============================================================================

export interface LiveSimEngine<TRatings, TStats> {
  /** Begin a live game session. Returns an opaque session token. */
  startGame(
    home: TeamSnapshot<TRatings, TStats>,
    away: TeamSnapshot<TRatings, TStats>,
    ctx: GameContext,
  ): LiveGameSession;

  /** Advance the session by N atomic events (plays, possessions, minutes).
   *  Returns the new session state plus events emitted during the advance. */
  advance(session: LiveGameSession, steps: number): {
    session: LiveGameSession;
    events: LiveEvent[];
  };

  /** Force-resolve a live session to a finished GameResult, used when the
   *  user skips to end. */
  resolve(session: LiveGameSession): BaseGameResult<TStats>;
}

export interface LiveGameSession {
  id: string;
  status: 'pre_game' | 'in_progress' | 'completed';
  /** Sport-specific running state. Football: drive/down/distance/score.
   *  Basketball: quarter/clock/possession/score. */
  state: unknown;
}

export interface LiveEvent {
  /** Sport-specific event taxonomy. Football: 'pass_complete' | 'sack' | ...
   *  Basketball: 'shot_made' | 'rebound' | ... */
  type: string;
  description: string;
  /** Game state at the time of the event. */
  context: unknown;
}

// ============================================================================
// Schedule generator
// ============================================================================

export interface ScheduleGenerator<TRatings, TStats> {
  /** Generate the schedule for a competition. Returns everything that can
   *  be pre-scheduled at season start. For pre-scheduled competitions
   *  (US sports primary, soccer league), this is the full season. For
   *  draw-based competitions (soccer cups, Champions League knockout),
   *  this is just the entry round; subsequent rounds are produced by
   *  generateNextRound() after each round completes. */
  generate(
    teams: BaseTeam<TRatings, TStats>[],
    season: number,
    competitionId: string,
    prevSeasonResults?: BaseGameResult<TStats>[],
  ): BaseGameResult<TStats>[];

  /** Optional. Required only for competitions whose format has draw-based
   *  seeding (CompetitionFormat.kind === 'single_elimination' &&
   *  seeding === 'draw', or knockout phase of group_then_knockout). The core
   *  calls this after the previous round of such a competition completes.
   *  Should return the games for the next round only — not the whole
   *  remainder of the bracket.
   *
   *  INTERFACE CHANGE #1 from soccer pressure-test — see DECISIONS.md. */
  generateNextRound?(
    competitionId: string,
    completedResults: BaseGameResult<TStats>[],
    season: number,
  ): BaseGameResult<TStats>[];
}

// ============================================================================
// Draft system
// ============================================================================

export interface DraftSystem<TRatings, TStats> {
  /** Number of rounds in the entry draft. NFL=7, NBA=2, NHL=7, soccer=0. */
  readonly rounds: number;

  /** When the draft happens within the season calendar. */
  readonly draftPhase: 'offseason_early' | 'offseason_late' | 'mid_season';

  /** How draft order is determined. */
  readonly orderRule: 'reverse_standings' | 'lottery' | 'mixed_lottery_then_reverse' | 'none';

  /** Compute the draft order for a given season. */
  computeDraftOrder(
    teams: BaseTeam<TRatings, TStats>[],
    prevSeasonResults: BaseGameResult<TStats>[],
  ): TeamId[];

  /** AI auto-pick. Called when a team's clock expires or the user delegates. */
  aiPick(
    pickingTeamId: TeamId,
    availableProspects: BasePlayer<TRatings, TStats>[],
    state: BaseLeagueState<TRatings, TStats>,
  ): PlayerId;

  /** Numeric trade value for a draft pick. Used by the trade evaluator. */
  pickValue(pick: BaseDraftPick, teams: BaseTeam<TRatings, TStats>[]): number;
}

// ============================================================================
// Development system
// ============================================================================

export interface DevelopmentSystem<TRatings, TStats> {
  /** Apply a season's worth of development/aging to a single player. Called
   *  at offseason rollover. */
  developSeason(
    player: BasePlayer<TRatings, TStats>,
    season: number,
  ): BasePlayer<TRatings, TStats>;

  /** Decide if this player retires at this offseason. */
  shouldRetire(player: BasePlayer<TRatings, TStats>): boolean;

  /** Apply mid-season effects (injury healing, hot/cold streaks, fatigue).
   *  Called by the core on each tick advance. */
  tickPlayer(
    player: BasePlayer<TRatings, TStats>,
    ticksAdvanced: number,
  ): BasePlayer<TRatings, TStats>;
}

// ============================================================================
// Player movement valuator (generalized trade evaluator)
// ============================================================================

export interface PlayerMovementValuator<TRatings, TStats> {
  /** Numeric trade value for a player. Used in trade-acceptance AI and as
   *  a starting point for transfer-fee valuation in soccer. */
  playerValue(
    player: BasePlayer<TRatings, TStats>,
    forTeam: BaseTeam<TRatings, TStats>,
    league: BaseLeagueState<TRatings, TStats>,
  ): number;

  /** Should the receiving team accept this proposed player movement? Returns
   *  decision + reasoning string (for UI feedback). */
  evaluate(
    movement: PlayerMovement,
    league: BaseLeagueState<TRatings, TStats>,
  ): { accept: boolean; reasoning: string };

  /** What movement types this sport supports. Football: ['trade', 'free_agency_sign',
   *  'release', 'waiver']. Soccer: ['transfer', 'loan', 'loan_recall',
   *  'free_agency_sign', 'release']. The core hides UI affordances for
   *  unsupported types. */
  readonly supportedMovementTypes: readonly PlayerMovement['type'][];
}

// ============================================================================
// Awards
// ============================================================================

export interface AwardSystem<TStats> {
  /** Definitions of every award this sport gives out. */
  readonly definitions: readonly AwardDefinition<TStats>[];

  /** Compute season-end award winners. Returns map of award id → winner data. */
  computeWinners(
    finalStats: Record<PlayerId, TStats>,
    seasonResults: BaseGameResult<TStats>[],
  ): Record<string, AwardWinner>;
}

export interface AwardDefinition<TStats> {
  id: string;
  /** Display name: 'MVP', 'Defensive Player of the Year', 'Golden Boot'. */
  name: string;
  /** Short description shown in award nomination UI. */
  description: string;
  /** Which stat fields are the primary inputs to this award. Used to surface
   *  stat-leader candidates without simulating voting. */
  primaryStatKeys: (keyof TStats | string)[];
  /** Whether this award is per-position (e.g., 'Best Goalkeeper') or open. */
  positionRestricted?: string[];
}

export interface AwardWinner {
  playerId: PlayerId;
  voteShare?: number;
  finalists: PlayerId[];
  reasoning: string;
}

// ============================================================================
// Cap rules (optional capability)
// ============================================================================

export interface CapRules<TRatings, TStats> {
  /** League-wide cap for the current season. Adapters compute this from
   *  inflation, prior CBA, etc. */
  currentCap(season: number): number;

  /** Is this contract legal under cap + roster rules? */
  isLegalContract(
    contract: BaseContract,
    player: BasePlayer<TRatings, TStats>,
    team: BaseTeam<TRatings, TStats>,
    league: BaseLeagueState<TRatings, TStats>,
  ): ValidationResult;

  /** Is this team's overall payroll legal? */
  isLegalRoster(
    team: BaseTeam<TRatings, TStats>,
    league: BaseLeagueState<TRatings, TStats>,
  ): ValidationResult;

  /** Compute dead cap charges if this player is released today. */
  deadCapForRelease(
    player: BasePlayer<TRatings, TStats>,
    league: BaseLeagueState<TRatings, TStats>,
  ): { season: number; amount: number }[];

  /** Market salary the negotiation engine should use as the player's ask. */
  marketSalary(
    player: BasePlayer<TRatings, TStats>,
    league: BaseLeagueState<TRatings, TStats>,
  ): number;

  /** What cap-adjacent actions are currently available to this team?
   *  e.g., 'Use Bird Rights', 'Apply Franchise Tag', 'Place on LTIR'. */
  availableCapActions(
    team: BaseTeam<TRatings, TStats>,
    league: BaseLeagueState<TRatings, TStats>,
  ): CapAction[];
}

// ============================================================================
// UI metadata
// ============================================================================

export interface UiMetadata<TRatings, TStats, TPosition extends string, TLineup> {
  /** How ratings are displayed in the player card UI. Adapter chooses which
   *  fields to show and how to group them ('Athletic', 'Offense', 'Defense'). */
  readonly ratingFields: readonly RatingFieldDescriptor<TRatings>[];

  /** Stat table columns for the leaders/stats pages. Categories let the UI
   *  build tabbed views ('Passing', 'Rushing', 'Receiving'). */
  readonly statColumns: readonly StatColumnDescriptor<TStats>[];

  /** Position groupings for depth chart display. Football: [Offense, Defense,
   *  Special Teams]. Basketball: [Backcourt, Frontcourt]. */
  readonly positionGroups: readonly PositionGroup<TPosition>[];

  /** Default color scheme overrides for sport-themed UI shell. */
  readonly themeOverrides?: Record<string, string>;

  /** Render adapter for the lineup model. The core hands this a TLineup;
   *  the adapter returns abstract render instructions the UI can consume. */
  describeLineup(lineup: TLineup): LineupDescription;
}

export interface RatingFieldDescriptor<TRatings> {
  key: keyof TRatings | string;
  label: string;
  group: string;
  /** Hidden until a scouting threshold is reached. */
  scoutGated?: boolean;
}

export interface StatColumnDescriptor<TStats> {
  key: keyof TStats | string;
  label: string;
  category: string;
  /** How to format the value. 'integer', 'decimal', 'percent', 'time'. */
  format: 'integer' | 'decimal' | 'percent' | 'time';
  /** Higher is better. Used for color-coding leaders. */
  higherIsBetter: boolean;
}

export interface PositionGroup<TPosition extends string> {
  label: string;
  positions: TPosition[];
}

export interface LineupDescription {
  /** Sport-agnostic abstract layout the UI knows how to render. */
  groups: {
    label: string;
    slots: {
      label: string;
      playerId: PlayerId | null;
      isStarter: boolean;
    }[];
  }[];
}

// ============================================================================
// Lineup model descriptor
// ============================================================================

/** The shape of a sport's lineup system. The core doesn't care about the
 *  internals; it stores the lineup as TLineup and passes it to the adapter
 *  for sim and rendering. This descriptor tells the core/UI what category
 *  of lineup it is, which affects which UI components are appropriate. */
export interface LineupModelDescriptor<TLineup> {
  kind: 'depth_chart' | 'rotation' | 'lines' | 'formation_xi';
  /** Construct a default lineup from a roster. Used when a team has no
   *  saved lineup yet. */
  buildDefault(players: BasePlayer<unknown, unknown>[]): TLineup;
  /** Validate that a lineup is internally consistent (e.g., football has
   *  exactly 11 starters, basketball has exactly 5, soccer has a goalkeeper). */
  validate(lineup: TLineup, players: BasePlayer<unknown, unknown>[]): ValidationResult;
}

// ============================================================================
// Coaching system
// ============================================================================

export interface CoachingSystem {
  /** Coach roles this sport has. NFL: ['HC', 'OC', 'DC', 'STC', 'QB', ...].
   *  NBA: ['HC', 'AC', 'PDC']. Soccer: ['manager', 'asst_manager', 'dir_of_football']. */
  readonly roles: readonly string[];

  /** Tactical schemes by role. NFL OC: ['spread', 'west_coast', 'air_raid'].
   *  Soccer manager: ['gegenpress', 'tiki_taka', 'park_the_bus', 'wing_play']. */
  readonly schemes: Record<string, readonly string[]>;

  /** Maximum staff size. NFL ~25 (full position coaches), NBA ~10, soccer ~5. */
  readonly maxStaffSize: number;
}

// ============================================================================
// Promotion/relegation (optional capability)
// ============================================================================

export interface PromotionRelegationSystem<TRatings, TStats> {
  /** Number of teams promoted/relegated per season. */
  promoteN: number;
  relegateN: number;

  /** Lower-tier leagues this sport supports. Soccer EFL Championship,
   *  League One, League Two, etc. */
  readonly lowerLeagues: readonly LowerLeagueDefinition[];

  /** Resolve promotion/relegation at season end. Returns the new top-flight
   *  team list and any moves between leagues. */
  resolveSeasonEnd(
    state: BaseLeagueState<TRatings, TStats>,
  ): {
    newTopFlight: TeamId[];
    movements: { teamId: TeamId; fromLeague: string; toLeague: string }[];
  };
}

export interface LowerLeagueDefinition {
  id: string;
  displayName: string;
  tier: number; // 2 = first division below top flight
  teamCount: number;
}
