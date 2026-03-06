import { create } from 'zustand';
import { persist } from 'zustand/middleware';
function uuid(): string {
  return crypto.randomUUID();
}
import type {
  LeagueState, Team, Player, GameResult, PlayerStats,
  NewsItem, TradeProposal, ResigningEntry, DraftPick, LeagueSettings,
} from '@/types';
import { emptyRecord, emptyStats, POSITIONS, ROSTER_LIMITS, DEFAULT_LEAGUE_SETTINGS, calculateDeadCap, calculateCapSavings, generateGuaranteed, type Position, type DeadCapEntry } from '@/types';
import { NFL_TEAMS } from '@/lib/data/teams';
import { loadFbgmLeagueFromUrl } from '@/lib/data/fbgmRoster';
import { generateRoster, generateDraftClass, generatePlayer } from './playerGen';
import { generateSchedule } from './schedule';
import { simulateGame } from './simulate';
import { developPlayers } from './development';

const SAVE_VERSION = 8;

// Defaults for export (UI uses these for display when store isn't accessible)
export const LEAGUE_MINIMUM_SALARY = DEFAULT_LEAGUE_SETTINGS.leagueMinSalary;
export const LUXURY_TAX_RATE = DEFAULT_LEAGUE_SETTINGS.luxuryTaxRate;

export function computeLuxuryTax(payroll: number, cap: number): number {
  const overCap = payroll - cap;
  if (overCap <= 0) return 0;
  return Math.round(overCap * LUXURY_TAX_RATE * 10) / 10;
}

interface GameStore extends LeagueState {
  initialized: boolean;
  newLeague: (teamId: string) => Promise<void>;
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
  advanceToDraft: () => void;
  draftPlayer: (playerId: string) => void;
  simDraftPick: () => void;
  simToUserDraftPick: () => void;
  simToEndDraft: () => void;
  advanceToFreeAgency: () => void;
  signFreeAgent: (playerId: string, salary: number, years: number) => boolean;
  aiSignFreeAgents: () => void;
  releasePlayer: (playerId: string) => void;
  restructureContract: (playerId: string, newSalary: number, newYears: number) => boolean;
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
  ) => boolean;
  respondToTradeProposal: (proposalId: string, accept: boolean) => boolean;
  solicitTradingBlockProposals: (playerIds: string[], pickIds: string[], seekPositions: Position[], seekDraftPicks?: boolean) => void;
  // PRD-07: Scouting
  setScoutingLevel: (level: 0 | 1 | 2 | 3 | 4) => void;
  deepScoutPlayer: (playerId: string) => void;
  // PRD-13: Depth chart
  reorderDepthChart: (position: Position, playerIds: string[]) => void;
  resetDepthChart: (position: Position) => void;
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
    .filter((player): player is Player => Boolean(player));
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

const PICK_VALUES = [150, 90, 55, 35, 20, 10, 5]; // Rounds 1-7

function playerTradeValue(player: Player): number {
  const ageMultiplier =
    player.age <= 25 ? 1.2 :
    player.age <= 29 ? 1.0 :
    player.age <= 33 ? 0.7 : 0.3;
  return (player.ratings.overall * 2 + player.potential * 0.5) * ageMultiplier;
}

function pickTradeValue(pick: DraftPick): number {
  return PICK_VALUES[(pick.round - 1)] ?? 5;
}

// ---------------------------------------------------------------------------
// Scouting helpers (PRD-07)
// ---------------------------------------------------------------------------

const SCOUTING_ERRORS = [12, 8, 5, 3, 1]; // Indexed by scoutingLevel

function gaussianScout(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function computeScoutingData(
  prospects: Player[],
  scoutingLevel: number,
): Record<string, { scoutedOvr: number; error: number; deepScouted: boolean }> {
  const error = SCOUTING_ERRORS[scoutingLevel] ?? 12;
  const data: Record<string, { scoutedOvr: number; error: number; deepScouted: boolean }> = {};
  for (const p of prospects) {
    const noise = Math.round(gaussianScout() * error);
    const scoutedOvr = Math.max(20, Math.min(99, p.ratings.overall + noise));
    data[p.id] = { scoutedOvr, error, deepScouted: false };
  }
  return data;
}

// ---------------------------------------------------------------------------
// Re-signing helpers (PRD-03)
// ---------------------------------------------------------------------------

/**
 * Estimates market salary for a player based on overall rating and position.
 * Calibrated to real NFL salary ranges:
 *   - Elite QB (95+):  ~$45-50M   (Mahomes/Burrow tier)
 *   - Elite WR (93+):  ~$27-30M   (CeeDee Lamb tier)
 *   - Elite DL (93+):  ~$25-28M
 *   - Good starter (80): ~$10-14M
 *   - Backup (65):     ~$2-4M
 *   - K/P:             capped at $5M max
 *
 * Uses an exponential curve so elite players command disproportionately more.
 */
const POSITION_SALARY_MULTIPLIER: Partial<Record<Position, number>> = {
  QB: 1.9,
  WR: 1.0,
  CB: 1.05,
  DL: 1.35,
  LB: 0.95,
  OL: 1.0,
  S: 0.9,
  TE: 0.85,
  RB: 0.8,
  K: 0.25,
  P: 0.25,
};

function estimateSalary(overall: number, position?: Position, age?: number, potential?: number): number {
  // Exponential curve: low-end players get minimum, elite players get $40-55M
  const normalized = Math.max(0, (overall - 40) / 60);
  const baseSalary = Math.max(LEAGUE_MINIMUM_SALARY, Math.pow(normalized, 1.6) * 42);

  // Position multiplier — QBs command the most, K/P the least
  const posMult = position ? (POSITION_SALARY_MULTIPLIER[position] ?? 1.0) : 1.0;
  let salary = baseSalary * posMult;

  // Age factor: younger players with upside command a premium
  // Older declining players get discounted
  if (age !== undefined) {
    if (age <= 25) salary *= 1.15;       // Young ascending — premium
    else if (age <= 27) salary *= 1.05;  // Prime years — slight premium
    else if (age >= 33) salary *= 0.65;  // Declining — steep discount
    else if (age >= 31) salary *= 0.80;  // Late career — discount
    else if (age >= 29) salary *= 0.90;  // Starting to age
  }

  // High-potential young players command more (teams pay for ceiling)
  if (potential !== undefined && age !== undefined && age <= 27) {
    const potentialBonus = Math.max(0, potential - overall) * 0.15;
    salary += potentialBonus;
  }

  // K/P hard cap at $5M
  if (position === 'K' || position === 'P') {
    salary = Math.min(salary, 5.0);
  }

  return Math.round(salary * 10) / 10;
}

function computeResigningEntry(player: Player, team: Team): ResigningEntry {
  const base = estimateSalary(player.ratings.overall, player.position, player.age, player.potential);
  const winPct = team.record.wins / Math.max(1, team.record.wins + team.record.losses);
  let mult = 1.0;
  if (winPct < 0.4) mult *= 1.15;
  if (winPct > 0.65) mult *= 0.90;
  if (player.age >= 32) mult *= 0.85;
  if (player.experience > 4) mult *= 0.92;
  const askingSalary = Math.round(base * mult * 10) / 10;
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

function computePlayoffSeeds(teams: Team[]): { AFC: string[]; NFC: string[] } {
  const result: { AFC: string[]; NFC: string[] } = { AFC: [], NFC: [] };
  const divisions = ['North', 'South', 'East', 'West'] as const;

  for (const conf of ['AFC', 'NFC'] as const) {
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

function buildBracket(seeds: { AFC: string[]; NFC: string[] }, _teams: Team[]): import('@/types').PlayoffMatchup[] {
  const matchups: import('@/types').PlayoffMatchup[] = [];

  for (const conf of ['AFC', 'NFC'] as const) {
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
    id: 'super-bowl', round: 4, conference: 'Super Bowl',
    homeTeamId: null, awayTeamId: null,
    homeSeed: null, awaySeed: null,
    homeScore: null, awayScore: null, winnerId: null,
    homeFeedsFrom: 'afc-conf',
    awayFeedsFrom: 'nfc-conf',
  });

  return matchups;
}

function propagateWinner(
  matchups: import('@/types').PlayoffMatchup[],
  decidedId: string,
  winnerId: string,
  playoffSeeds: { AFC: string[]; NFC: string[] },
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

  // NFL re-seeding: after all 3 Wild Card games in a conference finish,
  // assign divisional matchups so #1 plays the LOWEST remaining seed.
  for (const conf of ['AFC', 'NFC'] as const) {
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

  const offensivePlayers = withGames(['QB', 'RB', 'WR', 'TE', 'OL']);
  if (offensivePlayers.length > 0) {
    const mvp = offensivePlayers.sort((a, b) => b.ratings.overall - a.ratings.overall)[0];
    awards.push({ award: 'MVP', playerId: mvp.id, teamId: mvp.teamId! });
  }

  const defensivePlayers = withGames(['DL', 'LB', 'CB', 'S']);
  if (defensivePlayers.length > 0) {
    const dpoy = defensivePlayers.sort((a, b) =>
      (b.stats.tackles + b.stats.sacks * 5 + b.stats.defensiveINTs * 4) -
      (a.stats.tackles + a.stats.sacks * 5 + a.stats.defensiveINTs * 4)
    )[0];
    awards.push({ award: 'Defensive POY', playerId: dpoy.id, teamId: dpoy.teamId! });
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

/** Positional slot counts for All-League teams (mirrors NFL All-Pro format). */
const ALL_LEAGUE_SLOTS: { position: Position; count: number }[] = [
  { position: 'QB', count: 1 },
  { position: 'RB', count: 1 },
  { position: 'WR', count: 3 },
  { position: 'TE', count: 1 },
  { position: 'OL', count: 2 },
  { position: 'DL', count: 2 },
  { position: 'LB', count: 3 },
  { position: 'CB', count: 2 },
  { position: 'S', count: 1 },
  { position: 'K', count: 1 },
  { position: 'P', count: 1 },
];

function computeAllLeagueTeams(state: LeagueState): {
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
        const sortedPicks = [...aiPicks].sort((a, b) => b.round - a.round);
        const pick = sortedPicks[0];
        offeredPickIds.push(pick.id);
        offeredValue += pickTradeValue(pick);
      }
    }

    // ~20% chance: offer ONLY a draft pick (no player) for a mid-tier player
    const pickOnlyTrade = Math.random() < 0.20 && targetValue < 200;
    let offeredPlayerIds = [aiOffer.id];
    if (pickOnlyTrade) {
      // Offer a high-value pick instead of a player
      const aiPicks = aiTeam.draftPicks.filter(pk => pk.year >= state.season && pk.round <= 3);
      if (aiPicks.length > 0) {
        const pick = aiPicks[Math.floor(Math.random() * aiPicks.length)];
        offeredPlayerIds = [];
        offeredPickIds.length = 0;
        offeredPickIds.push(pick.id);
        offeredValue = pickTradeValue(pick);
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
  playoffBracket: null,
  playoffSeeds: null,
  champions: [],
  newsItems: [],
  seasonHistory: [],
  saveVersion: SAVE_VERSION,
  resigningPlayers: [],
  tradeProposals: [],
  scoutingLevel: 1,
  draftScoutingData: {},
  finalsMvpPlayerId: null,
  leagueSettings: { ...DEFAULT_LEAGUE_SETTINGS },
  suppressTradePopups: false,
};

// ---------------------------------------------------------------------------
// Pure function: simulate one week of games (no store dependency)
// Returns state patch + whether season is over, or null if nothing to sim
// ---------------------------------------------------------------------------
function simulateOneWeek(state: LeagueState): { patch: Record<string, unknown>; isSeasonOver: boolean } | null {
  if (state.phase !== 'regular') return null;

  const weekGames = state.schedule.filter(g => g.week === state.week && !g.played);
  if (weekGames.length === 0) return null;

  // Auto-resort all teams' depth charts by OVR each week (fixes stale ordering from old saves)
  const resortedTeams = state.teams.map(t => {
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
      if (teamScore > oppScore) {
        record.wins += 1;
        record.streak = record.streak >= 0 ? record.streak + 1 : 1;
      } else {
        record.losses += 1;
        record.streak = record.streak <= 0 ? record.streak - 1 : -1;
      }
      const opponent = state.teams.find(t => t.id === (isHome ? game.awayTeamId : game.homeTeamId));
      if (opponent && opponent.conference === team.conference && opponent.division === team.division) {
        if (teamScore > oppScore) record.divisionWins += 1;
        else record.divisionLosses += 1;
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

      newLeague: async (userTeamId: string) => {
        try {
          const imported = await loadFbgmLeagueFromUrl();
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
            playoffBracket: null,
            playoffSeeds: null,
            champions: [],
            newsItems: [],
            seasonHistory: [],
            saveVersion: SAVE_VERSION,
            resigningPlayers: [],
            tradeProposals: [],
            scoutingLevel: 1,
            draftScoutingData: {},
            finalsMvpPlayerId: null,
            leagueSettings: { ...DEFAULT_LEAGUE_SETTINGS },
            suppressTradePopups: false,
          });
          return;
        } catch (error) {
          console.warn('Failed to import FBGM roster, falling back to generated league.', error);
        }

        const allPlayers: Player[] = [];
        const teams: Team[] = NFL_TEAMS.map(t => {
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
            draftPicks: [1, 2, 3, 4, 5, 6, 7].map(round => ({
              id: uuid(),
              year: 2026,
              round,
              originalTeamId: id,
              ownerTeamId: id,
            })),
            depthChart: buildDefaultDepthChart(roster),
            deadCap: [],
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
          playoffBracket: null,
          playoffSeeds: null,
          champions: [],
          newsItems: [],
          seasonHistory: [],
          saveVersion: SAVE_VERSION,
          resigningPlayers: [],
          tradeProposals: [],
          scoutingLevel: 1,
          draftScoutingData: {},
          finalsMvpPlayerId: null,
          leagueSettings: { ...DEFAULT_LEAGUE_SETTINGS },
          suppressTradePopups: false,
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
        if (result.isSeasonOver) {
          // Compute playoff bracket in the same set() call
          const teams = result.patch.teams as Team[];
          const seeds = computePlayoffSeeds(teams);
          const bracket = buildBracket(seeds, teams);
          set({ ...result.patch, playoffSeeds: seeds, playoffBracket: bracket });
        } else {
          set(result.patch);
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
        let isSeasonOver = false;

        for (let guard = 0; guard < 200 && week < targetWeek; guard++) {
          const fakeState = { ...current, schedule, teams, players, week, newsItems, tradeProposals, phase: 'regular' as const } as LeagueState;
          const result = simulateOneWeek(fakeState);
          if (!result) break;

          schedule = result.patch.schedule as typeof schedule;
          teams = result.patch.teams as typeof teams;
          players = result.patch.players as typeof players;
          week = result.patch.week as number;
          newsItems = result.patch.newsItems as typeof newsItems;
          tradeProposals = result.patch.tradeProposals as typeof tradeProposals;

          if (result.isSeasonOver) {
            isSeasonOver = true;
            break;
          }
        }

        if (isSeasonOver) {
          // Compute playoff bracket here in the same set() call to avoid stale get()
          const seeds = computePlayoffSeeds(teams);
          const bracket = buildBracket(seeds, teams);
          set({ schedule, teams, players, week, newsItems, tradeProposals, phase: 'playoffs', playoffSeeds: seeds, playoffBracket: bracket });
        } else {
          set({ schedule, teams, players, week, newsItems, tradeProposals, phase: 'regular' });
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

        const superBowl = updatedBracket.find(m => m.id === 'super-bowl');
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
              headline: `${champTeam.city} ${champTeam.name} win Super Bowl ${state.season}!`,
              isUserTeam: champTeam.id === state.userTeamId,
            })];
          }
          // Determine Finals MVP: best performer from winning team in the SB game
          if (matchupId === 'super-bowl') {
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

        set({ playoffBracket: updatedBracket, champions: newChampions, newsItems: newNewsItems, finalsMvpPlayerId, schedule: updatedSchedule });
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

          // Check Super Bowl
          const superBowl = bracket.find(m => m.id === 'super-bowl');
          if (superBowl?.winnerId && !champions.find(c => c.season === state.season)) {
            champions = [...champions, { season: state.season, teamId: superBowl.winnerId }];
            const champTeam = state.teams.find(t => t.id === superBowl.winnerId);
            if (champTeam) {
              newsItems = [...newsItems, makeNews({
                season: state.season, week: 99, type: 'milestone', teamId: champTeam.id,
                headline: `${champTeam.city} ${champTeam.name} win Super Bowl ${state.season}!`,
                isUserTeam: champTeam.id === state.userTeamId,
              })];
            }
            if (next.id === 'super-bowl') {
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

        set({ playoffBracket: bracket, champions, newsItems, finalsMvpPlayerId, schedule: updatedSchedule });
      },

      /** Sim all games in the current playoff round (e.g. all Wild Card games). */
      simPlayoffRound: () => {
        const state = get();
        if (!state.playoffBracket || !state.playoffSeeds) return;
        const unplayed = state.playoffBracket
          .filter(m => !m.winnerId && m.homeTeamId && m.awayTeamId);
        if (unplayed.length === 0) return;
        const currentRound = Math.min(...unplayed.map(m => m.round));
        const roundGames = unplayed.filter(m => m.round === currentRound);

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
        }

        // Store playoff game results in schedule for BoxScoreModal access
        const existingIds = new Set(playoffResults.map(r => r.id));
        const updatedSchedule = [...state.schedule.filter(g => !existingIds.has(g.id)), ...playoffResults];

        set({ playoffBracket: bracket, champions, newsItems, finalsMvpPlayerId, schedule: updatedSchedule });
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
            p.id === playerId ? { ...p, contract: { salary, yearsLeft: years, guaranteed: generateGuaranteed(salary, years), totalYears: years } } : p,
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
        // Set yearsLeft = 0 so they get picked up by advanceToFreeAgency
        set({
          players: state.players.map(p =>
            p.id === playerId ? { ...p, contract: { ...p.contract, yearsLeft: 0 } } : p,
          ),
          resigningPlayers: state.resigningPlayers.filter(e => e.playerId !== playerId),
        });
      },

      advanceToDraft: () => {
        const state = get();
        // PRD-03: AI teams re-sign their own expiring players when coming from resigning phase
        let updatedPlayers = [...state.players];
        let updatedTeams = [...state.teams];

        if (state.phase === 'resigning') {
          // Handle remaining unsigned user players
          const unhandledUserExpiring = state.resigningPlayers.map(e => e.playerId);
          updatedPlayers = updatedPlayers.map(p =>
            unhandledUserExpiring.includes(p.id) ? { ...p, contract: { ...p.contract, yearsLeft: 0 } } : p,
          );

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
                  p.id === player.id ? { ...p, contract: { salary: marketSalary, yearsLeft: newYears, guaranteed: generateGuaranteed(marketSalary, newYears), totalYears: newYears } } : p,
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
        const rounds = 7;
        const draftOrder = Array.from({ length: rounds }, () => sortedTeams.map((team) => team.id)).flat();

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

        const rookieSalary = Math.round((5 - (state.freeAgents.indexOf(playerId) / 50)) * 10) / 10;
        const finalSalary = Math.max(0.5, rookieSalary);

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

        // PRD-13: Update depth chart for drafting team
        const updatedTeams = state.teams.map(t => {
          if (t.id !== currentPickTeamId) return t;
          const chart = insertIntoDepthChart(t.depthChart, player.position, playerId, state.players);
          return { ...t, roster: [...t.roster, playerId], totalPayroll: t.totalPayroll + finalSalary, depthChart: chart };
        });

        set({
          players: state.players.map(p =>
            p.id === playerId
              ? {
                  ...p,
                  teamId: currentPickTeamId,
                  draftYear: state.season,
                  draftPick: overallPick,
                  contract: { salary: finalSalary, yearsLeft: 4, guaranteed: generateGuaranteed(finalSalary, 4), totalYears: 4 },
                }
              : p,
          ),
          teams: updatedTeams,
          freeAgents: state.freeAgents.filter(id => id !== playerId),
          draftOrder: state.draftOrder.slice(1),
          draftResults: [
            ...state.draftResults,
            { overallPick, round, pickInRound, teamId: currentPickTeamId, playerId },
          ],
          newsItems: newNewsItems,
        });
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
          const rookieSalary = Math.max(0.5, Math.round((5 - (freeAgentIds.indexOf(pid) / 50)) * 10) / 10);

          players = players.map(p =>
            p.id === pid
              ? { ...p, teamId: pickTeam, draftYear: state.season, draftPick: overallPick, contract: { salary: rookieSalary, yearsLeft: 4, guaranteed: generateGuaranteed(rookieSalary, 4), totalYears: 4 } }
              : p,
          );
          teams = teams.map(t => {
            if (t.id !== pickTeam) return t;
            const chart = insertIntoDepthChart(t.depthChart, player.position, pid, players);
            return { ...t, roster: [...t.roster, pid], totalPayroll: t.totalPayroll + rookieSalary, depthChart: chart };
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

      simToEndDraft: () => {
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
          const rookieSalary = Math.max(0.5, Math.round((5 - (freeAgentIds.indexOf(pid) / 50)) * 10) / 10);

          players = players.map(p =>
            p.id === pid
              ? { ...p, teamId: pickTeam, draftYear: state.season, draftPick: overallPick, contract: { salary: rookieSalary, yearsLeft: 4, guaranteed: generateGuaranteed(rookieSalary, 4), totalYears: 4 } }
              : p,
          );
          teams = teams.map(t => {
            if (t.id !== pickTeam) return t;
            const chart = insertIntoDepthChart(t.depthChart, player.position, pid, players);
            return { ...t, roster: [...t.roster, pid], totalPayroll: t.totalPayroll + rookieSalary, depthChart: chart };
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
        // Target: at least 150 FAs available (real NFL FA class is 200-400+)
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
          newsItems: [...state.newsItems, ...releaseNews],
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
        let currentPlayers = state.players.map(p =>
          p.id === playerId
            ? { ...p, teamId: state.userTeamId, contract: { salary, yearsLeft: years, guaranteed: generateGuaranteed(salary, years), totalYears: years } }
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

        // --- Step 2: A handful of AI teams sign free agents each round ---
        // Only 5-8 teams act per user signing to keep the FA pool healthy.
        // Teams with critical needs are prioritized to act first.
        const aiTeamIds = currentTeams.filter(t => t.id !== state.userTeamId).map(t => t.id);

        // Score each AI team by how badly they need FAs
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

        // Sort by need (most desperate teams first), pick top 5-8 to act this round
        teamNeedScores.sort((a, b) => b.score - a.score);
        const teamsActingThisRound = teamNeedScores.slice(0, 5 + Math.floor(Math.random() * 4));

        for (const { teamId: aiTeamId, needPositions, wantPositions } of teamsActingThisRound) {
          if (currentFreeAgents.length === 0) break;

          const teamData = currentTeams.find(t => t.id === aiTeamId);
          if (!teamData) continue;
          let capSpace = teamData.salaryCap - teamData.totalPayroll;

          // Each team signs exactly 1 player per round
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

        // --- Single set() call with both user signing + AI signings ---
        set({
          players: currentPlayers,
          teams: currentTeams,
          freeAgents: currentFreeAgents,
          newsItems: [...state.newsItems, ...allNews],
        });

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

        const deadCap = calculateDeadCap(contract);
        const capSavings = calculateCapSavings(contract);

        const deadCapNote = deadCap > 0
          ? ` Dead cap hit: $${deadCap}M. Cap savings: $${capSavings > 0 ? capSavings : 0}M.`
          : ` Saves $${player.contract.salary}M/yr cap space.`;

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
            ? [...existingDeadCap, { playerName: `${player.firstName} ${player.lastName}`, amount: deadCap, yearsLeft: 1 }]
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
            p.id === playerId ? { ...p, teamId: null, onIR: false } : p,
          ),
          teams: updatedTeams,
          freeAgents: [...state.freeAgents, playerId],
          newsItems: [...state.newsItems, releaseNews],
        });
      },

      restructureContract: (playerId: string, newSalary: number, newYears: number) => {
        const state = get();
        const player = state.players.find(p => p.id === playerId);
        if (!player || player.teamId !== state.userTeamId) return false;
        // Prevent restructuring the same player more than once per season
        if (player.lastRestructuredSeason === state.season) return false;

        const oldSalary = player.contract.salary;
        const capDelta = newSalary - oldSalary; // negative = savings

        set({
          players: state.players.map(p =>
            p.id === playerId
              ? { ...p, lastRestructuredSeason: state.season, contract: { salary: newSalary, yearsLeft: newYears, guaranteed: generateGuaranteed(newSalary, newYears), totalYears: newYears } }
              : p,
          ),
          teams: state.teams.map(t =>
            t.id === state.userTeamId
              ? { ...t, totalPayroll: Math.max(0, t.totalPayroll + capDelta) }
              : t,
          ),
          newsItems: [...state.newsItems, makeNews({
            season: state.season, week: 0, type: 'signing',
            teamId: state.userTeamId, playerIds: [playerId],
            headline: `You restructured ${player.firstName} ${player.lastName}'s contract to $${newSalary}M/yr for ${newYears} years.`,
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
          return sum + (pick ? pickTradeValue(pick) : 0);
        }, 0);

        const receivedValue = receivedPlayerIds.reduce((sum, id) => {
          const p = state.players.find(pl => pl.id === id);
          return sum + (p ? playerTradeValue(p) : 0);
        }, 0) + receivedPickIds.reduce((sum, id) => {
          const pick = aiTeam.draftPicks.find(pk => pk.id === id);
          return sum + (pick ? pickTradeValue(pick) : 0);
        }, 0);

        // AI accepts if within 10% value
        if (offeredValue < receivedValue * 0.90) return false;

        // Block trades that increase user payroll when over the cap
        const offeredSalaryTotal = offeredPlayerIds.reduce((sum, id) => {
          const p = state.players.find(pl => pl.id === id);
          return sum + (p ? p.contract.salary : 0);
        }, 0);
        const receivedSalaryTotal = receivedPlayerIds.reduce((sum, id) => {
          const p = state.players.find(pl => pl.id === id);
          return sum + (p ? p.contract.salary : 0);
        }, 0);
        if (userTeam.totalPayroll > userTeam.salaryCap && receivedSalaryTotal > offeredSalaryTotal) {
          return false;
        }

        // Execute the trade
        const offeredPlayerIdsSet = new Set(offeredPlayerIds);
        const receivedPlayerIdsSet = new Set(receivedPlayerIds);
        const offeredPickIdsSet = new Set(offeredPickIds);
        const receivedPickIdsSet = new Set(receivedPickIds);

        const updatedPlayers = state.players.map(p => {
          if (offeredPlayerIdsSet.has(p.id)) return { ...p, teamId: counterpartTeamId };
          if (receivedPlayerIdsSet.has(p.id)) return { ...p, teamId: state.userTeamId };
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
              totalPayroll: t.totalPayroll - offeredSalary + receivedSalary,
              depthChart: buildDefaultDepthChart(allPlayers),
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
              totalPayroll: t.totalPayroll - receivedSalary + offeredSalary,
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

        const success = get().executeTrade(
          proposal.offeredPlayerIds,
          proposal.offeredPickIds,
          proposal.requestedPlayerIds,
          proposal.requestedPickIds,
          proposal.proposingTeamId,
        );

        set({
          tradeProposals: state.tradeProposals.map(p =>
            p.id === proposalId ? { ...p, status: accept && success ? 'accepted' : 'rejected' } : p,
          ),
        });

        return success;
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
          + blockedPicks.reduce((s, pk) => s + pickTradeValue(pk), 0);

        const blockedPositions = new Set(blockedPlayers.map(p => p.position));
        const seekPosSet = new Set(seekPositions);
        const proposals: TradeProposal[] = [];

        const aiTeams = state.teams.filter(t => t.id !== state.userTeamId);
        // Shuffle AI teams so we get varied proposals each time
        const shuffledTeams = [...aiTeams].sort(() => Math.random() - 0.5);

        for (const aiTeam of shuffledTeams) {
          const aiRoster = state.players.filter(p => p.teamId === aiTeam.id && !p.retired && !p.injury);

          // Interest: does the AI need any of the blocked positions?
          const needsBlockedPos = [...blockedPositions].some(pos => {
            const count = aiRoster.filter(p => p.position === pos).length;
            return count <= ROSTER_LIMITS[pos].min;
          });

          // 85% chance if they need the position, 40% random interest otherwise
          if (!needsBlockedPos && Math.random() > 0.40) continue;
          if (needsBlockedPos && Math.random() > 0.85) continue;

          // Build offer: when user specified seek positions, try to ONLY use those positions
          const hasPosPreference = seekPosSet.size > 0;

          // First pass: candidates at requested positions only
          const seekCandidates = aiRoster
            .filter(p => !blockedPositions.has(p.position) && seekPosSet.has(p.position))
            .sort((a, b) => b.ratings.overall - a.ratings.overall);

          // Fallback: all non-blocked-position players
          const allCandidates = aiRoster
            .filter(p => !blockedPositions.has(p.position))
            .sort((a, b) => b.ratings.overall - a.ratings.overall);

          // Find combination of players/picks matching ~75-120% of blocked value
          const offeredPlayerIds: string[] = [];
          const offeredPickIds: string[] = [];
          let offeredValue = 0;
          const targetMin = totalBlockedValue * 0.75;
          const targetMax = totalBlockedValue * 1.20;

          const aiPicks = aiTeam.draftPicks
            .filter(pk => pk.year >= state.season)
            .sort((a, b) => pickTradeValue(b) - pickTradeValue(a));

          // If user wants draft picks, lead with picks first
          if (seekDraftPicks) {
            for (const pk of aiPicks) {
              if (offeredValue >= targetMin) break;
              offeredPickIds.push(pk.id);
              offeredValue += pickTradeValue(pk);
            }
          }

          // First try: fill with seek-position players only
          if (hasPosPreference) {
            for (const candidate of seekCandidates) {
              if (offeredValue >= targetMin) break;
              const v = playerTradeValue(candidate);
              if (offeredValue + v <= targetMax * 1.3) {
                offeredPlayerIds.push(candidate.id);
                offeredValue += v;
              }
            }
          }

          // If seek positions couldn't fill value, supplement with other positions
          if (offeredValue < targetMin) {
            for (const candidate of allCandidates) {
              if (offeredValue >= targetMin) break;
              if (offeredPlayerIds.includes(candidate.id)) continue;
              const v = playerTradeValue(candidate);
              if (offeredValue + v <= targetMax * 1.3) {
                offeredPlayerIds.push(candidate.id);
                offeredValue += v;
              }
            }
          }

          // Add picks to fill value gap if needed (and not already added)
          if (offeredValue < targetMin && !seekDraftPicks) {
            for (const pk of aiPicks) {
              if (offeredValue >= targetMin) break;
              offeredPickIds.push(pk.id);
              offeredValue += pickTradeValue(pk);
            }
          }

          if (offeredValue < targetMin * 0.5) continue; // Can't match value at all
          if (offeredPlayerIds.length === 0 && offeredPickIds.length === 0) continue;

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
      setScoutingLevel: (level: 0 | 1 | 2 | 3 | 4) => {
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
        if (deepScoutedCount >= 5) return; // Max 5 deep scouts

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
            const sbGame = state.playoffBracket.find(m => m.id === 'super-bowl');
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
        const afcTeams = state.teams.filter(t => t.conference === 'AFC');
        const nfcTeams = state.teams.filter(t => t.conference === 'NFC');
        const bestAfc = afcTeams.sort((a, b) => b.record.wins - a.record.wins || a.record.losses - b.record.losses)[0];
        const bestNfc = nfcTeams.sort((a, b) => b.record.wins - a.record.wins || a.record.losses - b.record.losses)[0];

        // All-League teams
        const { first: allLeagueFirst, second: allLeagueSecond, allRookie: allRookieTeam } = computeAllLeagueTeams(state);

        const newSummary: import('@/types').SeasonSummary = {
          season: state.season,
          championTeamId: champion?.teamId ?? '',
          finalsMvpId: state.finalsMvpPlayerId ?? '',
          awards,
          bestRecord: {
            afc: { teamId: bestAfc?.id ?? '', wins: bestAfc?.record.wins ?? 0, losses: bestAfc?.record.losses ?? 0 },
            nfc: { teamId: bestNfc?.id ?? '', wins: bestNfc?.record.wins ?? 0, losses: bestNfc?.record.losses ?? 0 },
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

          return {
            ...p,
            age: p.age + 1,
            experience: isUnsignedFutureProspect ? 0 : p.experience + 1,
            stats: emptyStats(),
            injury: null,
            onIR: false,
            contract: isUnsignedFutureProspect
              ? p.contract
              : {
                  ...p.contract,
                  yearsLeft: p.contract.yearsLeft - 1,
                  // Reduce guaranteed money proportionally each year
                  guaranteed: p.contract.yearsLeft > 1 && p.contract.guaranteed
                    ? Math.round(((p.contract.guaranteed / p.contract.yearsLeft) * (p.contract.yearsLeft - 1)) * 10) / 10
                    : 0,
                },
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

        const newTeams = state.teams.map(t => {
          const retiredFromTeam = newlyRetiredOnTeam.filter(p => t.roster.includes(p.id));
          const salaryReduction = retiredFromTeam.reduce((sum, p) => sum + p.contract.salary, 0);
          const newRoster = t.roster.filter(pid => !newlyRetiredOnTeamIds.has(pid));
          // Remove retired from depth chart, then re-sort all positions by OVR
          const newDepthChart = POSITIONS.reduce<Record<Position, string[]>>((acc, pos) => {
            const active = (t.depthChart[pos] ?? []).filter(pid => !newlyRetiredOnTeamIds.has(pid));
            // Re-sort by OVR descending so best players are starters
            acc[pos] = active.sort((a, b) => {
              const pa = developedPlayers.find(p => p.id === a);
              const pb = developedPlayers.find(p => p.id === b);
              return (pb?.ratings.overall ?? 0) - (pa?.ratings.overall ?? 0);
            });
            return acc;
          }, {} as Record<Position, string[]>);
          // Expire dead cap entries (decrement years, remove expired)
          const updatedDeadCap = (t.deadCap ?? [])
            .map(dc => ({ ...dc, yearsLeft: dc.yearsLeft - 1 }))
            .filter(dc => dc.yearsLeft > 0);
          // Remove expired dead cap from payroll
          const expiredDeadCap = (t.deadCap ?? []).filter(dc => dc.yearsLeft <= 1);
          const deadCapRelief = expiredDeadCap.reduce((sum, dc) => sum + dc.amount, 0);

          return {
            ...t,
            record: emptyRecord(),
            roster: newRoster,
            totalPayroll: Math.max(0, t.totalPayroll - salaryReduction - deadCapRelief),
            depthChart: newDepthChart,
            deadCap: updatedDeadCap,
            // Refresh picks for new season
            draftPicks: [...t.draftPicks, ...[1, 2, 3, 4, 5, 6, 7].map(round => ({
              id: uuid(),
              year: newSeason,
              round,
              originalTeamId: t.id,
              ownerTeamId: t.id,
            }))],
          };
        });

        const finalPlayers = developedPlayers.map(p =>
          p.retired && !previouslyRetiredIds.has(p.id) ? { ...p, teamId: null } : p,
        );

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

        const newSchedule = generateSchedule(grownTeams, newSeason);

        // Preserve unsigned players as free agents for in-season signings
        const unsignedPlayerIds = allPlayersForNewSeason
          .filter(p => !p.teamId && !p.retired)
          .map(p => p.id);

        // Generate street free agents so there's always a pool for in-season signings
        // Real NFL always has ~100+ unsigned players available on the street
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
          playoffBracket: null,
          playoffSeeds: null,
          newsItems: retirementNews,
          seasonHistory: [...state.seasonHistory, newSummary],
          resigningPlayers: [],
          tradeProposals: [],
          draftScoutingData: {},
          finalsMvpPlayerId: null,
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

      setSuppressTradePopups: (val: boolean) => {
        set({ suppressTradePopups: val });
      },

      saveToSlot: (slot: 1 | 2) => {
        const stored = localStorage.getItem('gridiron-gm-autosave');
        if (stored) {
          localStorage.setItem(`gridiron-gm-save-${slot}`, stored);
        }
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
          if (isUserGame) return game; // keep full stats for user games (box score)
          // For non-user games, strip heavy data — scores are kept
          return { ...game, playerStats: {}, scoringPlays: undefined };
        });

        // Limit news items to last 200 to prevent unbounded growth
        const trimmedNews = state.newsItems.slice(-200);

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { initialized, ...rest } = state;
        return {
          ...rest,
          schedule: slimSchedule,
          newsItems: trimmedNews,
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
            if (!isUserGame) {
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
        return state;
      },
    },
  ),
);
