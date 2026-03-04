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
  // Kicking
  fieldGoalAttempts: number;
  fieldGoalsMade: number;
  extraPointAttempts: number;
  extraPointsMade: number;
}

export interface Contract {
  salary: number;
  yearsLeft: number;
  /** Total guaranteed money remaining on the contract (dead cap if released) */
  guaranteed: number;
  /** Original total years of the contract (for dead-cap proration) */
  totalYears?: number;
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
  /**
   * Player sentiment / mood (0-100).
   * Affected by: team winning, playing time (depth chart), contract satisfaction, team location.
   * Low sentiment → holdouts, locker room problems, unlikely to re-sign.
   */
  mood: number;
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
}

export interface DeadCapEntry {
  playerName: string;
  amount: number;
  yearsLeft: number;
}

export interface Team {
  id: string;
  city: string;
  name: string;
  abbreviation: string;
  conference: 'AFC' | 'NFC';
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
}

/**
 * Calculates the dead cap hit when releasing a player.
 * NFL-style: all remaining guaranteed money accelerates onto the current year's cap.
 * Simplified: guaranteed = ~50% of total contract value for first contract, decreasing over time.
 */
export function calculateDeadCap(contract: Contract): number {
  const guaranteed = contract.guaranteed ?? 0;
  const totalYears = contract.totalYears ?? contract.yearsLeft;
  // Prorate: remaining guaranteed based on years left vs total contract
  // Early in contract = high dead cap, late in contract = low dead cap
  const proratedGuaranteed = totalYears > 0 ? guaranteed * (contract.yearsLeft / totalYears) : 0;
  return Math.round(proratedGuaranteed * 10) / 10;
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
 * NFL-style: ~40-60% of total contract value is guaranteed.
 */
export function generateGuaranteed(salary: number, years: number): number {
  const totalValue = salary * years;
  const guaranteedPct = years <= 1 ? 1.0 : years <= 2 ? 0.65 : years <= 3 ? 0.50 : 0.40;
  return Math.round(totalValue * guaranteedPct * 10) / 10;
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
}

export interface NewsItem {
  id: string;
  season: number;
  week: number;
  type: 'injury' | 'trade' | 'signing' | 'release' | 'performance' | 'milestone' | 'system';
  teamId?: string;
  playerIds?: string[];
  headline: string;
  body?: string;
  isUserTeam: boolean;
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
  awards: { award: string; playerId: string; teamId: string }[];
  bestRecord: {
    afc: { teamId: string; wins: number; losses: number };
    nfc: { teamId: string; wins: number; losses: number };
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
  capGrowthRate: 8,
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
  playoffBracket: PlayoffMatchup[] | null;
  /** Per-conference seed order: index 0 = seed 1, index 6 = seed 7 (array of team IDs) */
  playoffSeeds: { AFC: string[]; NFC: string[] } | null;
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
  /** Scouting budget level (0=cheap, 4=maximum) */
  scoutingLevel: 0 | 1 | 2 | 3 | 4;
  /** Scouting data keyed by prospect player ID */
  draftScoutingData: Record<string, { scoutedOvr: number; error: number; deepScouted: boolean }>;
  /** Player ID of the Super Bowl MVP (set when SB is played, consumed when season summary is created) */
  finalsMvpPlayerId: string | null;
  /** Configurable league settings */
  leagueSettings: LeagueSettings;
  /** Suppress trade proposal popup notifications */
  suppressTradePopups: boolean;
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
  /** 1 = Wild Card, 2 = Divisional, 3 = Conference Championship, 4 = Super Bowl */
  round: number;
  conference: 'AFC' | 'NFC' | 'Super Bowl';
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
    fieldGoalAttempts: 0, fieldGoalsMade: 0, extraPointAttempts: 0, extraPointsMade: 0,
  };
}

export function emptyRecord(): TeamRecord {
  return {
    wins: 0, losses: 0, ties: 0,
    pointsFor: 0, pointsAgainst: 0,
    streak: 0, divisionWins: 0, divisionLosses: 0,
  };
}
