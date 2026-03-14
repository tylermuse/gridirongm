export type Position =
  | 'QB' | 'RB' | 'WR' | 'TE' | 'OL'
  | 'DL' | 'LB' | 'CB' | 'S'
  | 'K' | 'P';

export const POSITIONS: Position[] = [
  'QB', 'RB', 'WR', 'TE', 'OL',
  'DL', 'LB', 'CB', 'S',
  'K', 'P',
];

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

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  position: Position;
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
  /** Scouting label assigned at draft (cosmetic flavor) */
  scoutingLabel?: string;
  /** Deterministic seed for scouting report generation (set at draft class creation) */
  scoutingSeed?: number;
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
  /** College / university the player attended (flavor text for draft) */
  college?: string;
  /** Height string e.g. "6'3\"" */
  height?: string;
  /** Weight in lbs */
  weight?: number;
  /** Round the player was drafted in */
  draftRound?: number;
  /** Team ID that originally drafted this player */
  draftTeamId?: string;
  /** Stats from the previous completed season (for free agency display) */
  previousSeasonStats?: PlayerStats;
  /** Season-by-season stat history */
  seasonLog?: { season: number; teamId: string; stats: PlayerStats }[];
  /** Development trait affecting aging/growth curve */
  devTrait?: 'star' | 'normal' | 'late_bloomer' | 'bust';
  /** Season when devTrait was revealed to the user (after 1 full season on roster) */
  devTraitRevealedSeason?: number;
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
  atsWins?: number;
  atsLosses?: number;
  atsPushes?: number;
}

export interface DeadCapEntry {
  playerName: string;
  amount: number;
  yearsLeft: number;
  /** Source of the dead cap charge */
  source?: 'release' | 'trade' | 'void';
  /** Season the dead cap was created */
  season?: number;
}

export type OffensiveScheme = 'spread' | 'west_coast' | 'power_run' | 'air_raid' | 'rpo';
export type DefensiveScheme = 'cover_3' | 'man_press' | 'tampa_2' | 'blitz_34' | 'zone_blitz';
export type CoachRole = 'HC' | 'OC' | 'DC';

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
  /** Revenue breakdown (computed at start of each season) */
  revenue: {
    tickets: number;
    merchandise: number;
    tvDeal: number;
    total: number;
  };
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
  /** Betting lines generated before game */
  bettingLine?: BettingLine;
  /** ATS result after game played */
  spreadCover?: 'home' | 'away' | 'push';
  /** Whether total went over the O/U */
  overHit?: boolean;
}

export interface NewsItem {
  id: string;
  season: number;
  week: number;
  type: 'injury' | 'trade' | 'signing' | 'release' | 'performance' | 'milestone' | 'system' | 'quote' | 'rumor';
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
};

export interface LeagueState {
  season: number;
  week: number;
  phase: 'preseason' | 'regular' | 'playoffs' | 'resigning' | 'draft' | 'freeAgency' | 'offseason';
  userTeamId: string;
  teams: Team[];
  players: Player[];
  schedule: GameResult[];
  draftOrder: string[];
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
  /** Season-end summaries for history */
  seasonHistory: SeasonSummary[];
  /** Save version for migration detection */
  saveVersion: number;
  /** Players up for re-signing (user team, yearsLeft === 1) */
  resigningPlayers: ResigningEntry[];
  /** Incoming AI trade proposals */
  tradeProposals: TradeProposal[];
  /** Scouts remaining for this draft cycle (max 15) */
  scoutsRemaining: number;
  /** Set of scouted prospect player IDs (true = fully scouted) */
  draftScoutingData: Record<string, boolean>;
  /** Player ID of the Championship MVP (set when championship is played, consumed when season summary is created) */
  finalsMvpPlayerId: string | null;
  /** Configurable league settings */
  leagueSettings: LeagueSettings;
  /** Suppress trade proposal popup notifications */
  suppressTradePopups: boolean;
  /** Weekly recap show data generated after each sim week */
  weeklyRecaps: WeeklyRecapData[];
  /** Unlocked achievements */
  achievements: Achievement[];
}

export interface WeeklyRecapData {
  season: number;
  week: number;
  segments: RecapSegmentData[];
}

export interface RecapSegmentData {
  type: 'headline' | 'upset' | 'comeback' | 'blowout' | 'shootout' | 'defensive' | 'performance' | 'streak' | 'rivalry' | 'milestone' | 'summary';
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
