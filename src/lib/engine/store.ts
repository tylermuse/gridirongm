import { create } from 'zustand';
import { persist } from 'zustand/middleware';
function uuid(): string {
  return crypto.randomUUID();
}
import type {
  LeagueState, Team, Player, GameResult, PlayerStats,
  NewsItem, TradeProposal, ResigningEntry, DraftPick, LeagueSettings,
} from '@/types';
import { emptyRecord, emptyStats, POSITIONS, ROSTER_LIMITS, DEFAULT_LEAGUE_SETTINGS, calculateDeadCap, calculateCapSavings, generateGuaranteed, getCapHit, getUnamortizedBonus, calculateDeadCapV2, calculateCapSavingsV2, materializeContractYears, type Position, type DeadCapEntry, type ContractYear, type ContractRestructure } from '@/types';
import { LEAGUE_TEAMS } from '@/lib/data/teams';
import { loadLeagueFromUrl } from '@/lib/data/leagueImport';
import { generateRoster, generateDraftClass, generatePlayer } from './playerGen';
import { resetUsedNames } from '../data/names';
import { generateSchedule } from './schedule';
import { simulateGame } from './simulate';
import { developPlayers } from './development';
import { generateWeeklyRecap } from './recap';
import { checkAchievements } from './achievements';
import { estimateSalary, LEAGUE_MINIMUM_SALARY } from './salary';

const SAVE_VERSION = 14;

// Re-export for UI consumers
export { estimateSalary, LEAGUE_MINIMUM_SALARY } from './salary';
export const LUXURY_TAX_RATE = DEFAULT_LEAGUE_SETTINGS.luxuryTaxRate;

/** Market size multipliers by team abbreviation (1.0 = average) */
const MARKET_SIZES: Record<string, number> = {
  NYS: 1.4, NYG: 1.4, LAA: 1.35, CHI: 1.3, DAL: 1.3, HOU: 1.2, PHI: 1.2, WAS: 1.15,
  MIA: 1.1, DEN: 1.1, NE: 1.1, SF: 1.15, SEA: 1.1, ATL: 1.1, MIN: 1.05,
  BAL: 1.0, CIN: 1.0, PIT: 1.0, DET: 1.0, IND: 1.0, KC: 1.0, LV: 1.05, TB: 1.0, ARI: 1.0, CAR: 0.95, NO: 0.95,
  CLE: 0.9, TEN: 0.9, JAX: 0.85, BUF: 0.85, GB: 0.85,
};

export function computeLuxuryTax(payroll: number, cap: number): number {
  const overCap = payroll - cap;
  if (overCap <= 0) return 0;
  return Math.round(overCap * LUXURY_TAX_RATE * 10) / 10;
}

interface GameStore extends LeagueState {
  initialized: boolean;
  newLeague: (teamId: string, leagueFileUrl?: string) => Promise<void>;
  resetLeague: () => void;
  simWeek: () => void;
  simToWeek: (targetWeek: number) => void;
  advanceToPlayoffs: () => void;
  simPlayoffGame: (matchupId: string) => void;
  simNextPlayoffGame: () => void;
  simPlayoffRound: () => void;
  simAllPlayoffGames: () => void;
  // PRD-03: Re-signing phase
  advanceToResigning: () => void;
  resignPlayer: (playerId: string, salary: number, years: number) => boolean;
  passOnResigning: (playerId: string) => void;
  franchiseTagPlayer: (playerId: string) => boolean;
  advanceToDraft: () => void;
  draftPlayer: (playerId: string) => void;
  simDraftPick: () => void;
  simToUserDraftPick: () => void;
  simToEndDraft: (options?: { skipAdvance?: boolean }) => void;
  advanceToFreeAgency: () => void;
  advanceFADay: () => void;
  advanceFAWeek: () => void;
  signFreeAgent: (playerId: string, salary: number, years: number) => boolean;
  aiSignFreeAgents: () => void;
  releasePlayer: (playerId: string) => void;
  restructureContract: (playerId: string, conversionAmount: number, voidYearsToAdd: number) => boolean;
  placeOnIR: (playerId: string) => void;
  activateFromIR: (playerId: string) => void;
  startNewSeason: () => void;
  // PRD-04: Trades
  executeTrade: (
    offeredPlayerIds: string[],
    offeredPickIds: string[],
    receivedPlayerIds: string[],
    receivedPickIds: string[],
    counterpartTeamId: string,
    skipValueCheck?: boolean,
  ) => boolean;
  respondToTradeProposal: (proposalId: string, accept: boolean) => boolean;
  rejectAllTradeProposals: () => void;
  solicitTradingBlockProposals: (playerIds: string[], pickIds: string[], seekPositions: Position[], seekDraftPicks?: boolean) => void;
  // PRD-07: Scouting
  setScoutingLevel: (level: 0 | 1 | 2) => void;
  deepScoutPlayer: (playerId: string) => void;
  // PRD-13: Depth chart
  reorderDepthChart: (position: Position, playerIds: string[]) => void;
  resetDepthChart: (position: Position) => void;
  commitLiveGame: (result: GameResult, matchupId?: string) => void;
  updateLeagueSettings: (settings: Partial<LeagueSettings>) => void;
  setSuppressTradePopups: (val: boolean) => void;
  saveToSlot: (slot: 1 | 2) => void;
  loadFromSlot: (slot: 1 | 2) => void;
  getTeam: (id: string) => Team | undefined;
  getPlayer: (id: string) => Player | undefined;
  getTeamRoster: (teamId: string) => Player[];
  getWeekGames: (week: number) => GameResult[];
}

// ---------------------------------------------------------------------------
// Stat helpers
// ---------------------------------------------------------------------------

function addStats(target: PlayerStats, source: Partial<PlayerStats>): PlayerStats {
  const result = { ...target };
  for (const key of Object.keys(source) as (keyof PlayerStats)[]) {
    (result[key] as number) += (source[key] as number) ?? 0;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Depth chart helpers (PRD-13)
// ---------------------------------------------------------------------------

function buildDefaultDepthChart(players: Player[]): Record<Position, string[]> {
  return POSITIONS.reduce<Record<Position, string[]>>((acc, pos) => {
    acc[pos] = players
      .filter(p => p.position === pos)
      .sort((a, b) => b.ratings.overall - a.ratings.overall)
      .map(p => p.id);
    return acc;
  }, {} as Record<Position, string[]>);
}

/** Insert a player into a depth chart position, sorted by OVR */
function insertIntoDepthChart(
  chart: Record<Position, string[]>,
  position: Position,
  playerId: string,
  allPlayers: Player[],
): Record<Position, string[]> {
  const newChart = { ...chart };
  const existing = [...(newChart[position] ?? []), playerId];
  // Sort by OVR descending
  newChart[position] = existing.sort((a, b) => {
    const pa = allPlayers.find(p => p.id === a);
    const pb = allPlayers.find(p => p.id === b);
    return (pb?.ratings.overall ?? 0) - (pa?.ratings.overall ?? 0);
  });
  return newChart;
}

/** Sort roster so depth-chart starter appears first — used before simulateGame */
function sortRosterByDepthChart(
  roster: Player[],
  depthChart: Record<Position, string[]>,
): Player[] {
  return [...roster].sort((a, b) => {
    const ai = depthChart[a.position]?.indexOf(a.id) ?? 999;
    const bi = depthChart[b.position]?.indexOf(b.id) ?? 999;
    return ai - bi;
  });
}

// ---------------------------------------------------------------------------
// Auto-draft helper
// ---------------------------------------------------------------------------

function autoDraftPlayerId(state: LeagueState, pickingTeamId: string): string | undefined {
  const roster = state.players.filter((player) => player.teamId === pickingTeamId);
  const countByPosition = POSITIONS.reduce<Record<Position, number>>((acc, position) => {
    acc[position] = roster.filter((player) => player.position === position).length;
    return acc;
  }, {} as Record<Position, number>);

  const topOvrByPosition = POSITIONS.reduce<Record<Position, number>>((acc, position) => {
    const top = roster
      .filter((player) => player.position === position)
      .sort((a, b) => b.ratings.overall - a.ratings.overall)[0];
    acc[position] = top?.ratings.overall ?? 0;
    return acc;
  }, {} as Record<Position, number>);

  const prospects = state.freeAgents
    .map((id) => state.players.find((player) => player.id === id))
    .filter((player): player is Player => Boolean(player))
    .filter((player) => player.experience === 0);
  if (prospects.length === 0) return undefined;

  const ranked = prospects
    .map((prospect) => {
      const limits = ROSTER_LIMITS[prospect.position];
      const count = countByPosition[prospect.position];
      const minNeed = Math.max(0, limits.min - count);
      // BPA-dominant: OVR is by far the biggest factor.
      // A 10 OVR gap = 150pts — need bonuses max out at ~25pts and can never bridge that.
      // This means a 73 OVR S beats a 66 OVR WR even with strong positional need.
      const needScore = minNeed * 12;
      let score = prospect.ratings.overall * 15 + prospect.potential * 0.5 + needScore;
      // Very small random to break ties, not to reshape the board
      score += (Math.random() - 0.5) * 8;
      // K/P are the least important positions — heavily de-value them in draft
      if (prospect.position === 'K' || prospect.position === 'P') {
        score = minNeed > 0 ? score * 0.4 : score * 0.15;
      }
      return { playerId: prospect.id, score };
    })
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.playerId;
}

// ---------------------------------------------------------------------------
// Injury helpers (PRD-09)
// ---------------------------------------------------------------------------

const INJURY_TYPES: { type: string; minWeeks: number; maxWeeks: number; prob: number }[] = [
  { type: 'Sprain', minWeeks: 1, maxWeeks: 2, prob: 0.50 },
  { type: 'Muscle Pull', minWeeks: 2, maxWeeks: 4, prob: 0.25 },
  { type: 'Fracture', minWeeks: 4, maxWeeks: 8, prob: 0.15 },
  { type: 'ACL Tear', minWeeks: 10, maxWeeks: 10, prob: 0.10 },
];

function rollInjuryType(): { type: string; weeksLeft: number } {
  const r = Math.random();
  let cumulative = 0;
  for (const entry of INJURY_TYPES) {
    cumulative += entry.prob;
    if (r < cumulative) {
      const weeksLeft = entry.minWeeks + Math.floor(Math.random() * (entry.maxWeeks - entry.minWeeks + 1));
      return { type: entry.type, weeksLeft };
    }
  }
  return { type: 'Sprain', weeksLeft: 1 };
}

function generateInjuries(
  players: Player[],
  playerIdsWhoPlayed: Set<string>,
): Map<string, { type: string; weeksLeft: number }> {
  const injuries = new Map<string, { type: string; weeksLeft: number }>();
  for (const p of players) {
    if (!playerIdsWhoPlayed.has(p.id)) continue;
    if (p.injury && p.injury.weeksLeft > 0) continue;
    let chance = 0.012;
    if (p.age >= 30) chance *= 1.3;
    if (p.ratings.stamina < 60) chance *= 1.2;
    // PRD-07: injury history label → 20% higher first-year chance
    if (p.scoutingLabel === 'Injury history' && p.experience <= 1) chance *= 1.2;
    if (Math.random() < chance) {
      injuries.set(p.id, rollInjuryType());
    }
  }
  return injuries;
}

// ---------------------------------------------------------------------------
// News helpers (PRD-08)
// ---------------------------------------------------------------------------

function makeNews(fields: Omit<NewsItem, 'id'>): NewsItem {
  return { id: uuid(), ...fields };
}

function generateWeekNews(
  state: LeagueState,
  updatedGames: GameResult[],
  newInjuries: Map<string, { type: string; weeksLeft: number }>,
): NewsItem[] {
  const news: NewsItem[] = [];
  const { season, week, userTeamId, players, teams } = state;

  // Top passer of the week
  let topPasser: { playerId: string; yards: number; teamId: string; game: GameResult } | null = null;
  for (const game of updatedGames) {
    for (const [pid, stats] of Object.entries(game.playerStats)) {
      if ((stats.passYards ?? 0) > (topPasser?.yards ?? 250)) {
        const p = players.find(pl => pl.id === pid);
        if (p && p.teamId) {
          topPasser = { playerId: pid, yards: stats.passYards ?? 0, teamId: p.teamId, game };
        }
      }
    }
  }
  if (topPasser) {
    const p = players.find(pl => pl.id === topPasser!.playerId);
    const t = teams.find(t => t.id === topPasser!.teamId);
    if (p && t) {
      const g = topPasser.game;
      const isHome = g.homeTeamId === t.id;
      const teamScore = isHome ? g.homeScore : g.awayScore;
      const oppScore = isHome ? g.awayScore : g.homeScore;
      const oppTeam = teams.find(ot => ot.id === (isHome ? g.awayTeamId : g.homeTeamId));
      const result = teamScore > oppScore ? 'win' : teamScore < oppScore ? 'loss' : 'tie';
      const resultText = result === 'win' ? `${teamScore}-${oppScore} win` : result === 'loss' ? `${oppScore}-${teamScore} loss` : `${teamScore}-${oppScore} tie`;
      news.push(makeNews({
        season, week, type: 'performance',
        teamId: t.id,
        playerIds: [p.id],
        headline: `${p.firstName} ${p.lastName} threw for ${topPasser.yards} yards in ${t.abbreviation}'s ${resultText} against ${oppTeam?.abbreviation ?? 'opponent'}.`,
        isUserTeam: t.id === userTeamId,
      }));
    }
  }

  // Injury news for notable players
  for (const [pid, inj] of newInjuries.entries()) {
    const p = players.find(pl => pl.id === pid);
    if (p && p.teamId && p.ratings.overall >= 75) {
      const t = teams.find(t => t.id === p.teamId);
      if (t) {
        news.push(makeNews({
          season, week, type: 'injury',
          teamId: t.id,
          playerIds: [p.id],
          headline: `${p.firstName} ${p.lastName} suffered a ${inj.type}. Expected to miss ${inj.weeksLeft} week${inj.weeksLeft > 1 ? 's' : ''}.`,
          isUserTeam: t.id === userTeamId,
        }));
      }
    }
  }

  // Post-game coach quotes for user team games
  const coachWinQuotes = [
    (team: string, opp: string, margin: number) => `"We came out focused and executed the game plan." — ${team} HC after ${margin > 14 ? 'dominant ' : ''}win over ${opp}.`,
    (team: string, opp: string) => `"Defense really stepped up today. That's the standard." — ${team} HC after beating ${opp}.`,
    (team: string, opp: string) => `"Great team win. Everyone contributed." — ${team} HC after victory over ${opp}.`,
    (team: string, opp: string) => `"Good week of practice and it showed on the field." — ${team} HC after defeating ${opp}.`,
    (team: string, opp: string, margin: number) => margin <= 7
      ? `"That was a dogfight. Respect to ${opp} — they made us earn it." — ${team} HC.`
      : `"When we play our brand of football, we're tough to beat." — ${team} HC.`,
    (team: string) => `"We're not looking ahead. One week at a time." — ${team} HC.`,
    (team: string, opp: string) => `"Our guys showed resilience today against ${opp}. Proud of this team." — ${team} HC.`,
    (team: string, opp: string) => `"Preparation was there all week. Took care of business against ${opp}." — ${team} HC.`,
  ];
  const coachLossQuotes = [
    (team: string, opp: string) => `"We need to look in the mirror. That's not good enough." — ${team} HC after loss to ${opp}.`,
    (team: string, opp: string) => `"Can't turn the ball over like that and expect to win." — ${team} HC after loss to ${opp}.`,
    (team: string) => `"We'll go back to the drawing board. Lot of football left." — ${team} HC.`,
    (team: string, opp: string, margin: number) => margin >= 20
      ? `"I have to do better putting our players in position to succeed. That's on me." — ${team} HC after blowout loss to ${opp}.`
      : `"We were in it but couldn't finish." — ${team} HC.`,
    (team: string, opp: string) => `"${opp} was the better team today. We need to respond." — ${team} HC.`,
    (team: string) => `"Disappointing result. Got to get back to fundamentals." — ${team} HC.`,
    (team: string) => `"Not the result we wanted. We'll learn from this." — ${team} HC.`,
    (team: string, opp: string) => `"Credit to ${opp}. They came out with more energy." — ${team} HC.`,
  ];

  for (const game of updatedGames) {
    if (!game.played) continue;
    const isUserHome = game.homeTeamId === userTeamId;
    const isUserAway = game.awayTeamId === userTeamId;
    if (!isUserHome && !isUserAway) continue;
    const ut = teams.find(t => t.id === userTeamId);
    const oppId = isUserHome ? game.awayTeamId : game.homeTeamId;
    const ot = teams.find(t => t.id === oppId);
    if (!ut || !ot) continue;
    const userScore = isUserHome ? game.homeScore : game.awayScore;
    const oppScore = isUserHome ? game.awayScore : game.homeScore;
    const margin = Math.abs(userScore - oppScore);
    const won = userScore > oppScore;
    const templates = won ? coachWinQuotes : coachLossQuotes;
    const seed = season * 10000 + week * 100 + (won ? 1 : 0);
    const quote = templates[seed % templates.length](ut.abbreviation, ot.abbreviation, margin);
    news.push(makeNews({
      season, week, type: 'quote',
      teamId: userTeamId!,
      headline: quote,
      isUserTeam: true,
    }));
  }

  // Trade rumors (losing teams with high-OVR veterans, weeks 4-14)
  if (week >= 4 && week <= 14) {
    const rumorTemplates = [
      (team: string, player: string, pos: string) => `League sources: ${team} exploring trade options for ${pos} ${player}.`,
      (team: string, player: string, pos: string) => `Multiple teams have inquired about ${team}'s ${pos} ${player}, per sources.`,
      (team: string, player: string, pos: string) => `Don't be surprised if ${team} make ${pos} ${player} available before the deadline.`,
      (team: string, player: string, pos: string) => `Sources: ${team} "open to moving" ${pos} ${player} for the right package.`,
      (team: string, player: string, pos: string) => `Expect ${team} to shop ${pos} ${player} aggressively before the deadline.`,
      (team: string, player: string, pos: string) => `${team} reportedly listening to offers for ${pos} ${player} as they look toward the future.`,
    ];
    const losingTeams = teams.filter(t => t.id !== userTeamId && t.record.losses > t.record.wins + 2);
    let rumorCount = 0;
    for (const lt of losingTeams) {
      if (rumorCount >= 2) break;
      const tradeable = players.filter(p =>
        p.teamId === lt.id && p.ratings.overall >= 78 && p.age >= 27 && !p.retired
      ).sort((a, b) => b.ratings.overall - a.ratings.overall);
      if (tradeable.length === 0) continue;
      const target = tradeable[0];
      const rumorSeed = season * 10000 + week * 100 + lt.id.charCodeAt(0);
      const template = rumorTemplates[rumorSeed % rumorTemplates.length];
      news.push(makeNews({
        season, week, type: 'rumor',
        teamId: lt.id,
        playerIds: [target.id],
        headline: template(`${lt.city} ${lt.name}`, `${target.firstName} ${target.lastName}`, target.position),
        isUserTeam: false,
      }));
      rumorCount++;
    }
  }

  // Stat milestones
  const milestoneChecks: { stat: keyof PlayerStats; threshold: number; label: string }[] = [
    { stat: 'passYards', threshold: 3000, label: 'passing yards' },
    { stat: 'passYards', threshold: 4000, label: 'passing yards' },
    { stat: 'rushYards', threshold: 1000, label: 'rushing yards' },
    { stat: 'receivingYards', threshold: 1000, label: 'receiving yards' },
    { stat: 'sacks', threshold: 10, label: 'sacks' },
    { stat: 'passTDs', threshold: 30, label: 'passing touchdowns' },
    { stat: 'rushTDs', threshold: 10, label: 'rushing touchdowns' },
    { stat: 'defensiveINTs', threshold: 7, label: 'interceptions' },
  ];
  for (const game of updatedGames) {
    if (!game.played) continue;
    for (const [pid, gameStats] of Object.entries(game.playerStats)) {
      const p = players.find(pl => pl.id === pid);
      if (!p || !p.teamId) continue;
      for (const m of milestoneChecks) {
        const prevStat = (p.stats[m.stat] as number) ?? 0;
        const gameStat = ((gameStats as Record<string, number>)[m.stat]) ?? 0;
        const newTotal = prevStat + gameStat;
        if (prevStat < m.threshold && newTotal >= m.threshold) {
          const t = teams.find(tm => tm.id === p.teamId);
          news.push(makeNews({
            season, week, type: 'milestone',
            teamId: p.teamId!,
            playerIds: [p.id],
            headline: `${p.firstName} ${p.lastName} reaches ${newTotal.toLocaleString()} ${m.label} this season${t ? ` for the ${t.city} ${t.name}` : ''}.`,
            isUserTeam: p.teamId === userTeamId,
          }));
        }
      }
    }
  }

  // Upsets: lower-OVR team wins by 10+
  for (const game of updatedGames) {
    if (!game.played) continue;
    const homeTeam = teams.find(t => t.id === game.homeTeamId);
    const awayTeam = teams.find(t => t.id === game.awayTeamId);
    if (!homeTeam || !awayTeam) continue;
    const homeRoster = players.filter(p => p.teamId === game.homeTeamId);
    const awayRoster = players.filter(p => p.teamId === game.awayTeamId);
    const homeOvr = homeRoster.reduce((s, p) => s + p.ratings.overall, 0) / Math.max(1, homeRoster.length);
    const awayOvr = awayRoster.reduce((s, p) => s + p.ratings.overall, 0) / Math.max(1, awayRoster.length);
    const margin = Math.abs(game.homeScore - game.awayScore);
    if (margin >= 10) {
      const winner = game.homeScore > game.awayScore ? homeTeam : awayTeam;
      const loser = game.homeScore > game.awayScore ? awayTeam : homeTeam;
      const winnerOvr = game.homeScore > game.awayScore ? homeOvr : awayOvr;
      const loserOvr = game.homeScore > game.awayScore ? awayOvr : homeOvr;
      if (winnerOvr < loserOvr - 5) {
        const winScore = game.homeScore > game.awayScore ? game.homeScore : game.awayScore;
        const loseScore = game.homeScore > game.awayScore ? game.awayScore : game.homeScore;
        news.push(makeNews({
          season, week, type: 'performance',
          teamId: winner.id,
          headline: `Upset alert: ${winner.abbreviation} defeated ${loser.abbreviation} ${winScore}-${loseScore}.`,
          isUserTeam: winner.id === userTeamId || loser.id === userTeamId,
        }));
      }
    }
  }

  return news;
}

// ---------------------------------------------------------------------------
// Trade value formula (PRD-04)
// ---------------------------------------------------------------------------

// Realistic pick values: 1st rounders are extremely valuable.
// A 1st round pick should only be traded for elite players (85+ OVR).
// Two 1sts should cost a true superstar (90+ OVR, young).
const PICK_VALUES = [1000, 450, 200, 100, 50, 20, 10]; // Rounds 1-7

const POSITION_VALUE_MULT: Record<string, number> = {
  QB: 1.5, RB: 0.9, WR: 1.1, TE: 0.85, OL: 0.95,
  DL: 1.05, LB: 1.0, CB: 1.1, S: 0.95, K: 0.4, P: 0.35,
};

function playerTradeValue(player: Player): number {
  const ageMultiplier =
    player.age <= 25 ? 1.3 :
    player.age <= 27 ? 1.1 :
    player.age <= 29 ? 1.0 :
    player.age <= 31 ? 0.7 :
    player.age <= 33 ? 0.45 : 0.2;
  const posMultiplier = POSITION_VALUE_MULT[player.position] ?? 1.0;
  // Exponential curve: stars (85+) are worth dramatically more than average (65) players.
  // 56 OVR → ~30 value, 70 OVR → ~200, 80 OVR → ~500, 90 OVR → ~1200
  const normalized = Math.max(0, (player.ratings.overall - 40) / 55);
  const base = Math.pow(normalized, 2.5) * 1200;
  const potBonus = Math.max(0, player.potential - player.ratings.overall) * 3;
  return (base + potBonus) * ageMultiplier * posMultiplier;
}

function pickTradeValue(pick: DraftPick, currentSeason?: number): number {
  const base = PICK_VALUES[(pick.round - 1)] ?? 10;
  if (currentSeason == null) return base;
  // Future picks are worth less: 90% per year out
  const yearsOut = Math.max(0, pick.year - currentSeason);
  return Math.round(base * Math.pow(0.9, yearsOut));
}

// ---------------------------------------------------------------------------
// Scouting helpers (PRD-07)
// ---------------------------------------------------------------------------

const SCOUTING_ERRORS = [12, 5, 2]; // Indexed by scoutingLevel: 0=Entry(±12), 1=Pro(±5), 2=Elite(±2)

/** Deterministic hash from player ID → stable noise factor in [-1, 1] */
function playerNoiseDirection(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  // Map to [-1, 1] using a second pass for better distribution
  const h2 = ((h * 2654435769) >>> 0) / 4294967296; // golden ratio hash → [0,1)
  // Box-Muller-ish: approximate gaussian from uniform, clamped to [-2.5, 2.5]
  const u1 = Math.max(0.001, h2);
  const h3 = (((h * 1103515245 + 12345) >>> 0) & 0x7fffffff) / 2147483647;
  const u2 = h3;
  const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(-2.5, Math.min(2.5, gaussian));
}

function computeScoutingData(
  prospects: Player[],
  scoutingLevel: number,
): Record<string, { scoutedOvr: number; error: number; deepScouted: boolean }> {
  const error = SCOUTING_ERRORS[scoutingLevel] ?? 12;
  const data: Record<string, { scoutedOvr: number; error: number; deepScouted: boolean }> = {};
  for (const p of prospects) {
    // Deterministic noise based on player ID — direction stays consistent across levels,
    // only magnitude changes. This prevents OVR from randomly jumping when switching levels.
    const direction = playerNoiseDirection(p.id);
    const noise = Math.round(direction * error);
    const scoutedOvr = Math.max(20, Math.min(99, p.ratings.overall + noise));
    data[p.id] = { scoutedOvr, error, deepScouted: false };
  }
  return data;
}

// ---------------------------------------------------------------------------
// Re-signing helpers (PRD-03)
// ---------------------------------------------------------------------------

// estimateSalary is now imported from ./salary.ts (re-exported above for external consumers)

/** Compute franchise tag salary: blended positional average scaled by the player's quality.
 *  For elite players (OVR 85+), this equals the top-5 positional average (like the real league).
 *  For average or below players, the tag is capped at a reasonable multiple of their market value
 *  so you don't see a 49 OVR player commanding $36M on a tag.
 */
export function computeFranchiseTagSalary(position: Position, players: Player[], taggedPlayer?: Player): number {
  const posPlayers = players
    .filter(p => p.position === position && p.teamId && !p.retired)
    .sort((a, b) => b.contract.salary - a.contract.salary);
  const top5 = posPlayers.slice(0, 5);
  if (top5.length === 0) return LEAGUE_MINIMUM_SALARY;
  const positionalAvg = top5.reduce((sum, p) => sum + p.contract.salary, 0) / top5.length;

  // If no specific player provided, return the raw positional average
  if (!taggedPlayer) return Math.round(positionalAvg * 10) / 10;

  // Scale the tag based on the player's quality
  const playerMarket = estimateSalary(taggedPlayer.ratings.overall, taggedPlayer.position, taggedPlayer.age, taggedPlayer.potential);
  // Tag is 110% of market value or the top-5 positional average, whichever is higher
  // but capped at 150% of market value to prevent absurd tags for weak players
  const tag = Math.max(playerMarket * 1.1, Math.min(positionalAvg, playerMarket * 1.5));
  return Math.round(tag * 10) / 10;
}

/** Returns the price multiplier for the current FA day (1.0 on day 1, minimum 0.50 on day 30). */
export function faPriceDecay(faDay: number): number {
  if (faDay <= 5) return 1.0;
  if (faDay <= 15) return 1.0 - (faDay - 5) * 0.02;   // -2%/day → day 15 = 0.80
  if (faDay <= 25) return 0.80 - (faDay - 15) * 0.03;  // -3%/day → day 25 = 0.50
  return 0.50;                                           // floor at 50%
}

/** Determines which free agents refuse to negotiate with the user's team. */
function computeFARefusals(
  freeAgentIds: string[],
  players: Player[],
  userTeam: Team,
  faDay: number,
): string[] {
  const totalGames = userTeam.record.wins + userTeam.record.losses;
  const winPct = totalGames > 0 ? userTeam.record.wins / totalGames : 0.5;
  const isBadTeam = winPct < 0.35;

  return freeAgentIds.filter(pid => {
    const p = players.find(pl => pl.id === pid);
    if (!p) return false;

    // Previously unhappy → always refuses initially
    if (p.mood < 40) {
      // But even unhappy players acquiesce over time
      if (faDay >= 15) {
        const hash = p.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        const acquiesceChance = (faDay - 15) * 0.06;
        const acquiesceRoll = ((hash * 13 + faDay * 17) % 100) / 100;
        if (acquiesceRoll < acquiesceChance) return false;
      }
      return true;
    }

    // Bad team: some players refuse based on quality
    if (isBadTeam) {
      const eliteThreshold = p.ratings.overall >= 85 ? 0.60 : p.ratings.overall >= 75 ? 0.35 : 0.15;
      // Deterministic hash for stable refusal within a day
      const hash = p.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const roll = ((hash * 7 + faDay * 3) % 100) / 100;
      if (roll < eliteThreshold) {
        // Acquiesce: after day 15, growing chance they stop refusing
        if (faDay >= 15) {
          const acquiesceChance = (faDay - 15) * 0.06;
          const acquiesceRoll = ((hash * 13 + faDay * 17) % 100) / 100;
          if (acquiesceRoll < acquiesceChance) return false;
        }
        return true;
      }
    }

    return false;
  });
}

function computeResigningEntry(player: Player, team: Team): ResigningEntry {
  const base = estimateSalary(player.ratings.overall, player.position, player.age, player.potential);
  const winPct = team.record.wins / Math.max(1, team.record.wins + team.record.losses);
  let mult = 1.0;
  // Winning teams get a small hometown discount; losing teams pay a premium
  if (winPct < 0.4) mult *= 1.10;
  else if (winPct > 0.65) mult *= 0.95;
  // Older players accept slight discounts but not massive ones
  if (player.age >= 32) mult *= 0.90;
  const askingSalary = Math.round(Math.max(LEAGUE_MINIMUM_SALARY, base * mult) * 10) / 10;
  const askingYears = player.age >= 32 ? 1 : player.age >= 28 ? 2 : 3;
  return { playerId: player.id, askingSalary, askingYears };
}

// ---------------------------------------------------------------------------
// Playoff helpers
// ---------------------------------------------------------------------------

function winPct(t: Team): number {
  return t.record.wins / Math.max(1, t.record.wins + t.record.losses);
}

function pointDiff(t: Team): number {
  return t.record.pointsFor - t.record.pointsAgainst;
}

function teamCompareFn(a: Team, b: Team): number {
  return winPct(b) - winPct(a) || pointDiff(b) - pointDiff(a);
}

function computePlayoffSeeds(teams: Team[]): { AC: string[]; NC: string[] } {
  const result: { AC: string[]; NC: string[] } = { AC: [], NC: [] };
  const divisions = ['North', 'South', 'East', 'West'] as const;

  for (const conf of ['AC', 'NC'] as const) {
    const confTeams = teams.filter(t => t.conference === conf);

    const divWinners = divisions
      .map(div => [...confTeams.filter(t => t.division === div)].sort(teamCompareFn)[0])
      .filter(Boolean)
      .sort(teamCompareFn);

    const divWinnerIds = new Set(divWinners.map(t => t.id));

    const wildCards = confTeams
      .filter(t => !divWinnerIds.has(t.id))
      .sort(teamCompareFn)
      .slice(0, 3);

    result[conf] = [...divWinners, ...wildCards].map(t => t.id);
  }

  return result;
}

function buildBracket(seeds: { AC: string[]; NC: string[] }, _teams: Team[]): import('@/types').PlayoffMatchup[] {
  const matchups: import('@/types').PlayoffMatchup[] = [];

  for (const conf of ['AC', 'NC'] as const) {
    const s = seeds[conf];
    const c = conf.toLowerCase();

    matchups.push({
      id: `${c}-wc-0`, round: 1, conference: conf,
      homeTeamId: s[1] ?? null, awayTeamId: s[6] ?? null,
      homeSeed: 2, awaySeed: 7,
      homeScore: null, awayScore: null, winnerId: null,
    });
    matchups.push({
      id: `${c}-wc-1`, round: 1, conference: conf,
      homeTeamId: s[2] ?? null, awayTeamId: s[5] ?? null,
      homeSeed: 3, awaySeed: 6,
      homeScore: null, awayScore: null, winnerId: null,
    });
    matchups.push({
      id: `${c}-wc-2`, round: 1, conference: conf,
      homeTeamId: s[3] ?? null, awayTeamId: s[4] ?? null,
      homeSeed: 4, awaySeed: 5,
      homeScore: null, awayScore: null, winnerId: null,
    });

    // Divisional round: no feedsFrom — re-seeded dynamically in propagateWinner
    // after all 3 WC games in the conference are decided.
    // #1 seed plays lowest remaining seed; other two winners play each other.
    matchups.push({
      id: `${c}-div-0`, round: 2, conference: conf,
      homeTeamId: s[0] ?? null, awayTeamId: null,
      homeSeed: 1, awaySeed: null,
      homeScore: null, awayScore: null, winnerId: null,
    });
    matchups.push({
      id: `${c}-div-1`, round: 2, conference: conf,
      homeTeamId: null, awayTeamId: null,
      homeSeed: null, awaySeed: null,
      homeScore: null, awayScore: null, winnerId: null,
    });

    matchups.push({
      id: `${c}-conf`, round: 3, conference: conf,
      homeTeamId: null, awayTeamId: null,
      homeSeed: null, awaySeed: null,
      homeScore: null, awayScore: null, winnerId: null,
      homeFeedsFrom: `${c}-div-0`,
      awayFeedsFrom: `${c}-div-1`,
      seedDeterminesHome: true,
    });
  }

  matchups.push({
    id: 'championship', round: 4, conference: 'Championship',
    homeTeamId: null, awayTeamId: null,
    homeSeed: null, awaySeed: null,
    homeScore: null, awayScore: null, winnerId: null,
    homeFeedsFrom: 'ac-conf',
    awayFeedsFrom: 'nc-conf',
  });

  return matchups;
}

function propagateWinner(
  matchups: import('@/types').PlayoffMatchup[],
  decidedId: string,
  winnerId: string,
  playoffSeeds: { AC: string[]; NC: string[] },
): import('@/types').PlayoffMatchup[] {
  const teamSeedMap = new Map<string, number>();
  for (const teamIds of Object.values(playoffSeeds)) {
    teamIds.forEach((id, idx) => teamSeedMap.set(id, idx + 1));
  }

  const winnerSeed = teamSeedMap.get(winnerId) ?? null;

  let result = matchups.map(m => {
    let updated = { ...m };

    if (m.homeFeedsFrom === decidedId) {
      updated = { ...updated, homeTeamId: winnerId, homeSeed: winnerSeed };
    }
    if (m.awayFeedsFrom === decidedId) {
      updated = { ...updated, awayTeamId: winnerId, awaySeed: winnerSeed };
    }

    if (
      updated.seedDeterminesHome &&
      updated.homeTeamId &&
      updated.awayTeamId &&
      (m.homeTeamId === null || m.awayTeamId === null)
    ) {
      const hs = teamSeedMap.get(updated.homeTeamId) ?? 99;
      const as_ = teamSeedMap.get(updated.awayTeamId) ?? 99;
      if (hs > as_) {
        [updated.homeTeamId, updated.awayTeamId] = [updated.awayTeamId!, updated.homeTeamId!];
        [updated.homeSeed, updated.awaySeed] = [updated.awaySeed, updated.homeSeed];
      }
    }

    return updated;
  });

  // Re-seeding: after all 3 Wild Card games in a conference finish,
  // assign divisional matchups so #1 plays the LOWEST remaining seed.
  for (const conf of ['AC', 'NC'] as const) {
    const c = conf.toLowerCase();
    const wcGames = result.filter(m => m.conference === conf && m.round === 1);
    const allWcDone = wcGames.every(m => m.winnerId !== null);
    if (!allWcDone) continue;

    const div0 = result.find(m => m.id === `${c}-div-0`);
    const div1 = result.find(m => m.id === `${c}-div-1`);
    if (!div0 || !div1) continue;
    // Only re-seed if divisional away slots haven't been filled yet
    if (div0.awayTeamId && div1.homeTeamId && div1.awayTeamId) continue;

    // Collect the 3 wild card winners and sort by seed (ascending = lowest seed first)
    const wcWinners = wcGames
      .map(m => m.winnerId!)
      .sort((a, b) => (teamSeedMap.get(a) ?? 99) - (teamSeedMap.get(b) ?? 99));

    // Highest seed (worst) plays #1 in div-0
    const lowestSeed = wcWinners[wcWinners.length - 1]; // highest seed number = worst team
    const remaining = wcWinners.filter(id => id !== lowestSeed);
    // Sort remaining so higher seed (better) is home
    remaining.sort((a, b) => (teamSeedMap.get(a) ?? 99) - (teamSeedMap.get(b) ?? 99));

    result = result.map(m => {
      if (m.id === `${c}-div-0`) {
        return { ...m, awayTeamId: lowestSeed, awaySeed: teamSeedMap.get(lowestSeed) ?? null };
      }
      if (m.id === `${c}-div-1`) {
        return {
          ...m,
          homeTeamId: remaining[0],
          homeSeed: teamSeedMap.get(remaining[0]) ?? null,
          awayTeamId: remaining[1],
          awaySeed: teamSeedMap.get(remaining[1]) ?? null,
        };
      }
      return m;
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Season awards (PRD-10 prep)
// ---------------------------------------------------------------------------

function computeSeasonAwards(state: LeagueState): { award: string; playerId: string; teamId: string }[] {
  const awards: { award: string; playerId: string; teamId: string }[] = [];
  const activePlayers = state.players.filter(p => !p.retired && p.teamId);

  const withGames = (pos: string[]) =>
    activePlayers.filter(p => pos.includes(p.position) && p.stats.gamesPlayed >= 10);

  // MVP — stats-based scoring, heavily favors QBs (matches playoffs page formula)
  const mvpCandidates = withGames(['QB', 'RB', 'WR', 'TE']);
  if (mvpCandidates.length > 0) {
    const mvp = mvpCandidates.sort((a, b) => {
      const aScore = a.position === 'QB'
        ? a.stats.passYards * 0.04 + a.stats.passTDs * 6 - a.stats.interceptions * 4 + a.ratings.overall * 2
        : a.position === 'RB'
          ? a.stats.rushYards * 0.06 + a.stats.rushTDs * 6 + a.ratings.overall
          : a.stats.receivingYards * 0.06 + a.stats.receivingTDs * 6 + a.ratings.overall;
      const bScore = b.position === 'QB'
        ? b.stats.passYards * 0.04 + b.stats.passTDs * 6 - b.stats.interceptions * 4 + b.ratings.overall * 2
        : b.position === 'RB'
          ? b.stats.rushYards * 0.06 + b.stats.rushTDs * 6 + b.ratings.overall
          : b.stats.receivingYards * 0.06 + b.stats.receivingTDs * 6 + b.ratings.overall;
      return bScore - aScore;
    })[0];
    awards.push({ award: 'MVP', playerId: mvp.id, teamId: mvp.teamId! });
  }

  // DPOY — stats-based (tackles, sacks, INTs)
  const defensivePlayers = withGames(['DL', 'LB', 'CB', 'S']);
  if (defensivePlayers.length > 0) {
    const dpoy = defensivePlayers.sort((a, b) =>
      (b.stats.tackles + b.stats.sacks * 5 + b.stats.defensiveINTs * 4) -
      (a.stats.tackles + a.stats.sacks * 5 + a.stats.defensiveINTs * 4)
    )[0];
    awards.push({ award: 'Defensive POY', playerId: dpoy.id, teamId: dpoy.teamId! });
  }

  // OPOY — total yards based
  const opoyCandidates = withGames(['QB', 'RB', 'WR', 'TE']);
  if (opoyCandidates.length > 0) {
    const opoy = opoyCandidates.sort((a, b) => {
      const aYds = a.stats.passYards + a.stats.rushYards + a.stats.receivingYards;
      const bYds = b.stats.passYards + b.stats.rushYards + b.stats.receivingYards;
      return bYds - aYds;
    })[0];
    awards.push({ award: 'Offensive POY', playerId: opoy.id, teamId: opoy.teamId! });
  }

  const rookies = activePlayers.filter(p => p.experience === 1 && p.stats.gamesPlayed >= 10);
  const offensiveRookies = rookies.filter(p => ['QB', 'RB', 'WR', 'TE', 'OL'].includes(p.position));
  if (offensiveRookies.length > 0) {
    const oroy = offensiveRookies.sort((a, b) => b.ratings.overall - a.ratings.overall)[0];
    awards.push({ award: 'Offensive ROY', playerId: oroy.id, teamId: oroy.teamId! });
  }
  const defensiveRookies = rookies.filter(p => ['DL', 'LB', 'CB', 'S'].includes(p.position));
  if (defensiveRookies.length > 0) {
    const droy = defensiveRookies.sort((a, b) => b.ratings.overall - a.ratings.overall)[0];
    awards.push({ award: 'Defensive ROY', playerId: droy.id, teamId: droy.teamId! });
  }

  return awards;
}

// ---------------------------------------------------------------------------
// All-League / All-Rookie team selection
// ---------------------------------------------------------------------------

/** Positional slot counts for All-League teams (mirrors All-Pro roster format). */
const ALL_LEAGUE_SLOTS: { position: Position; count: number }[] = [
  { position: 'QB', count: 1 },
  { position: 'RB', count: 2 },
  { position: 'WR', count: 3 },
  { position: 'TE', count: 1 },
  { position: 'OL', count: 3 },
  { position: 'DL', count: 3 },
  { position: 'LB', count: 3 },
  { position: 'CB', count: 2 },
  { position: 'S', count: 2 },
  { position: 'K', count: 1 },
  { position: 'P', count: 1 },
];

export function computeAllLeagueTeams(state: LeagueState): {
  first: { position: Position; playerId: string; teamId: string }[];
  second: { position: Position; playerId: string; teamId: string }[];
  allRookie: { position: Position; playerId: string; teamId: string }[];
} {
  const activePlayers = state.players.filter(p => !p.retired && p.teamId && p.stats.gamesPlayed >= 10);
  const rookies = activePlayers.filter(p => p.experience === 1);

  const first: { position: Position; playerId: string; teamId: string }[] = [];
  const second: { position: Position; playerId: string; teamId: string }[] = [];
  const allRookie: { position: Position; playerId: string; teamId: string }[] = [];

  for (const { position, count } of ALL_LEAGUE_SLOTS) {
    const posPlayers = activePlayers
      .filter(p => p.position === position)
      .sort((a, b) => b.ratings.overall - a.ratings.overall);

    for (let i = 0; i < count && i < posPlayers.length; i++) {
      first.push({ position, playerId: posPlayers[i].id, teamId: posPlayers[i].teamId! });
    }
    for (let i = count; i < count * 2 && i < posPlayers.length; i++) {
      second.push({ position, playerId: posPlayers[i].id, teamId: posPlayers[i].teamId! });
    }

    // All-Rookie: 1 per position
    const posRookies = rookies
      .filter(p => p.position === position)
      .sort((a, b) => b.ratings.overall - a.ratings.overall);
    if (posRookies.length > 0) {
      allRookie.push({ position, playerId: posRookies[0].id, teamId: posRookies[0].teamId! });
    }
  }

  return { first, second, allRookie };
}

// ---------------------------------------------------------------------------
// AI trade proposal generation (PRD-04)
// ---------------------------------------------------------------------------

/** Positions that are NOT interesting for AI-initiated trade proposals (easily replaced via FA). */
const TRADE_EXCLUDED_POSITIONS = new Set<Position>(['K', 'P']);

function generateAITradeProposals(state: LeagueState): TradeProposal[] {
  if (state.week > 12) return []; // Trade deadline after week 12
  const proposals: TradeProposal[] = [];
  const userTeam = state.teams.find(t => t.id === state.userTeamId);
  if (!userTeam) return [];

  const aiTeams = state.teams.filter(t => t.id !== state.userTeamId);
  const userPlayers = state.players
    .filter(p => p.teamId === state.userTeamId && !TRADE_EXCLUDED_POSITIONS.has(p.position));
  if (userPlayers.length === 0) return [];

  // Each AI team has a 5% chance per week of proposing a trade
  for (const aiTeam of aiTeams) {
    if (Math.random() > 0.05) continue;
    if (state.tradeProposals.filter(p => p.proposingTeamId === aiTeam.id && p.status === 'pending').length > 0) continue;

    const aiRoster = state.players.filter(p => p.teamId === aiTeam.id && !p.retired);

    // Find all positions where AI is at or below minimum (excluding K/P)
    const aiNeeds = POSITIONS.filter(pos =>
      !TRADE_EXCLUDED_POSITIONS.has(pos) &&
      aiRoster.filter(p => p.position === pos).length <= ROSTER_LIMITS[pos].min,
    );

    // Pick a random need position (if any), or null for general interest
    const aiNeedPos = aiNeeds.length > 0 ? aiNeeds[Math.floor(Math.random() * aiNeeds.length)] : null;

    let targetPlayer: Player | undefined;
    if (aiNeedPos) {
      // Target best user player at that position
      const candidates = userPlayers
        .filter(p => p.position === aiNeedPos)
        .sort((a, b) => b.ratings.overall - a.ratings.overall);
      targetPlayer = candidates[0];
    }
    if (!targetPlayer) {
      // General interest: target a random high-value user player (top 8, random pick)
      const sorted = [...userPlayers].sort((a, b) => b.ratings.overall - a.ratings.overall);
      const topN = sorted.slice(0, Math.min(8, sorted.length));
      targetPlayer = topN[Math.floor(Math.random() * topN.length)];
    }

    if (!targetPlayer) continue;

    const targetValue = playerTradeValue(targetPlayer);

    // AI offers a player of similar value from their roster (excluding K/P)
    const aiPlayers = aiRoster.filter(p =>
      !p.injury && !TRADE_EXCLUDED_POSITIONS.has(p.position),
    );
    const aiOffer = aiPlayers
      .map(p => ({ player: p, diff: Math.abs(playerTradeValue(p) - targetValue) }))
      .sort((a, b) => a.diff - b.diff)[0]?.player;

    if (!aiOffer) continue;

    // Skip if OVR gap is too large (prevents 64-for-85 type proposals)
    const ovrGap = Math.abs(aiOffer.ratings.overall - targetPlayer.ratings.overall);
    if (ovrGap > 15) continue;

    // Don't offer the same position back (not interesting)
    if (aiOffer.position === targetPlayer.position && Math.random() > 0.3) continue;

    let offeredValue = playerTradeValue(aiOffer);
    const offeredPickIds: string[] = [];

    // ~40% chance to include a draft pick to sweeten the deal
    if (Math.random() < 0.40) {
      const aiPicks = aiTeam.draftPicks.filter(pk => pk.year >= state.season);
      if (aiPicks.length > 0) {
        // Prefer lower-round picks (less valuable) to add as sweetener
        // Don't add a pick that would make the offer more than 2x target value
        const sortedPicks = [...aiPicks].sort((a, b) => b.round - a.round);
        const pick = sortedPicks.find(pk => offeredValue + pickTradeValue(pk, state.season) <= targetValue * 2.0);
        if (pick) {
          offeredPickIds.push(pick.id);
          offeredValue += pickTradeValue(pick, state.season);
        }
      }
    }

    // ~20% chance: offer ONLY a draft pick (no player) for a mid-tier player
    // Pick must be proportional to player value — don't offer Rd 1 for a scrub
    const pickOnlyTrade = Math.random() < 0.20 && targetValue >= 50 && targetValue < 400;
    let offeredPlayerIds = [aiOffer.id];
    if (pickOnlyTrade) {
      // Find the best-fit pick that doesn't massively overshoot
      const aiPicks = aiTeam.draftPicks
        .filter(pk => pk.year >= state.season)
        .map(pk => ({ pick: pk, pv: pickTradeValue(pk, state.season) }))
        .filter(({ pv }) => pv <= targetValue * 2.0) // Don't overshoot by more than 2x
        .sort((a, b) => Math.abs(a.pv - targetValue) - Math.abs(b.pv - targetValue));
      if (aiPicks.length > 0) {
        const { pick, pv } = aiPicks[0];
        offeredPlayerIds = [];
        offeredPickIds.length = 0;
        offeredPickIds.push(pick.id);
        offeredValue = pv;
      }
    }

    const ratio = offeredValue / Math.max(1, targetValue);
    const valueAssessment: TradeProposal['valueAssessment'] =
      ratio > 1.05 ? 'lopsided-you-win' :
      ratio >= 0.95 ? 'fair' : 'lopsided-they-win';

    proposals.push({
      id: uuid(),
      season: state.season,
      week: state.week,
      proposingTeamId: aiTeam.id,
      offeredPlayerIds,
      offeredPickIds,
      requestedPlayerIds: [targetPlayer.id],
      requestedPickIds: [],
      status: 'pending',
      valueAssessment,
    });
  }

  return proposals;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const EMPTY_LEAGUE_STATE: LeagueState = {
  season: 2026,
  week: 1,
  phase: 'preseason',
  userTeamId: '',
  teams: [],
  players: [],
  schedule: [],
  draftOrder: [],
  draftResults: [],
  freeAgents: [],
  faDay: 0,
  faRefusals: [],
  playoffBracket: null,
  playoffSeeds: null,
  champions: [],
  newsItems: [],
  seasonHistory: [],
  saveVersion: SAVE_VERSION,
  resigningPlayers: [],
  tradeProposals: [],
  scoutingLevel: 0,
  draftScoutingData: {},
  finalsMvpPlayerId: null,
  leagueSettings: { ...DEFAULT_LEAGUE_SETTINGS },
  suppressTradePopups: false,
  weeklyRecaps: [],
  achievements: [],
};

// ---------------------------------------------------------------------------
// Pure function: simulate one week of games (no store dependency)
// Returns state patch + whether season is over, or null if nothing to sim
// ---------------------------------------------------------------------------
function simulateOneWeek(state: LeagueState): { patch: Record<string, unknown>; isSeasonOver: boolean } | null {
  if (state.phase !== 'regular') return null;

  const weekGames = state.schedule.filter(g => g.week === state.week && !g.played);
  if (weekGames.length === 0) return null;

  // Auto-resort AI teams' depth charts by OVR each week.
  // User team depth chart is NOT touched — the user controls it via drag-reorder.
  const resortedTeams = state.teams.map(t => {
    if (t.id === state.userTeamId) return t; // preserve user's manual depth chart
    const newDepthChart = { ...t.depthChart };
    for (const pos of POSITIONS) {
      const arr = newDepthChart[pos] ?? [];
      if (arr.length > 1) {
        newDepthChart[pos] = [...arr].sort((a, b) => {
          const pa = state.players.find(p => p.id === a);
          const pb = state.players.find(p => p.id === b);
          return (pb?.ratings.overall ?? 0) - (pa?.ratings.overall ?? 0);
        });
      }
    }
    return { ...t, depthChart: newDepthChart };
  });
  const updatedGames = weekGames.map(game => {
    const homeTeam = resortedTeams.find(t => t.id === game.homeTeamId);
    const awayTeam = resortedTeams.find(t => t.id === game.awayTeamId);
    const homeRosterRaw = state.players.filter(p => p.teamId === game.homeTeamId);
    const awayRosterRaw = state.players.filter(p => p.teamId === game.awayTeamId);
    const homeRoster = homeTeam?.depthChart
      ? sortRosterByDepthChart(homeRosterRaw, homeTeam.depthChart)
      : homeRosterRaw;
    const awayRoster = awayTeam?.depthChart
      ? sortRosterByDepthChart(awayRosterRaw, awayTeam.depthChart)
      : awayRosterRaw;
    return simulateGame(game, homeRoster, awayRoster);
  });

  const newSchedule = state.schedule.map(g => {
    const updated = updatedGames.find(u => u.id === g.id);
    return updated ?? g;
  });

  const newTeams = resortedTeams.map(team => {
    const teamGames = updatedGames.filter(
      g => g.homeTeamId === team.id || g.awayTeamId === team.id,
    );
    const record = { ...team.record };
    for (const game of teamGames) {
      const isHome = game.homeTeamId === team.id;
      const teamScore = isHome ? game.homeScore : game.awayScore;
      const oppScore = isHome ? game.awayScore : game.homeScore;
      record.pointsFor += teamScore;
      record.pointsAgainst += oppScore;
      const won = teamScore > oppScore;
      if (won) {
        record.wins += 1;
        record.streak = record.streak >= 0 ? record.streak + 1 : 1;
      } else {
        record.losses += 1;
        record.streak = record.streak <= 0 ? record.streak - 1 : -1;
      }
      // Home/away tracking
      if (isHome) {
        if (won) record.homeWins = (record.homeWins ?? 0) + 1;
        else record.homeLosses = (record.homeLosses ?? 0) + 1;
      } else {
        if (won) record.awayWins = (record.awayWins ?? 0) + 1;
        else record.awayLosses = (record.awayLosses ?? 0) + 1;
      }
      const opponent = state.teams.find(t => t.id === (isHome ? game.awayTeamId : game.homeTeamId));
      if (opponent && opponent.conference === team.conference && opponent.division === team.division) {
        if (won) record.divisionWins += 1;
        else record.divisionLosses += 1;
      }
      // Conference tracking
      if (opponent && opponent.conference === team.conference) {
        if (won) record.conferenceWins = (record.conferenceWins ?? 0) + 1;
        else record.conferenceLosses = (record.conferenceLosses ?? 0) + 1;
      }
    }
    return { ...team, record };
  });

  const newPlayers = state.players.map(p => {
    const allGameStats = updatedGames.reduce<Partial<PlayerStats>>((acc, game) => {
      const s = game.playerStats[p.id];
      if (s) {
        for (const key of Object.keys(s) as (keyof PlayerStats)[]) {
          (acc[key] as number) = ((acc[key] as number) ?? 0) + ((s[key] as number) ?? 0);
        }
      }
      return acc;
    }, {});
    if (Object.keys(allGameStats).length === 0) return p;
    return { ...p, stats: addStats(p.stats, allGameStats), careerStats: addStats(p.careerStats, allGameStats) };
  });

  const playerIdsWhoPlayed = new Set<string>();
  for (const game of updatedGames) {
    for (const pid of Object.keys(game.playerStats)) {
      playerIdsWhoPlayed.add(pid);
    }
  }
  const newInjuries = generateInjuries(newPlayers, playerIdsWhoPlayed);
  const injuredPlayers = newPlayers.map(p => {
    let injury = p.injury;
    if (injury && injury.weeksLeft > 0) {
      injury = { ...injury, weeksLeft: injury.weeksLeft - 1 };
      if (injury.weeksLeft <= 0) injury = null;
    }
    const newInj = newInjuries.get(p.id);
    if (newInj && !injury) injury = newInj;
    return { ...p, injury };
  });

  const weekNews = generateWeekNews(state, updatedGames, newInjuries);

  const newTradeProposals = state.week <= 12
    ? generateAITradeProposals({ ...state, teams: newTeams, players: injuredPlayers })
    : [];

  const moodUpdatedPlayers = injuredPlayers.map(p => {
    if (!p.teamId) return p;
    const team = newTeams.find(t => t.id === p.teamId);
    if (!team) return p;
    let moodDelta = 0;
    const wp = team.record.wins / Math.max(1, team.record.wins + team.record.losses);
    if (wp >= 0.6) moodDelta += 1;
    else if (wp <= 0.35) moodDelta -= 2;
    const depthPos = team.depthChart[p.position]?.indexOf(p.id) ?? -1;
    if (depthPos === 0) moodDelta += 1;
    else if (depthPos > 2) moodDelta -= 1;
    const marketSalary = estimateSalary(p.ratings.overall, p.position, p.age, p.potential);
    if (p.contract.salary < marketSalary * 0.7) moodDelta -= 1;
    if (team.record.streak >= 3) moodDelta += 1;
    if (team.record.streak <= -3) moodDelta -= 1;
    const newMood = Math.max(0, Math.min(100, (p.mood ?? 70) + moodDelta));
    return { ...p, mood: newMood };
  });

  const maxWeek = Math.max(...state.schedule.map(g => g.week));
  const nextWeek = state.week + 1;
  const isSeasonOver = nextWeek > maxWeek;

  return {
    patch: {
      schedule: newSchedule,
      teams: newTeams,
      players: moodUpdatedPlayers,
      week: isSeasonOver ? state.week : nextWeek,
      phase: isSeasonOver ? 'playoffs' : 'regular',
      newsItems: [...state.newsItems, ...weekNews],
      tradeProposals: [...state.tradeProposals, ...newTradeProposals],
    },
    isSeasonOver,
  };
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      initialized: false,
      ...EMPTY_LEAGUE_STATE,

      newLeague: async (userTeamId: string, leagueFileUrl?: string) => {
        try {
          resetUsedNames();
          if (!leagueFileUrl) throw new Error('No league file URL provided');
          const imported = await loadLeagueFromUrl(leagueFileUrl);
          const userTeam = imported.teams.find((t) => t.abbreviation === userTeamId) ?? imported.teams[0];
          const schedule = generateSchedule(imported.teams, imported.season);

          // Generate street free agents for in-season signings
          const fbgmFAs: Player[] = [];
          for (let i = 0; i < 80; i++) {
            const pos = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];
            const talentMean = 40 + Math.random() * 20;
            const p = generatePlayer(pos, talentMean, {
              age: 23 + Math.floor(Math.random() * 8),
              experience: Math.floor(Math.random() * 5),
              teamId: null,
            });
            p.contract = { salary: LEAGUE_MINIMUM_SALARY, yearsLeft: 0, guaranteed: 0, totalYears: 0 };
            fbgmFAs.push(p);
          }

          set({
            initialized: true,
            season: imported.season,
            week: 1,
            phase: 'regular',
            userTeamId: userTeam.id,
            teams: imported.teams,
            players: [...imported.players, ...fbgmFAs],
            schedule,
            draftOrder: [],
            draftResults: [],
            freeAgents: fbgmFAs.map(p => p.id),
            faDay: 0,
            faRefusals: [],
            playoffBracket: null,
            playoffSeeds: null,
            champions: [],
            newsItems: [],
            seasonHistory: [],
            saveVersion: SAVE_VERSION,
            resigningPlayers: [],
            tradeProposals: [],
            scoutingLevel: 0,
            draftScoutingData: {},
            finalsMvpPlayerId: null,
            leagueSettings: { ...DEFAULT_LEAGUE_SETTINGS },
            suppressTradePopups: false,
            weeklyRecaps: [],
            achievements: [],
          });
          return;
        } catch (error) {
          console.warn('Failed to import league data, falling back to generated league.', error);
        }

        const allPlayers: Player[] = [];
        const teams: Team[] = LEAGUE_TEAMS.map(t => {
          const id = uuid();
          const tierMean = 55 + Math.random() * 20;
          const roster = generateRoster(id, tierMean);
          allPlayers.push(...roster);

          return {
            id,
            ...t,
            record: emptyRecord(),
            salaryCap: DEFAULT_LEAGUE_SETTINGS.salaryCap,
            totalPayroll: roster.reduce((sum, p) => sum + p.contract.salary, 0),
            roster: roster.map(p => p.id),
            draftPicks: [2026, 2027, 2028].flatMap(year =>
              [1, 2, 3, 4, 5, 6, 7].map(round => ({
                id: uuid(),
                year,
                round,
                originalTeamId: id,
                ownerTeamId: id,
              })),
            ),
            depthChart: buildDefaultDepthChart(roster),
            deadCap: [],
            franchiseTagUsed: false,
            revenue: { tickets: 0, merchandise: 0, tvDeal: 0, total: 0 },
          };
        });

        const userTeam = teams.find(t => t.abbreviation === userTeamId) ?? teams[0];
        const schedule = generateSchedule(teams, 2026);

        // Generate initial street free agents for in-season signings
        const initialFAs: Player[] = [];
        for (let i = 0; i < 80; i++) {
          const pos = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];
          const talentMean = 40 + Math.random() * 20;
          const p = generatePlayer(pos, talentMean, {
            age: 23 + Math.floor(Math.random() * 8),
            experience: Math.floor(Math.random() * 5),
            teamId: null,
          });
          p.contract = { salary: LEAGUE_MINIMUM_SALARY, yearsLeft: 0, guaranteed: 0, totalYears: 0 };
          initialFAs.push(p);
        }
        allPlayers.push(...initialFAs);

        set({
          initialized: true,
          season: 2026,
          week: 1,
          phase: 'regular',
          userTeamId: userTeam.id,
          teams,
          players: allPlayers,
          schedule,
          draftOrder: [],
          draftResults: [],
          freeAgents: initialFAs.map(p => p.id),
          faDay: 0,
          faRefusals: [],
          playoffBracket: null,
          playoffSeeds: null,
          champions: [],
          newsItems: [],
          seasonHistory: [],
          saveVersion: SAVE_VERSION,
          resigningPlayers: [],
          tradeProposals: [],
          scoutingLevel: 0,
          draftScoutingData: {},
          finalsMvpPlayerId: null,
          leagueSettings: { ...DEFAULT_LEAGUE_SETTINGS },
          suppressTradePopups: false,
          weeklyRecaps: [],
          achievements: [],
        });
      },

      resetLeague: () => {
        set({ initialized: false, ...EMPTY_LEAGUE_STATE });
      },

      simWeek: () => {
        const state = get();
        if (state.phase !== 'regular') return;
        const result = simulateOneWeek(state);
        if (!result) return;

        // Generate weekly recap from this week's games
        const simmedWeek = state.week;
        const weekGames = (result.patch.schedule as GameResult[]).filter(g => g.week === simmedWeek && g.played);
        const recap = generateWeeklyRecap(weekGames, result.patch.teams as Team[], result.patch.players as Player[], state.season, simmedWeek);
        const weeklyRecaps = [...state.weeklyRecaps, recap];

        if (result.isSeasonOver) {
          // Compute playoff bracket in the same set() call
          const teams = result.patch.teams as Team[];
          const seeds = computePlayoffSeeds(teams);
          const bracket = buildBracket(seeds, teams);
          set({ ...result.patch, playoffSeeds: seeds, playoffBracket: bracket, weeklyRecaps });
        } else {
          set({ ...result.patch, weeklyRecaps });
        }
        // Check achievements after state update
        const newAchievements = checkAchievements(get());
        if (newAchievements.length > 0) {
          const current = get();
          set({ achievements: [...current.achievements, ...newAchievements] });
        }
      },

      simToWeek: (targetWeek: number) => {
        // Compute all weeks in a single pass to avoid stale get() issues
        let current = get();
        if (current.phase !== 'regular') return;

        let schedule = [...current.schedule];
        let teams = [...current.teams];
        let players = [...current.players];
        let week = current.week;
        let newsItems = [...current.newsItems];
        let tradeProposals = [...current.tradeProposals];
        let weeklyRecaps = [...current.weeklyRecaps];
        let isSeasonOver = false;

        for (let guard = 0; guard < 200 && week < targetWeek; guard++) {
          const simmedWeek = week;
          const fakeState = { ...current, schedule, teams, players, week, newsItems, tradeProposals, weeklyRecaps, phase: 'regular' as const } as LeagueState;
          const result = simulateOneWeek(fakeState);
          if (!result) break;

          schedule = result.patch.schedule as typeof schedule;
          teams = result.patch.teams as typeof teams;
          players = result.patch.players as typeof players;
          week = result.patch.week as number;
          newsItems = result.patch.newsItems as typeof newsItems;
          tradeProposals = result.patch.tradeProposals as typeof tradeProposals;

          // Generate recap for the week just simmed
          const weekGames = schedule.filter(g => g.week === simmedWeek && g.played);
          const recap = generateWeeklyRecap(weekGames, teams, players, current.season, simmedWeek);
          weeklyRecaps = [...weeklyRecaps, recap];

          if (result.isSeasonOver) {
            isSeasonOver = true;
            break;
          }
        }

        if (isSeasonOver) {
          // Compute playoff bracket here in the same set() call to avoid stale get()
          const seeds = computePlayoffSeeds(teams);
          const bracket = buildBracket(seeds, teams);
          set({ schedule, teams, players, week, newsItems, tradeProposals, weeklyRecaps, phase: 'playoffs', playoffSeeds: seeds, playoffBracket: bracket });
        } else {
          set({ schedule, teams, players, week, newsItems, tradeProposals, weeklyRecaps, phase: 'regular' });
        }
      },

      advanceToPlayoffs: () => {
        const state = get();
        const seeds = computePlayoffSeeds(state.teams);
        const bracket = buildBracket(seeds, state.teams);
        set({ phase: 'playoffs', playoffSeeds: seeds, playoffBracket: bracket });
      },

      simPlayoffGame: (matchupId: string) => {
        const state = get();
        if (!state.playoffBracket || !state.playoffSeeds) return;

        const matchup = state.playoffBracket.find(m => m.id === matchupId);
        if (!matchup || matchup.winnerId || !matchup.homeTeamId || !matchup.awayTeamId) return;

        const homeTeam = state.teams.find(t => t.id === matchup.homeTeamId);
        const awayTeam = state.teams.find(t => t.id === matchup.awayTeamId);
        const homeRosterRaw = state.players.filter(p => p.teamId === matchup.homeTeamId);
        const awayRosterRaw = state.players.filter(p => p.teamId === matchup.awayTeamId);
        const homeRoster = homeTeam?.depthChart
          ? sortRosterByDepthChart(homeRosterRaw, homeTeam.depthChart)
          : homeRosterRaw;
        const awayRoster = awayTeam?.depthChart
          ? sortRosterByDepthChart(awayRosterRaw, awayTeam.depthChart)
          : awayRosterRaw;

        const tempGame: GameResult = {
          id: matchupId,
          week: 99,
          season: state.season,
          homeTeamId: matchup.homeTeamId,
          awayTeamId: matchup.awayTeamId,
          homeScore: 0,
          awayScore: 0,
          played: false,
          playerStats: {},
        };

        const result = simulateGame(tempGame, homeRoster, awayRoster);
        const winnerId =
          result.homeScore >= result.awayScore ? matchup.homeTeamId : matchup.awayTeamId;

        let updatedBracket = state.playoffBracket.map(m =>
          m.id === matchupId
            ? { ...m, homeScore: result.homeScore, awayScore: result.awayScore, winnerId }
            : m,
        );

        updatedBracket = propagateWinner(updatedBracket, matchupId, winnerId, state.playoffSeeds);

        const superBowl = updatedBracket.find(m => m.id === 'championship');
        const existingChampions = state.champions ?? [];
        const newChampions =
          superBowl?.winnerId && !existingChampions.find(c => c.season === state.season)
            ? [...existingChampions, { season: state.season, teamId: superBowl.winnerId }]
            : existingChampions;

        let newNewsItems = state.newsItems;
        let finalsMvpPlayerId = state.finalsMvpPlayerId;
        if (superBowl?.winnerId && !existingChampions.find(c => c.season === state.season)) {
          const champTeam = state.teams.find(t => t.id === superBowl.winnerId);
          if (champTeam) {
            newNewsItems = [...newNewsItems, makeNews({
              season: state.season,
              week: 99,
              type: 'milestone',
              teamId: champTeam.id,
              headline: `${champTeam.city} ${champTeam.name} win The Championship ${state.season}!`,
              isUserTeam: champTeam.id === state.userTeamId,
            })];
          }
          // Determine Finals MVP: best performer from winning team in the SB game
          if (matchupId === 'championship') {
            const winnerRoster = state.players.filter(p => p.teamId === winnerId);
            const winnerIds = new Set(winnerRoster.map(p => p.id));
            let bestScore = -1;
            let bestId = '';
            for (const [pid, stats] of Object.entries(result.playerStats)) {
              if (!winnerIds.has(pid)) continue;
              const s = stats as Partial<PlayerStats>;
              const score = (s.passYards ?? 0) * 0.04 + (s.passTDs ?? 0) * 6
                + (s.rushYards ?? 0) * 0.1 + (s.rushTDs ?? 0) * 6
                + (s.receivingYards ?? 0) * 0.1 + (s.receivingTDs ?? 0) * 6
                + (s.tackles ?? 0) * 1 + (s.sacks ?? 0) * 3 + (s.defensiveINTs ?? 0) * 5;
              if (score > bestScore) {
                bestScore = score;
                bestId = pid;
              }
            }
            if (bestId) finalsMvpPlayerId = bestId;
          }
        }

        // Store the full game result in the schedule so BoxScoreModal can access it
        const playoffGameResult: GameResult = {
          ...result,
          id: matchupId,
          played: true,
        };
        const updatedSchedule = [...state.schedule.filter(g => g.id !== matchupId), playoffGameResult];

        // Generate playoff recap for this game's round
        const playoffWeek = 100 + matchup.round;
        const singleGameRecap = generateWeeklyRecap([playoffGameResult], state.teams, state.players, state.season, playoffWeek);
        const existingRecap = (state.weeklyRecaps ?? []).find(r => r.season === state.season && r.week === playoffWeek);
        const mergedRecap = existingRecap
          ? { ...existingRecap, segments: [...existingRecap.segments, ...singleGameRecap.segments].sort((a, b) => b.priority - a.priority).slice(0, 10) }
          : singleGameRecap;
        const updatedRecaps = [...(state.weeklyRecaps ?? []).filter(r => !(r.season === state.season && r.week === playoffWeek)), mergedRecap];

        set({ playoffBracket: updatedBracket, champions: newChampions, newsItems: newNewsItems, finalsMvpPlayerId, schedule: updatedSchedule, weeklyRecaps: updatedRecaps });
      },

      simNextPlayoffGame: () => {
        const state = get();
        if (!state.playoffBracket) return;
        const next = state.playoffBracket
          .filter(m => !m.winnerId && m.homeTeamId && m.awayTeamId)
          .sort((a, b) => a.round - b.round)[0];
        if (next) get().simPlayoffGame(next.id);
      },

      simAllPlayoffGames: () => {
        const state = get();
        if (!state.playoffBracket || !state.playoffSeeds) return;

        let bracket = [...state.playoffBracket.map(m => ({ ...m }))];
        let champions = state.champions ?? [];
        let newsItems = state.newsItems;
        let finalsMvpPlayerId = state.finalsMvpPlayerId;
        const playoffResults: GameResult[] = [];

        for (let guard = 0; guard < 200; guard++) {
          const next = bracket
            .filter(m => !m.winnerId && m.homeTeamId && m.awayTeamId)
            .sort((a, b) => a.round - b.round)[0];
          if (!next) break;

          const homeRosterRaw = state.players.filter(p => p.teamId === next.homeTeamId);
          const awayRosterRaw = state.players.filter(p => p.teamId === next.awayTeamId);
          const homeTeam = state.teams.find(t => t.id === next.homeTeamId);
          const awayTeam = state.teams.find(t => t.id === next.awayTeamId);
          const homeRoster = homeTeam?.depthChart ? sortRosterByDepthChart(homeRosterRaw, homeTeam.depthChart) : homeRosterRaw;
          const awayRoster = awayTeam?.depthChart ? sortRosterByDepthChart(awayRosterRaw, awayTeam.depthChart) : awayRosterRaw;

          const tempGame: GameResult = {
            id: next.id, week: 99, season: state.season,
            homeTeamId: next.homeTeamId!, awayTeamId: next.awayTeamId!,
            homeScore: 0, awayScore: 0, played: false, playerStats: {},
          };
          const result = simulateGame(tempGame, homeRoster, awayRoster);
          const winnerId = result.homeScore >= result.awayScore ? next.homeTeamId! : next.awayTeamId!;

          playoffResults.push({ ...result, id: next.id, played: true });

          // Update bracket in local array
          bracket = bracket.map(m =>
            m.id === next.id ? { ...m, homeScore: result.homeScore, awayScore: result.awayScore, winnerId } : m,
          );
          bracket = propagateWinner(bracket, next.id, winnerId, state.playoffSeeds);

          // Check Championship
          const superBowl = bracket.find(m => m.id === 'championship');
          if (superBowl?.winnerId && !champions.find(c => c.season === state.season)) {
            champions = [...champions, { season: state.season, teamId: superBowl.winnerId }];
            const champTeam = state.teams.find(t => t.id === superBowl.winnerId);
            if (champTeam) {
              newsItems = [...newsItems, makeNews({
                season: state.season, week: 99, type: 'milestone', teamId: champTeam.id,
                headline: `${champTeam.city} ${champTeam.name} win The Championship ${state.season}!`,
                isUserTeam: champTeam.id === state.userTeamId,
              })];
            }
            if (next.id === 'championship') {
              const winnerRoster = state.players.filter(p => p.teamId === winnerId);
              const winnerIds = new Set(winnerRoster.map(p => p.id));
              let bestScore = -1;
              let bestId = '';
              for (const [pid, stats] of Object.entries(result.playerStats)) {
                if (!winnerIds.has(pid)) continue;
                const s = stats as Partial<PlayerStats>;
                const score = (s.passYards ?? 0) * 0.04 + (s.passTDs ?? 0) * 6
                  + (s.rushYards ?? 0) * 0.1 + (s.rushTDs ?? 0) * 6
                  + (s.receivingYards ?? 0) * 0.1 + (s.receivingTDs ?? 0) * 6
                  + (s.tackles ?? 0) * 1 + (s.sacks ?? 0) * 3 + (s.defensiveINTs ?? 0) * 5;
                if (score > bestScore) { bestScore = score; bestId = pid; }
              }
              if (bestId) finalsMvpPlayerId = bestId;
            }
          }
        }

        // Store playoff game results in schedule for BoxScoreModal access
        const existingIds = new Set(playoffResults.map(r => r.id));
        const updatedSchedule = [...state.schedule.filter(g => !existingIds.has(g.id)), ...playoffResults];

        // Generate playoff recaps grouped by round
        const resultsByRound = new Map<number, GameResult[]>();
        for (const r of playoffResults) {
          const m = bracket.find(b => b.id === r.id);
          const round = m?.round ?? 1;
          if (!resultsByRound.has(round)) resultsByRound.set(round, []);
          resultsByRound.get(round)!.push(r);
        }
        let updatedRecaps = [...(state.weeklyRecaps ?? [])];
        for (const [round, results] of resultsByRound) {
          const playoffWeek = 100 + round;
          const recap = generateWeeklyRecap(results, state.teams, state.players, state.season, playoffWeek);
          updatedRecaps = [...updatedRecaps.filter(r => !(r.season === state.season && r.week === playoffWeek)), recap];
        }

        set({ playoffBracket: bracket, champions, newsItems, finalsMvpPlayerId, schedule: updatedSchedule, weeklyRecaps: updatedRecaps });
        // Check achievements after playoffs
        const newAchievementsP = checkAchievements(get());
        if (newAchievementsP.length > 0) {
          const cur = get();
          set({ achievements: [...cur.achievements, ...newAchievementsP] });
        }
      },

      /** Sim all games in the current playoff round (e.g. all Wild Card games). */
      simPlayoffRound: () => {
        const state = get();
        if (!state.playoffBracket || !state.playoffSeeds) return;
        const unplayed = state.playoffBracket
          .filter(m => !m.winnerId && m.homeTeamId && m.awayTeamId);
        if (unplayed.length === 0) return;
        const currentRound = Math.min(...unplayed.map(m => m.round));
        const allRoundGames = unplayed.filter(m => m.round === currentRound);

        // Skip the user's matchup so they can watch it live — unless it's the only game left
        const userMatchup = allRoundGames.find(m => m.homeTeamId === state.userTeamId || m.awayTeamId === state.userTeamId);
        const roundGames = allRoundGames.length > 1 && userMatchup
          ? allRoundGames.filter(m => m !== userMatchup)
          : allRoundGames;

        let bracket = [...state.playoffBracket.map(m => ({ ...m }))];
        let champions = state.champions ?? [];
        let newsItems = state.newsItems;
        let finalsMvpPlayerId = state.finalsMvpPlayerId;
        const playoffResults: GameResult[] = [];

        for (const game of roundGames) {
          const matchup = bracket.find(m => m.id === game.id);
          if (!matchup || !matchup.homeTeamId || !matchup.awayTeamId) continue;

          const homeRosterRaw = state.players.filter(p => p.teamId === matchup.homeTeamId);
          const awayRosterRaw = state.players.filter(p => p.teamId === matchup.awayTeamId);
          const homeTeam = state.teams.find(t => t.id === matchup.homeTeamId);
          const awayTeam = state.teams.find(t => t.id === matchup.awayTeamId);
          const homeRoster = homeTeam?.depthChart ? sortRosterByDepthChart(homeRosterRaw, homeTeam.depthChart) : homeRosterRaw;
          const awayRoster = awayTeam?.depthChart ? sortRosterByDepthChart(awayRosterRaw, awayTeam.depthChart) : awayRosterRaw;

          const tempGame: GameResult = {
            id: matchup.id, week: 99, season: state.season,
            homeTeamId: matchup.homeTeamId!, awayTeamId: matchup.awayTeamId!,
            homeScore: 0, awayScore: 0, played: false, playerStats: {},
          };
          const result = simulateGame(tempGame, homeRoster, awayRoster);
          const winnerId = result.homeScore >= result.awayScore ? matchup.homeTeamId! : matchup.awayTeamId!;

          playoffResults.push({ ...result, id: matchup.id, played: true });

          bracket = bracket.map(m =>
            m.id === matchup.id ? { ...m, homeScore: result.homeScore, awayScore: result.awayScore, winnerId } : m,
          );
          bracket = propagateWinner(bracket, matchup.id, winnerId, state.playoffSeeds);

          // Check if this was the Championship game
          const superBowl = bracket.find(m => m.id === 'championship');
          if (superBowl?.winnerId && !champions.find(c => c.season === state.season)) {
            champions = [...champions, { season: state.season, teamId: superBowl.winnerId }];
            const champTeam = state.teams.find(t => t.id === superBowl.winnerId);
            if (champTeam) {
              newsItems = [...newsItems, makeNews({
                season: state.season, week: 99, type: 'milestone', teamId: champTeam.id,
                headline: `${champTeam.city} ${champTeam.name} win The Championship ${state.season}!`,
                isUserTeam: champTeam.id === state.userTeamId,
              })];
            }
            if (matchup.id === 'championship') {
              const winnerRoster = state.players.filter(p => p.teamId === winnerId);
              const winnerIds = new Set(winnerRoster.map(p => p.id));
              let bestScore = -1;
              let bestId = '';
              for (const [pid, stats] of Object.entries(result.playerStats)) {
                if (!winnerIds.has(pid)) continue;
                const s = stats as Partial<PlayerStats>;
                const score = (s.passYards ?? 0) * 0.04 + (s.passTDs ?? 0) * 6
                  + (s.rushYards ?? 0) * 0.1 + (s.rushTDs ?? 0) * 6
                  + (s.receivingYards ?? 0) * 0.1 + (s.receivingTDs ?? 0) * 6
                  + (s.tackles ?? 0) * 1 + (s.sacks ?? 0) * 3 + (s.defensiveINTs ?? 0) * 5;
                if (score > bestScore) { bestScore = score; bestId = pid; }
              }
              if (bestId) finalsMvpPlayerId = bestId;
            }
          }
        }

        // Store playoff game results in schedule for BoxScoreModal access
        const existingIds = new Set(playoffResults.map(r => r.id));
        const updatedSchedule = [...state.schedule.filter(g => !existingIds.has(g.id)), ...playoffResults];

        // Generate playoff recap for the round (week = 100 + round to distinguish from regular season)
        const playoffWeek = 100 + currentRound;
        const playoffRecap = generateWeeklyRecap(playoffResults, state.teams, state.players, state.season, playoffWeek);
        const updatedRecaps = [...(state.weeklyRecaps ?? []).filter(r => !(r.season === state.season && r.week === playoffWeek)), playoffRecap];

        set({ playoffBracket: bracket, champions, newsItems, finalsMvpPlayerId, schedule: updatedSchedule, weeklyRecaps: updatedRecaps });
      },

      // PRD-03: Advance from playoffs to re-signing phase
      advanceToResigning: () => {
        const state = get();
        const userTeam = state.teams.find(t => t.id === state.userTeamId);
        if (!userTeam) return;

        const expiringPlayers = state.players.filter(
          p => p.teamId === state.userTeamId && p.contract.yearsLeft === 1 && !p.retired,
        );

        const resigningPlayers = expiringPlayers.map(p => computeResigningEntry(p, userTeam));

        set({ phase: 'resigning', resigningPlayers });
      },

      // PRD-03: User re-signs a player (negotiation handled in UI, this just executes)
      resignPlayer: (playerId: string, salary: number, years: number) => {
        const state = get();
        const entry = state.resigningPlayers.find(e => e.playerId === playerId);
        if (!entry) return false;

        const userTeam = state.teams.find(t => t.id === state.userTeamId);
        if (!userTeam) return false;

        const player = state.players.find(p => p.id === playerId);
        if (!player) return false;

        const capSpaceNeeded = salary - player.contract.salary;

        const newNewsItems = [...state.newsItems, makeNews({
          season: state.season,
          week: 0,
          type: 'signing',
          teamId: state.userTeamId,
          playerIds: [playerId],
          headline: `You re-signed ${player.firstName} ${player.lastName} to a $${salary}M/yr, ${years}-year extension.`,
          isUserTeam: true,
        })];

        set({
          players: state.players.map(p =>
            p.id === playerId ? { ...p, contract: { salary, yearsLeft: years, guaranteed: generateGuaranteed(salary, years), totalYears: years, offseasonSigned: true } } : p,
          ),
          teams: state.teams.map(t =>
            t.id === state.userTeamId
              ? { ...t, totalPayroll: Math.max(0, t.totalPayroll + capSpaceNeeded) }
              : t,
          ),
          resigningPlayers: state.resigningPlayers.filter(e => e.playerId !== playerId),
          newsItems: newNewsItems,
        });
        return true;
      },

      // PRD-03: User passes on re-signing (player will enter FA)
      passOnResigning: (playerId: string) => {
        const state = get();
        const player = state.players.find(p => p.id === playerId);
        const salary = player?.contract.salary ?? 0;

        set({
          players: state.players.map(p =>
            p.id === playerId ? { ...p, teamId: null, contract: { ...p.contract, yearsLeft: 0 } } : p,
          ),
          teams: state.teams.map(t => {
            if (t.id !== state.userTeamId) return t;
            const newRoster = t.roster.filter(id => id !== playerId);
            const newDepthChart = POSITIONS.reduce<Record<Position, string[]>>((acc, pos) => {
              acc[pos] = (t.depthChart[pos] ?? []).filter(id => id !== playerId);
              return acc;
            }, {} as Record<Position, string[]>);
            return { ...t, roster: newRoster, depthChart: newDepthChart, totalPayroll: Math.max(0, t.totalPayroll - salary) };
          }),
          freeAgents: [...state.freeAgents, playerId],
          resigningPlayers: state.resigningPlayers.filter(e => e.playerId !== playerId),
        });
      },

      franchiseTagPlayer: (playerId: string) => {
        const state = get();
        const player = state.players.find(p => p.id === playerId);
        const userTeam = state.teams.find(t => t.id === state.userTeamId);
        if (!player || !userTeam) return false;
        if (userTeam.franchiseTagUsed) return false;
        if (!state.resigningPlayers.some(e => e.playerId === playerId)) return false;

        const tagSalary = computeFranchiseTagSalary(player.position, state.players, player);
        const oldSalary = player.contract.salary;
        const capSpaceNeeded = tagSalary - oldSalary;

        // Allow tag even if slightly over cap (franchise tags are mandatory cap hits)
        set({
          players: state.players.map(p =>
            p.id === playerId
              ? { ...p, contract: { salary: tagSalary, yearsLeft: 1, guaranteed: tagSalary, totalYears: 1, offseasonSigned: true } }
              : p,
          ),
          teams: state.teams.map(t =>
            t.id === state.userTeamId
              ? { ...t, totalPayroll: t.totalPayroll + capSpaceNeeded, franchiseTagUsed: true }
              : t,
          ),
          resigningPlayers: state.resigningPlayers.filter(e => e.playerId !== playerId),
          newsItems: [
            ...state.newsItems,
            {
              id: `news-tag-${playerId}-${state.season}`,
              season: state.season,
              week: state.week,
              type: 'signing' as const,
              headline: `${player.firstName} ${player.lastName} franchise tagged by ${userTeam.city} ${userTeam.name}`,
              body: `${player.position} ${player.firstName} ${player.lastName} has been given the franchise tag, locking him in for 1 year at $${tagSalary}M.`,
              teamId: userTeam.id,
              playerIds: [playerId],
              isUserTeam: true,
            },
          ],
        });
        return true;
      },

      advanceToDraft: () => {
        const state = get();
        // PRD-03: AI teams re-sign their own expiring players when coming from resigning phase
        let updatedPlayers = [...state.players];
        let updatedTeams = [...state.teams];

        if (state.phase === 'resigning') {
          // Handle remaining unsigned user players — remove from team
          const unhandledUserExpiring = new Set(state.resigningPlayers.map(e => e.playerId));
          const unhandledSalary = updatedPlayers
            .filter(p => unhandledUserExpiring.has(p.id))
            .reduce((sum, p) => sum + p.contract.salary, 0);
          updatedPlayers = updatedPlayers.map(p =>
            unhandledUserExpiring.has(p.id) ? { ...p, teamId: null, contract: { ...p.contract, yearsLeft: 0 } } : p,
          );
          updatedTeams = updatedTeams.map(t => {
            if (t.id !== state.userTeamId) return t;
            const newRoster = t.roster.filter(id => !unhandledUserExpiring.has(id));
            const newDepthChart = POSITIONS.reduce<Record<Position, string[]>>((acc, pos) => {
              acc[pos] = (t.depthChart[pos] ?? []).filter(id => !unhandledUserExpiring.has(id));
              return acc;
            }, {} as Record<Position, string[]>);
            return { ...t, roster: newRoster, depthChart: newDepthChart, totalPayroll: Math.max(0, t.totalPayroll - unhandledSalary) };
          });

          // AI teams use franchise tag on their best expiring player (OVR >= 70)
          const aiTeamsForTag = updatedTeams.filter(t => t.id !== state.userTeamId && !t.franchiseTagUsed);
          for (const aiTeam of aiTeamsForTag) {
            const expiring = updatedPlayers
              .filter(p => p.teamId === aiTeam.id && p.contract.yearsLeft === 1 && !p.retired)
              .sort((a, b) => b.ratings.overall - a.ratings.overall);
            const bestPlayer = expiring[0];
            if (bestPlayer && bestPlayer.ratings.overall >= 70) {
              const tagSalary = computeFranchiseTagSalary(bestPlayer.position, updatedPlayers, bestPlayer);
              const oldSalary = bestPlayer.contract.salary;
              const aiTeamData = updatedTeams.find(t => t.id === aiTeam.id);
              const canAffordTag = aiTeamData ? (aiTeamData.totalPayroll + tagSalary - oldSalary) <= aiTeamData.salaryCap : false;
              if (canAffordTag) {
                updatedPlayers = updatedPlayers.map(p =>
                  p.id === bestPlayer.id ? { ...p, contract: { salary: tagSalary, yearsLeft: 1, guaranteed: tagSalary, totalYears: 1, offseasonSigned: true } } : p,
                );
                updatedTeams = updatedTeams.map(t =>
                  t.id === aiTeam.id ? { ...t, totalPayroll: Math.max(0, t.totalPayroll + (tagSalary - oldSalary)), franchiseTagUsed: true } : t,
                );
              }
            }
          }

          // AI teams auto-resign their own expiring players
          const aiTeams = updatedTeams.filter(t => t.id !== state.userTeamId);
          for (const aiTeam of aiTeams) {
            const expiringFromAI = updatedPlayers.filter(
              p => p.teamId === aiTeam.id && p.contract.yearsLeft === 1 && !p.retired,
            );
            for (const player of expiringFromAI) {
              const marketSalary = estimateSalary(player.ratings.overall, player.position, player.age, player.potential);
              const capSpace = aiTeam.salaryCap - aiTeam.totalPayroll;
              // 70% chance if cap space available
              if (capSpace >= marketSalary && Math.random() < 0.70) {
                const newYears = 1 + Math.floor(Math.random() * 3);
                const salaryDiff = marketSalary - player.contract.salary;
                updatedPlayers = updatedPlayers.map(p =>
                  p.id === player.id ? { ...p, contract: { salary: marketSalary, yearsLeft: newYears, guaranteed: generateGuaranteed(marketSalary, newYears), totalYears: newYears, offseasonSigned: true } } : p,
                );
                updatedTeams = updatedTeams.map(t =>
                  t.id === aiTeam.id ? { ...t, totalPayroll: Math.max(0, t.totalPayroll + salaryDiff) } : t,
                );
              } else {
                // Let contract expire
                updatedPlayers = updatedPlayers.map(p =>
                  p.id === player.id ? { ...p, contract: { ...p.contract, yearsLeft: 0 } } : p,
                );
              }
            }
          }
        }

        // Find/generate draft class
        const allImportedProspects = updatedPlayers
          .filter(
            (p) =>
              p.teamId === null &&
              p.experience === 0 &&
              p.draftYear !== null &&
              p.contract.yearsLeft === 0 &&
              p.draftYear >= state.season,
          )
          .sort((a, b) => b.ratings.overall - a.ratings.overall);
        const targetDraftYear = allImportedProspects.reduce<number | null>(
          (minYear, prospect) =>
            minYear === null || (prospect.draftYear as number) < minYear
              ? (prospect.draftYear as number)
              : minYear,
          null,
        ) ?? state.season;
        const importedDraftClass = allImportedProspects.filter(
          (prospect) => prospect.draftYear === targetDraftYear,
        );

        const draftClass = importedDraftClass.length > 0
          ? importedDraftClass
          : generateDraftClass(224).map((player) => ({
              ...player,
              draftYear: targetDraftYear,
            }));

        const sortedTeams = [...updatedTeams].sort((a, b) => {
          const aWinPct = a.record.wins / Math.max(1, a.record.wins + a.record.losses);
          const bWinPct = b.record.wins / Math.max(1, b.record.wins + b.record.losses);
          return aWinPct - bWinPct;
        });

        // Build draft order from draftPicks (respects trades — ownerTeamId may differ from originalTeamId)
        // Collect all picks for this draft year from all teams
        const allDraftYearPicks = updatedTeams.flatMap(t =>
          t.draftPicks.filter(pk => pk.year === targetDraftYear && !pk.playerId),
        );
        // Sort by round, then within each round by original team's win pct (worst first)
        const teamWinPctMap = new Map(sortedTeams.map((t, i) => [t.id, i])); // lower index = worse record
        allDraftYearPicks.sort((a, b) => {
          if (a.round !== b.round) return a.round - b.round;
          return (teamWinPctMap.get(a.originalTeamId) ?? 16) - (teamWinPctMap.get(b.originalTeamId) ?? 16);
        });
        // Draft order = the OWNER of each pick drafts
        const draftOrder = allDraftYearPicks.map(pk => pk.ownerTeamId);

        // PRD-07: Compute scouting data for draft prospects
        const scoutingData = computeScoutingData(draftClass, state.scoutingLevel);

        const finalPlayers = importedDraftClass.length > 0
          ? updatedPlayers
          : [...updatedPlayers, ...draftClass];

        set({
          phase: 'draft',
          players: finalPlayers,
          teams: updatedTeams,
          freeAgents: draftClass.map(p => p.id),
          draftOrder,
          draftResults: [],
          resigningPlayers: [],
          draftScoutingData: scoutingData,
        });
      },

      draftPlayer: (playerId: string) => {
        const state = get();
        const player = state.players.find(p => p.id === playerId);
        if (!player) return;

        const currentPickTeamId = state.draftOrder[0];
        if (!currentPickTeamId) return;
        const totalPicks = state.teams.length * 7;
        const overallPick = totalPicks - state.draftOrder.length + 1;
        const pickInRound = ((overallPick - 1) % state.teams.length) + 1;
        const round = Math.ceil(overallPick / state.teams.length);

        // Rookie salary scale based on draft position (league-style exponential decay)
        // Pick 1: ~$10M, Pick 32: ~$2.8M, Pick 64: ~$1.3M, Pick 128+: ~$0.8M
        const finalSalary = Math.max(0.8, Math.round((0.7 + 9.3 * Math.exp(-0.04 * (overallPick - 1))) * 10) / 10);

        const pickingTeam = state.teams.find(t => t.id === currentPickTeamId);
        if (pickingTeam && currentPickTeamId === state.userTeamId) {
          if (pickingTeam.totalPayroll + finalSalary > pickingTeam.salaryCap) {
            console.warn('Cap space exceeded when drafting player');
          }
        }

        let newNewsItems = state.newsItems;
        if (overallPick <= 10 || currentPickTeamId === state.userTeamId) {
          const pickingTeamObj = state.teams.find(t => t.id === currentPickTeamId);
          newNewsItems = [...newNewsItems, makeNews({
            season: state.season,
            week: 0,
            type: 'signing',
            teamId: currentPickTeamId,
            playerIds: [playerId],
            headline: `${pickingTeamObj?.abbreviation ?? '???'} selects ${player.firstName} ${player.lastName} (${player.position}) with pick #${overallPick} in Round ${round}.`,
            isUserTeam: currentPickTeamId === state.userTeamId,
          })];
        }

        // PRD-13: Update depth chart for drafting team + mark the DraftPick as used
        // Find which DraftPick this corresponds to (the owner's pick for this round/year)
        const targetDraftYear = state.season;
        const pickIndex = state.draftResults.length; // how many picks have been made so far
        const updatedTeams = state.teams.map(t => {
          // Mark the used pick on whichever team owns it
          const updatedPicks = t.draftPicks.map(pk => {
            if (pk.year === targetDraftYear && pk.ownerTeamId === currentPickTeamId && pk.round === round && !pk.playerId) {
              return { ...pk, playerId, pick: overallPick };
            }
            return pk;
          });
          if (t.id !== currentPickTeamId) return { ...t, draftPicks: updatedPicks };
          const chart = insertIntoDepthChart(t.depthChart, player.position, playerId, state.players);
          return { ...t, roster: [...t.roster, playerId], totalPayroll: t.totalPayroll + finalSalary, depthChart: chart, draftPicks: updatedPicks };
        });

        const newDraftOrder = state.draftOrder.slice(1);
        const newFreeAgents = state.freeAgents.filter(id => id !== playerId);

        set({
          players: state.players.map(p =>
            p.id === playerId
              ? {
                  ...p,
                  teamId: currentPickTeamId,
                  draftYear: state.season,
                  draftPick: overallPick,
                  contract: { salary: finalSalary, yearsLeft: 4, guaranteed: generateGuaranteed(finalSalary, 4), totalYears: 4, offseasonSigned: true },
                }
              : p,
          ),
          teams: updatedTeams,
          freeAgents: newFreeAgents,
          draftOrder: newDraftOrder,
          draftResults: [
            ...state.draftResults,
            { overallPick, round, pickInRound, teamId: currentPickTeamId, playerId },
          ],
          newsItems: newNewsItems,
        });

        // Auto-advance to free agency when draft is complete
        if (newDraftOrder.length === 0 || newFreeAgents.length === 0) {
          get().advanceToFreeAgency();
        }
      },

      simDraftPick: () => {
        const state = get();
        if (state.phase !== 'draft') return;
        const currentPickTeamId = state.draftOrder[0];
        if (!currentPickTeamId) return;
        const playerId = autoDraftPlayerId(state, currentPickTeamId);
        if (!playerId) return;
        get().draftPlayer(playerId);
      },

      simToUserDraftPick: () => {
        const state = get();
        if (state.phase !== 'draft') return;
        // If it's already the user's pick, do nothing — they need to pick first
        if (state.draftOrder[0] === state.userTeamId) return;

        // Compute all picks in a single pass, then call set() ONCE
        let draftOrder = [...state.draftOrder];
        let freeAgentIds = [...state.freeAgents];
        let players = [...state.players];
        let teams = [...state.teams];
        let draftResults = [...state.draftResults];
        let newsItems = [...state.newsItems];
        const totalPicks = state.teams.length * 7;

        for (let guard = 0; guard < 5000 && draftOrder.length > 0 && freeAgentIds.length > 0; guard++) {
          const pickTeam = draftOrder[0];
          if (pickTeam === state.userTeamId) break; // Stop at user's pick

          const fakeState = { ...state, draftOrder, freeAgents: freeAgentIds, players, teams } as LeagueState;
          const pid = autoDraftPlayerId(fakeState, pickTeam);
          if (!pid) break;

          const player = players.find(p => p.id === pid);
          if (!player) break;

          const overallPick = totalPicks - draftOrder.length + 1;
          const pickInRound = ((overallPick - 1) % state.teams.length) + 1;
          const round = Math.ceil(overallPick / state.teams.length);
          // Rookie salary scale based on draft position (league-style exponential decay)
          // Pick 1: ~$10M, Pick 32: ~$2.8M, Pick 64: ~$1.3M, Pick 128+: ~$0.8M
          const rookieSalary = Math.max(0.8, Math.round((0.7 + 9.3 * Math.exp(-0.04 * (overallPick - 1))) * 10) / 10);

          players = players.map(p =>
            p.id === pid
              ? { ...p, teamId: pickTeam, draftYear: state.season, draftPick: overallPick, contract: { salary: rookieSalary, yearsLeft: 4, guaranteed: generateGuaranteed(rookieSalary, 4), totalYears: 4, offseasonSigned: true } }
              : p,
          );
          teams = teams.map(t => {
            const updPicks = t.draftPicks.map(pk => {
              if (pk.year === state.season && pk.ownerTeamId === pickTeam && pk.round === round && !pk.playerId) {
                return { ...pk, playerId: pid, pick: overallPick };
              }
              return pk;
            });
            if (t.id !== pickTeam) return { ...t, draftPicks: updPicks };
            const chart = insertIntoDepthChart(t.depthChart, player.position, pid, players);
            return { ...t, roster: [...t.roster, pid], totalPayroll: t.totalPayroll + rookieSalary, depthChart: chart, draftPicks: updPicks };
          });
          freeAgentIds = freeAgentIds.filter(id => id !== pid);
          draftOrder = draftOrder.slice(1);
          draftResults = [...draftResults, { overallPick, round, pickInRound, teamId: pickTeam, playerId: pid }];

          if (overallPick <= 10 || pickTeam === state.userTeamId) {
            const pickTeamObj = teams.find(t => t.id === pickTeam);
            newsItems = [...newsItems, makeNews({
              season: state.season, week: 0, type: 'signing', teamId: pickTeam, playerIds: [pid],
              headline: `${pickTeamObj?.abbreviation ?? '???'} selects ${player.firstName} ${player.lastName} (${player.position}) with pick #${overallPick} in Round ${round}.`,
              isUserTeam: pickTeam === state.userTeamId,
            })];
          }
        }

        set({ players, teams, freeAgents: freeAgentIds, draftOrder, draftResults, newsItems });
      },

      simToEndDraft: (options?: { skipAdvance?: boolean }) => {
        const state = get();
        if (state.phase !== 'draft') return;

        // Compute ALL remaining picks in a single pass, then call set() ONCE
        let draftOrder = [...state.draftOrder];
        let freeAgentIds = [...state.freeAgents];
        let players = [...state.players];
        let teams = [...state.teams];
        let draftResults = [...state.draftResults];
        let newsItems = [...state.newsItems];
        const totalPicks = state.teams.length * 7;

        for (let guard = 0; guard < 5000 && draftOrder.length > 0 && freeAgentIds.length > 0; guard++) {
          const pickTeam = draftOrder[0];
          const fakeState = { ...state, draftOrder, freeAgents: freeAgentIds, players, teams } as LeagueState;
          const pid = autoDraftPlayerId(fakeState, pickTeam);
          if (!pid) break;

          const player = players.find(p => p.id === pid);
          if (!player) break;

          const overallPick = totalPicks - draftOrder.length + 1;
          const pickInRound = ((overallPick - 1) % state.teams.length) + 1;
          const round = Math.ceil(overallPick / state.teams.length);
          // Rookie salary scale based on draft position (league-style exponential decay)
          // Pick 1: ~$10M, Pick 32: ~$2.8M, Pick 64: ~$1.3M, Pick 128+: ~$0.8M
          const rookieSalary = Math.max(0.8, Math.round((0.7 + 9.3 * Math.exp(-0.04 * (overallPick - 1))) * 10) / 10);

          players = players.map(p =>
            p.id === pid
              ? { ...p, teamId: pickTeam, draftYear: state.season, draftPick: overallPick, contract: { salary: rookieSalary, yearsLeft: 4, guaranteed: generateGuaranteed(rookieSalary, 4), totalYears: 4, offseasonSigned: true } }
              : p,
          );
          teams = teams.map(t => {
            const updPicks = t.draftPicks.map(pk => {
              if (pk.year === state.season && pk.ownerTeamId === pickTeam && pk.round === round && !pk.playerId) {
                return { ...pk, playerId: pid, pick: overallPick };
              }
              return pk;
            });
            if (t.id !== pickTeam) return { ...t, draftPicks: updPicks };
            const chart = insertIntoDepthChart(t.depthChart, player.position, pid, players);
            return { ...t, roster: [...t.roster, pid], totalPayroll: t.totalPayroll + rookieSalary, depthChart: chart, draftPicks: updPicks };
          });
          freeAgentIds = freeAgentIds.filter(id => id !== pid);
          draftOrder = draftOrder.slice(1);
          draftResults = [...draftResults, { overallPick, round, pickInRound, teamId: pickTeam, playerId: pid }];

          if (overallPick <= 10 || pickTeam === state.userTeamId) {
            const pickTeamObj = teams.find(t => t.id === pickTeam);
            newsItems = [...newsItems, makeNews({
              season: state.season, week: 0, type: 'signing', teamId: pickTeam, playerIds: [pid],
              headline: `${pickTeamObj?.abbreviation ?? '???'} selects ${player.firstName} ${player.lastName} (${player.position}) with pick #${overallPick} in Round ${round}.`,
              isUserTeam: pickTeam === state.userTeamId,
            })];
          }
        }

        set({ players, teams, freeAgents: freeAgentIds, draftOrder, draftResults, newsItems });

        // Auto-advance to free agency when draft is complete (unless caller opts out)
        if (!options?.skipAdvance) {
          get().advanceToFreeAgency();
        }
      },

      advanceToFreeAgency: () => {
        const state = get();
        const expiredPlayers = state.players.filter(
          p => p.teamId && p.contract.yearsLeft <= 0,
        );

        const releaseNews: NewsItem[] = expiredPlayers
          .filter(p => p.ratings.overall >= 75)
          .map(p => {
            const t = state.teams.find(t => t.id === p.teamId);
            return makeNews({
              season: state.season,
              week: 0,
              type: 'release',
              teamId: p.teamId!,
              playerIds: [p.id],
              headline: `${p.firstName} ${p.lastName} (${p.position}, ${t?.abbreviation ?? '?'}) enters free agency.`,
              isUserTeam: p.teamId === state.userTeamId,
            });
          });

        // Include undrafted players (still in freeAgents from draft) as UDFAs
        const undraftedIds = state.freeAgents.filter(id => {
          const p = state.players.find(pl => pl.id === id);
          return p && !p.teamId;
        });

        // Generate supplemental free agents to ensure a healthy market
        // Target: at least 150 FAs available (real pro FA class is 200-400+)
        const baseFACount = expiredPlayers.length + undraftedIds.length;
        const supplementalCount = Math.max(0, 150 - baseFACount);
        const supplementalPlayers: Player[] = [];
        if (supplementalCount > 0) {
          for (let i = 0; i < supplementalCount; i++) {
            const pos = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];
            // Generate depth players (45-68 OVR) — journeymen and camp bodies
            const talentMean = 45 + Math.random() * 23;
            const p = generatePlayer(pos, talentMean, {
              age: 24 + Math.floor(Math.random() * 8),
              experience: 1 + Math.floor(Math.random() * 6),
              teamId: null,
            });
            supplementalPlayers.push(p);
          }
        }

        const allPlayers = [
          ...state.players.map(p =>
            p.contract.yearsLeft <= 0 ? { ...p, teamId: null } : p,
          ),
          ...supplementalPlayers,
        ];

        set({
          phase: 'freeAgency',
          players: allPlayers,
          teams: state.teams.map(t => {
            const expiredFromTeam = expiredPlayers.filter(ep => t.roster.includes(ep.id));
            const salaryReduction = expiredFromTeam.reduce((sum, p) => sum + p.contract.salary, 0);
            const newRoster = t.roster.filter(pid => !expiredPlayers.find(ep => ep.id === pid));
            // Remove expired players from depth chart
            const newDepthChart = POSITIONS.reduce<Record<Position, string[]>>((acc, pos) => {
              acc[pos] = (t.depthChart[pos] ?? []).filter(
                pid => !expiredPlayers.find(ep => ep.id === pid),
              );
              return acc;
            }, {} as Record<Position, string[]>);
            return {
              ...t,
              roster: newRoster,
              totalPayroll: Math.max(0, t.totalPayroll - salaryReduction),
              depthChart: newDepthChart,
            };
          }),
          freeAgents: [...expiredPlayers.map(p => p.id), ...undraftedIds, ...supplementalPlayers.map(p => p.id)],
          faDay: 1,
          newsItems: [...state.newsItems, ...releaseNews],
        });

        // Compute initial refusals
        const newState = get();
        const userTeamData = newState.teams.find(t => t.id === newState.userTeamId);
        if (userTeamData) {
          set({ faRefusals: computeFARefusals(newState.freeAgents, newState.players, userTeamData, 1) });
        }
      },

      advanceFADay: () => {
        const state = get();
        if (state.phase !== 'freeAgency' || state.faDay >= 30) return;

        const nextDay = state.faDay + 1;
        const decay = faPriceDecay(nextDay);

        // --- AI signings for this day ---
        let currentPlayers = state.players;
        let currentTeams = state.teams;
        let currentFreeAgents = [...state.freeAgents];
        const allNews: NewsItem[] = [];

        // Signing pace: Early(1-5): 12-18, Mid-Early(6-10): 8-12, Mid(11-20): 5-8, Late(21-30): 2-4
        const signingsThisDay =
          nextDay <= 5 ? 12 + Math.floor(Math.random() * 7) :
          nextDay <= 10 ? 8 + Math.floor(Math.random() * 5) :
          nextDay <= 20 ? 5 + Math.floor(Math.random() * 4) :
          2 + Math.floor(Math.random() * 3);

        // Score AI teams by need — check roster needs AND upgrade opportunities
        const teamNeedScores: { teamId: string; score: number; needPositions: Position[]; wantPositions: Position[] }[] = [];
        for (const t of currentTeams) {
          if (t.id === state.userTeamId) continue;
          const rosterPlayers = currentPlayers.filter(p => p.teamId === t.id && !p.retired);
          // Allow signing up to 56 (cuts happen later) — don't block teams at 53
          if (rosterPlayers.length >= 56) continue;
          const capSpace = t.salaryCap - t.totalPayroll;
          if (capSpace < LEAGUE_MINIMUM_SALARY) continue; // Can't afford anyone
          const needPositions: Position[] = [];
          const wantPositions: Position[] = [];
          for (const pos of POSITIONS) {
            const posPlayers = rosterPlayers.filter(p => p.position === pos);
            const count = posPlayers.length;
            const starterOvr = posPlayers.sort((a, b) => b.ratings.overall - a.ratings.overall)[0]?.ratings.overall ?? 0;
            if (count < ROSTER_LIMITS[pos].min) needPositions.push(pos);
            else if (count < ROSTER_LIMITS[pos].max && starterOvr < 78) wantPositions.push(pos);
            // Upgrade-seeking: positions with many starters (OL=5, WR=3, DL=4) check weakest starter
            else if (count >= ROSTER_LIMITS[pos].min && ROSTER_LIMITS[pos].min >= 3) {
              const weakestStarter = posPlayers.sort((a, b) => a.ratings.overall - b.ratings.overall)[0];
              if (weakestStarter && weakestStarter.ratings.overall < 65) wantPositions.push(pos);
            }
          }
          // Even teams without specific position needs still participate (BPA signings)
          const score = needPositions.length * 10 + wantPositions.length * 3 + (capSpace > 20 ? 5 : 0) + Math.random() * 5;
          // All teams with cap space participate — BPA, depth, upgrades
          if (needPositions.length > 0 || wantPositions.length > 0 || rosterPlayers.length < 53 || Math.random() < 0.4) {
            teamNeedScores.push({ teamId: t.id, score, needPositions, wantPositions });
          }
        }
        teamNeedScores.sort((a, b) => b.score - a.score);
        const teamsActing = teamNeedScores.slice(0, signingsThisDay);

        for (const { teamId: aiTeamId, needPositions, wantPositions } of teamsActing) {
          if (currentFreeAgents.length === 0) break;
          const teamData = currentTeams.find(t => t.id === aiTeamId);
          if (!teamData) continue;
          const capSpace = teamData.salaryCap - teamData.totalPayroll;

          const availableFAs = currentFreeAgents
            .map(id => currentPlayers.find(p => p.id === id))
            .filter((p): p is Player => !!p && !p.retired)
            .filter(p => {
              const sal = estimateSalary(p.ratings.overall, p.position, p.age, p.potential) * decay;
              return sal <= capSpace || (capSpace >= LEAGUE_MINIMUM_SALARY && sal <= LEAGUE_MINIMUM_SALARY * 2);
            })
            .sort((a, b) => {
              const aBonus = needPositions.includes(a.position) ? 200 : wantPositions.includes(a.position) ? 80 : 0;
              const bBonus = needPositions.includes(b.position) ? 200 : wantPositions.includes(b.position) ? 80 : 0;
              return (bBonus + b.ratings.overall) - (aBonus + a.ratings.overall);
            });

          const target = availableFAs[0];
          if (!target) continue;

          const marketSalary = estimateSalary(target.ratings.overall, target.position, target.age, target.potential) * decay;
          const aiSalary = Math.round(Math.max(LEAGUE_MINIMUM_SALARY, Math.min(marketSalary, capSpace)) * 10) / 10;
          const aiYears = target.age >= 32 ? 1 : target.age >= 28 ? 2 : 3;

          currentPlayers = currentPlayers.map(p =>
            p.id === target.id
              ? { ...p, teamId: aiTeamId, contract: { salary: aiSalary, yearsLeft: aiYears, guaranteed: generateGuaranteed(aiSalary, aiYears), totalYears: aiYears, offseasonSigned: true } }
              : p,
          );
          currentFreeAgents = currentFreeAgents.filter(id => id !== target.id);
          currentTeams = currentTeams.map(t => {
            if (t.id !== aiTeamId) return t;
            const chart = insertIntoDepthChart(t.depthChart, target.position, target.id, currentPlayers);
            return { ...t, roster: [...t.roster, target.id], totalPayroll: t.totalPayroll + aiSalary, depthChart: chart };
          });

          allNews.push(makeNews({
            season: state.season, week: state.week, type: 'signing',
            teamId: aiTeamId, playerIds: [target.id],
            headline: `${teamData.city} ${teamData.name} signed ${target.firstName} ${target.lastName} (${target.position}, ${target.ratings.overall} OVR) to a $${aiSalary}M/yr, ${aiYears}-year deal.`,
            isUserTeam: false,
          }));
        }

        // Recompute refusals for the new day
        const userTeamData = currentTeams.find(t => t.id === state.userTeamId);
        const newRefusals = userTeamData ? computeFARefusals(currentFreeAgents, currentPlayers, userTeamData, nextDay) : [];

        set({
          faDay: nextDay,
          players: currentPlayers,
          teams: currentTeams,
          freeAgents: currentFreeAgents,
          faRefusals: newRefusals,
          newsItems: [...state.newsItems, ...allNews],
        });
      },

      advanceFAWeek: () => {
        // Advance up to 7 days in a SINGLE state update (one set() call) to avoid
        // persist middleware overhead (lz-string compression + localStorage write per call)
        const initialState = get();
        if (initialState.phase !== 'freeAgency' || initialState.faDay >= 30) return;

        let currentDay = initialState.faDay;
        let currentPlayers = initialState.players;
        let currentTeams = initialState.teams;
        let currentFreeAgents = [...initialState.freeAgents];
        const allNews: NewsItem[] = [];

        for (let i = 0; i < 7; i++) {
          if (currentDay >= 30) break;

          const nextDay = currentDay + 1;
          const decay = faPriceDecay(nextDay);

          const signingsThisDay =
            nextDay <= 5 ? 12 + Math.floor(Math.random() * 7) :
            nextDay <= 10 ? 8 + Math.floor(Math.random() * 5) :
            nextDay <= 20 ? 5 + Math.floor(Math.random() * 4) :
            2 + Math.floor(Math.random() * 3);

          const teamNeedScores: { teamId: string; score: number; needPositions: Position[]; wantPositions: Position[] }[] = [];
          for (const t of currentTeams) {
            if (t.id === initialState.userTeamId) continue;
            const rosterPlayers = currentPlayers.filter(p => p.teamId === t.id && !p.retired);
            if (rosterPlayers.length >= 56) continue;
            const capSpace = t.salaryCap - t.totalPayroll;
            if (capSpace < LEAGUE_MINIMUM_SALARY) continue;
            const needPositions: Position[] = [];
            const wantPositions: Position[] = [];
            for (const pos of POSITIONS) {
              const posPlayers = rosterPlayers.filter(p => p.position === pos);
              const count = posPlayers.length;
              const starterOvr = posPlayers.sort((a, b) => b.ratings.overall - a.ratings.overall)[0]?.ratings.overall ?? 0;
              if (count < ROSTER_LIMITS[pos].min) needPositions.push(pos);
              else if (count < ROSTER_LIMITS[pos].max && starterOvr < 78) wantPositions.push(pos);
              else if (count >= ROSTER_LIMITS[pos].min && ROSTER_LIMITS[pos].min >= 3) {
                const weakestStarter = posPlayers.sort((a, b) => a.ratings.overall - b.ratings.overall)[0];
                if (weakestStarter && weakestStarter.ratings.overall < 65) wantPositions.push(pos);
              }
            }
            const score = needPositions.length * 10 + wantPositions.length * 3 + (capSpace > 20 ? 5 : 0) + Math.random() * 5;
            if (needPositions.length > 0 || wantPositions.length > 0 || rosterPlayers.length < 53 || Math.random() < 0.4) {
              teamNeedScores.push({ teamId: t.id, score, needPositions, wantPositions });
            }
          }
          teamNeedScores.sort((a, b) => b.score - a.score);
          const teamsActing = teamNeedScores.slice(0, signingsThisDay);

          for (const { teamId: aiTeamId, needPositions, wantPositions } of teamsActing) {
            if (currentFreeAgents.length === 0) break;
            const teamData = currentTeams.find(t => t.id === aiTeamId);
            if (!teamData) continue;
            const capSpace = teamData.salaryCap - teamData.totalPayroll;

            const availableFAs = currentFreeAgents
              .map(id => currentPlayers.find(p => p.id === id))
              .filter((p): p is Player => !!p && !p.retired)
              .filter(p => {
                const sal = estimateSalary(p.ratings.overall, p.position, p.age, p.potential) * decay;
                return sal <= capSpace || (capSpace >= LEAGUE_MINIMUM_SALARY && sal <= LEAGUE_MINIMUM_SALARY * 2);
              })
              .sort((a, b) => {
                const aBonus = needPositions.includes(a.position) ? 200 : wantPositions.includes(a.position) ? 80 : 0;
                const bBonus = needPositions.includes(b.position) ? 200 : wantPositions.includes(b.position) ? 80 : 0;
                return (bBonus + b.ratings.overall) - (aBonus + a.ratings.overall);
              });

            const target = availableFAs[0];
            if (!target) continue;

            const marketSalary = estimateSalary(target.ratings.overall, target.position, target.age, target.potential) * decay;
            const aiSalary = Math.round(Math.max(LEAGUE_MINIMUM_SALARY, Math.min(marketSalary, capSpace)) * 10) / 10;
            const aiYears = target.age >= 32 ? 1 : target.age >= 28 ? 2 : 3;

            currentPlayers = currentPlayers.map(p =>
              p.id === target.id
                ? { ...p, teamId: aiTeamId, contract: { salary: aiSalary, yearsLeft: aiYears, guaranteed: generateGuaranteed(aiSalary, aiYears), totalYears: aiYears, offseasonSigned: true } }
                : p,
            );
            currentFreeAgents = currentFreeAgents.filter(id => id !== target.id);
            currentTeams = currentTeams.map(t => {
              if (t.id !== aiTeamId) return t;
              const chart = insertIntoDepthChart(t.depthChart, target.position, target.id, currentPlayers);
              return { ...t, roster: [...t.roster, target.id], totalPayroll: t.totalPayroll + aiSalary, depthChart: chart };
            });

            allNews.push(makeNews({
              season: initialState.season, week: initialState.week, type: 'signing',
              teamId: aiTeamId, playerIds: [target.id],
              headline: `${teamData.city} ${teamData.name} signed ${target.firstName} ${target.lastName} (${target.position}, ${target.ratings.overall} OVR) to a $${aiSalary}M/yr, ${aiYears}-year deal.`,
              isUserTeam: false,
            }));
          }

          currentDay = nextDay;
        }

        const userTeamData = currentTeams.find(t => t.id === initialState.userTeamId);
        const newRefusals = userTeamData ? computeFARefusals(currentFreeAgents, currentPlayers, userTeamData, currentDay) : [];

        set({
          faDay: currentDay,
          players: currentPlayers,
          teams: currentTeams,
          freeAgents: currentFreeAgents,
          faRefusals: newRefusals,
          newsItems: [...initialState.newsItems, ...allNews],
        });
      },

      signFreeAgent: (playerId: string, salary: number, years: number) => {
        const state = get();
        const userTeam = state.teams.find(t => t.id === state.userTeamId);
        const isMinimumSalary = salary <= LEAGUE_MINIMUM_SALARY;
        // Allow minimum salary signings even when over cap
        if (!isMinimumSalary && userTeam && userTeam.totalPayroll + salary > userTeam.salaryCap) {
          return false;
        }

        const player = state.players.find(p => p.id === playerId);

        // --- Step 1: Apply user signing to local variables ---
        const isOffseason = state.phase === 'freeAgency' || state.phase === 'resigning' || state.phase === 'draft';
        let currentPlayers = state.players.map(p =>
          p.id === playerId
            ? { ...p, teamId: state.userTeamId, contract: { salary, yearsLeft: years, guaranteed: generateGuaranteed(salary, years), totalYears: years, ...(isOffseason ? { offseasonSigned: true } : {}) } }
            : p,
        );
        let currentTeams = state.teams.map(t => {
          if (t.id !== state.userTeamId) return t;
          const chart = player ? insertIntoDepthChart(t.depthChart, player.position, playerId, currentPlayers) : t.depthChart;
          return { ...t, roster: [...t.roster, playerId], totalPayroll: t.totalPayroll + salary, depthChart: chart };
        });
        let currentFreeAgents = state.freeAgents.filter(id => id !== playerId);
        const allNews: NewsItem[] = [];

        if (player) {
          allNews.push(makeNews({
            season: state.season, week: state.week, type: 'signing',
            teamId: state.userTeamId, playerIds: [playerId],
            headline: `You signed ${player.firstName} ${player.lastName} (${player.position}) to a $${salary}M/yr deal.`,
            isUserTeam: true,
          }));
        }

        // --- Step 2: AI signings ---
        // During freeAgency phase, AI signings happen via advanceFADay (called below).
        // During regular season, do inline AI signings as before.
        if (state.phase !== 'freeAgency') {
          const aiTeamIds = currentTeams.filter(t => t.id !== state.userTeamId).map(t => t.id);
          const teamNeedScores: { teamId: string; score: number; needPositions: Position[]; wantPositions: Position[] }[] = [];
          for (const aiTeamId of aiTeamIds) {
            const teamData = currentTeams.find(t => t.id === aiTeamId);
            if (!teamData) continue;
            const rosterPlayers = currentPlayers.filter(p => p.teamId === aiTeamId && !p.retired);
            if (rosterPlayers.length >= 53) continue;
            const needPositions: Position[] = [];
            const wantPositions: Position[] = [];
            for (const pos of POSITIONS) {
              const count = rosterPlayers.filter(p => p.position === pos).length;
              const starterOvr = rosterPlayers.filter(p => p.position === pos).sort((a, b) => b.ratings.overall - a.ratings.overall)[0]?.ratings.overall ?? 0;
              if (count < ROSTER_LIMITS[pos].min) needPositions.push(pos);
              else if (count < ROSTER_LIMITS[pos].max && starterOvr < 70) wantPositions.push(pos);
            }
            const score = needPositions.length * 10 + wantPositions.length * 3 + Math.random() * 5;
            teamNeedScores.push({ teamId: aiTeamId, score, needPositions, wantPositions });
          }
          teamNeedScores.sort((a, b) => b.score - a.score);
          const teamsActingThisRound = teamNeedScores.slice(0, 5 + Math.floor(Math.random() * 4));
          for (const { teamId: aiTeamId, needPositions, wantPositions } of teamsActingThisRound) {
            if (currentFreeAgents.length === 0) break;
            const teamData = currentTeams.find(t => t.id === aiTeamId);
            if (!teamData) continue;
            const capSpace = teamData.salaryCap - teamData.totalPayroll;
            const availableFAs = currentFreeAgents
              .map(id => currentPlayers.find(p => p.id === id))
              .filter((p): p is Player => !!p && !p.retired)
              .filter(p => {
                const sal = estimateSalary(p.ratings.overall, p.position, p.age, p.potential);
                return sal <= capSpace || (capSpace >= LEAGUE_MINIMUM_SALARY && sal <= LEAGUE_MINIMUM_SALARY * 2);
              })
              .sort((a, b) => {
                const aBonus = needPositions.includes(a.position) ? 200 : wantPositions.includes(a.position) ? 80 : 0;
                const bBonus = needPositions.includes(b.position) ? 200 : wantPositions.includes(b.position) ? 80 : 0;
                return (bBonus + b.ratings.overall) - (aBonus + a.ratings.overall);
              });
            const target = availableFAs[0];
            if (!target) continue;
            const marketSalary = estimateSalary(target.ratings.overall, target.position, target.age, target.potential);
            const aiSalary = marketSalary <= capSpace ? marketSalary : LEAGUE_MINIMUM_SALARY;
            const aiYears = target.age >= 32 ? 1 : target.age >= 28 ? 2 : 3;
            // Regular season AI signing — no offseasonSigned flag (season is already in progress)
            currentPlayers = currentPlayers.map(p =>
              p.id === target.id
                ? { ...p, teamId: aiTeamId, contract: { salary: aiSalary, yearsLeft: aiYears, guaranteed: generateGuaranteed(aiSalary, aiYears), totalYears: aiYears } }
                : p,
            );
            currentFreeAgents = currentFreeAgents.filter(id => id !== target.id);
            currentTeams = currentTeams.map(t => {
              if (t.id !== aiTeamId) return t;
              const chart = insertIntoDepthChart(t.depthChart, target.position, target.id, currentPlayers);
              return { ...t, roster: [...t.roster, target.id], totalPayroll: t.totalPayroll + aiSalary, depthChart: chart };
            });
            allNews.push(makeNews({
              season: state.season, week: state.week, type: 'signing',
              teamId: aiTeamId, playerIds: [target.id],
              headline: `${teamData.city} ${teamData.name} signed ${target.firstName} ${target.lastName} (${target.position}, ${target.ratings.overall} OVR) to a $${aiSalary}M/yr, ${aiYears}-year deal.`,
              isUserTeam: false,
            }));
          }
        }

        // --- Single set() call with user signing (+ AI signings if regular season) ---
        set({
          players: currentPlayers,
          teams: currentTeams,
          freeAgents: currentFreeAgents,
          newsItems: [...state.newsItems, ...allNews],
        });

        // During freeAgency, advance one day (triggers AI signings via advanceFADay)
        if (state.phase === 'freeAgency') {
          get().advanceFADay();
        }

        return true;
      },

      /** AI teams sign free agents — standalone version for non-user-triggered signings */
      aiSignFreeAgents: () => {
        // This is now primarily handled inline in signFreeAgent.
        // Kept as a no-op for backward compatibility.
      },

      releasePlayer: (playerId: string) => {
        const state = get();
        const player = state.players.find(p => p.id === playerId);
        if (!player || player.teamId !== state.userTeamId) return;

        // Ensure guaranteed is set (handles old saves where it might be missing)
        const contract = { ...player.contract };
        if (contract.guaranteed === undefined || contract.guaranteed === null) {
          contract.guaranteed = generateGuaranteed(contract.salary, contract.yearsLeft);
        }

        // Use V2 functions that handle restructured contracts (accelerated prorated bonus)
        const deadCap = calculateDeadCapV2(contract);
        const capHit = getCapHit(contract);
        const capSavings = capHit - deadCap;

        const unamortizedBonus = getUnamortizedBonus(contract);
        const bonusNote = unamortizedBonus > 0
          ? ` (includes $${Math.round(unamortizedBonus * 10) / 10}M accelerated bonus)`
          : '';
        const deadCapNote = deadCap > 0
          ? ` Dead cap hit: $${Math.round(deadCap * 10) / 10}M${bonusNote}. Cap savings: $${capSavings > 0 ? Math.round(capSavings * 10) / 10 : 0}M.`
          : ` Saves $${capHit}M/yr cap space.`;

        const releaseNews = makeNews({
          season: state.season,
          week: state.week,
          type: 'release',
          teamId: state.userTeamId,
          playerIds: [playerId],
          headline: `You released ${player.firstName} ${player.lastName} (${player.position}).${deadCapNote}`,
          isUserTeam: true,
        });

        const updatedTeams = state.teams.map(t => {
          if (t.id !== state.userTeamId) return t;
          const chart = { ...t.depthChart };
          chart[player.position] = (chart[player.position] ?? []).filter(id => id !== playerId);

          // Dead cap: remove full salary but add dead cap charge
          const actualSavings = Math.max(0, capSavings);
          const existingDeadCap = t.deadCap ?? [];
          const newDeadCap: DeadCapEntry[] = deadCap > 0
            ? [...existingDeadCap, {
                playerName: `${player.firstName} ${player.lastName}`,
                amount: Math.round(deadCap * 10) / 10,
                yearsLeft: 1,
                source: 'release' as const,
                season: state.season,
              }]
            : existingDeadCap;

          return {
            ...t,
            roster: t.roster.filter(id => id !== playerId),
            totalPayroll: Math.max(0, t.totalPayroll - actualSavings),
            depthChart: chart,
            deadCap: newDeadCap,
          };
        });

        set({
          players: state.players.map(p =>
            p.id === playerId
              ? { ...p, teamId: null, onIR: false, contract: { salary: contract.salary, yearsLeft: contract.yearsLeft, guaranteed: contract.guaranteed, totalYears: contract.totalYears } }
              : p,
          ),
          teams: updatedTeams,
          freeAgents: [...state.freeAgents, playerId],
          newsItems: [...state.newsItems, releaseNews],
        });
      },

      restructureContract: (playerId: string, conversionAmount: number, voidYearsToAdd: number) => {
        const state = get();
        const player = state.players.find(p => p.id === playerId);
        if (!player || player.teamId !== state.userTeamId) return false;
        // Prevent restructuring the same player more than once per season
        if (player.lastRestructuredSeason === state.season) return false;

        const contract = { ...player.contract };
        const leagueMin = state.leagueSettings?.leagueMinSalary ?? LEAGUE_MINIMUM_SALARY;

        // Must have 2+ real years remaining (excluding existing void years)
        const realYears = contract.contractYears
          ? contract.contractYears.filter(y => !y.isVoidYear).length
          : contract.yearsLeft;
        if (realYears < 2) return false;

        // Cannot exceed 3 total void years on a contract
        const existingVoidYears = contract.voidYears ?? 0;
        if (existingVoidYears + voidYearsToAdd > 3) return false;

        // Materialize contractYears from flat model if needed
        let years: ContractYear[] = contract.contractYears
          ? contract.contractYears.map(y => ({ ...y }))
          : materializeContractYears(contract);

        // Validate conversion amount
        const currentBase = years[0].baseSalary;
        const maxConversion = Math.max(0, currentBase - leagueMin);
        if (conversionAmount < 1 || conversionAmount > maxConversion) return false;

        // Add void years to the end
        for (let i = 0; i < voidYearsToAdd; i++) {
          years.push({ baseSalary: 0, proratedBonus: 0, isVoidYear: true });
        }

        // Calculate prorated amount per year (spread across ALL remaining years including void)
        const totalYearsForProration = years.length;
        const proratedPerYear = Math.round((conversionAmount / totalYearsForProration) * 100) / 100;

        // Reduce current year base salary and add prorated bonus to all years
        years[0] = { ...years[0], baseSalary: years[0].baseSalary - conversionAmount };
        for (let i = 0; i < years.length; i++) {
          years[i] = { ...years[i], proratedBonus: years[i].proratedBonus + proratedPerYear };
        }

        const oldCapHit = getCapHit(player.contract);
        const newCapHit = Math.round((years[0].baseSalary + years[0].proratedBonus) * 100) / 100;
        const capDelta = newCapHit - oldCapHit; // negative = savings

        const newContract = {
          ...contract,
          salary: newCapHit, // Keep salary in sync for backward compat
          yearsLeft: years.length,
          contractYears: years,
          voidYears: existingVoidYears + voidYearsToAdd,
          restructureHistory: [
            ...(contract.restructureHistory ?? []),
            {
              season: state.season,
              amountConverted: conversionAmount,
              voidYearsAdded: voidYearsToAdd,
              proratedPerYear,
            } as ContractRestructure,
          ],
        };

        const capSaved = Math.round(Math.abs(capDelta) * 10) / 10;
        const voidNote = voidYearsToAdd > 0 ? ` Added ${voidYearsToAdd} void year${voidYearsToAdd > 1 ? 's' : ''}.` : '';

        set({
          players: state.players.map(p =>
            p.id === playerId
              ? { ...p, lastRestructuredSeason: state.season, contract: newContract }
              : p,
          ),
          teams: state.teams.map(t =>
            t.id === state.userTeamId
              ? { ...t, totalPayroll: Math.max(0, t.totalPayroll + capDelta) }
              : t,
          ),
          newsItems: [...state.newsItems, makeNews({
            season: state.season, week: state.week, type: 'signing',
            teamId: state.userTeamId, playerIds: [playerId],
            headline: `You restructured ${player.firstName} ${player.lastName}'s contract, converting $${conversionAmount}M to signing bonus. Saves $${capSaved}M this year.${voidNote}`,
            isUserTeam: true,
          })],
        });

        return true;
      },

      placeOnIR: (playerId: string) => {
        const state = get();
        const player = state.players.find(p => p.id === playerId);
        if (!player || player.teamId !== state.userTeamId) return;
        if (!player.injury || player.injury.weeksLeft < 4) return;
        set({
          players: state.players.map(p =>
            p.id === playerId ? { ...p, onIR: true } : p,
          ),
        });
      },

      activateFromIR: (playerId: string) => {
        const state = get();
        const player = state.players.find(p => p.id === playerId);
        if (!player || !player.onIR) return;
        if (player.injury && player.injury.weeksLeft > 2) return;
        set({
          players: state.players.map(p =>
            p.id === playerId ? { ...p, onIR: false } : p,
          ),
        });
      },

      // PRD-04: Execute a trade
      executeTrade: (
        offeredPlayerIds,
        offeredPickIds,
        receivedPlayerIds,
        receivedPickIds,
        counterpartTeamId,
        skipValueCheck,
      ) => {
        const state = get();
        // Trade deadline only applies during regular season; offseason trades always allowed
        const offseasonPhases = ['resigning', 'draft', 'freeAgency', 'offseason', 'preseason'];
        if (state.phase === 'regular' && state.week > 12) return false;
        if (state.phase === 'playoffs') return false; // No trades during playoffs

        const userTeam = state.teams.find(t => t.id === state.userTeamId);
        const aiTeam = state.teams.find(t => t.id === counterpartTeamId);
        if (!userTeam || !aiTeam) return false;

        // Evaluate trade values
        const offeredValue = offeredPlayerIds.reduce((sum, id) => {
          const p = state.players.find(pl => pl.id === id);
          return sum + (p ? playerTradeValue(p) : 0);
        }, 0) + offeredPickIds.reduce((sum, id) => {
          const pick = userTeam.draftPicks.find(pk => pk.id === id);
          return sum + (pick ? pickTradeValue(pick, state.season) : 0);
        }, 0);

        const receivedValue = receivedPlayerIds.reduce((sum, id) => {
          const p = state.players.find(pl => pl.id === id);
          return sum + (p ? playerTradeValue(p) : 0);
        }, 0) + receivedPickIds.reduce((sum, id) => {
          const pick = aiTeam.draftPicks.find(pk => pk.id === id);
          return sum + (pick ? pickTradeValue(pick, state.season) : 0);
        }, 0);

        // AI accepts if within 10% value (skip for AI-initiated proposals already approved)
        if (!skipValueCheck && offeredValue < receivedValue * 0.90) return false;

        // Block trades that would push user over the salary cap
        const offeredSalaryTotal = offeredPlayerIds.reduce((sum, id) => {
          const p = state.players.find(pl => pl.id === id);
          return sum + (p ? p.contract.salary : 0);
        }, 0);
        const receivedSalaryTotal = receivedPlayerIds.reduce((sum, id) => {
          const p = state.players.find(pl => pl.id === id);
          return sum + (p ? p.contract.salary : 0);
        }, 0);
        const newPayroll = userTeam.totalPayroll - offeredSalaryTotal + receivedSalaryTotal;
        if (newPayroll > userTeam.salaryCap) {
          return false;
        }

        // Execute the trade
        const offeredPlayerIdsSet = new Set(offeredPlayerIds);
        const receivedPlayerIdsSet = new Set(receivedPlayerIds);
        const offeredPickIdsSet = new Set(offeredPickIds);
        const receivedPickIdsSet = new Set(receivedPickIds);

        // Calculate dead money from restructured players being traded away
        // When trading a restructured player, the sending team eats the unamortized bonus as dead cap
        const userDeadCapEntries: DeadCapEntry[] = [];
        const aiDeadCapEntries: DeadCapEntry[] = [];

        // Dead cap for players user is sending out
        for (const id of offeredPlayerIds) {
          const p = state.players.find(pl => pl.id === id);
          if (p && p.contract.contractYears) {
            const bonus = getUnamortizedBonus(p.contract);
            if (bonus > 0) {
              userDeadCapEntries.push({
                playerName: `${p.firstName} ${p.lastName}`,
                amount: Math.round(bonus * 10) / 10,
                yearsLeft: 1,
                source: 'trade',
                season: state.season,
              });
            }
          }
        }

        // Dead cap for players AI is sending out
        for (const id of receivedPlayerIds) {
          const p = state.players.find(pl => pl.id === id);
          if (p && p.contract.contractYears) {
            const bonus = getUnamortizedBonus(p.contract);
            if (bonus > 0) {
              aiDeadCapEntries.push({
                playerName: `${p.firstName} ${p.lastName}`,
                amount: Math.round(bonus * 10) / 10,
                yearsLeft: 1,
                source: 'trade',
                season: state.season,
              });
            }
          }
        }

        // Strip prorated bonus from traded players (receiving team gets base salary only)
        const updatedPlayers = state.players.map(p => {
          if (offeredPlayerIdsSet.has(p.id)) {
            const cleanContract = p.contract.contractYears
              ? {
                  ...p.contract,
                  salary: p.contract.contractYears[0].baseSalary,
                  contractYears: p.contract.contractYears.filter(y => !y.isVoidYear).map(y => ({
                    ...y, proratedBonus: 0,
                  })),
                  yearsLeft: p.contract.contractYears.filter(y => !y.isVoidYear).length,
                  voidYears: 0,
                  restructureHistory: undefined,
                }
              : p.contract;
            return { ...p, teamId: counterpartTeamId, contract: cleanContract };
          }
          if (receivedPlayerIdsSet.has(p.id)) {
            const cleanContract = p.contract.contractYears
              ? {
                  ...p.contract,
                  salary: p.contract.contractYears[0].baseSalary,
                  contractYears: p.contract.contractYears.filter(y => !y.isVoidYear).map(y => ({
                    ...y, proratedBonus: 0,
                  })),
                  yearsLeft: p.contract.contractYears.filter(y => !y.isVoidYear).length,
                  voidYears: 0,
                  restructureHistory: undefined,
                }
              : p.contract;
            return { ...p, teamId: state.userTeamId, contract: cleanContract };
          }
          return p;
        });

        const offeredSalary = offeredPlayerIds.reduce((sum, id) => {
          const p = state.players.find(pl => pl.id === id);
          return sum + (p?.contract.salary ?? 0);
        }, 0);
        const receivedSalary = receivedPlayerIds.reduce((sum, id) => {
          const p = state.players.find(pl => pl.id === id);
          return sum + (p?.contract.salary ?? 0);
        }, 0);

        // Calculate dead money impact on payroll
        const userDeadCapTotal = userDeadCapEntries.reduce((s, e) => s + e.amount, 0);
        const aiDeadCapTotal = aiDeadCapEntries.reduce((s, e) => s + e.amount, 0);

        const updatedTeams = state.teams.map(t => {
          if (t.id === state.userTeamId) {
            const newRoster = [
              ...t.roster.filter(id => !offeredPlayerIdsSet.has(id)),
              ...receivedPlayerIds,
            ];
            const newPicks = [
              ...t.draftPicks.filter(pk => !offeredPickIdsSet.has(pk.id)),
              ...aiTeam.draftPicks.filter(pk => receivedPickIdsSet.has(pk.id)).map(pk => ({
                ...pk, ownerTeamId: state.userTeamId,
              })),
            ];
            // Rebuild depth chart for user team
            const allPlayers = updatedPlayers.filter(p => newRoster.includes(p.id));
            return {
              ...t,
              roster: newRoster,
              draftPicks: newPicks,
              totalPayroll: t.totalPayroll - offeredSalary + receivedSalary + userDeadCapTotal,
              depthChart: buildDefaultDepthChart(allPlayers),
              deadCap: [...(t.deadCap ?? []), ...userDeadCapEntries],
            };
          }
          if (t.id === counterpartTeamId) {
            const newRoster = [
              ...t.roster.filter(id => !receivedPlayerIdsSet.has(id)),
              ...offeredPlayerIds,
            ];
            const newPicks = [
              ...t.draftPicks.filter(pk => !receivedPickIdsSet.has(pk.id)),
              ...userTeam.draftPicks.filter(pk => offeredPickIdsSet.has(pk.id)).map(pk => ({
                ...pk, ownerTeamId: counterpartTeamId,
              })),
            ];
            return {
              ...t,
              roster: newRoster,
              draftPicks: newPicks,
              totalPayroll: t.totalPayroll - receivedSalary + offeredSalary + aiDeadCapTotal,
              deadCap: [...(t.deadCap ?? []), ...aiDeadCapEntries],
            };
          }
          return t;
        });

        const tradeNews = makeNews({
          season: state.season,
          week: state.week,
          type: 'trade',
          teamId: state.userTeamId,
          playerIds: [...offeredPlayerIds, ...receivedPlayerIds],
          headline: `Trade: You send ${offeredPlayerIds.length > 0 ? offeredPlayerIds.map(id => state.players.find(p => p.id === id)?.lastName ?? '?').join(', ') : 'picks'} to ${aiTeam.abbreviation} for ${receivedPlayerIds.length > 0 ? receivedPlayerIds.map(id => state.players.find(p => p.id === id)?.lastName ?? '?').join(', ') : 'picks'}.`,
          isUserTeam: true,
        });

        set({
          players: updatedPlayers,
          teams: updatedTeams,
          newsItems: [...state.newsItems, tradeNews],
        });

        return true;
      },

      respondToTradeProposal: (proposalId: string, accept: boolean) => {
        const state = get();
        const proposal = state.tradeProposals.find(p => p.id === proposalId);
        if (!proposal || proposal.status !== 'pending') return false;

        // Guard: verify requested players still on user team
        const requestedPlayersValid = proposal.requestedPlayerIds.every(pid => {
          const p = state.players.find(pl => pl.id === pid);
          return p && p.teamId === state.userTeamId;
        });
        if (!requestedPlayersValid) {
          set({
            tradeProposals: state.tradeProposals.map(p =>
              p.id === proposalId ? { ...p, status: 'rejected' } : p,
            ),
          });
          return false;
        }

        if (!accept) {
          set({
            tradeProposals: state.tradeProposals.map(p =>
              p.id === proposalId ? { ...p, status: 'rejected' } : p,
            ),
          });
          return true;
        }

        // In the proposal, "offered" = what AI offers to user, "requested" = what AI wants from user.
        // executeTrade expects (userOfferedPlayers, userOfferedPicks, userReceivedPlayers, userReceivedPicks, counterpart).
        // So: user is offering the "requested" players and receiving the "offered" players.
        // skipValueCheck=true because the AI already approved this trade when it proposed it.
        const success = get().executeTrade(
          proposal.requestedPlayerIds,
          proposal.requestedPickIds,
          proposal.offeredPlayerIds,
          proposal.offeredPickIds,
          proposal.proposingTeamId,
          true, // skip AI value check — AI already proposed this
        );

        set({
          tradeProposals: state.tradeProposals.map(p =>
            p.id === proposalId ? { ...p, status: accept && success ? 'accepted' : 'rejected' } : p,
          ),
        });

        return success;
      },

      rejectAllTradeProposals: () => {
        const state = get();
        const pending = state.tradeProposals.filter(p => p.status === 'pending');
        if (pending.length === 0) return;
        set({
          tradeProposals: state.tradeProposals.map(p =>
            p.status === 'pending' ? { ...p, status: 'rejected' } : p,
          ),
        });
      },

      solicitTradingBlockProposals: (blockedPlayerIds: string[], blockedPickIds: string[], seekPositions: Position[], seekDraftPicks?: boolean) => {
        const state = get();
        // Block during playoffs and past in-season trade deadline
        if (state.phase === 'playoffs') return;
        if (state.phase === 'regular' && state.week > 12) return;

        const blockedPlayers = blockedPlayerIds
          .map(id => state.players.find(p => p.id === id))
          .filter((p): p is Player => !!p && p.teamId === state.userTeamId);
        const userTeam = state.teams.find(t => t.id === state.userTeamId);
        const blockedPicks = blockedPickIds
          .map(id => userTeam?.draftPicks.find(pk => pk.id === id))
          .filter((pk): pk is DraftPick => !!pk);

        if (blockedPlayers.length === 0 && blockedPicks.length === 0) return;

        const totalBlockedValue = blockedPlayers.reduce((s, p) => s + playerTradeValue(p), 0)
          + blockedPicks.reduce((s, pk) => s + pickTradeValue(pk, state.season), 0);

        if (totalBlockedValue < 10) return;

        const blockedPositions = new Set(blockedPlayers.map(p => p.position));
        const seekPosSet = new Set(seekPositions);
        const hasPosPreference = seekPosSet.size > 0;
        const proposals: TradeProposal[] = [];

        const aiTeams = state.teams.filter(t => t.id !== state.userTeamId);
        const shuffledTeams = [...aiTeams].sort(() => Math.random() - 0.5);

        for (const aiTeam of shuffledTeams) {
          if (proposals.length >= 8) break; // cap at 8 proposals

          const aiRoster = state.players.filter(p => p.teamId === aiTeam.id && !p.retired && !p.injury);

          // Interest check: 70% of teams consider it (higher than before for more variety)
          if (Math.random() > 0.70) continue;

          const offeredPlayerIds: string[] = [];
          const offeredPickIds: string[] = [];
          let offeredValue = 0;
          const targetMin = totalBlockedValue * 0.75;
          const hardCeiling = totalBlockedValue * 2.0;

          const aiPicks = aiTeam.draftPicks
            .filter(pk => pk.year >= state.season && !pk.playerId)
            .sort((a, b) => pickTradeValue(b, state.season) - pickTradeValue(a, state.season));

          // ── Build offer based on what user WANTS ──

          // Step 1: If user wants draft picks, lead with picks
          if (seekDraftPicks) {
            for (const pk of aiPicks) {
              if (offeredValue >= targetMin) break;
              const pv = pickTradeValue(pk, state.season);
              if (offeredValue + pv > hardCeiling) continue;
              offeredPickIds.push(pk.id);
              offeredValue += pv;
            }
          }

          // Step 2: If user specified positions, offer ONLY those positions
          if (hasPosPreference) {
            const seekCandidates = aiRoster
              .filter(p => seekPosSet.has(p.position))
              .sort((a, b) => b.ratings.overall - a.ratings.overall);

            for (const candidate of seekCandidates) {
              if (offeredValue >= targetMin) break;
              const v = playerTradeValue(candidate);
              if (offeredValue + v > hardCeiling) continue;
              offeredPlayerIds.push(candidate.id);
              offeredValue += v;
            }

            // If user specified positions, don't fall back to random positions —
            // skip this team if they can't provide what user wants
            if (offeredPlayerIds.length === 0 && !seekDraftPicks) continue;
          }

          // Step 3: If no preferences specified (or picks-only preference already filled),
          // use general candidates to fill remaining value
          if (!hasPosPreference && !seekDraftPicks) {
            const allCandidates = aiRoster
              .filter(p => !blockedPositions.has(p.position))
              .sort((a, b) => b.ratings.overall - a.ratings.overall);

            for (const candidate of allCandidates) {
              if (offeredValue >= targetMin) break;
              if (offeredPlayerIds.includes(candidate.id)) continue;
              const v = playerTradeValue(candidate);
              if (offeredValue + v > hardCeiling) continue;
              offeredPlayerIds.push(candidate.id);
              offeredValue += v;
            }
          }

          // Step 4: Supplement with picks if value still short (and user didn't exclude them)
          if (offeredValue < targetMin && !seekDraftPicks) {
            for (const pk of aiPicks) {
              if (offeredValue >= targetMin) break;
              const pv = pickTradeValue(pk, state.season);
              if (offeredValue + pv > hardCeiling) continue;
              offeredPickIds.push(pk.id);
              offeredValue += pv;
            }
          }

          if (offeredValue < targetMin * 0.5) continue;
          if (offeredPlayerIds.length === 0 && offeredPickIds.length === 0) continue;
          if (offeredValue > hardCeiling) continue;

          const ratio = offeredValue / Math.max(1, totalBlockedValue);
          const valueAssessment: TradeProposal['valueAssessment'] =
            ratio > 1.05 ? 'lopsided-you-win' :
            ratio >= 0.95 ? 'fair' : 'lopsided-they-win';

          proposals.push({
            id: uuid(),
            season: state.season,
            week: state.week,
            proposingTeamId: aiTeam.id,
            offeredPlayerIds,
            offeredPickIds,
            requestedPlayerIds: blockedPlayerIds,
            requestedPickIds: blockedPickIds,
            status: 'pending',
            valueAssessment,
          });
        }

        // Clear old pending proposals from trading block and add new ones
        const existingNonPending = state.tradeProposals.filter(p => p.status !== 'pending');
        set({ tradeProposals: [...existingNonPending, ...proposals] });
      },

      // PRD-07: Set scouting level
      setScoutingLevel: (level: 0 | 1 | 2) => {
        const state = get();
        // Recompute scouting data at the new level
        const prospects = state.freeAgents
          .map(id => state.players.find(p => p.id === id))
          .filter((p): p is Player => !!p);
        const newScoutingData = computeScoutingData(prospects, level);
        // Preserve deep-scouted entries (don't overwrite them)
        const merged = { ...newScoutingData };
        for (const [pid, existing] of Object.entries(state.draftScoutingData)) {
          if (existing.deepScouted) {
            merged[pid] = existing; // keep deep-scouted as-is
          }
        }
        set({ scoutingLevel: level, draftScoutingData: merged });
      },

      // PRD-07: Deep scout a prospect
      deepScoutPlayer: (playerId: string) => {
        const state = get();
        const scoutData = state.draftScoutingData[playerId];
        if (!scoutData) return;

        const deepScoutedCount = Object.values(state.draftScoutingData).filter(d => d.deepScouted).length;
        // Deep scout limit is enforced on the UI side based on subscription tier

        set({
          draftScoutingData: {
            ...state.draftScoutingData,
            [playerId]: { ...scoutData, deepScouted: true, error: Math.ceil(scoutData.error / 2) },
          },
        });
      },

      // PRD-13: Reorder depth chart position
      reorderDepthChart: (position: Position, playerIds: string[]) => {
        const state = get();
        const updatedTeams = state.teams.map(t => {
          if (t.id !== state.userTeamId) return t;
          return {
            ...t,
            depthChart: { ...t.depthChart, [position]: playerIds },
          };
        });
        set({ teams: updatedTeams });
      },

      // PRD-13: Reset depth chart position to OVR order
      resetDepthChart: (position: Position) => {
        const state = get();
        const updatedTeams = state.teams.map(t => {
          if (t.id !== state.userTeamId) return t;
          const sorted = state.players
            .filter(p => p.teamId === state.userTeamId && p.position === position)
            .sort((a, b) => b.ratings.overall - a.ratings.overall)
            .map(p => p.id);
          return {
            ...t,
            depthChart: { ...t.depthChart, [position]: sorted },
          };
        });
        set({ teams: updatedTeams });
      },

      startNewSeason: () => {
        const state = get();
        const newSeason = state.season + 1;
        const previouslyRetiredIds = new Set(state.players.filter(p => p.retired).map(p => p.id));

        const awards = computeSeasonAwards(state);
        const userTeamObj = state.teams.find(t => t.id === state.userTeamId);

        let userPlayoffResult: import('@/types').SeasonSummary['userPlayoffResult'] = 'missed';
        if (state.playoffBracket && state.playoffSeeds) {
          const userInPlayoffs = Object.values(state.playoffSeeds).flat().includes(state.userTeamId);
          if (userInPlayoffs) {
            const sbGame = state.playoffBracket.find(m => m.id === 'championship');
            const confGames = state.playoffBracket.filter(m => m.round === 3);
            const divGames = state.playoffBracket.filter(m => m.round === 2);

            if (sbGame?.winnerId === state.userTeamId) userPlayoffResult = 'champion';
            else if (sbGame?.homeTeamId === state.userTeamId || sbGame?.awayTeamId === state.userTeamId) userPlayoffResult = 'runnerup';
            else if (confGames.some(m => m.homeTeamId === state.userTeamId || m.awayTeamId === state.userTeamId)) userPlayoffResult = 'conference';
            else if (divGames.some(m => m.homeTeamId === state.userTeamId || m.awayTeamId === state.userTeamId)) userPlayoffResult = 'divisional';
            else userPlayoffResult = 'wildcard';
          }
        }

        const champion = state.champions.find(c => c.season === state.season);

        // Best record per conference (before records reset)
        const acTeams = state.teams.filter(t => t.conference === 'AC');
        const ncTeams = state.teams.filter(t => t.conference === 'NC');
        const bestAc = acTeams.sort((a, b) => b.record.wins - a.record.wins || a.record.losses - b.record.losses)[0];
        const bestNc = ncTeams.sort((a, b) => b.record.wins - a.record.wins || a.record.losses - b.record.losses)[0];

        // All-League teams
        const { first: allLeagueFirst, second: allLeagueSecond, allRookie: allRookieTeam } = computeAllLeagueTeams(state);

        const newSummary: import('@/types').SeasonSummary = {
          season: state.season,
          championTeamId: champion?.teamId ?? '',
          finalsMvpId: state.finalsMvpPlayerId ?? '',
          finalsMvpGameStats: (() => {
            const sbGame = state.schedule.find(g => g.id === 'championship' && g.played);
            return sbGame && state.finalsMvpPlayerId ? sbGame.playerStats[state.finalsMvpPlayerId] : undefined;
          })(),
          awards,
          bestRecord: {
            ac: { teamId: bestAc?.id ?? '', wins: bestAc?.record.wins ?? 0, losses: bestAc?.record.losses ?? 0 },
            nc: { teamId: bestNc?.id ?? '', wins: bestNc?.record.wins ?? 0, losses: bestNc?.record.losses ?? 0 },
          },
          allLeagueFirst,
          allLeagueSecond,
          allRookieTeam,
          retiredPlayers: [], // populated after development runs below
          statLeaders: {
            passYards: (() => {
              const top = state.players.reduce((best, p) =>
                p.stats.passYards > (best?.stats.passYards ?? 0) ? p : best, state.players[0]);
              return top ? { playerId: top.id, value: top.stats.passYards } : { playerId: '', value: 0 };
            })(),
            rushYards: (() => {
              const top = state.players.reduce((best, p) =>
                p.stats.rushYards > (best?.stats.rushYards ?? 0) ? p : best, state.players[0]);
              return top ? { playerId: top.id, value: top.stats.rushYards } : { playerId: '', value: 0 };
            })(),
            sacks: (() => {
              const top = state.players.reduce((best, p) =>
                p.stats.sacks > (best?.stats.sacks ?? 0) ? p : best, state.players[0]);
              return top ? { playerId: top.id, value: top.stats.sacks } : { playerId: '', value: 0 };
            })(),
          },
          userRecord: {
            wins: userTeamObj?.record.wins ?? 0,
            losses: userTeamObj?.record.losses ?? 0,
          },
          userPlayoffResult,
        };

        const agedPlayers = state.players.map(p => {
          if (p.retired) return p;

          if (p.teamId === null) {
            const isFutureProspect =
              p.draftYear !== null && p.draftYear >= newSeason && p.experience === 0;
            if (!isFutureProspect) {
              return { ...p, retired: true, stats: emptyStats() };
            }
          }

          const isUnsignedFutureProspect =
            p.teamId === null &&
            p.contract.yearsLeft <= 0 &&
            p.draftYear !== null &&
            p.draftYear >= newSeason;

          // Advance contractYears: pop index 0, shift everything forward
          // Skip decrement for contracts signed this offseason (offseasonSigned flag)
          let advancedContract = p.contract;
          if (!isUnsignedFutureProspect) {
            if (p.contract.offseasonSigned) {
              // Just clear the flag — don't decrement. This contract hasn't had a season played yet.
              advancedContract = { ...p.contract, offseasonSigned: undefined };
            } else {
              const newYearsLeft = p.contract.yearsLeft - 1;
              if (p.contract.contractYears && p.contract.contractYears.length > 1) {
                const advancedYears = p.contract.contractYears.slice(1);
                const newYr0 = advancedYears[0];
                advancedContract = {
                  ...p.contract,
                  yearsLeft: newYearsLeft,
                  salary: Math.round((newYr0.baseSalary + newYr0.proratedBonus) * 100) / 100,
                  contractYears: advancedYears,
                  guaranteed: p.contract.yearsLeft > 1 && p.contract.guaranteed
                    ? Math.round(((p.contract.guaranteed / p.contract.yearsLeft) * (p.contract.yearsLeft - 1)) * 10) / 10
                    : 0,
                };
              } else {
                advancedContract = {
                  ...p.contract,
                  yearsLeft: newYearsLeft,
                  // Clear contractYears if only 1 year was left
                  contractYears: undefined,
                  voidYears: undefined,
                  restructureHistory: undefined,
                  guaranteed: p.contract.yearsLeft > 1 && p.contract.guaranteed
                    ? Math.round(((p.contract.guaranteed / p.contract.yearsLeft) * (p.contract.yearsLeft - 1)) * 10) / 10
                    : 0,
                };
              }
            }
          }

          return {
            ...p,
            age: p.age + 1,
            experience: isUnsignedFutureProspect ? 0 : p.experience + 1,
            stats: emptyStats(),
            injury: null,
            onIR: false,
            contract: advancedContract,
          };
        });

        const devSettings = state.leagueSettings ?? DEFAULT_LEAGUE_SETTINGS;
        const developedPlayers = developPlayers(
          agedPlayers,
          state.season,
          devSettings.progressionRate / 100,
          devSettings.regressionRate / 100,
        );

        const retirementNews: NewsItem[] = developedPlayers
          .filter(p => p.retired && !previouslyRetiredIds.has(p.id))
          .filter(p => p.ratings.overall >= 70)
          .map(p => makeNews({
            season: state.season,
            week: 0,
            type: 'milestone',
            playerIds: [p.id],
            headline: `${p.firstName} ${p.lastName} announces retirement after ${p.experience} season${p.experience !== 1 ? 's' : ''}.`,
            isUserTeam: false,
          }));

        const newlyRetiredOnTeam = developedPlayers.filter(
          p => p.retired && !previouslyRetiredIds.has(p.id) && p.teamId !== null,
        );
        const newlyRetiredOnTeamIds = new Set(newlyRetiredOnTeam.map(p => p.id));

        // Process void years: players whose new year-0 is a void year have their contracts voided
        const voidYearPlayers: { player: typeof developedPlayers[0]; deadCapAmount: number }[] = [];
        for (const p of developedPlayers) {
          if (
            p.teamId &&
            !p.retired &&
            p.contract.contractYears &&
            p.contract.contractYears.length > 0 &&
            p.contract.contractYears[0].isVoidYear
          ) {
            // All remaining prorated bonus accelerates into dead money
            const remainingBonus = getUnamortizedBonus(p.contract);
            voidYearPlayers.push({ player: p, deadCapAmount: Math.round(remainingBonus * 10) / 10 });
          }
        }
        const voidPlayerIds = new Set(voidYearPlayers.map(v => v.player.id));

        // Generate void year news
        const voidNews: NewsItem[] = voidYearPlayers
          .filter(v => v.deadCapAmount > 0)
          .map(v => makeNews({
            season: newSeason,
            week: 0,
            type: 'signing',
            teamId: v.player.teamId!,
            playerIds: [v.player.id],
            headline: `${v.player.firstName} ${v.player.lastName}'s contract voided — $${v.deadCapAmount}M dead money.`,
            isUserTeam: v.player.teamId === state.userTeamId,
          }));

        // Update void players: remove from team, clear contract
        const afterVoidPlayers = developedPlayers.map(p => {
          if (voidPlayerIds.has(p.id)) {
            return {
              ...p,
              teamId: null,
              contract: { salary: 0, yearsLeft: 0, guaranteed: 0, totalYears: 0 },
            };
          }
          return p;
        });

        // Identify players whose contracts expired (yearsLeft hit 0 after decrement)
        // These should be properly released from their teams
        const expiredContractPlayers = afterVoidPlayers.filter(
          p => p.teamId && !p.retired && !voidPlayerIds.has(p.id) && p.contract.yearsLeft <= 0,
        );
        const expiredContractIds = new Set(expiredContractPlayers.map(p => p.id));

        const newTeams = state.teams.map(t => {
          const retiredFromTeam = newlyRetiredOnTeam.filter(p => t.roster.includes(p.id));
          const salaryReduction = retiredFromTeam.reduce((sum, p) => sum + p.contract.salary, 0);
          // Also remove voided players from roster
          const voidedFromTeam = voidYearPlayers.filter(v => t.roster.includes(v.player.id));
          const voidSalaryReduction = voidedFromTeam.reduce((sum, v) => sum + getCapHit(v.player.contract), 0);
          // Remove expired contract players from roster
          const expiredFromTeam = expiredContractPlayers.filter(p => t.roster.includes(p.id));
          const expiredSalaryReduction = expiredFromTeam.reduce((sum, p) => sum + p.contract.salary, 0);
          const voidDeadCapNew: DeadCapEntry[] = voidedFromTeam
            .filter(v => v.deadCapAmount > 0)
            .map(v => ({
              playerName: `${v.player.firstName} ${v.player.lastName}`,
              amount: v.deadCapAmount,
              yearsLeft: 1,
              source: 'void' as const,
              season: newSeason,
            }));
          const voidDeadCapTotal = voidDeadCapNew.reduce((sum, dc) => sum + dc.amount, 0);

          const removedIds = new Set([...newlyRetiredOnTeamIds, ...voidPlayerIds, ...expiredContractIds]);
          const newRoster = t.roster.filter(pid => !removedIds.has(pid));
          // Remove retired + voided from depth chart, then re-sort all positions by OVR
          const newDepthChart = POSITIONS.reduce<Record<Position, string[]>>((acc, pos) => {
            const active = (t.depthChart[pos] ?? []).filter(pid => !removedIds.has(pid));
            // Re-sort by OVR descending so best players are starters
            acc[pos] = active.sort((a, b) => {
              const pa = afterVoidPlayers.find(p => p.id === a);
              const pb = afterVoidPlayers.find(p => p.id === b);
              return (pb?.ratings.overall ?? 0) - (pa?.ratings.overall ?? 0);
            });
            return acc;
          }, {} as Record<Position, string[]>);
          // Expire dead cap entries (decrement years, remove expired)
          const updatedDeadCap = [...(t.deadCap ?? []), ...voidDeadCapNew]
            .map(dc => ({ ...dc, yearsLeft: dc.yearsLeft - 1 }))
            .filter(dc => dc.yearsLeft > 0);
          // Remove expired dead cap from payroll
          const expiredDeadCap = (t.deadCap ?? []).filter(dc => dc.yearsLeft <= 1);
          const deadCapRelief = expiredDeadCap.reduce((sum, dc) => sum + dc.amount, 0);

          // Compute revenue based on previous season performance
          const teamPlayers = developedPlayers.filter(p => p.teamId === t.id && !p.retired);
          const starCount = teamPlayers.filter(p => p.ratings.overall >= 80).length;
          const marketSize = MARKET_SIZES[t.abbreviation] ?? 1.0;
          const wins = t.record.wins;
          const tickets = Math.round(80 * marketSize * (1 + wins / 20) * 10) / 10;
          const merchandise = Math.round(25 * (1 + starCount * 0.15) * marketSize * 10) / 10;
          const tvDeal = 120;
          const totalRevenue = Math.round((tickets + merchandise + tvDeal) * 10) / 10;

          return {
            ...t,
            record: emptyRecord(),
            roster: newRoster,
            totalPayroll: Math.max(0, t.totalPayroll - salaryReduction - voidSalaryReduction - expiredSalaryReduction + voidDeadCapTotal - deadCapRelief),
            depthChart: newDepthChart,
            deadCap: updatedDeadCap,
            franchiseTagUsed: false,
            revenue: { tickets, merchandise, tvDeal, total: totalRevenue },
            // Add picks for new season + next year (ensure 2 future years always exist)
            draftPicks: [
              ...t.draftPicks,
              ...[newSeason, newSeason + 1].flatMap(yr =>
                t.draftPicks.some(pk => pk.year === yr && pk.originalTeamId === t.id) ? [] :
                [1, 2, 3, 4, 5, 6, 7].map(round => ({
                  id: uuid(),
                  year: yr,
                  round,
                  originalTeamId: t.id,
                  ownerTeamId: t.id,
                })),
              ),
            ],
          };
        });

        const finalPlayers = afterVoidPlayers.map(p => {
          if (p.retired && !previouslyRetiredIds.has(p.id)) return { ...p, teamId: null };
          if (expiredContractIds.has(p.id)) return { ...p, teamId: null };
          return p;
        });

        // Populate retired players in the season summary (notable retirees only)
        const newlyRetiredAll = developedPlayers.filter(
          p => p.retired && !previouslyRetiredIds.has(p.id),
        );
        newSummary.retiredPlayers = newlyRetiredAll
          .filter(p => p.ratings.overall >= 65 || p.experience >= 5)
          .sort((a, b) => b.ratings.overall - a.ratings.overall)
          .map(p => ({
            playerId: p.id,
            name: `${p.firstName} ${p.lastName}`,
            position: p.position,
            teamId: p.teamId ?? '',
            age: p.age,
          }));

        // Grow salary cap for new season
        const settings = state.leagueSettings ?? DEFAULT_LEAGUE_SETTINGS;
        const capGrowthMult = 1 + (settings.capGrowthRate / 100);
        let grownTeams = newTeams.map(t => ({
          ...t,
          salaryCap: Math.round(t.salaryCap * capGrowthMult * 10) / 10,
        }));

        // Ensure no team starts short-handed: fill roster gaps with minimum-salary players
        let allPlayersForNewSeason = [...finalPlayers];
        for (let ti = 0; ti < grownTeams.length; ti++) {
          const team = grownTeams[ti];
          const teamRoster = allPlayersForNewSeason.filter(p => p.teamId === team.id && !p.retired);
          for (const pos of POSITIONS) {
            const posCount = teamRoster.filter(p => p.position === pos).length;
            const needed = ROSTER_LIMITS[pos].min - posCount;
            if (needed <= 0) continue;
            for (let j = 0; j < needed; j++) {
              const fill = generatePlayer(pos, 42 + Math.random() * 15, {
                age: 23 + Math.floor(Math.random() * 5),
                experience: 0,
                teamId: team.id,
              });
              fill.contract = { salary: LEAGUE_MINIMUM_SALARY, yearsLeft: 1, guaranteed: 0, totalYears: 1 };
              allPlayersForNewSeason.push(fill);
              const newChart = { ...team.depthChart };
              newChart[pos] = [...(newChart[pos] ?? []), fill.id];
              grownTeams = grownTeams.map((t, idx) =>
                idx === ti
                  ? { ...t, roster: [...t.roster, fill.id], totalPayroll: t.totalPayroll + LEAGUE_MINIMUM_SALARY, depthChart: newChart }
                  : t,
              );
            }
          }
        }

        // AI Contract Restructuring — win-now AI teams restructure to create cap space
        const aiRestructureNews: NewsItem[] = [];
        for (let ti = 0; ti < grownTeams.length; ti++) {
          const team = grownTeams[ti];
          if (team.id === state.userTeamId) continue; // Skip user team

          const capSpace = team.salaryCap - team.totalPayroll;
          const isContender = team.record.wins >= 9; // Won 9+ games last season
          if (!isContender || capSpace > 20) continue; // Only cap-strapped contenders

          const teamPlayers = allPlayersForNewSeason
            .filter(p => p.teamId === team.id && !p.retired && p.contract.yearsLeft >= 3 && p.contract.salary >= 8);

          let restructureCount = 0;
          for (const player of teamPlayers) {
            if (restructureCount >= 3) break; // Max 3 restructures per team
            if (Math.random() > 0.30) continue; // 30% chance per eligible player

            const contractYears = player.contract.contractYears
              ? player.contract.contractYears.map(y => ({ ...y }))
              : materializeContractYears(player.contract);

            const currentBase = contractYears[0].baseSalary;
            const leagueMin = settings.leagueMinSalary ?? LEAGUE_MINIMUM_SALARY;
            const maxConversion = Math.max(0, currentBase - leagueMin);
            if (maxConversion < 2) continue;

            // AI converts 40-60% of base salary
            const conversionPct = 0.40 + Math.random() * 0.20;
            const conversionAmount = Math.round(Math.min(maxConversion, currentBase * conversionPct) * 10) / 10;

            // AI adds 0-2 void years
            const existingVoid = player.contract.voidYears ?? 0;
            const voidToAdd = Math.min(2, 3 - existingVoid, Math.floor(Math.random() * 3));

            // Apply restructure
            for (let v = 0; v < voidToAdd; v++) {
              contractYears.push({ baseSalary: 0, proratedBonus: 0, isVoidYear: true });
            }
            const totalYrs = contractYears.length;
            const proratedPerYear = Math.round((conversionAmount / totalYrs) * 100) / 100;
            contractYears[0] = { ...contractYears[0], baseSalary: contractYears[0].baseSalary - conversionAmount };
            for (let y = 0; y < contractYears.length; y++) {
              contractYears[y] = { ...contractYears[y], proratedBonus: contractYears[y].proratedBonus + proratedPerYear };
            }

            const newCapHit = Math.round((contractYears[0].baseSalary + contractYears[0].proratedBonus) * 100) / 100;
            const capDelta = newCapHit - player.contract.salary;

            // Update player
            const pi = allPlayersForNewSeason.findIndex(p => p.id === player.id);
            if (pi >= 0) {
              allPlayersForNewSeason[pi] = {
                ...allPlayersForNewSeason[pi],
                lastRestructuredSeason: newSeason,
                contract: {
                  ...player.contract,
                  salary: newCapHit,
                  yearsLeft: contractYears.length,
                  contractYears,
                  voidYears: existingVoid + voidToAdd,
                  restructureHistory: [
                    ...(player.contract.restructureHistory ?? []),
                    { season: newSeason, amountConverted: conversionAmount, voidYearsAdded: voidToAdd, proratedPerYear },
                  ],
                },
              };
            }

            // Update team payroll
            grownTeams = grownTeams.map((t, idx) =>
              idx === ti ? { ...t, totalPayroll: Math.max(0, t.totalPayroll + capDelta) } : t,
            );

            aiRestructureNews.push(makeNews({
              season: newSeason, week: 0, type: 'signing',
              teamId: team.id, playerIds: [player.id],
              headline: `${team.city} restructured ${player.firstName} ${player.lastName}'s contract, converting $${conversionAmount}M to signing bonus.`,
              isUserTeam: false,
            }));

            restructureCount++;
          }
        }

        const newSchedule = generateSchedule(grownTeams, newSeason);

        // Preserve unsigned players as free agents for in-season signings
        const unsignedPlayerIds = allPlayersForNewSeason
          .filter(p => !p.teamId && !p.retired)
          .map(p => p.id);

        // Generate street free agents so there's always a pool for in-season signings
        // Real league always has ~100+ unsigned players available on the street
        const streetFATarget = 80;
        const currentFACount = unsignedPlayerIds.length;
        const streetFACount = Math.max(0, streetFATarget - currentFACount);
        const streetFAs: import('@/types').Player[] = [];
        if (streetFACount > 0) {
          for (let i = 0; i < streetFACount; i++) {
            const pos = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];
            // Street FAs are lower-end players (40-60 OVR) — practice squad / depth
            const talentMean = 40 + Math.random() * 20;
            const p = generatePlayer(pos, talentMean, {
              age: 23 + Math.floor(Math.random() * 8),
              experience: Math.floor(Math.random() * 5),
              teamId: null,
            });
            p.contract = { salary: LEAGUE_MINIMUM_SALARY, yearsLeft: 0, guaranteed: 0, totalYears: 0 };
            streetFAs.push(p);
          }
          allPlayersForNewSeason.push(...streetFAs);
        }

        const seasonFreeAgents = [...unsignedPlayerIds, ...streetFAs.map(p => p.id)];

        set({
          season: newSeason,
          week: 1,
          phase: 'regular',
          players: allPlayersForNewSeason,
          teams: grownTeams,
          schedule: newSchedule,
          draftResults: [],
          freeAgents: seasonFreeAgents,
          faDay: 0,
          faRefusals: [],
          playoffBracket: null,
          playoffSeeds: null,
          newsItems: [...retirementNews, ...voidNews, ...aiRestructureNews],
          seasonHistory: [...state.seasonHistory, newSummary],
          resigningPlayers: [],
          tradeProposals: [],
          draftScoutingData: {},
          finalsMvpPlayerId: null,
          weeklyRecaps: [],
        });
      },

      updateLeagueSettings: (updates: Partial<LeagueSettings>) => {
        const state = get();
        const newSettings = { ...(state.leagueSettings ?? DEFAULT_LEAGUE_SETTINGS), ...updates };
        // If salaryCap changed, update all teams
        const oldSettings = state.leagueSettings ?? DEFAULT_LEAGUE_SETTINGS;
        let updatedTeams = state.teams;
        if (updates.salaryCap !== undefined && updates.salaryCap !== oldSettings.salaryCap) {
          updatedTeams = state.teams.map(t => ({ ...t, salaryCap: updates.salaryCap! }));
        }
        set({ leagueSettings: newSettings, teams: updatedTeams });
      },

      commitLiveGame: (result: GameResult, matchupId?: string) => {
        const state = get();

        // Check if this is a playoff game
        const isPlayoff = !!matchupId && !!state.playoffBracket?.find(m => m.id === matchupId);

        if (isPlayoff && state.playoffBracket && state.playoffSeeds) {
          // --- Playoff game commit ---
          const winnerId = result.homeScore >= result.awayScore ? result.homeTeamId : result.awayTeamId;
          let bracket = state.playoffBracket.map(m =>
            m.id === matchupId ? { ...m, homeScore: result.homeScore, awayScore: result.awayScore, winnerId } : { ...m },
          );
          bracket = propagateWinner(bracket, matchupId, winnerId, state.playoffSeeds);

          let champions = state.champions ?? [];
          let newsItems = state.newsItems;
          let finalsMvpPlayerId = state.finalsMvpPlayerId;

          // Check if this was the Championship game
          const superBowl = bracket.find(m => m.id === 'championship');
          if (superBowl?.winnerId && !champions.find(c => c.season === state.season)) {
            champions = [...champions, { season: state.season, teamId: superBowl.winnerId }];
            const champTeam = state.teams.find(t => t.id === superBowl.winnerId);
            if (champTeam) {
              newsItems = [...newsItems, makeNews({
                season: state.season, week: 99, type: 'milestone', teamId: champTeam.id,
                headline: `${champTeam.city} ${champTeam.name} win The Championship ${state.season}!`,
                isUserTeam: champTeam.id === state.userTeamId,
              })];
            }
            if (matchupId === 'championship') {
              const winnerRoster = state.players.filter(p => p.teamId === winnerId);
              const winnerIds = new Set(winnerRoster.map(p => p.id));
              let bestScore = -1;
              let bestId = '';
              for (const [pid, stats] of Object.entries(result.playerStats ?? {})) {
                if (!winnerIds.has(pid)) continue;
                const s = stats as Partial<PlayerStats>;
                const score = (s.passYards ?? 0) * 0.04 + (s.passTDs ?? 0) * 6
                  + (s.rushYards ?? 0) * 0.1 + (s.rushTDs ?? 0) * 6
                  + (s.receivingYards ?? 0) * 0.1 + (s.receivingTDs ?? 0) * 6
                  + (s.tackles ?? 0) * 1 + (s.sacks ?? 0) * 3 + (s.defensiveINTs ?? 0) * 5;
                if (score > bestScore) { bestScore = score; bestId = pid; }
              }
              if (bestId) finalsMvpPlayerId = bestId;
            }
          }

          // Add result to schedule for box score access
          const playoffResult = { ...result, id: matchupId, played: true };
          const updatedSchedule = [...state.schedule.filter(g => g.id !== matchupId), playoffResult];

          // Generate playoff recap
          const matchup = state.playoffBracket.find(m => m.id === matchupId);
          const playoffWeek = 100 + (matchup?.round ?? 1);
          const playoffRecap = generateWeeklyRecap([playoffResult], state.teams, state.players, state.season, playoffWeek);
          const updatedRecaps = [...(state.weeklyRecaps ?? []).filter(r => !(r.season === state.season && r.week === playoffWeek)), playoffRecap];

          // Update player stats
          const newPlayers = state.players.map(p => {
            const playerStats = result.playerStats?.[p.id];
            if (!playerStats) return p;
            return { ...p, stats: addStats(p.stats, playerStats) };
          });

          set({ playoffBracket: bracket, champions, newsItems, finalsMvpPlayerId, schedule: updatedSchedule, weeklyRecaps: updatedRecaps, players: newPlayers });
        } else {
          // --- Regular season game commit ---
          const newSchedule = state.schedule.map(g => g.id === result.id ? result : g);
          // Update team records
          const newTeams = state.teams.map(team => {
            if (team.id !== result.homeTeamId && team.id !== result.awayTeamId) return team;
            const isHome = team.id === result.homeTeamId;
            const teamScore = isHome ? result.homeScore : result.awayScore;
            const oppScore = isHome ? result.awayScore : result.homeScore;
            const won = teamScore > oppScore;
            const lost = teamScore < oppScore;
            return {
              ...team,
              record: {
                ...team.record,
                wins: team.record.wins + (won ? 1 : 0),
                losses: team.record.losses + (lost ? 1 : 0),
                ties: team.record.ties + (!won && !lost ? 1 : 0),
                pointsFor: team.record.pointsFor + teamScore,
                pointsAgainst: team.record.pointsAgainst + oppScore,
                streak: won ? (team.record.streak > 0 ? team.record.streak + 1 : 1) : (team.record.streak < 0 ? team.record.streak - 1 : -1),
              },
            };
          });
          // Update player stats
          const newPlayers = state.players.map(p => {
            const playerStats = result.playerStats?.[p.id];
            if (!playerStats) return p;
            return { ...p, stats: addStats(p.stats, playerStats) };
          });
          set({ schedule: newSchedule, teams: newTeams, players: newPlayers });
        }
      },

      setSuppressTradePopups: (val: boolean) => {
        set({ suppressTradePopups: val });
      },

      saveToSlot: (slot: 1 | 2) => {
        // Force a persist flush before reading localStorage to avoid stale data
        const api = (useGameStore as unknown as { persist: { getOptions: () => { name?: string; storage?: { getItem: (name: string) => unknown; setItem: (name: string, value: unknown) => void } }; rehydrate: () => void } }).persist;
        // Build snapshot directly from current in-memory state so we don't depend
        // on the async persist flush having completed yet.
        const currentState = get();
        const partializer = (api.getOptions() as { partialize?: (s: typeof currentState) => unknown }).partialize;
        const stateToSave = partializer ? partializer(currentState) : currentState;
        const payload = JSON.stringify({ state: stateToSave, version: SAVE_VERSION });
        localStorage.setItem(`gridiron-gm-save-${slot}`, payload);
      },

      loadFromSlot: (slot: 1 | 2) => {
        const data = localStorage.getItem(`gridiron-gm-save-${slot}`);
        if (!data) return;
        localStorage.setItem('gridiron-gm-autosave', data);
        window.location.reload();
      },

      getTeam: (id: string) => get().teams.find(t => t.id === id),
      getPlayer: (id: string) => get().players.find(p => p.id === id),
      getTeamRoster: (teamId: string) => get().players.filter(p => p.teamId === teamId),
      getWeekGames: (week: number) => get().schedule.filter(g => g.week === week),
    }),
    {
      name: 'gridiron-gm-autosave',
      version: SAVE_VERSION,
      partialize: (state) => {
        // Slim down schedule: only keep playerStats/scoringPlays for user-team games
        // (other games' stats are already aggregated into player .stats objects)
        const slimSchedule = state.schedule.map(game => {
          if (!game.played) return game;
          const isUserGame = game.homeTeamId === state.userTeamId || game.awayTeamId === state.userTeamId;
          const isSuperBowl = game.id === 'championship';
          if (isUserGame || isSuperBowl) return game; // keep full stats for user games (box score) and SB (MVP stats)
          // For non-user games, strip heavy data — scores are kept
          return { ...game, playerStats: {}, scoringPlays: undefined };
        });

        // Limit news items to last 200 to prevent unbounded growth
        const trimmedNews = state.newsItems.slice(-200);

        // Keep only current season recaps to prevent unbounded growth
        const trimmedRecaps = (state.weeklyRecaps ?? []).filter(
          (r: { season: number }) => r.season === state.season
        );

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { initialized, ...rest } = state;
        return {
          ...rest,
          schedule: slimSchedule,
          newsItems: trimmedNews,
          weeklyRecaps: trimmedRecaps,
        };
      },
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown>;
        if (version < 3) {
          // Migrate salary cap to $300M and add missing fields
          const settings = (state.leagueSettings as Record<string, unknown>) ?? {};
          if (!settings.salaryCap || (settings.salaryCap as number) < 300) {
            settings.salaryCap = DEFAULT_LEAGUE_SETTINGS.salaryCap;
          }
          state.leagueSettings = { ...DEFAULT_LEAGUE_SETTINGS, ...settings };
          state.suppressTradePopups = state.suppressTradePopups ?? false;
          state.weeklyRecaps = state.weeklyRecaps ?? [];
          const teams = (state.teams as Array<Record<string, unknown>>) ?? [];
          for (const team of teams) {
            if ((team.salaryCap as number) < 300) {
              team.salaryCap = DEFAULT_LEAGUE_SETTINGS.salaryCap;
            }
          }
        }
        if (version < 4) {
          // Add guaranteed money to existing contracts and deadCap to teams
          const players = (state.players as Array<Record<string, unknown>>) ?? [];
          for (const p of players) {
            const contract = p.contract as Record<string, unknown>;
            if (contract && contract.guaranteed === undefined) {
              const salary = (contract.salary as number) ?? 0;
              const years = (contract.yearsLeft as number) ?? 1;
              const totalValue = salary * years;
              const guaranteedPct = years <= 1 ? 1.0 : years <= 2 ? 0.65 : years <= 3 ? 0.50 : 0.40;
              contract.guaranteed = Math.round(totalValue * guaranteedPct * 10) / 10;
              contract.totalYears = years;
            }
          }
          // Add mood to players
          for (const p of players) {
            if (p.mood === undefined) {
              p.mood = 60 + Math.floor(Math.random() * 30);
            }
          }
          const teams = (state.teams as Array<Record<string, unknown>>) ?? [];
          for (const team of teams) {
            if (!team.deadCap) team.deadCap = [];
          }
        }
        if (version < 5) {
          // Ensure salary cap is $300M for all teams
          const teams5 = (state.teams as Array<Record<string, unknown>>) ?? [];
          for (const team of teams5) {
            if ((team.salaryCap as number) < 300) {
              team.salaryCap = DEFAULT_LEAGUE_SETTINGS.salaryCap;
            }
          }
          const settings5 = (state.leagueSettings as Record<string, unknown>) ?? {};
          if (!settings5.salaryCap || (settings5.salaryCap as number) < 300) {
            settings5.salaryCap = DEFAULT_LEAGUE_SETTINGS.salaryCap;
          }
          state.leagueSettings = { ...DEFAULT_LEAGUE_SETTINGS, ...settings5 };
        }
        if (version < 6) {
          // Recalculate guaranteed money with realistic formula
          // Old formula had 1-year deals at 100% guaranteed (no cap savings from cuts)
          const players6 = (state.players as Array<Record<string, unknown>>) ?? [];
          for (const p of players6) {
            const contract = p.contract as Record<string, unknown>;
            if (contract) {
              const salary = (contract.salary as number) ?? 0;
              const years = (contract.yearsLeft as number) ?? 1;
              contract.guaranteed = generateGuaranteed(salary, years);
            }
          }
        }
        if (version < 7) {
          // Fix guaranteed money: old formula used salary*years*pct (total contract value)
          // which produced absurdly high guaranteed amounts (e.g. $18M on a $6.5M/yr deal).
          // New formula: guaranteed = salary * fraction (single year basis), always < salary.
          // Also removed double-proration from calculateDeadCap — guaranteed IS the dead cap now.
          const players7 = (state.players as Array<Record<string, unknown>>) ?? [];
          for (const p of players7) {
            const contract = p.contract as Record<string, unknown>;
            if (contract) {
              const salary = (contract.salary as number) ?? 0;
              const years = (contract.yearsLeft as number) ?? 1;
              contract.guaranteed = generateGuaranteed(salary, years);
            }
          }
        }
        if (version < 8) {
          // Strip playerStats from non-user games to reduce localStorage size
          // playerStats are the biggest contributor to save bloat
          const userTeamId8 = state.userTeamId as string;
          const schedule8 = (state.schedule as Array<Record<string, unknown>>) ?? [];
          for (const game of schedule8) {
            if (!game.played) continue;
            const isUserGame = game.homeTeamId === userTeamId8 || game.awayTeamId === userTeamId8;
            const isSuperBowl = game.id === 'championship';
            if (!isUserGame && !isSuperBowl) {
              game.playerStats = {};
              game.scoringPlays = undefined;
            }
          }
          // Trim news items to last 200
          const news8 = (state.newsItems as Array<unknown>) ?? [];
          if (news8.length > 200) {
            state.newsItems = news8.slice(-200);
          }
        }
        if (version < 9) {
          // Add franchiseTagUsed to all teams
          const teams9 = (state.teams as Array<Record<string, unknown>>) ?? [];
          for (const team of teams9) {
            if (team.franchiseTagUsed === undefined) team.franchiseTagUsed = false;
          }
        }
        if (version < 10) {
          // Add free agency day tracking
          if (state.faDay === undefined) state.faDay = 0;
          if (state.faRefusals === undefined) state.faRefusals = [];
        }
        if (version < 11) {
          // Rename conferences: AFC→AC, NFC→NC; rename super-bowl→championship
          const teams11 = (state.teams as Array<Record<string, unknown>>) ?? [];
          for (const team of teams11) {
            if (team.conference === 'AFC') team.conference = 'AC';
            if (team.conference === 'NFC') team.conference = 'NC';
          }
          // Migrate playoff seeds
          const seeds = state.playoffSeeds as Record<string, unknown> | null;
          if (seeds) {
            if (seeds.AFC) { seeds.AC = seeds.AFC; delete seeds.AFC; }
            if (seeds.NFC) { seeds.NC = seeds.NFC; delete seeds.NFC; }
          }
          // Migrate playoff bracket matchup IDs and conference labels
          const bracket = (state.playoffBracket as Array<Record<string, unknown>>) ?? [];
          for (const m of bracket) {
            if (typeof m.id === 'string') {
              m.id = m.id.replace(/^afc-/, 'ac-').replace(/^nfc-/, 'nc-').replace('super-bowl', 'championship');
            }
            if (m.conference === 'AFC') m.conference = 'AC';
            if (m.conference === 'NFC') m.conference = 'NC';
            if (m.conference === 'Super Bowl') m.conference = 'Championship';
            if (typeof m.homeFeedsFrom === 'string') {
              m.homeFeedsFrom = m.homeFeedsFrom.replace(/^afc-/, 'ac-').replace(/^nfc-/, 'nc-');
            }
            if (typeof m.awayFeedsFrom === 'string') {
              m.awayFeedsFrom = m.awayFeedsFrom.replace(/^afc-/, 'ac-').replace(/^nfc-/, 'nc-');
            }
          }
          // Migrate season history bestRecord keys
          const history = (state.seasonHistory as Array<Record<string, unknown>>) ?? [];
          for (const summary of history) {
            const br = summary.bestRecord as Record<string, unknown>;
            if (br) {
              if (br.afc) { br.ac = br.afc; delete br.afc; }
              if (br.nfc) { br.nc = br.nfc; delete br.nfc; }
            }
          }
          // Migrate schedule game IDs
          const schedule11 = (state.schedule as Array<Record<string, unknown>>) ?? [];
          for (const game of schedule11) {
            if (typeof game.id === 'string') {
              game.id = game.id.replace('super-bowl', 'championship');
            }
          }
        }
        if (version < 12) {
          // Add achievements array
          if (!state.achievements) state.achievements = [];
        }
        if (version < 13) {
          // Add revenue to teams
          const teams13 = (state.teams as Array<Record<string, unknown>>) ?? [];
          for (const team of teams13) {
            if (!team.revenue) {
              team.revenue = { tickets: 0, merchandise: 0, tvDeal: 0, total: 0 };
            }
          }
        }
        if (version < 14) {
          // Add source + season to existing dead cap entries
          const teams14 = (state.teams as Array<Record<string, unknown>>) ?? [];
          for (const team of teams14) {
            const deadCap = (team.deadCap as Array<Record<string, unknown>>) ?? [];
            for (const dc of deadCap) {
              if (!dc.source) dc.source = 'release';
              if (dc.season === undefined) dc.season = (state.season as number) ?? 1;
            }
          }
        }
        return state;
      },
    },
  ),
);
