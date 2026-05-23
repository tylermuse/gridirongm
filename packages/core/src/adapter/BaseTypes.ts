/**
 * BaseTypes.ts
 *
 * Sport-agnostic types consumed by both @bs/core and every sport adapter.
 * Anything that varies per-sport is parameterized via generics or lives in
 * a typed `sportData` slot. Anything that's universal lives here verbatim.
 *
 * READ DECISIONS.md BEFORE MODIFYING. The shape of these types encodes
 * specific decisions about what's universal vs. sport-specific, and changing
 * them without understanding the reasoning will silently force one sport's
 * concepts onto another.
 */

// ============================================================================
// IDs — every entity in the system uses a string UUID. Branded for safety.
// ============================================================================

export type PlayerId = string & { readonly __brand: 'PlayerId' };
export type TeamId = string & { readonly __brand: 'TeamId' };
export type CoachId = string & { readonly __brand: 'CoachId' };
export type LeagueId = string & { readonly __brand: 'LeagueId' };
export type CompetitionId = string & { readonly __brand: 'CompetitionId' };
export type GameId = string & { readonly __brand: 'GameId' };
export type SeasonId = string & { readonly __brand: 'SeasonId' };

// ============================================================================
// Sport identifier
// ============================================================================

export type SportId = 'football' | 'basketball' | 'hockey' | 'soccer';

// ============================================================================
// Player — generic over per-sport rating and stat shapes
// ============================================================================

/** Universal player fields. Anything sport-specific (handedness for hockey,
 *  preferred foot for soccer, throwing arm for football QB) lives in the
 *  `sportData` slot, typed per sport. */
export interface BasePlayer<TRatings, TStats> {
  id: PlayerId;
  firstName: string;
  lastName: string;
  birthDate: string; // ISO date
  age: number; // denormalized; recomputed each season advance
  /** Country of origin. Used by some sports for draft eligibility, work
   *  permits, international competitions. ISO 3166-1 alpha-2. */
  nationality: string;
  /** Two-letter heritage codes the player also identifies with. Used by
   *  some leagues' "homegrown" rules and international team eligibility. */
  altNationalities?: string[];

  /** Sport-specific player archetype discriminator. `'standard'` for sports
   *  where all players share one rating/stat shape (football, basketball,
   *  soccer outfield, hockey skaters). Sports with multiple archetypes
   *  (hockey goalies, soccer keepers, baseball pitchers) declare their own
   *  kind enum and the rating/stat types become discriminated unions. */
  kind: string;

  ratings: TRatings;

  /** Career-aggregate and current-season stats live on the player. Per-game
   *  box scores live on GameResult. The core merges them at season-end. */
  seasonStats: TStats;
  careerStats: TStats;

  /** Active contract. Null = free agent. */
  contract: BaseContract | null;

  /** Current roster assignment. Tells the core where this player sits across
   *  the team's roster buckets. Null = unsigned free agent. */
  rosterSlot: RosterSlotRef | null;

  /** Injury state. Null = healthy. Universal across sports. */
  injury: Injury | null;

  /** Long-term development trajectory. Sport-specific curves shape the
   *  numbers; the core just tracks current value and recent deltas. */
  development: {
    potential: number; // 0-100, hidden from user unless scouted
    currentTrajectory: 'breakout' | 'rising' | 'plateau' | 'declining' | 'cliff';
    seasonsAtCurrentTrajectory: number;
  };

  /** Sport-specific extension slot. Anything that doesn't fit the universal
   *  fields goes here, typed per-sport. Examples:
   *   - football: { qbTier, irDesignation, accruedSeasons }
   *   - hockey:   { handedness, shootsLeft, waiver_exempt }
   *   - soccer:   { preferredFoot, squadNumber, workPermit, homegrown } */
  sportData: unknown; // each adapter narrows this to a concrete type
}

// ============================================================================
// Team — generic over the same per-sport types
// ============================================================================

export interface BaseTeam<TRatings, TStats> {
  id: TeamId;
  city: string;
  name: string;
  /** Short identifier shown in standings, box scores. 2-4 chars typically. */
  abbreviation: string;
  /** Primary brand color, hex with leading #. UI uses this for theming. */
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string;

  /** Players assigned to this team across all roster buckets. The bucket
   *  each player sits in lives on the player's rosterSlot field. */
  playerIds: PlayerId[];

  /** Roster bucket sizes, validated against the adapter's RosterRules.
   *  The adapter declares legal bucket names; the team holds the assignments. */
  rosterBuckets: Record<string, PlayerId[]>;

  /** Future draft picks owned by this team. Across all years, including
   *  picks acquired via trade. Sport-specific number of rounds. */
  draftPicks: BaseDraftPick[];

  /** Current-season standings. Sport-specific record shape lives in
   *  sportData; the universal fields are the columns every standings table
   *  needs. */
  record: BaseTeamRecord;

  /** Coaching staff. Roles vary per sport; the adapter declares valid roles. */
  coachIds: CoachId[];

  /** Front office state — owner expectations, GM approval rating, season
   *  objectives. Sport-agnostic shape; numeric thresholds tuned per sport. */
  approval: ApprovalState;

  /** Cap state. Only populated for sports whose adapter implements CapRules.
   *  Soccer leaves this null and uses sportData for wage budget tracking. */
  capState: CapState | null;

  /** Sport-specific extension slot. Examples:
   *   - football: { conference, division, scheme, primetimeGames }
   *   - hockey:   { conference, division, ahlAffiliate }
   *   - soccer:   { leaguePosition, wageBudget, ffpStatus, currentCompetitions[] }
   */
  sportData: unknown;
}

export interface BaseTeamRecord {
  wins: number;
  losses: number;
  /** Ties + overtime losses. Sport-specific: NFL allows ties, NHL has OT
   *  losses, NBA has neither, soccer has draws. The adapter decides what to
   *  display; this field just stores the raw count. */
  otherResults: number;
  pointsFor: number;
  pointsAgainst: number;
  /** Recent form: last 5-10 games, oldest first. 'W' | 'L' | 'O' (other). */
  streak: string[];
}

// ============================================================================
// Roster slot references
// ============================================================================

/** Where a player sits in a team's roster system. The bucket name is
 *  sport-specific (declared by the adapter's RosterRules); the index is
 *  optional and used by sports where order matters (depth chart position,
 *  rotation slot, line assignment).
 *
 *  For sports with ownership/registration splits (soccer loans): the
 *  ownership lives on team.playerIds; registration lives via this rosterSlot.
 *  A loaned-out player has rosterSlot on a different team than their owning
 *  team. The core's playerMovement.transferLoan handles the bookkeeping. */
export interface RosterSlotRef {
  teamId: TeamId;
  bucket: string; // e.g. 'active', 'practice_squad', 'injured_reserve', 'loaned_in'
  index?: number;
  /** True if the player is registered with this team but owned by another.
   *  Soccer loans set this; US sports never do. */
  isLoanRegistration?: boolean;
  /** For loans: the owning team. Set only when isLoanRegistration === true. */
  ownerTeamId?: TeamId;
  /** For loans: when registration reverts to owner. ISO date. */
  loanEndDate?: string;
}

// ============================================================================
// Contracts
// ============================================================================

export interface BaseContract {
  /** Annual breakdown. Length of the array = contract length in years.
   *  Each year has base salary + signing bonus proration + sport-specific
   *  flags. */
  years: ContractYear[];
  /** Year (calendar year) the contract was signed. */
  signedSeason: number;
  /** Total guaranteed money at signing, in dollars. Used for negotiations
   *  and trade math. */
  guaranteedAtSigning: number;
  /** History of restructures, extensions, renegotiations. Append-only. */
  modifications: ContractModification[];
  /** Sport-specific clauses: no-trade clause flavor, opt-outs, player/team
   *  options, soccer release clauses, NBA player options, etc. */
  sportData: unknown;
}

export interface ContractYear {
  /** Year of the season the salary applies to (e.g. 2026 for 2026-27 NBA). */
  season: number;
  /** Base salary paid out this year. */
  baseSalary: number;
  /** Signing bonus prorated to this year. */
  proratedBonus: number;
  /** True = fully guaranteed. Affects dead cap math on release. */
  guaranteed: boolean;
}

export interface ContractModification {
  /** ISO date of the modification. */
  date: string;
  type: 'restructure' | 'extension' | 'renegotiation' | 'release' | 'trade';
  /** Free-form description for the news feed and history. */
  description: string;
  /** Cap impact this modification caused, if any. */
  capImpactByYear: Record<number, number>;
}

// ============================================================================
// Draft picks (generalized)
// ============================================================================

export interface BaseDraftPick {
  /** Year of the draft this pick will be used in. */
  season: number;
  /** Round number, 1-indexed. Sport-specific max rounds. */
  round: number;
  /** Original owning team. Used for "via" display in trade contexts. */
  originalTeamId: TeamId;
  /** Current owning team. Differs from original if pick has been traded. */
  currentTeamId: TeamId;
  /** Optional conditions like "top-3 protected, conveys 2027 if not
   *  conveyed by 2026." Free-form string for display; the core enforces
   *  expirations and protections via sport-specific logic. */
  conditions?: string;
}

// ============================================================================
// Player movement — generalized "trade"
// ============================================================================

/** A discriminated union covering every kind of player movement across all
 *  supported sports. Football: trade, free_agency_sign, release, claim_off_waivers,
 *  franchise_tag. Basketball: trade, free_agency_sign, release, two_way_sign.
 *  Hockey: trade, free_agency_sign, release, waivers, ltir_placement, recall.
 *  Soccer: transfer, loan_out, loan_in, loan_recall, free_transfer, contract_renewal. */
export type PlayerMovement =
  | TradeMovement
  | FreeAgentSigning
  | Release
  | Waiver
  | TransferFee
  | Loan
  | LoanRecall;

export interface TradeMovement {
  type: 'trade';
  date: string;
  /** Each side of the trade. Array allows for 3+ team trades. */
  sides: TradeSide[];
  /** Optional cap considerations specific to the trade (NBA matching, NHL
   *  retained salary). */
  capNotes?: string[];
}

export interface TradeSide {
  teamId: TeamId;
  playersSent: PlayerId[];
  picksSent: BaseDraftPick[];
  /** Cash sent. NBA trades allow cash up to a per-season limit. NHL trades
   *  can include retained salary. Soccer "trades" with cash component are
   *  really transfer fees; use TransferFee instead. */
  cashSent?: number;
}

export interface FreeAgentSigning {
  type: 'free_agency_sign';
  date: string;
  playerId: PlayerId;
  signingTeamId: TeamId;
  contract: BaseContract;
}

export interface Release {
  type: 'release';
  date: string;
  playerId: PlayerId;
  releasingTeamId: TeamId;
  /** Sport-specific designation: post-June-1 (NFL), waived-and-stretched (NBA),
   *  bought-out (NHL/soccer). */
  designation?: string;
}

export interface Waiver {
  type: 'waiver';
  date: string;
  playerId: PlayerId;
  /** Originating team (placed on waivers from). */
  fromTeamId: TeamId;
  /** Claiming team. Null = cleared waivers. */
  toTeamId: TeamId | null;
}

/** Soccer-specific. Transfer fee paid to the selling club for a player's
 *  registration, plus a new contract with the buying club. */
export interface TransferFee {
  type: 'transfer';
  date: string;
  playerId: PlayerId;
  sellingTeamId: TeamId;
  buyingTeamId: TeamId;
  /** Fee in dollars (or local currency, normalized by the adapter). */
  feeAmount: number;
  /** Add-ons triggered by performance (apps, goals, trophies). */
  addOns?: { description: string; amount: number; trigger: string }[];
  /** Sell-on percentage retained by the selling club for future transfers. */
  sellOnPercent?: number;
  newContract: BaseContract;
}

/** Soccer-specific. Player remains owned by owningTeam but registers with
 *  borrowingTeam for the loan duration. */
export interface Loan {
  type: 'loan';
  date: string;
  playerId: PlayerId;
  owningTeamId: TeamId;
  borrowingTeamId: TeamId;
  loanEndDate: string;
  /** Loan fee paid to owner. */
  loanFee: number;
  /** Wage split: percent paid by the borrowing team. Owner pays the rest. */
  wagesCoveredByBorrowerPercent: number;
  /** Optional buy clause: if borrower pays this amount by end of loan, the
   *  player transfers permanently. */
  optionToBuy?: number;
  /** Optional obligation to buy: borrower must pay this amount if certain
   *  conditions are met (apps, trophies). */
  obligationToBuy?: { amount: number; trigger: string };
}

export interface LoanRecall {
  type: 'loan_recall';
  date: string;
  playerId: PlayerId;
  owningTeamId: TeamId;
  borrowingTeamId: TeamId;
  /** Optional cost paid to borrower for early recall. */
  recallFee?: number;
}

// ============================================================================
// Cap state (optional capability)
// ============================================================================

/** Populated only for sports whose adapter implements the CapRules capability.
 *  Football, basketball, hockey: yes. Soccer: no (uses sportData wageBudget). */
export interface CapState {
  salaryCap: number;
  currentPayroll: number;
  /** Money committed to released players, by season. */
  deadCapByYear: Record<number, DeadCapEntry[]>;
  /** Sport-specific cap-adjacent values: NBA luxury tax, NHL LTIR pool,
   *  unused exception room. */
  sportData: unknown;
}

export interface DeadCapEntry {
  playerId: PlayerId;
  playerName: string; // denormalized so the UI doesn't need a player lookup
  amount: number;
  /** Year (season) the dead cap hits. */
  season: number;
  /** Why this charge exists. */
  reason: string;
}

// ============================================================================
// Game results
// ============================================================================

export interface BaseGameResult<TStats> {
  id: GameId;
  season: number;
  /** Which competition this game belongs to. For US sports there's usually
   *  one (the league + playoffs). For soccer this distinguishes league from
   *  cup from continental. */
  competitionId: CompetitionId;
  /** When the game is scheduled / was played. */
  date: string;

  homeTeamId: TeamId;
  awayTeamId: TeamId;

  /** Played = box score available. Scheduled = future game. Postponed = was
   *  scheduled, rescheduled to another date. */
  status: 'scheduled' | 'in_progress' | 'played' | 'postponed';

  /** Final score. Null until status === 'played'. */
  finalScore: { home: number; away: number } | null;

  /** Per-player box scores keyed by player ID. Only populated for players
   *  who appeared in the game. */
  boxScores: Record<PlayerId, Partial<TStats>>;

  /** Sport-specific game-level data: NFL drives + play-by-play (deferred for
   *  basketball/hockey/soccer), NBA pace + lead changes, NHL shots-on-goal,
   *  soccer cards + xG. */
  sportData: unknown;
}

// ============================================================================
// League state (the root)
// ============================================================================

export interface BaseLeagueState<TRatings, TStats> {
  id: LeagueId;
  sportId: SportId;
  /** League name as the user knows it. "BS Football", "BS Hoops", etc. */
  displayName: string;
  /** Current season year. Advances on offseason rollover. */
  currentSeason: number;
  /** Current phase within the season. */
  currentPhase: SeasonPhase;
  /** Current sub-phase week/day. Semantics vary per sport: NFL = week
   *  number, NBA = day-of-season, soccer = matchweek. */
  currentTick: number;

  /** All teams in the top-flight league. For sports with promotion/relegation
   *  (soccer), this set changes between seasons; the affected teams move
   *  between this set and the adapter's sportData lowerLeagues. */
  teams: BaseTeam<TRatings, TStats>[];

  /** All players ever generated. Includes retired, free agents, prospects.
   *  Lookups go through this map; team.playerIds are foreign keys. */
  players: Record<PlayerId, BasePlayer<TRatings, TStats>>;

  /** Free agents — denormalized index for FA UI. Recomputed when player
   *  contracts change. */
  freeAgentIds: PlayerId[];

  /** Coaches across the league. Same pattern as players. */
  coaches: Record<CoachId, BaseCoach>;

  /** All competitions this league participates in. US sports = 1
   *  (the league + playoffs). Soccer = 2-4 (league + domestic cups + continental). */
  competitions: Competition[];

  /** All games ever scheduled — past + future, across all competitions.
   *  The core's calendar walker filters by date + competition. */
  games: BaseGameResult<TStats>[];

  /** Past season summaries. Keyed by year. The adapter knows what fields
   *  belong in a season summary (champion, MVP, scoring leader, etc.); this
   *  field stores the typed result. */
  seasonHistory: Record<number, unknown>;

  /** The active player-controlled GM's team. Null if the user is spectating. */
  userTeamId: TeamId | null;

  /** Save format version. Bumped when migration logic is added in the core. */
  saveVersion: number;

  /** Sport-specific extension slot. Each adapter narrows. */
  sportData: unknown;
}

// ============================================================================
// Competition (new abstraction for soccer; collapses to trivial for US sports)
// ============================================================================

export interface Competition {
  id: CompetitionId;
  /** Human-readable: "Regular Season", "Playoffs", "Premier League", "FA Cup",
   *  "Champions League". */
  name: string;
  /** Phase-by-phase structure unique to this competition. */
  format: CompetitionFormat;
  /** Current phase the competition is in. Multiple competitions on one
   *  league progress independently. */
  currentPhaseIndex: number;
  /** Standings for the current iteration. Snapshot updated after each game. */
  standings: CompetitionStanding[];
  /** Past champions and key results. */
  history: { season: number; champion: TeamId; runnerUp?: TeamId }[];
}

export type CompetitionFormat =
  | { kind: 'round_robin'; gamesPerOpponent: number; followedByPlayoff?: PlayoffFormat }
  | { kind: 'single_elimination'; rounds: number; seeding: 'merit' | 'random' | 'draw' }
  | { kind: 'group_then_knockout'; groups: number; teamsPerGroup: number; advanceTopN: number; knockoutFormat: PlayoffFormat }
  | { kind: 'double_round_robin'; promotionRelegation?: { promoteN: number; relegateN: number } };

export interface PlayoffFormat {
  rounds: { name: string; tieFormat: TieFormat }[];
  reseededEachRound: boolean;
}

/** How a single tie/round is decided. INTERFACE CHANGE #2 from soccer
 *  pressure-test — see DECISIONS.md.
 *
 *  US sports best-of series: `{ type: 'best_of', games: 7 }`.
 *  Football playoffs / NFL-style single match: `{ type: 'single_match' }`.
 *  European cup two-legged tie: `{ type: 'legs', count: 2, awayGoalsRule: false }`.
 *  Single-leg cup tie: `{ type: 'legs', count: 1 }`. */
export type TieFormat =
  | { type: 'single_match' }
  | { type: 'best_of'; games: number }
  | { type: 'legs'; count: 1 | 2; awayGoalsRule?: boolean };

export interface CompetitionStanding {
  teamId: TeamId;
  wins: number;
  losses: number;
  draws: number;
  pointsFor: number;
  pointsAgainst: number;
  /** Soccer / international: 3 points per win, 1 per draw. Computed by adapter. */
  competitionPoints: number;
  position: number;
}

// ============================================================================
// Phases
// ============================================================================

/** Universal phases every sport passes through. Sport-specific sub-phases
 *  (e.g., soccer transfer windows, hockey expansion draft) live in the
 *  adapter's SeasonCalendar.subPhases. */
export type SeasonPhase =
  | 'preseason'
  | 'regular_season'
  | 'playoffs'
  | 'offseason';

// ============================================================================
// Coaches
// ============================================================================

export interface BaseCoach {
  id: CoachId;
  firstName: string;
  lastName: string;
  age: number;
  /** Sport-specific role enum: NFL has HC/OC/DC/position coaches; NBA has
   *  HC/Asst; soccer has manager/asst/dir-of-football. */
  role: string;
  teamId: TeamId | null;
  /** Tactical preferences. The adapter declares the valid scheme strings. */
  schemes: string[];
  /** Coaching ratings on a 0-100 scale, universal across sports. */
  ratings: {
    offense: number;
    defense: number;
    development: number;
    morale: number;
  };
  /** Career history of head positions held. */
  history: { team: string; startSeason: number; endSeason: number | null; record: string }[];
  contract: BaseContract | null;
  sportData: unknown;
}

// ============================================================================
// Approval state
// ============================================================================

export interface ApprovalState {
  /** 0-100. Fans react to wins, losses, and roster moves. */
  fanApproval: number;
  /** 0-100. Owner reacts to wins, finances, and objective progress. */
  ownerApproval: number;
  /** Objectives the owner set for this season. */
  objectives: SeasonObjective[];
  /** Hot-seat warning level. */
  jobSecurity: 'safe' | 'warm' | 'hot' | 'final_warning';
}

export interface SeasonObjective {
  id: string;
  description: string;
  target: number;
  current: number;
  type: 'wins' | 'playoff_round' | 'championship' | 'payroll' | 'youth_development' | 'sport_specific';
  status: 'pending' | 'met' | 'missed';
}

// ============================================================================
// Injuries
// ============================================================================

export interface Injury {
  type: string; // sport-specific vocabulary, but field is universal
  bodyPart?: string;
  weeksOut: number;
  severity: 'minor' | 'moderate' | 'major' | 'season_ending';
  occurredDate: string;
  /** Whether the player has opted to play through. Triggers re-injury rolls. */
  playingThrough: boolean;
}

// ============================================================================
// Validation results — used by capability checks
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  violations: ValidationViolation[];
  warnings: ValidationViolation[];
}

export interface ValidationViolation {
  /** Machine-readable code: 'CAP_OVER_LIMIT', 'ROSTER_UNDER_MIN_AT_POSITION', etc. */
  code: string;
  message: string;
  /** What entity the violation attaches to. */
  ref?: { kind: 'player' | 'team' | 'contract'; id: string };
}

// ============================================================================
// Cap actions — returned by CapRules.availableCapActions()
// ============================================================================

export interface CapAction {
  id: string;
  /** Display label: "Use Mid-Level Exception", "Place on LTIR", "Franchise Tag". */
  label: string;
  /** Why this is available (or not). */
  description: string;
  /** Whether the user can invoke it right now. */
  available: boolean;
  /** If not available, why. */
  blockedReason?: string;
}
