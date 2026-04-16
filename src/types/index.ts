export type Position =
  | 'QB' | 'RB' | 'WR' | 'TE' | 'OL'
  | 'DL' | 'LB' | 'CB' | 'S'
  | 'K' | 'P';

/** Detailed position. Lives alongside the broad Position type so existing
 *  roster/cap/sim logic keeps working unchanged, but lets the UI and (later)
 *  scheme/depth-chart logic talk in terms of OT/OG/C, EDGE/DT, FS/SS, etc. */
export type SubPosition =
  | 'QB'
  | 'RB' | 'FB'
  | 'WR' | 'TE'
  | 'OT' | 'OG' | 'C'
  | 'EDGE' | 'DT'
  | 'MLB' | 'OLB'
  | 'CB' | 'FS' | 'SS'
  | 'K' | 'P';

/** BS Mode personality traits */
export type PersonalityTrait = 'irrational_confidence' | 'steady' | 'pressure_fold' | 'clutch';
export type QBTier = 'Elite' | 'Franchise' | 'Bridge' | 'Game Manager' | 'Backup' | 'Camp Arm';

export const POSITIONS: Position[] = [
  'QB', 'RB', 'WR', 'TE', 'OL',
  'DL', 'LB', 'CB', 'S',
  'K', 'P',
];

/** Derive a player's detailed sub-position from their broad Position +
 *  ratings. Pure function — used both at generation time (to seed the
 *  Player.subPosition field) and as a backfill for older saves. */
export function deriveSubPosition(player: {
  position: Position;
  ratings: {
    passRush: number; speed: number; tackling: number; coverage: number;
    strength: number; agility: number; blocking: number; carrying: number;
  };
}): SubPosition {
  if (player.position === 'QB') return 'QB';
  if (player.position === 'WR') return 'WR';
  if (player.position === 'TE') return 'TE';
  if (player.position === 'CB') return 'CB';
  if (player.position === 'K') return 'K';
  if (player.position === 'P') return 'P';

  // RB vs FB: speed+agility (RB) vs strength+blocking (FB). FBs are rare.
  if (player.position === 'RB') {
    const rbScore = player.ratings.speed + player.ratings.agility;
    const fbScore = player.ratings.strength + player.ratings.blocking;
    return fbScore > rbScore * 1.05 ? 'FB' : 'RB';
  }

  // OL: OT/OG/C
  // OT: agility+speed dominant (pass protectors on the edge)
  // OG: strength+blocking dominant (interior run blockers)
  // C: balanced blocking — small carve-out for the smartest interior linemen
  if (player.position === 'OL') {
    const tackleScore = player.ratings.agility + player.ratings.speed;
    const guardScore = player.ratings.strength + player.ratings.blocking;
    const balancedScore = (player.ratings.blocking + player.ratings.tackling) / 2;
    if (
      balancedScore > tackleScore * 0.55
      && balancedScore > guardScore * 0.55
      && Math.random() < 0.18
    ) {
      return 'C';
    }
    if (tackleScore > guardScore * 0.95) return 'OT';
    return 'OG';
  }

  // DL: EDGE vs DT
  if (player.position === 'DL') {
    const edgeScore = player.ratings.passRush + player.ratings.speed;
    const interiorScore = player.ratings.strength * 2;
    return edgeScore > interiorScore ? 'EDGE' : 'DT';
  }

  // LB: OLB (edge/cover) vs MLB (inside/run defense)
  if (player.position === 'LB') {
    const edgeScore = player.ratings.passRush + player.ratings.speed;
    const insideScore = player.ratings.tackling + player.ratings.coverage;
    return edgeScore > insideScore ? 'OLB' : 'MLB';
  }

  // S: FS (cover/speed) vs SS (run support/strength)
  if (player.position === 'S') {
    const fsScore = player.ratings.coverage + player.ratings.speed;
    const ssScore = player.ratings.tackling + player.ratings.strength;
    return fsScore > ssScore ? 'FS' : 'SS';
  }

  return player.position as SubPosition;
}

/**
 * Legacy display helper — kept for callers that read the old string-typed
 * sub-position label. New code should use Player.subPosition (typed) directly,
 * which is set at generation time and backfilled on load.
 */
export function getSubPosition(player: { position: Position; ratings: { passRush: number; speed: number; tackling: number; coverage: number; strength: number; agility: number; blocking: number } }): string {
  if (player.position === 'OL') {
    const tackleScore = player.ratings.agility + player.ratings.speed;
    const guardScore = player.ratings.strength + player.ratings.blocking;
    if (tackleScore > guardScore * 0.95) return 'OT';
    return 'OG';
  }
  if (player.position === 'LB') {
    const edgeScore = player.ratings.passRush + player.ratings.speed;
    const insideScore = player.ratings.tackling + player.ratings.coverage;
    return edgeScore > insideScore ? 'OLB' : 'ILB';
  }
  if (player.position === 'DL') {
    const edgeScore = player.ratings.passRush + player.ratings.speed;
    const interiorScore = player.ratings.strength * 2;
    return edgeScore > interiorScore ? 'EDGE' : 'DT';
  }
  if (player.position === 'S') {
    const fsScore = player.ratings.coverage + player.ratings.speed;
    const ssScore = player.ratings.tackling + player.ratings.strength;
    return fsScore > ssScore ? 'FS' : 'SS';
  }
  return player.position;
}

/** NFL Passer Rating (scale 0-158.3). Pass attempts must be > 0. */
export function calcPasserRating(comp: number, att: number, yds: number, td: number, int: number): number {
  if (att === 0) return 0;
  const a = Math.min(2.375, Math.max(0, ((comp / att) - 0.3) * 5));
  const b = Math.min(2.375, Math.max(0, ((yds / att) - 3) * 0.25));
  const c = Math.min(2.375, Math.max(0, (td / att) * 20));
  const d = Math.min(2.375, Math.max(0, 2.375 - ((int / att) * 25)));
  return Math.round(((a + b + c + d) / 6) * 1000) / 10;
}

export const ROSTER_LIMITS: Record<Position, { min: number; max: number }> = {
  QB: { min: 1, max: 3 },
  RB: { min: 2, max: 4 },
  WR: { min: 3, max: 6 },
  TE: { min: 1, max: 3 },
  OL: { min: 5, max: 8 },
  DL: { min: 4, max: 7 },
  LB: { min: 3, max: 6 },
  CB: { min: 3, max: 5 },
  S: { min: 2, max: 4 },
  K: { min: 1, max: 1 },
  P: { min: 1, max: 1 },
};

export interface PlayerRatings {
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

/** Auto-generated college career stats for draft prospect scouting */
export interface CollegeStats {
  /** Number of college seasons played */
  seasons: number;
  /** Total games played */
  gamesPlayed: number;
  // Offense
  passYards?: number;
  passTDs?: number;
  passINTs?: number;
  rushYards?: number;
  rushTDs?: number;
  recYards?: number;
  recTDs?: number;
  receptions?: number;
  // Defense
  tackles?: number;
  sacks?: number;
  interceptions?: number;
  forcedFumbles?: number;
  // Special
  fieldGoalPct?: number;
}

export interface PlayerStats {
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
  // Snap tracking
  snaps: number;
}

/** Per-year contract breakdown used for restructured contracts */
export interface ContractYear {
  baseSalary: number;      // Base salary for this year ($M)
  proratedBonus: number;   // Accumulated prorated signing bonus ($M), 0 by default
  isVoidYear: boolean;     // true = dummy year added for spreading proration
}

/** Log entry for a single contract restructure */
export interface ContractRestructure {
  season: number;          // When the restructure happened
  amountConverted: number; // How much base salary was converted to bonus
  voidYearsAdded: number;  // How many void years were added (0-3)
  proratedPerYear: number; // The per-year prorated charge created
}

export interface Contract {
  salary: number;
  yearsLeft: number;
  /** Total guaranteed money remaining on the contract (dead cap if released) */
  guaranteed: number;
  /** Original total years of the contract (for dead-cap proration) */
  totalYears?: number;
  /** Per-year breakdown — populated on first restructure, undefined for simple contracts */
  contractYears?: ContractYear[];
  /** Total void years added to this contract (max 3 lifetime) */
  voidYears?: number;
  /** History of all restructures on this contract */
  restructureHistory?: ContractRestructure[];
  /** Set true when signed during offseason — prevents first startNewSeason decrement */
  offseasonSigned?: boolean;
}

/** Shape for user-imported draft prospects (Import Draft Class feature). */
export interface ImportedProspect {
  firstName: string;
  lastName: string;
  position: Position;
  college?: string;
  age?: number;
  overall?: number;      // 40-99, defaults to random 55-80
  potential?: number;     // 40-99, defaults to overall + random 5-15
  /** Optional detailed ratings — if not provided, generated from overall. */
  ratings?: Partial<PlayerRatings>;
}

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  position: Position;
  /** Detailed sub-position derived from ratings (Phase 1 — Apr 11 2026).
   *  Optional during the rollout to allow lazy backfill on existing saves. */
  subPosition?: SubPosition;
  age: number;
  experience: number;
  ratings: PlayerRatings;
  potential: number;
  /** Season-end OVR snapshots recorded each offseason before development runs. */
  ratingHistory: { season: number; overall: number }[];
  stats: PlayerStats;
  careerStats: PlayerStats;
  contract: Contract;
  teamId: string | null;
  draftYear: number | null;
  draftPick: number | null;
  retired: boolean;
  injury: { type: string; weeksLeft: number } | null;
  /** Currently on Injured Reserve */
  onIR: boolean;
  /** Projected draft rank (noisy media perception, set at draft class creation) */
  projectedRank?: number;
  /** Whether the player is holding out for a new contract */
  holdout?: boolean;
  /** BS Mode: personality trait affecting performance variance */
  personality?: PersonalityTrait;
  /** How this player was acquired by their current team (set once on first joining) */
  acquiredVia?: 'draft' | 'free-agency' | 'trade' | 'initial';
  /** Season when the player was acquired by their current team */
  acquiredSeason?: number;
  /** Scouting label assigned at draft (cosmetic flavor) */
  scoutingLabel?: string;
  /** Deterministic seed for scouting report generation (set at draft class creation) */
  scoutingSeed?: number;
  /** Draft prospect archetype — affects post-draft development.
   *  boom: late bloomer who can dramatically exceed expectations (potential jumps)
   *  bust: high-profile prospect who fails to develop (potential drops sharply)
   *  normal: standard development curve */
  draftProfile?: 'boom' | 'bust' | 'normal';
  /**
   * Player sentiment / mood (0-100).
   * Affected by: team winning, playing time (depth chart), contract satisfaction, team location.
   * Low sentiment → holdouts, locker room problems, unlikely to re-sign.
   */
  mood: number;
  /** Season when the player last had their contract restructured (prevents repeat restructures) */
  lastRestructuredSeason?: number;
  /** Optional photo URL (populated from imported league files) */
  photoUrl?: string;
  /** Combine measurables (40-yard dash, bench press, vertical jump) */
  combineStats?: { fortyYard: number; benchPress: number; verticalJump: number };
  /** College / university the player attended (flavor text for draft) */
  college?: string;
  /** Auto-generated college stats for draft scouting flavor */
  collegeStats?: CollegeStats;
  /** Heisman winner flag (top prospect in the class) */
  heismanWinner?: boolean;
  /** Height string e.g. "6'3\"" */
  height?: string;
  /** Weight in lbs */
  weight?: number;
  /** Round the player was drafted in */
  draftRound?: number;
  /** Team ID that originally drafted this player */
  draftTeamId?: string;
  /** Free agency priority — what matters most to this player in FA */
  faPriority?: 'money' | 'winning' | 'role' | 'loyalty';
  /** Stats from the previous completed season (for free agency display) */
  previousSeasonStats?: PlayerStats;
  /** Season-by-season stat history */
  seasonLog?: { season: number; teamId: string; stats: PlayerStats }[];
  /** Career awards earned */
  awards?: { award: string; season: number }[];
  /** Discipline rating (0-100). Low = more likely to get suspended. */
  discipline?: number;
  /** Active suspension: games remaining, reason, and fine amount */
  suspension?: { gamesLeft: number; reason: string; fine: number };
}

/** Format a team record as "W-L" or "W-L-T" if ties > 0 */
export function formatRecord(r: { wins: number; losses: number; ties?: number }): string {
  return r.ties ? `${r.wins}-${r.losses}-${r.ties}` : `${r.wins}-${r.losses}`;
}

export interface TeamRecord {
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  streak: number;
  divisionWins: number;
  divisionLosses: number;
  homeWins: number;
  homeLosses: number;
  awayWins: number;
  awayLosses: number;
  conferenceWins: number;
  conferenceLosses: number;
  /** Against the spread wins (betting) */
  atsWins?: number;
  /** Against the spread losses (betting) */
  atsLosses?: number;
  /** Against the spread pushes (betting) */
  atsPushes?: number;
}

export interface DeadCapEntry {
  playerName: string;
  amount: number;
  yearsLeft: number;
  /** Source of the dead cap charge */
  source?: 'release' | 'trade' | 'void' | 'extension';
  /** Season the dead cap was created */
  season?: number;
}

// ---------------------------------------------------------------------------
// Coaching types
// ---------------------------------------------------------------------------

export type CoachRole = 'HC' | 'OC' | 'DC' | 'QB' | 'RB' | 'WR' | 'OL' | 'DL' | 'DB';
/** The 6 position-coach roles added in Phase 1 coaching tree */
export const POSITION_COACH_ROLES: CoachRole[] = ['QB', 'RB', 'WR', 'OL', 'DL', 'DB'];
/** Which player positions each coach role develops */
export const COACH_ROLE_POSITIONS: Record<string, string[]> = {
  QB: ['QB'],
  RB: ['RB'],
  WR: ['WR', 'TE'],
  OL: ['OL'],
  DL: ['DL'],
  DB: ['CB', 'S', 'LB'],
};
export type OffensiveScheme = 'spread' | 'west_coast' | 'power_run' | 'air_raid' | 'rpo';
export type DefensiveScheme = 'cover_3' | 'man_press' | 'tampa_2' | 'blitz_34' | 'zone_blitz';

export interface CoachHistory {
  teamId: string;
  teamName: string;
  role: CoachRole;
  seasonStart: number;
  seasonEnd: number;
  wins: number;
  losses: number;
  playoffAppearances: number;
  championships: number;
}

export interface Coach {
  id: string;
  firstName: string;
  lastName: string;
  role: CoachRole;
  ovr: number;
  age: number;
  offensiveScheme?: OffensiveScheme;
  defensiveScheme?: DefensiveScheme;
  trait: string;
  yearsWithTeam: number;
  careerWins: number;
  careerLosses: number;
  bio?: string;
  history?: CoachHistory[];
  ratingHistory?: { season: number; ovr: number }[];
  personality?: string;
  specialties?: string[];
  contractYears?: number;
  salary?: number;
}

export interface OwnerObjective {
  id: string;
  description: string;
  type: 'wins' | 'playoffs' | 'cap' | 'development' | 'championship';
  target: number | string;
  season: number;
  status: 'active' | 'completed' | 'failed';
}

export interface ApprovalState {
  fanApproval: number;
  ownerApproval: number;
  objectives: OwnerObjective[];
  tenureSeasons: number;
  warningIssued: boolean;
}

export interface Team {
  id: string;
  city: string;
  name: string;
  abbreviation: string;
  conference: 'AC' | 'NC';
  division: 'North' | 'South' | 'East' | 'West';
  primaryColor: string;
  secondaryColor: string;
  /** Team logo URL (from imported league files, e.g. FBGM imgURL) */
  logoUrl?: string;
  record: TeamRecord;
  salaryCap: number;
  totalPayroll: number;
  roster: string[];
  draftPicks: DraftPick[];
  /** Ordered player IDs per position; index 0 = starter */
  depthChart: Record<Position, string[]>;
  /** Dead cap charges from released players */
  deadCap: DeadCapEntry[];
  /** Whether the franchise tag has been used this season */
  franchiseTagUsed: boolean;
  /** Coaching staff (HC, OC, DC) */
  coaches?: Coach[];
  /** BS Mode: Ewing Theory active */
  ewingTheory?: { injuredPlayerId: string; teamPowerBoost: number };
  /** Revenue breakdown (computed at start of each season) */
  revenue: {
    tickets: number;
    merchandise: number;
    tvDeal: number;
    total: number;
  };
  /** Fan and owner approval + seasonal objectives */
  approval?: ApprovalState;
}

/**
 * Calculates the dead cap hit when releasing a player.
 * Uses the formula directly to avoid stale stored guaranteed values.
 * Dead cap is always < salary, so cutting always saves cap space.
 */
export function calculateDeadCap(contract: Contract): number {
  // Compute guaranteed from formula — never trust stored value (may be from old buggy formula)
  const formulaGuaranteed = generateGuaranteed(contract.salary, contract.yearsLeft);
  // Use whichever is lower: stored value or formula (handles both old inflated values AND correctly reduced values)
  const stored = contract.guaranteed ?? Infinity;
  const guaranteed = Math.min(stored, formulaGuaranteed);
  return Math.round(guaranteed * 10) / 10;
}

/**
 * Calculates the actual cap savings from releasing a player.
 * Savings = annual salary - dead cap hit (can be negative in year 1 of big deals!)
 */
export function calculateCapSavings(contract: Contract): number {
  const deadCap = calculateDeadCap(contract);
  const savings = contract.salary - deadCap;
  return Math.round(savings * 10) / 10;
}

/**
 * Generates a guaranteed amount for a new contract.
 * Pro-style: guaranteed money is roughly 1-2 years of salary, NOT a % of total value.
 * This ensures releasing a player always saves cap space (dead cap < annual salary).
 * Guaranteed $ is prorated across years, so dead cap = guaranteed * (yearsLeft/totalYears).
 * For savings to be positive: salary > guaranteed * (yearsLeft/totalYears)
 * → guaranteed must be < salary * totalYears (always true with these values).
 */
export function generateGuaranteed(salary: number, years: number): number {
  // Realistic guaranteed money:
  // - Star players (high salary) get more guaranteed
  // - Short deals get higher % guaranteed but lower total
  // - Cutting a player should almost always save SOME cap space
  //
  // Examples:
  //   1-year $1M deal: ~$0.2-0.5M guaranteed (signing bonus only)
  //   1-year $10M deal: ~$5-7M guaranteed
  //   3-year $15M/yr deal: ~$25-30M total guaranteed (~55-65%)
  //   5-year $50M/yr deal: ~$100-125M total guaranteed (~40-50%)
  //
  // Dead cap = guaranteed * (yearsLeft / totalYears)
  // Cap savings = salary - deadCap
  // We want savings > 0 almost always, especially for depth players.

  if (salary <= 1) {
    // Minimum/low salary: small signing bonus only
    return Math.round(salary * 0.25 * 10) / 10;
  }

  // Base guaranteed fraction decreases with contract length
  // But total guaranteed $ increases with salary (stars get more guaranteed)
  const baseFraction = years <= 1 ? 0.40 : years <= 2 ? 0.55 : years <= 3 ? 0.50 : years <= 4 ? 0.45 : 0.40;

  // Higher-paid players get slightly more guaranteed (as % of salary)
  // A $20M/yr player might get 60% guaranteed, a $2M/yr player gets 35%
  const salaryBonus = Math.min(0.15, (salary / 100) * 0.5);

  const fraction = Math.min(0.70, baseFraction + salaryBonus);
  return Math.round(salary * fraction * 10) / 10;
}

// ── Contract Restructuring Helpers ──────────────────────────────────

/**
 * Get the current-year cap hit for a contract.
 * If contractYears exists, use index 0 (baseSalary + proratedBonus).
 * Otherwise fall back to the flat salary field.
 */
export function getCapHit(contract: Contract): number {
  if (contract.contractYears && contract.contractYears.length > 0) {
    const yr = contract.contractYears[0];
    return Math.round((yr.baseSalary + yr.proratedBonus) * 100) / 100;
  }
  return contract.salary;
}

/**
 * Get the total unamortized prorated bonus remaining across ALL years.
 * This is the dead money that accelerates on cut/trade.
 */
export function getUnamortizedBonus(contract: Contract): number {
  if (!contract.contractYears) return 0;
  return Math.round(
    contract.contractYears.reduce((sum, yr) => sum + yr.proratedBonus, 0) * 100
  ) / 100;
}

/**
 * Calculate dead cap for a contract, handling both restructured and legacy contracts.
 * Restructured: all unamortized prorated bonus accelerates.
 * Legacy: falls back to the original calculateDeadCap formula.
 */
export function calculateDeadCapV2(contract: Contract): number {
  if (contract.contractYears) {
    return getUnamortizedBonus(contract);
  }
  return calculateDeadCap(contract);
}

/**
 * Calculate cap savings from releasing a player.
 * Savings = current year cap hit - dead money charge.
 */
export function calculateCapSavingsV2(contract: Contract): number {
  const capHit = getCapHit(contract);
  const deadCap = calculateDeadCapV2(contract);
  return Math.round((capHit - deadCap) * 100) / 100;
}

/**
 * Create a ContractYear[] from a flat contract model.
 * Called on first restructure to materialize the per-year breakdown.
 * All years get the same baseSalary = contract.salary, proratedBonus = 0.
 */
export function materializeContractYears(contract: Contract): ContractYear[] {
  const years: ContractYear[] = [];
  for (let i = 0; i < contract.yearsLeft; i++) {
    years.push({ baseSalary: contract.salary, proratedBonus: 0, isVoidYear: false });
  }
  return years;
}

export interface DraftPick {
  id: string;
  year: number;
  round: number;
  originalTeamId: string;
  ownerTeamId: string;
  pick?: number;
  playerId?: string;
}

export interface ScoringPlay {
  /** Which quarter (1-4, 5 for OT) */
  quarter: number;
  /** Time remaining in the quarter (e.g. "12:34") */
  timeLeft?: string;
  /** Team that scored */
  teamId: string;
  /** Points scored on this play */
  points: number;
  /** Description of the scoring play */
  description: string;
  /** Running score after this play: [away, home] */
  score: [number, number];
}

export interface BettingLine {
  spread: number;        // negative = home favored
  overUnder: number;
  homeML: number;        // e.g. -175
  awayML: number;        // e.g. +155
}

export interface GameResult {
  id: string;
  week: number;
  season: number;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  played: boolean;
  playerStats: Record<string, Partial<PlayerStats>>;
  /** Scoring play log for box score display */
  scoringPlays?: ScoringPlay[];
  bettingLine?: BettingLine;
  /** ATS result after game played */
  spreadCover?: 'home' | 'away' | 'push';
  /** Whether total went over the O/U */
  overHit?: boolean;
}

export interface SocialPost {
  id: string;
  author: {
    type: 'player' | 'fan' | 'media' | 'team';
    playerId?: string;
    personId?: 'tony_blaze' | 'marcus_cole';
    teamId?: string;
    name: string;
    handle: string;
    avatar: string;
    verified: boolean;
  };
  text: string;
  timestamp: { season: number; week: number };
  likes: number;
  reposts: number;
  replies: number;
  action?: {
    label: string;
    type: 'extend' | 'trade' | 'viewPlayer' | 'viewRoster' | 'negotiate';
    playerId?: string;
  };
  category: 'player' | 'fan' | 'media' | 'team';
}

export interface NewsItem {
  id: string;
  season: number;
  week: number;
  type: 'injury' | 'trade' | 'signing' | 'release' | 'performance' | 'milestone' | 'system' | 'quote' | 'rumor' | 'recap';
  teamId?: string;
  playerIds?: string[];
  headline: string;
  body?: string;
  isUserTeam: boolean;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlockedSeason?: number;
  unlockedWeek?: number;
}

export interface AllLeagueEntry {
  position: Position;
  playerId: string;
  teamId: string;
}

export interface RetiredPlayerEntry {
  playerId: string;
  name: string;
  position: Position;
  teamId: string;
  age: number;
}

export interface SeasonSummary {
  season: number;
  championTeamId: string;
  finalsMvpId: string;
  /** Championship game stats for the MVP */
  finalsMvpGameStats?: Partial<PlayerStats>;
  awards: { award: string; playerId: string; teamId: string }[];
  bestRecord: {
    ac: { teamId: string; wins: number; losses: number };
    nc: { teamId: string; wins: number; losses: number };
  };
  allLeagueFirst: AllLeagueEntry[];
  allLeagueSecond: AllLeagueEntry[];
  allRookieTeam: AllLeagueEntry[];
  retiredPlayers: RetiredPlayerEntry[];
  statLeaders: Record<string, { playerId: string; value: number }>;
  userRecord: { wins: number; losses: number };
  userPlayoffResult: 'missed' | 'wildcard' | 'divisional' | 'conference' | 'runnerup' | 'champion';
}

export interface TradeProposal {
  id: string;
  season: number;
  week: number;
  /** The AI team proposing the trade */
  proposingTeamId: string;
  /** What the AI offers to the user */
  offeredPlayerIds: string[];
  offeredPickIds: string[];
  /** What the AI wants from the user */
  requestedPlayerIds: string[];
  requestedPickIds: string[];
  /** 'pending' | 'accepted' | 'rejected' */
  status: 'pending' | 'accepted' | 'rejected';
  valueAssessment: 'fair' | 'lopsided-you-win' | 'lopsided-they-win';
}

export interface ResigningEntry {
  playerId: string;
  askingSalary: number;
  askingYears: number;
  /** Player refuses to negotiate — mood too low */
  refusesToResign?: boolean;
}

export interface LeagueSettings {
  salaryCap: number;         // Starting cap (default 300)
  capGrowthRate: number;     // % annual growth (default 5)
  luxuryTaxRate: number;     // Penalty multiplier (default 1.5)
  leagueMinSalary: number;   // Minimum salary (default 0.75)
  tradeDeadlineWeek: number; // Week trades close (default 12)
  injuryRate: number;        // 0-200, 100 = normal (default 100)
  progressionRate: number;   // 0-200, 100 = normal (default 100)
  regressionRate: number;    // 0-200, 100 = normal (default 100)
  retirementAge: number;     // Min age for retirement consideration (default 32)
  bsMode: boolean;           // BS Mode: adds drama and variance
  mcafeeMode: boolean;       // McAfee Mode: special teams matter
  /** Chaos Draft mode: top picks bust, late picks boom (JaMarcus Russell / Brock Purdy League) */
  chaosDraft: boolean;
  /** Use Claude AI to generate unique Team Spotlight commentary */
  aiCommentary: boolean;
  /** God Mode: full commissioner control — edit players, force trades, etc. */
  godMode: boolean;
  /** Permanently set once God Mode is enabled — disables achievements */
  godModeUsed: boolean;
  /** Roster management depth (Apr 11 2026) */
  rosterLimitEnabled: boolean;       // default true — enforces 53-man active
  practiceSquadEnabled: boolean;     // default false — adds PS slots and logic (Phase 2)
  irEnabled: boolean;                // default false — IR designated-for-return rules (Phase 2)
  practiceSquadSize: number;         // default 16 (only meaningful if practiceSquadEnabled)
  /** Suspension frequency multiplier (0.0–2.0, default 1.0). 0 = off, 2 = double rate */
  suspensionFrequency: number;
  /** Number of preseason games (0-4, default 3). 0 = skip preseason. */
  preseasonGames: number;
}

export const DEFAULT_LEAGUE_SETTINGS: LeagueSettings = {
  salaryCap: 300,
  capGrowthRate: 7,
  luxuryTaxRate: 1.5,
  leagueMinSalary: 0.75,
  tradeDeadlineWeek: 12,
  injuryRate: 100,
  progressionRate: 100,
  regressionRate: 100,
  retirementAge: 32,
  bsMode: false,
  mcafeeMode: false,
  chaosDraft: false,
  aiCommentary: true,
  godMode: false,
  godModeUsed: false,
  rosterLimitEnabled: true,
  practiceSquadEnabled: false,
  irEnabled: false,
  practiceSquadSize: 16,
  suspensionFrequency: 1.0,
  preseasonGames: 0,
};

export interface LeagueState {
  season: number;
  week: number;
  phase: 'preseason' | 'regular' | 'playoffs' | 'resigning' | 'draft' | 'freeAgency' | 'offseason';
  userTeamId: string;
  teams: Team[];
  players: Player[];
  schedule: GameResult[];
  /** Preseason schedule (separate from regular season) */
  preseasonSchedule?: GameResult[];
  /** Current preseason game number (1-based, 0 = not in preseason) */
  preseasonWeek?: number;
  draftOrder: string[];
  /** Canonical pick-id sequence for the current draft. Stays constant across trades —
   *  draftOrder is derived from this by looking up each pick's current ownerTeamId.
   *  Length matches the original draftOrder length. Cleared when draft ends. */
  draftPickOrder?: string[];
  /** Year the current draft is for. Set in advanceToDraft, cleared when draft
   *  ends. Used by draftPlayer/simRound/simToEndDraft to mark the correct
   *  team.draftPicks slot — without this, leftover unused picks from prior
   *  drafts can be wrongly consumed by current-draft picks. */
  currentDraftYear?: number;
  draftResults: DraftSelection[];
  freeAgents: string[];
  /** Current day within the 30-day free agency window (0 = not in FA) */
  faDay: number;
  /** Player IDs that refuse to negotiate with the user's team */
  faRefusals: string[];
  playoffBracket: PlayoffMatchup[] | null;
  /** Per-conference seed order: index 0 = seed 1, index 6 = seed 7 (array of team IDs) */
  playoffSeeds: { AC: string[]; NC: string[] } | null;
  /** Championship history across all seasons */
  champions: { season: number; teamId: string }[];
  /** News feed items */
  newsItems: NewsItem[];
  /** Last-read news marker (week) */
  newsLastReadWeek: number;
  /** Last-read news marker (season) */
  newsLastReadSeason: number;
  /** Season-end summaries for history */
  seasonHistory: SeasonSummary[];
  /** Save version for migration detection */
  saveVersion: number;
  /** Players up for re-signing (user team, yearsLeft === 1) */
  resigningPlayers: ResigningEntry[];
  /** Incoming AI trade proposals */
  tradeProposals: TradeProposal[];
  /** Scouting level (0=Entry, 1=Pro, 2=Elite) */
  scoutingLevel: 0 | 1 | 2;
  /** Scouting data keyed by prospect player ID */
  draftScoutingData: Record<string, { scoutedOvr: number; error: number; deepScouted: boolean }>;
  /** Multi-layer scouting state */
  scoutingState?: {
    scoutPoints: number;
    maxScoutPoints: number;
    filmReviews: Record<string, {
      ovrRange: { low: number; high: number };
      strength: string;
      weakness: string;
      projectionTier: 'Starter' | 'Rotational' | 'Backup' | 'Project';
      potentialHint: 'high' | 'medium' | 'low';
      blurb: string;
    }>;
    inPersonEvals: Record<string, {
      ovrRange: { low: number; high: number };
      personality: string;
      characterNotes: string;
      revealedBustBoom: boolean;
      bustBoomResult?: 'bust' | 'boom' | 'normal';
      revealedRatingKeys: string[];
      /** In-person observations */
      bodyType: string;
      footballIQ: string;
      competitiveness: string;
      medicalFlag: string | null;
      motivation: string;
    }>;
    inPersonEvalCount: number;
    fullEvals: Record<string, {
      exactOvr: number;
      bustBoomResult: 'bust' | 'boom' | 'normal';
    }>;
    fullEvalCount: number;
  };
  /** NFL 2026 hardcoded first-round mock draft (empty if not NFL roster or past first draft) */
  nflMockDraft?: { pickNum: number; teamAbbr: string; playerId: string; firstName: string; lastName: string; position: string; college: string; blurb: string }[];
  /** Game plan for the user team's NEXT regular-season game. Cleared after that game is simulated. */
  nextGamePlan?: { passRate: number; aggressiveness: 'conservative' | 'balanced' | 'aggressive'; redZoneStrategy: 'run' | 'balanced' | 'pass' };
  /** Per-position scouting preview of the upcoming draft class. Generated at trade deadline. */
  draftClassPreview?: {
    season: number;
    groups: { position: string; grade: string; depthNote: string; ovrLow: number; ovrHigh: number; topOvr: number }[];
  };
  /** BS Mode: QB tier assignments */
  qbTiers?: Record<string, { playerId: string; tier: QBTier }>;
  /** BS Mode: opponent selection for top seeds */
  // Reserved for future use
  /** BS Mode: draft lottery results */
  draftLotteryResults?: { teamId: string; abbr: string; originalRank: number; lotteryPick: number }[];
  /** Player ID of the Championship MVP (set when championship is played, consumed when season summary is created) */
  finalsMvpPlayerId: string | null;
  /** All-Pro Game result — played between conference championships and the big game */
  allStarGame: { played: boolean; acScore: number; ncScore: number; mvpPlayerId: string | null } | null;
  /** Configurable league settings */
  leagueSettings: LeagueSettings;
  /** Suppress trade proposal popup notifications */
  suppressTradePopups: boolean;
  /** Weekly recap show data generated after each sim week */
  weeklyRecaps: WeeklyRecapData[];
  /** Unlocked achievements */
  achievements: Achievement[];
  /** Dynamic rivalries between teams */
  rivalries: Rivalry[];
  /** Trade rumors generated during the season */
  tradeRumors: TradeRumor[];
  /** Social media feed posts */
  socialPosts: SocialPost[];
  /** Underpaid stars demanding new deals during re-signing */
  holdoutDemands: HoldoutEntry[];
  /** Game over state when owner fires the GM */
  firedState: { fired: boolean; season: number; reason: string } | null;
  /** Expansion draft state (null when not active) */
  expansionDraft: ExpansionDraftState | null;
  /** Number of contract extensions used this season (max 3) */
  extensionsUsedThisSeason?: number;
  /** Free agency intel report pursuit state */
  pursuitState?: {
    pursuitPoints: number;
    maxPursuitPoints: number;
    intelReports: Record<string, {
      priority: 'money' | 'winning' | 'role' | 'loyalty';
      priorityLabel: string;
      priorityDetail: string;
      trueAskingSalary: number;
      trueAskingYears: number;
      closingOffer: { salary: number; years: number };
      closingOfferDetail: string;
      willingness: 'eager' | 'open' | 'reluctant' | 'not_interested';
      willingnessReason: string;
      competingTeams: string[];
      marketHeat: 'cold' | 'moderate' | 'hot' | 'bidding_war';
      marketHeatDetail: string;
      agentStyle: 'hardball' | 'collaborative' | 'impatient' | 'relationship';
      agentStyleDetail: string;
      agentTip: string;
      priorityAligned: boolean;
      fitAssessment: string;
      dealPath: 'strong' | 'possible' | 'uphill' | 'unlikely';
      dealPathDetail: string;
      concerns: string[];
      intelBlurb: string;
      salaryDiscount: number;
      patienceBonus: number;
      overridesRefusal: boolean;
    }>;
  };
}

export interface ExpansionTeamConfig {
  city: string;
  name: string;
  abbreviation: string;
  conference: 'AC' | 'NC';
  division: 'North' | 'South' | 'East' | 'West';
  primaryColor: string;
  secondaryColor: string;
}

export interface ExpansionDraftState {
  phase: 'setup' | 'protection' | 'drafting' | 'complete';
  configs: ExpansionTeamConfig[];
  expansionTeamIds: string[];
  protectedPlayers: Record<string, string[]>;
  picks: { expansionTeamId: string; fromTeamId: string; playerId: string }[];
  currentPickIndex: number;
}

export interface Rivalry {
  id: string;
  team1Id: string;
  team2Id: string;
  intensity: number;
  formed: number;
  events: RivalryEvent[];
  type: 'divisional' | 'playoff' | 'trade' | 'emerging';
}

export interface RivalryEvent {
  season: number;
  week: number;
  description: string;
  type: 'blowout' | 'comeback' | 'upset' | 'playoff_elimination' | 'trade_steal' | 'sweep';
}

export interface TradeRumor {
  id: string;
  season: number;
  week: number;
  type: 'star_available' | 'shopping_pick' | 'position_need' | 'blockbuster' | 'deadline_buzz';
  teamId: string;
  targetTeamId?: string;
  playerIds: string[];
  pickIds?: string[];
  headline: string;
  detail: string;
  resolved: boolean;
  outcome?: 'accurate' | 'false_alarm';
  resolvedWeek?: number;
  /** Hidden flag set at generation — determines if this rumor is "destined" to come true */
  _accurate?: boolean;
}

export interface HoldoutEntry {
  playerId: string;
  demandedSalary: number;
  demandedYears: number;
  resolved: boolean;
}

export interface WeeklyRecapData {
  season: number;
  week: number;
  segments: RecapSegmentData[];
}

export interface RecapSegmentData {
  type: 'headline' | 'upset' | 'comeback' | 'blowout' | 'shootout' | 'defensive' | 'performance' | 'streak' | 'rivalry' | 'milestone' | 'trade' | 'summary';
  title: string;
  body: string;
  teamIds: string[];
  playerIds: string[];
  priority: number;
  icon: string;
}

export interface DraftSelection {
  overallPick: number;
  round: number;
  pickInRound: number;
  teamId: string;
  playerId: string;
}

export interface PlayoffMatchup {
  id: string;
  /** 1 = Wild Card, 2 = Divisional, 3 = Conference Championship, 4 = Championship */
  round: number;
  conference: 'AC' | 'NC' | 'Championship';
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeSeed: number | null;
  awaySeed: number | null;
  homeScore: number | null;
  awayScore: number | null;
  winnerId: string | null;
  /** ID of a prior matchup whose winner fills the home slot */
  homeFeedsFrom?: string;
  /** ID of a prior matchup whose winner fills the away slot */
  awayFeedsFrom?: string;
  /** When true, the lower seed (better team) is assigned home field once both teams are known */
  seedDeterminesHome?: boolean;
}

export function emptyStats(): PlayerStats {
  return {
    gamesPlayed: 0,
    passAttempts: 0, passCompletions: 0, passYards: 0, passTDs: 0, interceptions: 0,
    rushAttempts: 0, rushYards: 0, rushTDs: 0, fumbles: 0,
    targets: 0, receptions: 0, receivingYards: 0, receivingTDs: 0,
    tackles: 0, tacklesForLoss: 0, sacks: 0, defensiveINTs: 0, passDeflections: 0, forcedFumbles: 0,
    sacksAllowed: 0, passBlocks: 0,
    fieldGoalAttempts: 0, fieldGoalsMade: 0, extraPointAttempts: 0, extraPointsMade: 0,
    puntAttempts: 0, puntYards: 0, puntsInside20: 0, touchbacks: 0,
    kickReturns: 0, kickReturnYards: 0, kickReturnTDs: 0,
    puntReturns: 0, puntReturnYards: 0, puntReturnTDs: 0,
    snaps: 0,
  };
}

export function emptyRecord(): TeamRecord {
  return {
    wins: 0, losses: 0, ties: 0,
    pointsFor: 0, pointsAgainst: 0,
    streak: 0, divisionWins: 0, divisionLosses: 0,
    homeWins: 0, homeLosses: 0,
    awayWins: 0, awayLosses: 0,
    conferenceWins: 0, conferenceLosses: 0,
  };
}
