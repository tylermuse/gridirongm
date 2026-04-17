import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { idbStorage, getItem as idbGetItem, setItem as idbSetItem, flushPersist, flushPersistSync } from '@/lib/storage';
function uuid(): string {
  return crypto.randomUUID();
}
import type {
  LeagueState, Team, Player, GameResult, PlayerStats, PlayerRatings,
  NewsItem, TradeProposal, ResigningEntry, DraftPick, LeagueSettings,
  HoldoutEntry, TradeRumor, Rivalry, RivalryEvent,
  ExpansionTeamConfig, SocialPost, ImportedProspect,
} from '@/types';
import { emptyRecord, emptyStats, POSITIONS, ROSTER_LIMITS, DEFAULT_LEAGUE_SETTINGS, calculateDeadCap, calculateCapSavings, generateGuaranteed, getCapHit, getUnamortizedBonus, calculateDeadCapV2, calculateCapSavingsV2, materializeContractYears, deriveSubPosition, assignOlSlots, type Position, type DeadCapEntry, type ContractYear, type ContractRestructure } from '@/types';
import { LEAGUE_TEAMS } from '@/lib/data/teams';
import { loadLeagueFromUrl } from '@/lib/data/leagueImport';
import { NFL_2026_FIRST_ROUND, isNfl2026Roster, type MockDraftPick } from '@/lib/data/nfl2026Draft';
import { generateRoster, generateDraftClass, generatePlayer, generateCombineStats, recalculateOvr, generateCollegeStats } from './playerGen';
import { resetUsedNames } from '../data/names';
import { generateSchedule } from './schedule';
import { simulateGame, generateBettingLine } from './simulate';
import { developPlayers, POSITION_AGING } from './development';
import { generateWeeklyRecap } from './recap';
import { checkAchievements } from './achievements';
import { estimateSalary, LEAGUE_MINIMUM_SALARY, capInflationFactor, maxReasonableAAV } from './salary';
import { generateCoachingStaff, generateCoach, generatePositionCoaches, backfillCoachHistory, coachingBonus, progressCoaches, processCoachingCarousel, positionCoachDevMultiplier, rollOwnerPersonality } from './coaching';
import { computeLeagueQBTiers, getQBTierModifier } from './qbTierPyramid';
import { generateSeasonObjectives, evaluateObjectives } from './objectives';
import { defaultApproval, updateApprovalAfterGame, updateApprovalEndOfSeason, updateApprovalForMove } from './approval';
import { teamSpecialTeamsRating } from './specialTeams';
import { createExpansionTeamObject, runExpansionDraft, computeProtectionLimit } from './expansionDraft';
import { buildGmSyncPayload, syncGmStats } from './gmSync';
import { checkDisciplineEvents, disciplineNewsItems, tickSuspensions } from './discipline';
import { generateFilmReviewBlurb } from './scoutingReport';
import { generateSocialPosts } from './social';

const SAVE_VERSION = 27;

// Re-export for UI consumers
export { estimateSalary, LEAGUE_MINIMUM_SALARY, capInflationFactor } from './salary';
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
  newLeague: (teamId: string, leagueFileUrl?: string, startMode?: 'offseason' | 'regular') => Promise<void>;
  resetLeague: () => void;
  /** Set the game plan for the user team's NEXT regular-season game. Cleared when that week is simmed. */
  setNextGamePlan: (plan: {
    passRate: number;
    aggressiveness: 'conservative' | 'balanced' | 'aggressive';
    redZoneStrategy: 'run' | 'balanced' | 'pass';
    blitzRate?: number;
    coverage?: 'man' | 'zone' | 'balanced';
    tempo?: 'fast' | 'normal' | 'slow';
  } | null) => void;
  /** Generate the draft class preview if it doesn't already exist for the current season. */
  ensureDraftClassPreview: () => void;
  simWeek: () => void;
  simToWeek: (targetWeek: number) => void;
  simPreseasonWeek: () => void;
  skipPreseason: () => void;
  advanceToPlayoffs: () => void;
  simPlayoffGame: (matchupId: string) => void;
  simNextPlayoffGame: () => void;
  simPlayoffRound: () => void;
  simAllPlayoffGames: () => void;
  // PRD-03: Re-signing phase
  advanceToResigning: () => void;
  resignPlayer: (playerId: string, salary: number, years: number) => boolean;
  passOnResigning: (playerId: string) => void;
  passOnResigningBatch: (playerIds: string[]) => void;
  franchiseTagPlayer: (playerId: string) => boolean;
  resolveHoldout: (playerId: string, resolution: 'extend' | 'deny') => void;
  advanceToDraft: () => void;
  draftPlayer: (playerId: string) => void;
  simDraftPick: () => void;
  simToUserDraftPick: () => void;
  simToEndDraft: (options?: { skipAdvance?: boolean }) => void;
  /** Detect draftResults entries whose player no longer resolves and restore
   *  the corresponding pick slots to the front of draftOrder. Idempotent. */
  recoverOrphanDraftPicks: () => void;
  advanceToFreeAgency: () => void;
  advanceFADay: () => void;
  advanceFAWeek: () => void;
  signFreeAgent: (playerId: string, salary: number, years: number) => boolean;
  aiSignFreeAgents: () => void;
  releasePlayer: (playerId: string) => void;
  /** Cut all teams (or one team if id supplied) down to the 53-man roster
   *  limit by releasing the lowest-OVR players. No-op if rosterLimitEnabled
   *  is false. */
  autoCutToRosterLimit: (teamId?: string) => void;
  restructureContract: (playerId: string, conversionAmount: number, voidYearsToAdd: number) => boolean;
  extendPlayer: (playerId: string, salary: number, years: number) => boolean;
  placeOnIR: (playerId: string) => void;
  activateFromIR: (playerId: string) => void;
  togglePlayingThroughInjury: (playerId: string) => void;
  setBaseFormation: (formation: '3-4' | '4-3' | 'Nickel') => void;
  startNewSeason: () => void;
  // PRD-04: Trades
  executeTrade: (
    offeredPlayerIds: string[],
    offeredPickIds: string[],
    receivedPlayerIds: string[],
    receivedPickIds: string[],
    counterpartTeamId: string,
    skipValueCheck?: boolean,
    forceGodMode?: boolean,
  ) => { success: boolean; reason?: string };
  generateCounterOffer: (
    receivedPlayerIds: string[],
    receivedPickIds: string[],
    counterpartTeamId: string,
  ) => { sendPlayerIds: string[]; sendPickIds: string[] } | null;
  respondToTradeProposal: (proposalId: string, accept: boolean) => boolean;
  rejectAllTradeProposals: () => void;
  solicitTradingBlockProposals: (playerIds: string[], pickIds: string[], seekPositions: Position[], seekDraftPicks?: boolean) => void;
  // PRD-07: Scouting
  setScoutingLevel: (level: 0 | 1 | 2) => void;
  scoutPlayer: (playerId: string) => boolean;
  filmReviewPlayer: (playerId: string) => boolean;
  inPersonEvalPlayer: (playerId: string) => boolean;
  fullEvalPlayer: (playerId: string) => boolean;
  // Free Agency Intel Report
  intelReportFA: (playerId: string) => boolean;
  // Coaching
  replaceCoach: (role: import('@/types').CoachRole, specificCoach?: import('@/types').Coach) => void;
  // PRD-13: Depth chart
  reorderDepthChart: (position: Position, playerIds: string[]) => void;
  resetDepthChart: (position: Position) => void;
  simAllStarGame: () => void;
  commitLiveGame: (result: GameResult, matchupId?: string) => void;
  updateLeagueSettings: (settings: Partial<LeagueSettings>) => void;
  /** God Mode: edit any player's attributes */
  editPlayer: (playerId: string, updates: Partial<Player>) => void;
  /** God Mode: create a new player and add to the user's team */
  createPlayer: (data: { firstName: string; lastName: string; position: Position; age: number; overall: number; potential: number }) => string | null;
  setSuppressTradePopups: (val: boolean) => void;
  saveToSlot: (slot: number) => Promise<void>;
  loadFromSlot: (slot: number) => Promise<void>;
  createExpansionTeam: (config: ExpansionTeamConfig) => boolean;
  protectPlayers: (teamId: string, playerIds: string[]) => boolean;
  runExpansionDraftAction: () => void;
  cancelExpansionDraft: () => void;
  getTeam: (id: string) => Team | undefined;
  getPlayer: (id: string) => Player | undefined;
  getTeamRoster: (teamId: string) => Player[];
  getWeekGames: (week: number) => GameResult[];
  switchTeam: (newTeamId: string) => void;
  importDraftClass: (prospects: import('@/types').ImportedProspect[], targetYear?: number) => { count: number; skipped: number };
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
    const aRaw = depthChart[a.position]?.indexOf(a.id) ?? -1;
    const bRaw = depthChart[b.position]?.indexOf(b.id) ?? -1;
    // Players not in depth chart (indexOf returns -1) sort to the end
    const ai = aRaw < 0 ? 999 : aRaw;
    const bi = bRaw < 0 ? 999 : bRaw;
    return ai - bi;
  });
}

// ---------------------------------------------------------------------------
// Auto-draft helper
// ---------------------------------------------------------------------------

function autoDraftPlayerId(state: LeagueState, pickingTeamId: string): string | undefined {
  const totalPicks = state.teams.length * 7;
  const overallPick = totalPicks - state.draftOrder.length + 1;
  const round = Math.ceil(overallPick / state.teams.length);

  // Validate any returned pid actually resolves to a real player in state.players.
  // Without this guard, an orphaned ID in freeAgents leads to "ghost picks" in
  // the draft results table (team shows but player is "--").
  const playerExists = (id: string | undefined): boolean => {
    if (!id) return false;
    return state.players.some(p => p.id === id);
  };

  // Mock first-round picks: use mock in round 1, with ~40% BPA deviation
  // Real NFL mocks are ~50-60% accurate — top 5 picks more predictable
  if (round === 1 && state.nflMockDraft && state.nflMockDraft.length > 0) {
    const availableIds = new Set(state.freeAgents);

    // Find the mock pick for this overall pick number — only consider it valid
    // if both freeAgents has it AND a real player exists for the id.
    const mockForPick = state.nflMockDraft.find(m => m.pickNum === overallPick);
    let mockPickId: string | undefined;

    if (mockForPick && availableIds.has(mockForPick.playerId) && playerExists(mockForPick.playerId)) {
      mockPickId = mockForPick.playerId;
    }
    if (!mockPickId) {
      for (const mock of state.nflMockDraft) {
        if (availableIds.has(mock.playerId) && playerExists(mock.playerId)) {
          mockPickId = mock.playerId;
          break;
        }
      }
    }

    if (mockPickId) {
      // Pick 1: ALWAYS use mock (guaranteed #1 overall)
      if (overallPick === 1) return mockPickId;
      const mockChance = overallPick <= 3 ? 0.75 : overallPick <= 10 ? 0.60 : overallPick <= 20 ? 0.50 : 0.40;
      if (Math.random() < mockChance) return mockPickId;
    }
  }

  const roster = state.players.filter((player) => player.teamId === pickingTeamId);
  const countByPosition = POSITIONS.reduce<Record<Position, number>>((acc, position) => {
    acc[position] = roster.filter((player) => player.position === position).length;
    return acc;
  }, {} as Record<Position, number>);

  let prospects = state.freeAgents
    .map((id) => state.players.find((player) => player.id === id))
    .filter((player): player is Player => Boolean(player))
    .filter((player) => player.experience === 0);
  // Fallback: if experience filter killed all prospects, include all free agents
  if (prospects.length === 0) {
    prospects = state.freeAgents
      .map((id) => state.players.find((player) => player.id === id))
      .filter((player): player is Player => Boolean(player));
  }
  if (prospects.length === 0) {
    // Last resort: if no BPA prospects found in round 1, fall back to mock pick
    if (round === 1 && state.nflMockDraft && state.nflMockDraft.length > 0) {
      const availableIds = new Set(state.freeAgents);
      for (const mock of state.nflMockDraft) {
        if (availableIds.has(mock.playerId)) return mock.playerId;
      }
    }
    return undefined;
  }

  // Position draft value premium — mirrors real NFL draft tendencies.
  // QBs, OL, DL, and edge rushers are valued higher; RBs are devalued.
  const POSITION_DRAFT_VALUE: Record<Position, number> = {
    QB: 35,   // QBs go early — massive positional value
    OL: 20,   // Protect the QB — OL valued in early rounds
    DL: 18,   // Pass rushers are premium picks
    WR: 10,   // WRs go throughout the draft
    LB: 8,    // Linebackers — solid mid-round value
    CB: 5,    // CBs — slightly less premium than pass rush
    TE: 5,    // TEs go mid-rounds unless elite
    S: 0,     // Safeties — least valued in early rounds
    RB: -15,  // RBs devalued — "don't draft a RB in round 1" effect
    K: -50,   // Kickers/punters go very late
    P: -50,
  };

  const ranked = prospects
    .map((prospect) => {
      const limits = ROSTER_LIMITS[prospect.position];
      const count = countByPosition[prospect.position];
      const minNeed = Math.max(0, limits.min - count);
      const needScore = minNeed * 12;
      const posValue = POSITION_DRAFT_VALUE[prospect.position] ?? 0;
      let score = prospect.ratings.overall * 15 + prospect.potential * 0.5 + needScore + posValue;
      score += (Math.random() - 0.5) * 8;

      // Position max enforcement: heavily penalize positions already at or above max
      if (count >= limits.max) {
        score *= 0.05; // Nearly eliminate chance of drafting surplus positions
      }

      // QB premium: QBs are the most valuable position in football.
      // Teams draft QBs early even with decent starters — the upside
      // of a franchise QB is worth the investment.
      if (prospect.position === 'QB') {
        const bestQB = roster.filter(p => p.position === 'QB').sort((a, b) => b.ratings.overall - a.ratings.overall)[0];
        const qbOvr = bestQB?.ratings.overall ?? 0;
        if (count === 0) {
          score += 200; // No QB — must draft one
        } else if (qbOvr < 60) {
          score += 150; // Bad QB — strong upgrade motivation
        } else if (qbOvr < 70) {
          score += 80; // Below average — still worth upgrading
        } else if (qbOvr < 78) {
          // Average-to-good QB — draft if prospect is clearly better
          score += prospect.ratings.overall > qbOvr ? 50 : 10;
        } else {
          // Elite QB — only draft if at max roster QB count (handled above)
          score *= 0.4;
        }
      }

      if (prospect.position === 'K' || prospect.position === 'P') {
        score = minNeed > 0 ? score * 0.4 : score * 0.15;
      }
      return { playerId: prospect.id, score };
    })
    .sort((a, b) => b.score - a.score);

  // Walk down the ranked list — return the first one whose player exists.
  for (const r of ranked) {
    if (playerExists(r.playerId)) return r.playerId;
  }

  // Safety net: fall back to mock pick for round 1
  if (round === 1 && state.nflMockDraft && state.nflMockDraft.length > 0) {
    const availableIds = new Set(state.freeAgents);
    for (const mock of state.nflMockDraft) {
      if (availableIds.has(mock.playerId) && playerExists(mock.playerId)) return mock.playerId;
    }
  }

  // Last resort for any round: pick the first free agent that exists
  for (const id of state.freeAgents) {
    if (playerExists(id)) return id;
  }

  return undefined;
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

// Severity ordering for re-injury escalation. Picked to be monotonic: each
// entry is strictly worse than the previous.
const INJURY_SEVERITY_LADDER: { type: string; minWeeks: number; maxWeeks: number }[] = [
  { type: 'Sprain', minWeeks: 1, maxWeeks: 2 },
  { type: 'Strain', minWeeks: 2, maxWeeks: 4 },
  { type: 'Fracture', minWeeks: 4, maxWeeks: 8 },
  { type: 'ACL Tear', minWeeks: 10, maxWeeks: 14 },
];

/** Roll re-injury for each player who played through an injury in this game.
 *  Returns the updated player list plus a list of news entries describing each
 *  re-injury. A re-injury replaces the existing injury with one severity tier
 *  worse, and at least +50% longer than what was remaining. */
function rollReInjuries(
  players: Player[],
  teamRosterIds: Set<string>,
  gameLabel: string,
  season: number,
  week: number,
  userTeamId: string,
): { players: Player[]; news: NewsItem[] } {
  const news: NewsItem[] = [];
  const newPlayers = players.map(p => {
    if (!teamRosterIds.has(p.id)) return p;
    if (!p.playingThroughInjury || !p.injury || p.injury.weeksLeft <= 0) return p;
    const w = p.injury.weeksLeft;
    const chance = w >= 3 ? 0.25 : w === 2 ? 0.15 : 0.08;
    if (Math.random() >= chance) return p;
    // Escalate severity by one tier (capped at the worst)
    const currentTierIdx = INJURY_SEVERITY_LADDER.findIndex(t => t.type === p.injury!.type);
    const nextTier = INJURY_SEVERITY_LADDER[Math.min(
      (currentTierIdx >= 0 ? currentTierIdx : 0) + 1,
      INJURY_SEVERITY_LADDER.length - 1,
    )];
    // +50% longer than the current weeksLeft, or the tier's minimum — whichever is larger
    const minWeeks = Math.max(nextTier.minWeeks, Math.ceil(w * 1.5));
    const maxWeeks = Math.max(minWeeks, nextTier.maxWeeks);
    const newWeeks = minWeeks + Math.floor(Math.random() * (maxWeeks - minWeeks + 1));
    news.push(makeNews({
      season,
      week,
      type: 'injury',
      teamId: p.teamId ?? undefined,
      playerIds: [p.id],
      headline: `${p.firstName} ${p.lastName} re-injured playing through — ${nextTier.type}, out ${newWeeks} week${newWeeks > 1 ? 's' : ''}.`,
      body: `${p.firstName} ${p.lastName} aggravated an existing ${p.injury.type} in ${gameLabel} and now has a ${nextTier.type}. Expected to miss ${newWeeks} week${newWeeks > 1 ? 's' : ''}.`,
      isUserTeam: p.teamId === userTeamId,
    }));
    return {
      ...p,
      injury: { type: nextTier.type, weeksLeft: newWeeks },
      playingThroughInjury: false,
    };
  });
  return { players: newPlayers, news };
}

/** Decrement each injured player's weeksLeft by `weeks`, clearing the injury
 *  when it reaches 0. Used during playoffs where the regular-season weekly
 *  tick doesn't run. Also clears the playingThroughInjury flag when the
 *  injury finishes healing. */
function decrementInjuryWeeks(players: Player[], weeks: number): Player[] {
  if (weeks <= 0) return players;
  return players.map(p => {
    if (!p.injury || p.injury.weeksLeft <= 0) return p;
    const newLeft = p.injury.weeksLeft - weeks;
    if (newLeft <= 0) return { ...p, injury: null, playingThroughInjury: false };
    return { ...p, injury: { ...p.injury, weeksLeft: newLeft } };
  });
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

  // Post-game report cards for user team games
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
    const tied = userScore === oppScore;
    const resultWord = won ? 'defeat' : tied ? 'tie' : 'fall to';

    const headline = `${ut.abbreviation} ${resultWord} ${ot.abbreviation} ${userScore}\u2013${oppScore}`;

    const performers: { name: string; line: string }[] = [];
    for (const [pid, stats] of Object.entries(game.playerStats)) {
      const p = players.find(pl => pl.id === pid);
      if (!p || p.teamId !== userTeamId) continue;
      const s = stats as Record<string, number>;

      if (p.position === 'QB' && (s.passYards ?? 0) > 0) {
        const tds = s.passTDs ?? 0; const ints = s.interceptions ?? 0;
        performers.push({ name: `${p.firstName} ${p.lastName}`, line: `${s.passYards} yds, ${tds} TD${tds !== 1 ? 's' : ''}${ints > 0 ? `, ${ints} INT${ints !== 1 ? 's' : ''}` : ''} passing` });
      }
      if ((s.rushYards ?? 0) >= 40) {
        const tds = s.rushTDs ?? 0;
        performers.push({ name: `${p.firstName} ${p.lastName}`, line: `${s.rushYards} yds${tds > 0 ? `, ${tds} TD${tds !== 1 ? 's' : ''}` : ''} rushing` });
      }
      if ((s.receivingYards ?? 0) >= 40) {
        const rec = s.receptions ?? 0; const tds = s.receivingTDs ?? 0;
        performers.push({ name: `${p.firstName} ${p.lastName}`, line: `${rec} rec, ${s.receivingYards} yds${tds > 0 ? `, ${tds} TD${tds !== 1 ? 's' : ''}` : ''}` });
      }
      if ((s.sacks ?? 0) >= 1) performers.push({ name: `${p.firstName} ${p.lastName}`, line: `${s.sacks} sack${(s.sacks ?? 0) !== 1 ? 's' : ''}` });
      if ((s.defensiveINTs ?? 0) >= 1) performers.push({ name: `${p.firstName} ${p.lastName}`, line: `${s.defensiveINTs} INT${(s.defensiveINTs ?? 0) !== 1 ? 's' : ''}` });
    }
    const topPerformers = performers.slice(0, 4);

    const seed = season * 10000 + week * 100 + (won ? 1 : 0);
    const coachQuotes = won
      ? margin >= 21 ? [`"Complete performance on both sides of the ball."`, `"That's our standard. We brought it tonight."`, `"Dominant effort. Proud of these guys."`, `"Everything clicked today. That's championship football."`]
      : margin >= 10 ? [`"Solid win. We controlled the game start to finish."`, `"Really pleased with how we executed the game plan."`, `"The guys came out focused. That's what good teams do."`, `"Good complementary football. Defense and offense both showed up."`]
      : [`"Gutsy win. These close ones build character."`, `"That was a dogfight. Respect to ${ot.abbreviation} — they made us earn it."`, `"Finding ways to win tight games — that's growth."`, `"We kept our composure in a tough environment."`]
      : tied ? [`"Frustrating not to close that out."`, `"A tie feels like a loss when you had chances to win."`]
      : margin >= 21 ? [`"That's on me. I have to put our guys in better positions."`, `"Embarrassing. We got outcoached and outplayed."`, `"No excuses. We weren't prepared and it showed."`, `"Unacceptable. We'll be making changes this week."`]
      : margin >= 10 ? [`"We were outmatched today. Back to the drawing board."`, `"${ot.abbreviation} was the better team. We have to respond."`, `"Too many mistakes. Can't beat good teams playing like that."`, `"Disappointing. We're better than what we showed today."`]
      : [`"We were in it until the end but couldn't finish."`, `"Close loss. We need to learn how to win these."`, `"Just didn't make the plays when it mattered."`, `"A few plays away. We'll get it corrected."`];

    const coachLine = coachQuotes[seed % coachQuotes.length];

    const record = ut.record;
    const totalGames = record.wins + record.losses;
    const winPct = totalGames > 0 ? record.wins / totalGames : 0.5;
    const fanReactions = won
      ? winPct >= 0.7 ? [`Fans chanting "Super Bowl!" as the stadium empties.`, `Electric atmosphere. Season ticket renewals through the roof.`]
      : winPct >= 0.4 ? [`A much-needed win gives the fanbase reason for optimism.`, `Solid crowd energy today. Fans starting to believe.`]
      : [`Fans relieved to finally see a W. "About time."`, `A rare bright spot in a tough season.`]
      : winPct <= 0.3 ? [`Boos rain down as the clock hits zero.`, `Sections of empty seats by the fourth quarter.`, `Fan frustration boiling over.`]
      : winPct <= 0.5 ? [`A quiet crowd files out. Patience wearing thin.`, `Mixed reactions from a fanbase searching for answers.`]
      : [`Stunned silence from a crowd that expected more.`, `Disappointing result for a team with higher aspirations.`];
    const fanLine = fanReactions[seed % fanReactions.length];

    const bodyLines: string[] = [];
    if (topPerformers.length > 0) {
      bodyLines.push('KEY PERFORMERS:');
      for (const perf of topPerformers) bodyLines.push(`\u2022 ${perf.name}: ${perf.line}`);
      bodyLines.push('');
    }
    bodyLines.push(`POSTGAME: ${coachLine} \u2014 ${ut.abbreviation} HC`);
    bodyLines.push('');
    bodyLines.push(`FANS: ${fanLine}`);

    const recapPlayerIds = topPerformers.map(perf => {
      const match = players.find(p => p.teamId === userTeamId && `${p.firstName} ${p.lastName}` === perf.name);
      return match?.id;
    }).filter((id): id is string => !!id);

    news.push(makeNews({ season, week, type: 'recap', teamId: userTeamId!, playerIds: recapPlayerIds, headline, body: bodyLines.join('\n'), isUserTeam: true }));
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

// Draft pick value chart — exponential decay by overall pick number.
// Inspired by NFL draft value charts (Jimmy Johnson). Pick #1 ≈ 3000, pick #32 ≈ 600.
// Value = 3000 * e^(-0.032 * (pickNum - 1)) for picks 1-224.
// This makes top picks DRAMATICALLY more valuable than late picks,
// preventing exploits like trading pick #30 for pick #2.
function draftPickPointValue(overallPick: number): number {
  return Math.round(3000 * Math.exp(-0.032 * (overallPick - 1)));
}

// Estimate overall pick number from round + team record
function estimateOverallPick(round: number, teams: Team[], originalTeamId: string): number {
  const numTeams = teams.length || 32;
  // Sort teams by record (worst first) to estimate pick position within round
  const sorted = [...teams].sort((a, b) => {
    const aWp = a.record.wins / Math.max(1, a.record.wins + a.record.losses);
    const bWp = b.record.wins / Math.max(1, b.record.wins + b.record.losses);
    return aWp - bWp;
  });
  const posInRound = sorted.findIndex(t => t.id === originalTeamId);
  const slot = posInRound >= 0 ? posInRound : Math.floor(numTeams / 2); // default to middle
  return (round - 1) * numTeams + slot + 1;
}

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
  // Exponential curve scaled to match draft pick values.
  // 56 OVR → ~80, 65 OVR → ~350, 70 OVR → ~600, 80 OVR → ~1500, 90 OVR → ~3500
  // A 90 OVR player should be worth roughly a top-3 pick.
  const normalized = Math.max(0, (player.ratings.overall - 40) / 55);
  const base = Math.pow(normalized, 2.5) * 3500;
  const potBonus = Math.max(0, player.potential - player.ratings.overall) * 8;
  const rawValue = (base + potBonus) * ageMultiplier * posMultiplier;
  // Contract multiplier — expiring players are nearly worthless in trades
  let contractMult = 1.0;
  if (player.contract.yearsLeft <= 0) contractMult = 0.15;       // expiring / FA — almost no value
  else if (player.contract.yearsLeft === 1) contractMult = 0.50;  // 1 year left — half value
  else if (player.contract.yearsLeft === 2) contractMult = 0.80;  // 2 years — slight discount
  return rawValue * contractMult;
}

/** Generates a position-by-position preview grade for the upcoming draft class.
 *  Uses a fresh sample-generated draft class to preview class quality without
 *  committing to specific players. The actual class is generated at draft time. */
function generateDraftClassPreview(season: number): { season: number; groups: { position: string; grade: string; depthNote: string; ovrLow: number; ovrHigh: number; topOvr: number }[] } {
  // Generate a sample class to estimate quality distributions
  const sample = generateDraftClass(224, { chaosDraft: false });
  const POSITIONS_TO_RATE: Position[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S'];

  function gradeFromOvrs(ovrs: number[]): { grade: string; depthNote: string; ovrLow: number; ovrHigh: number; topOvr: number } {
    if (ovrs.length === 0) {
      return { grade: 'C', depthNote: 'No prospects available', ovrLow: 0, ovrHigh: 0, topOvr: 0 };
    }
    const sorted = [...ovrs].sort((a, b) => b - a);
    const top1 = sorted[0];
    const top3Avg = sorted.slice(0, 3).reduce((s, v) => s + v, 0) / Math.min(3, sorted.length);
    const top10 = sorted.slice(0, 10);
    const top10Avg = top10.reduce((s, v) => s + v, 0) / top10.length;
    const startersCount = ovrs.filter(o => o >= 70).length;

    // Composite score: top1 weighted more, then top3, then top10
    const composite = top1 * 0.4 + top3Avg * 0.35 + top10Avg * 0.25;

    let grade: string;
    if (composite >= 86) grade = 'A+';
    else if (composite >= 82) grade = 'A';
    else if (composite >= 79) grade = 'A-';
    else if (composite >= 76) grade = 'B+';
    else if (composite >= 73) grade = 'B';
    else if (composite >= 70) grade = 'B-';
    else if (composite >= 67) grade = 'C+';
    else if (composite >= 64) grade = 'C';
    else grade = 'C-';

    let depthNote: string;
    if (top1 >= 85 && startersCount >= 8) depthNote = 'Loaded class — elite top, deep pool';
    else if (top1 >= 85 && startersCount < 5) depthNote = 'Strong top-end talent, limited depth';
    else if (top1 < 75 && startersCount >= 8) depthNote = 'Thin at the top, good depth';
    else if (startersCount >= 6) depthNote = 'Deep class with several starters';
    else if (top1 >= 80) depthNote = 'A few quality prospects, weak depth';
    else depthNote = 'Weak class overall — developmental prospects';

    // OVR range covers the top-10 prospects at this position with a small noise
    // pad so the range feels like a scouting estimate rather than a hard number.
    const top10Min = Math.min(...top10);
    return {
      grade,
      depthNote,
      ovrLow: Math.max(40, top10Min - 1),
      ovrHigh: Math.min(95, top1 + 1),
      topOvr: top1,
    };
  }

  const groups = POSITIONS_TO_RATE.map(pos => {
    const posOvrs = sample.filter(p => p.position === pos).map(p => p.ratings.overall);
    const result = gradeFromOvrs(posOvrs);
    return { position: pos, ...result };
  });

  return { season, groups };
}

/** Pick value based on estimated overall pick number.
 *  Uses exponential curve: pick #1 ≈ 3000, #10 ≈ 2200, #20 ≈ 1600, #32 ≈ 1100, #64 ≈ 400. */
export function pickTradeValue(pick: DraftPick, teams?: Team[]): number {
  if (teams && teams.length > 0) {
    const overallPick = estimateOverallPick(pick.round, teams, pick.originalTeamId);
    return draftPickPointValue(overallPick);
  }
  // Fallback: use round midpoint estimate (assumes 32 teams)
  const midPick = (pick.round - 1) * 32 + 16;
  return draftPickPointValue(midPick);
}

// ---------------------------------------------------------------------------
// Scouting helpers (PRD-07)
// ---------------------------------------------------------------------------

/**
 * Scouting noise system — rank-aware variance.
 *
 * Top prospects are well-known commodities (low noise).
 * Later picks have more uncertainty, making scouting valuable.
 *
 * Base OVR error by tier (Entry scouting, level 0):
 *   Top 10:    ±6-9    (everyone knows the top talent)
 *   Picks 11-32: ±8-12
 *   Day 2 (33-100): ±11-17
 *   Late/UDFA (100+): ±15-23
 *
 * Pro scouting (level 1) cuts error by ~55%.
 * Elite scouting (level 2) cuts error by ~80%.
 * Deep Scout narrows to ±2 and re-centers on true OVR.
 *
 * Bust/boom flags (~5% of top-20, ~4% of picks 40-80) add extra noise.
 */

/** Simple hash from player ID + salt */
type NewScoutingState = NonNullable<LeagueState['scoutingState']>;
function migrateScoutingState(raw: LeagueState['scoutingState']): NewScoutingState {
  if (raw && 'filmReviews' in raw) return raw as NewScoutingState;
  return { scoutPoints: (raw as any)?.scoutPoints ?? 10, maxScoutPoints: (raw as any)?.maxScoutPoints ?? 20, filmReviews: {}, inPersonEvals: {}, inPersonEvalCount: 0, fullEvals: {}, fullEvalCount: 0 };
}

function seedFromId(id: string, salt = 0): number {
  let h = salt;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Deterministic hash from player ID → stable noise factor in [-1, 1] */
function playerNoiseDirection(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  const h2 = ((h * 2654435769) >>> 0) / 4294967296;
  const u1 = Math.max(0.001, h2);
  const h3 = (((h * 1103515245 + 12345) >>> 0) & 0x7fffffff) / 2147483647;
  const u2 = h3;
  const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(-2.5, Math.min(2.5, gaussian));
}

/** Deterministic bust/boom flag based on player ID */
function playerBustBoomRoll(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  }
  return ((h * 48271) >>> 0) / 4294967296; // [0, 1)
}

/** Base error for a prospect at a given true rank.
 *  Wide enough that scouting always adds meaningful value.
 *  Deep scouting narrows to ±2. */
function baseErrorForRank(rank: number): number {
  if (rank <= 10) return 6 + Math.min(3, rank * 0.3);            // ±6-9
  if (rank <= 32) return 8 + Math.min(4, (rank - 10) * 0.18);    // ±8-12
  if (rank <= 100) return 11 + Math.min(6, (rank - 32) * 0.09);  // ±11-17
  return 15 + Math.min(8, (rank - 100) * 0.05);                   // ±15-23
}

/** Scouting level multipliers — how much error is retained.
 *  Entry: wide ranges, Pro: moderate, Elite: tight. */
const SCOUTING_LEVEL_MULT = [1.0, 0.45, 0.20]; // Entry, Pro, Elite

function computeScoutingData(
  prospects: Player[],
  scoutingLevel: number,
): Record<string, { scoutedOvr: number; error: number; deepScouted: boolean }> {
  // Sort by true OVR (desc) to determine true rank tiers — K/P deprioritized
  const sorted = [...prospects].sort((a, b) => {
    const aAdj = (a.position === 'K' || a.position === 'P') ? a.ratings.overall * 0.5 : a.ratings.overall;
    const bAdj = (b.position === 'K' || b.position === 'P') ? b.ratings.overall * 0.5 : b.ratings.overall;
    return bAdj - aAdj;
  });
  const trueRankMap = new Map<string, number>();
  sorted.forEach((p, i) => trueRankMap.set(p.id, i + 1));

  const levelMult = SCOUTING_LEVEL_MULT[scoutingLevel] ?? 1.0;
  const data: Record<string, { scoutedOvr: number; error: number; deepScouted: boolean }> = {};

  for (const p of prospects) {
    const trueRank = trueRankMap.get(p.id) ?? 100;
    const rawError = baseErrorForRank(trueRank);
    const error = Math.max(1, Math.round(rawError * levelMult));

    // Deterministic noise direction — stable across scouting levels
    const direction = playerNoiseDirection(p.id);
    const normalizedDir = direction / 2.5; // [-1, 1]

    // Bust/boom: rare chance of extra noise
    const bbRoll = playerBustBoomRoll(p.id);
    let extraNoise = 0;
    if (trueRank <= 20 && bbRoll < 0.06) {
      // ~6% bust flag on top-20: scouted OVR drops 8-15 points
      extraNoise = -(8 + Math.round(bbRoll * 100)); // deterministic drop
    } else if (trueRank >= 40 && trueRank <= 80 && bbRoll > 0.96) {
      // ~4% boom flag on picks 40-80: scouted OVR rises 8-12 points
      extraNoise = 8 + Math.round((1 - bbRoll) * 100);
    }
    // Scouting reduces bust/boom noise too
    const scaledExtra = Math.round(extraNoise * levelMult);

    const noise = Math.round(normalizedDir * error) + scaledExtra;
    const scoutedOvr = Math.max(20, Math.min(99, p.ratings.overall + noise));
    data[p.id] = { scoutedOvr, error, deepScouted: false };
  }
  return data;
}

// ---------------------------------------------------------------------------
// Re-signing helpers (PRD-03)
// ---------------------------------------------------------------------------

// estimateSalary is now imported from ./salary.ts (re-exported above for external consumers)

/** estimateSalary with cap inflation derived from a team's current salary cap */
function marketSalary(p: Player, teamCap: number): number {
  return estimateSalary(p.ratings.overall, p.position, p.age, p.potential, capInflationFactor(teamCap));
}

/** Compute franchise tag salary: blended positional average scaled by the player's quality.
 *  For elite players (OVR 85+), this equals the top-5 positional average (like the real league).
 *  For average or below players, the tag is capped at a reasonable multiple of their market value
 *  so you don't see a 49 OVR player commanding $36M on a tag.
 */
/**
 * Recalculate a team's totalPayroll from scratch using actual roster contracts + dead cap.
 * Prevents payroll drift from incremental tracking errors.
 */
function recalculateTeamPayroll(team: Team, allPlayers: Player[]): number {
  const rosterPayroll = team.roster.reduce((sum, pid) => {
    const p = allPlayers.find(pl => pl.id === pid);
    if (!p || p.retired) return sum;
    return sum + getCapHit(p.contract);
  }, 0);
  const deadCapTotal = (team.deadCap ?? []).reduce((sum, dc) => sum + dc.amount, 0);
  return Math.round((rosterPayroll + deadCapTotal) * 10) / 10;
}

export function computeFranchiseTagSalary(position: Position, players: Player[], taggedPlayer?: Player): number {
  const posPlayers = players
    .filter(p => p.position === position && p.teamId && !p.retired)
    .sort((a, b) => b.contract.salary - a.contract.salary);
  const top5 = posPlayers.slice(0, 5);
  if (top5.length === 0) return LEAGUE_MINIMUM_SALARY;
  const positionalAvg = top5.reduce((sum, p) => sum + p.contract.salary, 0) / top5.length;

  // If no specific player provided, return the raw positional average
  if (!taggedPlayer) return Math.round(positionalAvg * 10) / 10;

  // Franchise tag = guaranteed 1-year deal at a modest premium over market value.
  // It should be competitive with (slightly above) the player's asking price,
  // making it a viable "guaranteed retention" tool vs. the negotiation risk of extending.
  // Elite players: tag approaches the top-5 positional average (real NFL formula).
  // Others: tag = market value + small premium (5-15%).
  // Market value — franchise tag is based on top-5 positional averages which already
  // reflect cap inflation through existing contracts, so no explicit inflation needed here.
  const playerMarket = estimateSalary(taggedPlayer.ratings.overall, taggedPlayer.position, taggedPlayer.age, taggedPlayer.potential);
  const ovr = taggedPlayer.ratings.overall;

  let tag: number;
  if (ovr >= 85) {
    // True elite: top-5 positional average (but floor at market + 10%)
    tag = Math.max(positionalAvg, playerMarket * 1.10);
  } else if (ovr >= 75) {
    // Very good: blend between market and positional average
    const blend = (ovr - 75) / 10; // 0 at 75, 1 at 85
    tag = playerMarket * (1.08 + blend * 0.07) // 108% to 115%
  } else {
    // Starters and below: small premium (5-8%) over market
    tag = playerMarket * (ovr >= 65 ? 1.08 : 1.05);
  }

  // Floor: at least market value
  tag = Math.max(tag, playerMarket);

  return Math.round(tag * 10) / 10;
}

/** Returns the price multiplier for the current FA day (1.0 on day 1, minimum 0.50 on day 30). */
export function faPriceDecay(faDay: number): number {
  if (faDay <= 5) return 1.0;
  if (faDay <= 15) return 1.0 - (faDay - 5) * 0.02;   // -2%/day → day 15 = 0.80
  if (faDay <= 25) return 0.80 - (faDay - 15) * 0.03;  // -3%/day → day 25 = 0.50
  return 0.50;                                           // floor at 50%
}

/** Assign a free-agency priority to a player based on deterministic seed. */
function assignFAPriority(player: Player): 'money' | 'winning' | 'role' | 'loyalty' {
  const seed = seedFromId(player.id, 42);
  // Weight by player attributes
  const isElite = player.ratings.overall >= 82;
  const isOld = player.age >= 31;
  const isYoung = player.age <= 25;
  const hasLoyalty = (player.experience ?? 0) >= 5;

  // Deterministic bucket from seed
  const bucket = seed % 100;

  if (isElite && isOld) {
    // Older elite players want rings
    if (bucket < 55) return 'winning';
    if (bucket < 80) return 'money';
    if (bucket < 95) return 'loyalty';
    return 'role';
  }
  if (isYoung) {
    // Young players want money or role
    if (bucket < 45) return 'money';
    if (bucket < 75) return 'role';
    if (bucket < 90) return 'winning';
    return 'loyalty';
  }
  if (hasLoyalty) {
    if (bucket < 30) return 'loyalty';
    if (bucket < 60) return 'money';
    if (bucket < 85) return 'winning';
    return 'role';
  }
  // Default distribution
  if (bucket < 40) return 'money';
  if (bucket < 65) return 'winning';
  if (bucket < 85) return 'role';
  return 'loyalty';
}

/** Determines which free agents refuse to negotiate with the user's team. */
function computeFARefusals(
  freeAgentIds: string[],
  players: Player[],
  userTeam: Team,
  faDay: number,
): string[] {
  const totalGames = userTeam.record.wins + userTeam.record.losses + userTeam.record.ties;
  const winPct = totalGames > 0 ? (userTeam.record.wins + userTeam.record.ties * 0.5) / totalGames : 0.5;
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
  const ci = capInflationFactor(team.salaryCap);
  // Very unhappy players (mood < 20) refuse to re-sign entirely
  if (player.mood < 20) {
    const base = estimateSalary(player.ratings.overall, player.position, player.age, player.potential, ci);
    return { playerId: player.id, askingSalary: Math.round(base * 10) / 10, askingYears: 1, refusesToResign: true };
  }

  const base = estimateSalary(player.ratings.overall, player.position, player.age, player.potential, ci);
  const tg = team.record.wins + team.record.losses + team.record.ties;
  const winPct = tg > 0 ? (team.record.wins + team.record.ties * 0.5) / tg : 0.5;
  let mult = 1.0;
  // Winning teams get a small hometown discount; losing teams pay a premium
  if (winPct < 0.4) mult *= 1.10;
  else if (winPct > 0.65) mult *= 0.95;
  // Unhappy players (mood 20-40) demand a premium to stay
  if (player.mood < 30) mult *= 1.15;
  else if (player.mood < 40) mult *= 1.08;
  // Older players accept slight discounts but not massive ones
  if (player.age >= 32) mult *= 0.90;
  let askingSalary = Math.round(Math.max(LEAGUE_MINIMUM_SALARY, base * mult) * 10) / 10;
  // K/P salary caps — scale with cap inflation
  if (player.position === 'K') askingSalary = Math.min(askingSalary, 4.0 * ci);
  if (player.position === 'P') askingSalary = Math.min(askingSalary, 2.5 * ci);
  // Players want long-term security — asking for multi-year deals
  // makes the 1-year franchise tag a meaningful strategic trade-off
  const askingYears = player.age >= 34 ? 2
    : player.age >= 32 ? 3
    : player.age >= 30 ? 3 + (player.ratings.overall >= 70 ? 1 : 0) // 3-4yr
    : player.age >= 28 ? 4 + (player.ratings.overall >= 75 ? 1 : 0) // 4-5yr
    : player.ratings.overall >= 70 ? 4 + (player.age <= 26 ? 1 : 0) // good young: 4-5yr
    : 3 + (player.age <= 25 ? 1 : 0); // average young: 3-4yr
  return { playerId: player.id, askingSalary, askingYears };
}

/**
 * Compute holdout demands for under-contract players who are underpaid/unhappy.
 * Only applies to the user's team. Capped at 3 holdouts.
 */
function computeHoldoutDemands(players: Player[], userTeamId: string, season: number): HoldoutEntry[] {
  const candidates = players.filter(p =>
    p.teamId === userTeamId &&
    !p.retired &&
    !p.onIR &&
    p.contract.yearsLeft >= 2 && // must have 2+ years remaining
    !(p.lastRestructuredSeason !== undefined && season - p.lastRestructuredSeason < 2), // not recently restructured
  );

  const eligible: { player: Player; underpaidRatio: number }[] = [];

  for (const p of candidates) {
    const marketValue = estimateSalary(p.ratings.overall, p.position, p.age, p.potential);
    const underpaidRatio = marketValue / Math.max(0.5, p.contract.salary);

    // Must be significantly underpaid (market > 1.35x current salary)
    if (underpaidRatio < 1.35) continue;

    // Gate: low mood OR elite player
    if (p.mood >= 50 && p.ratings.overall < 85) continue;

    eligible.push({ player: p, underpaidRatio });
  }

  // Sort by underpaid ratio (most underpaid first), star priority
  eligible.sort((a, b) => {
    return b.underpaidRatio - a.underpaidRatio;
  });

  // Cap at 3
  const selected = eligible.slice(0, 3);

  return selected.map(({ player }) => {
    const marketValue = estimateSalary(player.ratings.overall, player.position, player.age, player.potential);
    // They want somewhere between market and 110% of market
    const demandedSalary = Math.round(marketValue * (1.0 + Math.random() * 0.1) * 10) / 10;
    const demandedYears = player.age >= 30 ? 2 : player.age >= 27 ? 3 : 4;
    return {
      playerId: player.id,
      demandedSalary,
      demandedYears,
      resolved: false,
    };
  });
}

// ---------------------------------------------------------------------------
// Playoff helpers
// ---------------------------------------------------------------------------

function winPct(t: Team): number {
  const totalGames = t.record.wins + t.record.losses + t.record.ties;
  return totalGames > 0 ? (t.record.wins + t.record.ties * 0.5) / totalGames : 0;
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

  // OVR threshold — major awards require minimum talent level
  const majorEligible = activePlayers.filter(p => p.ratings.overall >= 70);
  const rookieEligible = activePlayers.filter(p => p.ratings.overall >= 60);

  const withGames = (pos: string[], pool: typeof activePlayers = majorEligible) =>
    pool.filter(p => pos.includes(p.position) && p.stats.gamesPlayed >= 10);

  // MVP — QBs should win ~70-80% of the time (matching real NFL patterns).
  // Team wins are a near-prerequisite, passing stats dominate for QBs.
  const mvpCandidates = withGames(['QB', 'RB', 'WR', 'TE']);
  const mvpScore = (p: typeof mvpCandidates[0]) => {
    // Team win bonus — winning record is critical for MVP candidacy
    const team = state.teams.find(t => t.id === p.teamId);
    const gp = team ? team.record.wins + team.record.losses : 1;
    const winPct = team ? team.record.wins / Math.max(1, gp) : 0.5;
    const wins = team?.record.wins ?? 0;
    // Strong bonus for winning: 10+ wins gets significant boost, sub-.500 gets penalty
    const winBonus = wins * 8 + (winPct >= 0.65 ? 50 : winPct >= 0.5 ? 20 : -40);

    if (p.position === 'QB') {
      // QBs: passing production is king. Elite stat line + wins = MVP.
      return p.stats.passYards * 0.05 + p.stats.passTDs * 8 - p.stats.interceptions * 6
        + p.stats.rushTDs * 4 + p.stats.rushYards * 0.02
        + winBonus * 1.2; // QBs get extra win credit (they drive wins)
    }
    if (p.position === 'RB')
      return p.stats.rushYards * 0.06 + p.stats.rushTDs * 6 + p.stats.receivingYards * 0.02 + winBonus;
    if (p.position === 'TE')
      return p.stats.receivingYards * 0.08 + p.stats.receivingTDs * 8 + winBonus;
    // WR
    return p.stats.receivingYards * 0.06 + p.stats.receivingTDs * 6 + winBonus;
  };
  if (mvpCandidates.length > 0) {
    const mvp = mvpCandidates.sort((a, b) => mvpScore(b) - mvpScore(a))[0];
    awards.push({ award: 'MVP', playerId: mvp.id, teamId: mvp.teamId! });
  }

  // DPOY — weighted defensive stats, edge rushers and playmakers favored
  const defensivePlayers = withGames(['DL', 'LB', 'CB', 'S']);
  if (defensivePlayers.length > 0) {
    const dpoyScore = (p: Player) => {
      const team = state.teams.find(t => t.id === p.teamId);
      const winBonus = team ? team.record.wins * 3 : 0;
      return p.stats.tackles * 0.5 + p.stats.sacks * 8 + p.stats.defensiveINTs * 7
        + (p.stats.tacklesForLoss ?? 0) * 2 + (p.stats.passDeflections ?? 0) * 2
        + (p.stats.forcedFumbles ?? 0) * 4 + winBonus;
    };
    const dpoy = defensivePlayers.sort((a, b) => dpoyScore(b) - dpoyScore(a))[0];
    awards.push({ award: 'Defensive POY', playerId: dpoy.id, teamId: dpoy.teamId! });
  }

  // OPOY — yards + TDs based, QBs must be 20% better to win (since they accumulate way more yards)
  const opoyCandidates = withGames(['QB', 'RB', 'WR', 'TE']);
  if (opoyCandidates.length > 0) {
    const opoyScore = (p: Player) => {
      const yards = p.stats.passYards + p.stats.rushYards + p.stats.receivingYards;
      const tds = p.stats.passTDs + p.stats.rushTDs + p.stats.receivingTDs;
      return yards + tds * 30; // 30 bonus pts per TD
    };
    const sorted = opoyCandidates.sort((a, b) => opoyScore(b) - opoyScore(a));
    const top = sorted[0];
    const second = sorted[1];
    // QBs must outscore the next candidate by 20% to win OPOY
    if (top.position === 'QB' && second && opoyScore(top) < opoyScore(second) * 1.20) {
      // QB didn't clear the 20% threshold — give it to the best non-QB
      const nonQB = sorted.find(p => p.position !== 'QB');
      if (nonQB) {
        awards.push({ award: 'Offensive POY', playerId: nonQB.id, teamId: nonQB.teamId! });
      } else {
        awards.push({ award: 'Offensive POY', playerId: top.id, teamId: top.teamId! });
      }
    } else {
      awards.push({ award: 'Offensive POY', playerId: top.id, teamId: top.teamId! });
    }
  }

  const rookies = rookieEligible.filter(p => p.experience === 1 && p.stats.gamesPlayed >= 10);
  const offensiveRookies = rookies.filter(p => ['QB', 'RB', 'WR', 'TE', 'OL'].includes(p.position));
  if (offensiveRookies.length > 0) {
    const oroy = offensiveRookies.sort((a, b) => allLeagueScore(b) - allLeagueScore(a))[0];
    awards.push({ award: 'Offensive ROY', playerId: oroy.id, teamId: oroy.teamId! });
  }
  const defensiveRookies = rookies.filter(p => ['DL', 'LB', 'CB', 'S'].includes(p.position));
  if (defensiveRookies.length > 0) {
    const droy = defensiveRookies.sort((a, b) => allLeagueScore(b) - allLeagueScore(a))[0];
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

/** Performance score: 80% season stats (totals, not per-game), 20% OVR.
 *  A player who plays 17 games with big numbers should beat a higher-OVR
 *  player who missed time or underperformed. Total stats reward availability. */
function allLeagueScore(p: Player): number {
  const s = p.stats;
  let statPts = 0;
  switch (p.position) {
    case 'QB':
      statPts = s.passTDs * 6 + s.passYards / 20 - s.interceptions * 8 + s.rushTDs * 6 + s.rushYards / 25;
      break;
    case 'RB':
      statPts = s.rushYards / 8 + s.rushTDs * 8 + s.receptions * 1.0 + s.receivingYards / 15 + s.receivingTDs * 6;
      break;
    case 'WR':
    case 'TE':
      statPts = s.receptions * 1.5 + s.receivingYards / 8 + s.receivingTDs * 8;
      break;
    case 'DL':
    case 'LB':
      statPts = s.tackles * 1.5 + s.sacks * 6 + s.defensiveINTs * 10 + s.forcedFumbles * 5;
      break;
    case 'CB':
    case 'S':
      statPts = s.tackles * 1.2 + s.defensiveINTs * 10 + s.passDeflections * 4 + s.forcedFumbles * 5;
      break;
    case 'K':
      statPts = s.fieldGoalsMade * 4 + (s.fieldGoalsMade / Math.max(1, s.fieldGoalAttempts)) * 25;
      break;
    case 'P':
      statPts = p.ratings.overall * 0.6 + s.gamesPlayed * 2;
      break;
    default: // OL — no box score stats, so score conservatively to avoid dominating OROY
      statPts = (p.ratings.overall - 55) * 0.25 + s.gamesPlayed * 0.5 + (s.sacksAllowed != null ? Math.max(0, 20 - s.sacksAllowed) * 0.5 : 0);
      break;
  }
  // 80% stats, 20% OVR
  return p.ratings.overall * 0.2 + statPts * 0.8;
}

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

  // Build conference lookup
  const teamConf = new Map(state.teams.map(t => [t.id, t.conference]));

  for (const { position, count } of ALL_LEAGUE_SLOTS) {
    // Select per conference so both AC and NC are represented
    for (const conf of ['AC', 'NC']) {
      const confPlayers = activePlayers
        .filter(p => p.position === position && teamConf.get(p.teamId!) === conf)
        .sort((a, b) => allLeagueScore(b) - allLeagueScore(a));

      for (let i = 0; i < count && i < confPlayers.length; i++) {
        first.push({ position, playerId: confPlayers[i].id, teamId: confPlayers[i].teamId! });
      }
      for (let i = count; i < count * 2 && i < confPlayers.length; i++) {
        second.push({ position, playerId: confPlayers[i].id, teamId: confPlayers[i].teamId! });
      }
    }

    // All-Rookie: 1 per position
    const posRookies = rookies
      .filter(p => p.position === position)
      .sort((a, b) => allLeagueScore(b) - allLeagueScore(a));
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
  const dl = (state.leagueSettings ?? DEFAULT_LEAGUE_SETTINGS).tradeDeadlineWeek;
  const isOffseason = state.phase === 'resigning' || state.phase === 'draft' || state.phase === 'freeAgency';
  // Block proposals only during regular season after the deadline (offseason is always open)
  if (!isOffseason && state.week > dl + 1) return [];
  const proposals: TradeProposal[] = [];
  const userTeam = state.teams.find(t => t.id === state.userTeamId);
  if (!userTeam) return [];

  const aiTeams = state.teams.filter(t => t.id !== state.userTeamId);
  const userPlayers = state.players
    .filter(p => p.teamId === state.userTeamId && !TRADE_EXCLUDED_POSITIONS.has(p.position));
  if (userPlayers.length === 0) return [];

  // Each AI team has a 5% chance per week of proposing a trade (15% if active rumor)
  for (const aiTeam of aiTeams) {
    const hasActiveRumor = (state.tradeRumors ?? []).some(r => r.teamId === aiTeam.id && !r.resolved && r._accurate);
    const tradeChance = hasActiveRumor ? 0.15 : 0.05;
    if (Math.random() > tradeChance) continue;
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

    // Rivalry restriction: AI won't trade stars (75+) to rivals with intensity >= 50
    const rivalry = (state.rivalries ?? []).find(r =>
      r.intensity >= 50 &&
      ((r.team1Id === aiTeam.id && r.team2Id === state.userTeamId) ||
       (r.team2Id === aiTeam.id && r.team1Id === state.userTeamId)));
    if (rivalry && targetPlayer.ratings.overall >= 75) continue;

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

    // Determine AI team strategy — rebuilding teams should HOARD picks, not give them away
    const aiTotal = aiTeam.record.wins + aiTeam.record.losses;
    const aiWinPct = aiTotal > 0 ? aiTeam.record.wins / aiTotal : 0.5;
    const isRebuilding = aiWinPct < 0.35;

    // Rebuilding teams: NEVER add pick sweeteners (they want picks, not to trade them)
    // Contending teams: ~40% chance to include a draft pick to sweeten
    if (!isRebuilding && Math.random() < 0.40) {
      const aiPicks = aiTeam.draftPicks.filter(pk => pk.year >= state.season);
      if (aiPicks.length > 0) {
        // Prefer lower-round picks (less valuable) to add as sweetener
        // Don't add a pick that would make the offer more than 1.15x target value
        const sortedPicks = [...aiPicks].sort((a, b) => b.round - a.round);
        const pick = sortedPicks.find(pk => offeredValue + pickTradeValue(pk, state.teams) <= targetValue * 1.15);
        if (pick) {
          offeredPickIds.push(pick.id);
          offeredValue += pickTradeValue(pick, state.teams);
        }
      }
    }

    // ~20% chance: offer ONLY a draft pick (no player) for a mid-tier player
    // Pick must be proportional to player value — don't offer Rd 1 for a scrub
    // Rebuilding teams skip this — they don't trade picks for players
    const pickOnlyTrade = !isRebuilding && Math.random() < 0.20 && targetValue >= 80 && targetValue < 400;
    let offeredPlayerIds = [aiOffer.id];
    if (pickOnlyTrade) {
      // Find the best-fit pick that doesn't massively overshoot
      const aiPicks = aiTeam.draftPicks
        .filter(pk => pk.year >= state.season)
        .map(pk => ({ pick: pk, pv: pickTradeValue(pk, state.teams) }))
        .filter(({ pv }) => pv <= targetValue * 1.15) // Don't overshoot by more than 15%
        .sort((a, b) => Math.abs(a.pv - targetValue) - Math.abs(b.pv - targetValue));
      if (aiPicks.length > 0) {
        const { pick, pv } = aiPicks[0];
        offeredPlayerIds = [];
        offeredPickIds.length = 0;
        offeredPickIds.push(pick.id);
        offeredValue = pv;
      }
    }

    // Cap total offered value — AI should never overpay by more than 15%
    if (offeredValue > targetValue * 1.15) continue;

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

// ---------------------------------------------------------------------------
// Contract Extension helper
// ---------------------------------------------------------------------------

export function computeExtensionAskingSalary(player: Player, userTeam: Team, ci: number): { salary: number; years: number; premium: number } {
  const marketSalary = estimateSalary(player.ratings.overall, player.position, player.age, player.potential, ci);
  const mood = player.mood ?? 70;
  let premium = 1.10;

  const underpaidRatio = marketSalary / Math.max(player.contract.salary, 0.75);
  if (underpaidRatio >= 2.0) premium += 0.05;
  else if (underpaidRatio >= 1.5) premium += 0.03;

  if (mood >= 80) premium -= 0.05;
  else if (mood >= 60) premium -= 0.02;
  else if (mood < 40) premium += 0.05;
  else if (mood < 25) premium += 0.08;

  const totalGames = userTeam.record.wins + userTeam.record.losses;
  const winPct = totalGames > 0 ? userTeam.record.wins / totalGames : 0.5;
  if (winPct >= 0.65) premium -= 0.03;
  else if (winPct < 0.35) premium += 0.04;

  if (player.ratings.overall >= 85) premium += 0.03;
  if (player.age <= 26 && player.potential >= 80) premium += 0.03;

  premium = Math.max(1.05, Math.min(1.20, premium));
  const salary = Math.round(marketSalary * premium * 10) / 10;
  const years = player.age >= 32 ? 2 : player.age >= 29 ? 3 : player.age >= 26 ? 4 : 5;

  return { salary, years, premium };
}

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
  newsLastReadWeek: 0,
  newsLastReadSeason: 0,
  seasonHistory: [],
  saveVersion: SAVE_VERSION,
  resigningPlayers: [],
  holdoutDemands: [],
  tradeProposals: [],
  scoutingLevel: 2,
  draftScoutingData: {},
  finalsMvpPlayerId: null, allStarGame: null,
  leagueSettings: { ...DEFAULT_LEAGUE_SETTINGS },
  suppressTradePopups: false,
  weeklyRecaps: [],
  achievements: [],
  tradeRumors: [],
  socialPosts: [],
  rivalries: [],
  firedState: null,
  expansionDraft: null,
  extensionsUsedThisSeason: 0,
};

// ---------------------------------------------------------------------------
// Trade Rumors
// ---------------------------------------------------------------------------

function generateTradeRumors(state: LeagueState): TradeRumor[] {
  const rumDl = (state.leagueSettings ?? DEFAULT_LEAGUE_SETTINGS).tradeDeadlineWeek;
  const isRegular = state.phase === 'regular' && state.week >= 4 && state.week <= rumDl + 1;
  const isOffseason = state.phase === 'draft' || state.phase === 'freeAgency' || state.phase === 'resigning';
  if (!isRegular && !isOffseason) return [];
  const rumors: TradeRumor[] = [];
  const maxNew = 3;

  for (const team of state.teams) {
    if (rumors.length >= maxNew) break;
    const rumorChance = isOffseason ? 0.25 : 0.15; // Higher chance during offseason (fewer trigger points)
    if (Math.random() > rumorChance) continue;

    const teamRoster = state.players.filter(p => p.teamId === team.id && !p.retired);
    const winPctVal = team.record.wins / Math.max(1, team.record.wins + team.record.losses);
    const isAccurate = Math.random() < 0.6; // 60% accuracy

    // Deadline buzz: any team
    if (state.week >= 10 && Math.random() < 0.4) {
      const target = teamRoster.filter(p => p.ratings.overall >= 70)
        .sort((a, b) => b.ratings.overall - a.ratings.overall)[0];
      if (target) {
        rumors.push({
          id: uuid(), season: state.season, week: state.week,
          type: 'deadline_buzz', teamId: team.id, playerIds: [target.id],
          headline: `Trade deadline heating up around ${target.firstName} ${target.lastName}`,
          detail: `Multiple teams reportedly making calls about the ${team.city} ${team.name} ${target.position}. ${target.contract.yearsLeft <= 1 ? 'With an expiring contract, the price may be right.' : 'A deal would be costly given his contract.'}`,
          resolved: false, _accurate: isAccurate,
        });
        continue;
      }
    }

    // Star available: losing team with good player on expiring deal
    if (winPctVal <= 0.4) {
      const expStars = teamRoster.filter(p => p.ratings.overall >= 80 && p.contract.yearsLeft <= 1)
        .sort((a, b) => b.ratings.overall - a.ratings.overall);
      if (expStars.length > 0) {
        const p = expStars[0];
        rumors.push({
          id: uuid(), season: state.season, week: state.week,
          type: 'star_available', teamId: team.id, playerIds: [p.id],
          headline: `Sources: ${team.city} listening to offers for ${p.firstName} ${p.lastName}`,
          detail: `The ${team.name} (${team.record.wins}-${team.record.losses}) are reportedly open to moving their ${p.ratings.overall} OVR ${p.position} with an expiring contract.`,
          resolved: false, _accurate: isAccurate,
        });
        continue;
      }

      // Bad teams want to accumulate picks, not sell them
      if (Math.random() < 0.5) {
        // Shopping a veteran for picks
        const vets = teamRoster.filter(p => p.age >= 28 && p.contract.salary >= 5 && p.ratings.overall >= 65)
          .sort((a, b) => b.contract.salary - a.contract.salary);
        if (vets.length > 0) {
          const vet = vets[0];
          rumors.push({
            id: uuid(), season: state.season, week: state.week,
            type: 'star_available', teamId: team.id, playerIds: [vet.id],
            headline: `${team.city} looking to move ${vet.firstName} ${vet.lastName} for draft capital`,
            detail: `The ${team.name} (${team.record.wins}-${team.record.losses}) are in rebuild mode and may sell ${vet.firstName} ${vet.lastName} ($${vet.contract.salary}M) to stockpile picks.`,
            resolved: false, _accurate: isAccurate,
          });
          continue;
        }
      }
    }

    // Contenders shopping picks for win-now help
    if (winPctVal >= 0.55 && team.record.wins >= 7 && Math.random() < 0.4) {
      rumors.push({
        id: uuid(), season: state.season, week: state.week,
        type: 'shopping_pick', teamId: team.id, playerIds: [],
        headline: `${team.city} may move future draft capital for impact player`,
        detail: `With a ${team.record.wins}-${team.record.losses} record, the ${team.name} are reportedly willing to trade future picks to bolster their playoff push.`,
        resolved: false, _accurate: isAccurate,
      });
      continue;
    }

    // Position need: team weak at a position
    const posStarters = POSITIONS.filter(pos => pos !== 'K' && pos !== 'P').map(pos => {
      const posPlayers = teamRoster.filter(p => p.position === pos).sort((a, b) => b.ratings.overall - a.ratings.overall);
      return { pos, bestOvr: posPlayers[0]?.ratings.overall ?? 0 };
    }).sort((a, b) => a.bestOvr - b.bestOvr);
    const weakest = posStarters[0];
    if (weakest && weakest.bestOvr < 65) {
      rumors.push({
        id: uuid(), season: state.season, week: state.week,
        type: 'position_need', teamId: team.id, playerIds: [],
        headline: `${team.city} actively seeking ${weakest.pos} help`,
        detail: `The ${team.name} starter at ${weakest.pos} grades out at just ${weakest.bestOvr} OVR — one of the worst at the position league-wide. Expect calls to be made.`,
        resolved: false, _accurate: isAccurate,
      });
      continue;
    }

    // Blockbuster: two teams with complementary needs
    if (Math.random() < 0.3) {
      const otherTeam = state.teams.find(t => t.id !== team.id && Math.random() < 0.1);
      if (otherTeam) {
        rumors.push({
          id: uuid(), season: state.season, week: state.week,
          type: 'blockbuster', teamId: team.id, targetTeamId: otherTeam.id, playerIds: [],
          headline: `Early talks between ${team.city} and ${otherTeam.city}`,
          detail: `Sources indicate the ${team.name} and ${otherTeam.name} have had preliminary trade discussions. No deal is imminent, but both sides are engaged.`,
          resolved: false, _accurate: isAccurate,
        });
      }
    }
  }

  return rumors;
}

function resolveTradeRumors(state: LeagueState): { rumors: TradeRumor[]; news: NewsItem[] } {
  const news: NewsItem[] = [];
  const updatedRumors = state.tradeRumors.map(r => {
    if (r.resolved) return r;

    // Past trade deadline — all unresolved become false alarms
    const resDl = (state.leagueSettings ?? DEFAULT_LEAGUE_SETTINGS).tradeDeadlineWeek;
    if (state.week > resDl + 1) {
      const resolved = { ...r, resolved: true, outcome: 'false_alarm' as const, resolvedWeek: state.week };
      if (r.playerIds.length > 0) {
        const p = state.players.find(pl => pl.id === r.playerIds[0]);
        if (p) {
          news.push(makeNews({
            season: state.season, week: state.week, type: 'rumor',
            headline: `Despite rumors, ${p.firstName} ${p.lastName} stays put in ${state.teams.find(t => t.id === r.teamId)?.city ?? 'town'}`,
            isUserTeam: r.teamId === state.userTeamId,
            teamId: r.teamId, playerIds: [p.id],
          }));
        }
      }
      return resolved;
    }
    return r;
  });

  return { rumors: updatedRumors, news };
}

// ---------------------------------------------------------------------------
// Dynamic Rivalries
// ---------------------------------------------------------------------------

function updateRivalries(state: LeagueState, weekGames: GameResult[]): { rivalries: Rivalry[]; news: NewsItem[] } {
  const rivalries = [...(state.rivalries ?? [])];
  const news: NewsItem[] = [];

  for (const game of weekGames) {
    if (!game.played) continue;
    const homeTeam = state.teams.find(t => t.id === game.homeTeamId);
    const awayTeam = state.teams.find(t => t.id === game.awayTeamId);
    if (!homeTeam || !awayTeam) continue;

    const margin = Math.abs(game.homeScore - game.awayScore);
    const winnerId = game.homeScore > game.awayScore ? game.homeTeamId : game.awayTeamId;
    const loserId = winnerId === game.homeTeamId ? game.awayTeamId : game.homeTeamId;
    const winnerTeam = state.teams.find(t => t.id === winnerId)!;
    const loserTeam = state.teams.find(t => t.id === loserId)!;

    // Find existing rivalry
    let rivalry = rivalries.find(r =>
      (r.team1Id === game.homeTeamId && r.team2Id === game.awayTeamId) ||
      (r.team1Id === game.awayTeamId && r.team2Id === game.homeTeamId)
    );

    // Determine intensity delta
    let delta = 0;
    const events: RivalryEvent[] = [];
    const isDivision = homeTeam.conference === awayTeam.conference && homeTeam.division === awayTeam.division;

    if (isDivision) delta += 3;
    if (margin <= 7) {
      delta += 8;
      if (margin <= 3) {
        events.push({ season: state.season, week: state.week, description: `${winnerTeam.abbreviation} edges ${loserTeam.abbreviation} ${game.homeScore > game.awayScore ? game.homeScore : game.awayScore}-${game.homeScore > game.awayScore ? game.awayScore : game.homeScore}`, type: 'upset' });
      }
    }
    if (margin >= 21) {
      // Check if underdog won (simple heuristic: worse record won)
      const winnerWinPct = winnerTeam.record.wins / Math.max(1, winnerTeam.record.wins + winnerTeam.record.losses);
      const loserWinPct = loserTeam.record.wins / Math.max(1, loserTeam.record.wins + loserTeam.record.losses);
      if (winnerWinPct < loserWinPct - 0.15) {
        delta += 12;
        events.push({ season: state.season, week: state.week, description: `Underdog ${winnerTeam.abbreviation} blows out ${loserTeam.abbreviation} ${Math.max(game.homeScore, game.awayScore)}-${Math.min(game.homeScore, game.awayScore)}`, type: 'blowout' });
      } else {
        events.push({ season: state.season, week: state.week, description: `${winnerTeam.abbreviation} dominates ${loserTeam.abbreviation} ${Math.max(game.homeScore, game.awayScore)}-${Math.min(game.homeScore, game.awayScore)}`, type: 'blowout' });
        delta += 5;
      }
    }

    if (delta < 3 && !isDivision) continue; // Not interesting enough to form/update rivalry

    if (rivalry) {
      rivalry.intensity = Math.min(100, rivalry.intensity + delta);
      rivalry.events.push(...events);
      // Keep events trimmed
      if (rivalry.events.length > 10) rivalry.events = rivalry.events.slice(-10);
    } else if (delta >= 8 || isDivision) {
      // Cap at ~20 active rivalries
      if (rivalries.length >= 20) continue;
      rivalry = {
        id: uuid(),
        team1Id: game.homeTeamId,
        team2Id: game.awayTeamId,
        intensity: Math.min(100, delta + 10),
        formed: state.season,
        events,
        type: isDivision ? 'divisional' : 'emerging',
      };
      rivalries.push(rivalry);
    }

    // Generate news for intense rivalry games
    if (rivalry && rivalry.intensity >= 50 && margin <= 7) {
      news.push(makeNews({
        season: state.season, week: state.week, type: 'rumor',
        headline: `Rivalry heats up: ${winnerTeam.city} edges ${loserTeam.city} ${Math.max(game.homeScore, game.awayScore)}-${Math.min(game.homeScore, game.awayScore)}`,
        body: `The rivalry between the ${homeTeam.name} and ${awayTeam.name} continues to intensify after another hard-fought battle.`,
        teamId: winnerId,
        isUserTeam: winnerId === state.userTeamId || loserId === state.userTeamId,
      }));
    }
  }

  return { rivalries, news };
}

function decayRivalries(rivalries: Rivalry[]): Rivalry[] {
  return rivalries
    .map(r => ({ ...r, intensity: r.intensity - 15 }))
    .filter(r => r.intensity >= 10);
}

// ---------------------------------------------------------------------------
// Preseason schedule generation — random matchups, no divisions matter
// ---------------------------------------------------------------------------
function generatePreseasonSchedule(teams: Team[], numGames: number, season: number): GameResult[] {
  const games: GameResult[] = [];
  for (let week = 1; week <= numGames; week++) {
    // Shuffle teams and pair them up
    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length - 1; i += 2) {
      games.push({
        id: `pre-${season}-${week}-${i}`,
        week,
        season,
        homeTeamId: shuffled[i].id,
        awayTeamId: shuffled[i + 1].id,
        homeScore: 0,
        awayScore: 0,
        played: false,
        playerStats: {},
      });
    }
  }
  return games;
}

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
    // Exclude suspended players from the game roster
    const homeRosterRaw = state.players.filter(p => p.teamId === game.homeTeamId && !p.suspension);
    const awayRosterRaw = state.players.filter(p => p.teamId === game.awayTeamId && !p.suspension);
    const homeRoster = homeTeam?.depthChart
      ? sortRosterByDepthChart(homeRosterRaw, homeTeam.depthChart)
      : homeRosterRaw;
    const awayRoster = awayTeam?.depthChart
      ? sortRosterByDepthChart(awayRosterRaw, awayTeam.depthChart)
      : awayRosterRaw;

    // Coaching bonus applied to team power
    let homeCoachBonus = homeTeam ? coachingBonus(homeTeam, homeRosterRaw) : 0;
    let awayCoachBonus = awayTeam ? coachingBonus(awayTeam, awayRosterRaw) : 0;

    // McAfee Mode: special teams rating modifier
    const mcafeeMode = (state.leagueSettings ?? DEFAULT_LEAGUE_SETTINGS).mcafeeMode;
    if (mcafeeMode) {
      const homeST = teamSpecialTeamsRating(homeRosterRaw);
      const awayST = teamSpecialTeamsRating(awayRosterRaw);
      homeCoachBonus += (homeST.overall - 65) * 0.05;
      awayCoachBonus += (awayST.overall - 65) * 0.05;
    }

    const bsMode = (state.leagueSettings ?? DEFAULT_LEAGUE_SETTINGS).bsMode;

    // BS Mode: Ewing Theory boost
    if (bsMode) {
      if (homeTeam?.ewingTheory) homeCoachBonus += homeTeam.ewingTheory.teamPowerBoost;
      if (awayTeam?.ewingTheory) awayCoachBonus += awayTeam.ewingTheory.teamPowerBoost;
    }

    // Generate betting line before game
    const bettingLine = generateBettingLine(homeRosterRaw, awayRosterRaw, homeCoachBonus, awayCoachBonus);

    // Check for rivalry intensity between these teams
    const rivalry = (state.rivalries ?? []).find(r =>
      (r.team1Id === game.homeTeamId && r.team2Id === game.awayTeamId) ||
      (r.team1Id === game.awayTeamId && r.team2Id === game.homeTeamId)
    );
    const rivalryIntensity = rivalry?.intensity ?? 0;

    // Apply user's pre-game plan (only for the user's game)
    let userGamePlan: {
      plan: {
        passRate: number;
        aggressiveness: 'conservative' | 'balanced' | 'aggressive';
        redZoneStrategy: 'run' | 'balanced' | 'pass';
        blitzRate?: number;
        coverage?: 'man' | 'zone' | 'balanced';
        tempo?: 'fast' | 'normal' | 'slow';
      };
      userTeamSide: 'home' | 'away'
    } | undefined;
    if (state.nextGamePlan && (game.homeTeamId === state.userTeamId || game.awayTeamId === state.userTeamId)) {
      userGamePlan = {
        plan: state.nextGamePlan,
        userTeamSide: game.homeTeamId === state.userTeamId ? 'home' : 'away',
      };
    }

    const result = simulateGame(game, homeRoster, awayRoster, homeCoachBonus, awayCoachBonus, rivalryIntensity, bsMode, mcafeeMode, userGamePlan);

    // Compute ATS coverage
    const scoreDiff = result.homeScore - result.awayScore;
    const adjustedDiff = scoreDiff + bettingLine.spread; // spread is negative when home favored
    const spreadCover: 'home' | 'away' | 'push' =
      adjustedDiff > 0 ? 'home' : adjustedDiff < 0 ? 'away' : 'push';
    const totalPoints = result.homeScore + result.awayScore;
    const overHit = totalPoints > bettingLine.overUnder;

    return { ...result, bettingLine, spreadCover, overHit };
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
      } else if (teamScore < oppScore) {
        record.losses += 1;
        record.streak = record.streak <= 0 ? record.streak - 1 : -1;
      } else {
        record.ties += 1;
        record.streak = 0;
      }
      const opponent = state.teams.find(t => t.id === (isHome ? game.awayTeamId : game.homeTeamId));
      if (opponent && opponent.conference === team.conference && opponent.division === team.division) {
        if (teamScore > oppScore) record.divisionWins += 1;
        else if (teamScore < oppScore) record.divisionLosses += 1;
      }
      // ATS tracking
      if (game.spreadCover) {
        const teamCovered = (isHome && game.spreadCover === 'home') || (!isHome && game.spreadCover === 'away');
        const teamLostCover = (isHome && game.spreadCover === 'away') || (!isHome && game.spreadCover === 'home');
        if (teamCovered) record.atsWins = (record.atsWins ?? 0) + 1;
        else if (teamLostCover) record.atsLosses = (record.atsLosses ?? 0) + 1;
        else record.atsPushes = (record.atsPushes ?? 0) + 1;
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
  // Roll re-injury BEFORE the weekly decrement, using the pre-tick weeksLeft
  // values. Affects players who were flagged as playing through an injury.
  const reInjResult = rollReInjuries(newPlayers, playerIdsWhoPlayed, `Week ${state.week}`, state.season, state.week, state.userTeamId);
  const postReInjPlayers = reInjResult.players;

  const injuredPlayers = postReInjPlayers.map(p => {
    let injury = p.injury;
    let playingThroughInjury = p.playingThroughInjury;
    if (injury && injury.weeksLeft > 0) {
      injury = { ...injury, weeksLeft: injury.weeksLeft - 1 };
      if (injury.weeksLeft <= 0) {
        injury = null;
        playingThroughInjury = false;
      }
    }
    const newInj = newInjuries.get(p.id);
    if (newInj && !injury) injury = newInj;
    return { ...p, injury, playingThroughInjury };
  });

  // BS Mode: Ewing Theory — when a team's best player is injured 3+ weeks, 15% chance to activate
  const ewingBsMode = (state.leagueSettings ?? DEFAULT_LEAGUE_SETTINGS).bsMode;
  const ewingNews: NewsItem[] = [];
  if (ewingBsMode) {
    for (const team of newTeams) {
      if (team.ewingTheory) {
        // Check if star returned — clear Ewing Theory
        const star = injuredPlayers.find(p => p.id === team.ewingTheory!.injuredPlayerId);
        if (star && (!star.injury || star.injury.weeksLeft === 0)) {
          team.ewingTheory = undefined;
        }
        continue;
      }
      const teamRoster = injuredPlayers.filter(p => team.roster.includes(p.id) && !p.retired);
      const bestPlayer = teamRoster.reduce((best, p) =>
        p.ratings.overall > (best?.ratings.overall ?? 0) ? p : best, null as Player | null);
      if (bestPlayer?.injury && bestPlayer.injury.weeksLeft >= 3 && Math.random() < 0.15) {
        team.ewingTheory = { injuredPlayerId: bestPlayer.id, teamPowerBoost: 3 };
        ewingNews.push(makeNews({
          season: state.season, week: state.week, type: 'rumor',
          headline: `${team.city} rallies after losing ${bestPlayer.firstName} ${bestPlayer.lastName}`,
          body: `The ${team.name} seem to be playing with renewed energy after their star's injury. Teammates are stepping up.`,
          teamId: team.id, isUserTeam: team.id === state.userTeamId,
        }));
      }
    }
  }

  const weekNews = generateWeekNews(state, updatedGames, newInjuries);

  // Generate social media posts for this week
  const userTeamForSocial = newTeams.find(t => t.id === state.userTeamId);
  const socialRoster = injuredPlayers.filter(p => p.teamId === state.userTeamId && !p.retired);
  const weekSocialPosts: SocialPost[] = userTeamForSocial
    ? generateSocialPosts({
        team: userTeamForSocial,
        roster: socialRoster,
        allTeams: newTeams,
        players: injuredPlayers,
        season: state.season,
        week: state.week,
        games: updatedGames,
      })
    : [];

  const simDl = (state.leagueSettings ?? DEFAULT_LEAGUE_SETTINGS).tradeDeadlineWeek;
  const newTradeProposals = state.week <= simDl + 1
    ? generateAITradeProposals({ ...state, teams: newTeams, players: injuredPlayers })
    : [];

  const moodUpdatedPlayers = injuredPlayers.map(p => {
    if (!p.teamId) return p;
    const team = newTeams.find(t => t.id === p.teamId);
    if (!team) return p;
    let moodDelta = 0;
    const wpGames = team.record.wins + team.record.losses + team.record.ties;
    const wp = wpGames > 0 ? (team.record.wins + team.record.ties * 0.5) / wpGames : 0.5;
    if (wp >= 0.6) moodDelta += 1;
    else if (wp <= 0.35) moodDelta -= 2;
    const starterSlots: Record<string, number> = {
      QB: 1, RB: 1, WR: 3, TE: 1, OL: 5,
      DL: 4, LB: 3, CB: 2, S: 2, K: 1, P: 1,
    };
    const slots = starterSlots[p.position] ?? 1;
    const depthPos = team.depthChart[p.position]?.indexOf(p.id) ?? -1;
    const isStarterRole = depthPos >= 0 && depthPos < slots;
    if (isStarterRole) moodDelta += 1;
    else if (depthPos >= 0 && depthPos < slots * 2) { /* backup — no change */ }
    else if (depthPos >= 0) moodDelta -= 1;
    const marketSalary = estimateSalary(p.ratings.overall, p.position, p.age, p.potential);
    if (p.contract.salary < marketSalary * 0.7) moodDelta -= 1;
    if (team.record.streak >= 3) moodDelta += 1;
    if (team.record.streak <= -3) moodDelta -= 1;
    const newMood = Math.max(0, Math.min(100, (p.mood ?? 70) + moodDelta));
    return { ...p, mood: newMood };
  });

  // Trade rumors
  const newRumors = generateTradeRumors(state);
  const rumorNews: NewsItem[] = newRumors.map(r => makeNews({
    season: state.season, week: state.week, type: 'rumor',
    headline: r.headline, body: r.detail,
    teamId: r.teamId, isUserTeam: r.teamId === state.userTeamId,
  }));
  const { rumors: resolvedRumors, news: rumorResolutionNews } = resolveTradeRumors({
    ...state, tradeRumors: [...(state.tradeRumors ?? []), ...newRumors],
  });

  // Dynamic rivalries
  const { rivalries: updatedRivalries, news: rivalryNews } = updateRivalries(state, updatedGames);

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
      newsItems: [...state.newsItems, ...weekNews, ...ewingNews, ...rumorNews, ...rumorResolutionNews, ...rivalryNews, ...reInjResult.news],
      tradeProposals: [...state.tradeProposals, ...newTradeProposals],
      tradeRumors: resolvedRumors,
      rivalries: updatedRivalries,
      socialPosts: [...(state.socialPosts ?? []), ...weekSocialPosts],
    },
    isSeasonOver,
  };
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      initialized: false,
      ...EMPTY_LEAGUE_STATE,

      newLeague: async (userTeamId: string, leagueFileUrl?: string, startMode?: 'offseason' | 'regular') => {
        try {
          resetUsedNames();
          if (!leagueFileUrl) throw new Error('No league file URL provided');
          const imported = await loadLeagueFromUrl(leagueFileUrl);
          // Real 2026 NFL draft order — original team by record (worst to best)
          const REAL_2026_ORIGINAL_ORDER = [
            'LV','NYJ','ARI','TEN','NYG','CLE','WAS','NO','KC','CIN',
            'MIA','DAL','ATL','BAL','TB','IND','DET','MIN','CAR','GB',
            'PIT','LAC','PHI','JAX','CHI','BUF','SF','HOU','LAR','DEN','NE','SEA',
          ];
          // Traded first-round picks: originalTeam → newOwner
          const REAL_2026_R1_TRADES: Record<string, string> = {
            'ATL': 'LAR',  // Pick 13: LAR via ATL
            'BAL': 'LV',   // Pick 14: LV via BAL
            'IND': 'NYJ',  // Pick 16: NYJ via IND
            'GB':  'DAL',  // Pick 20: DAL via GB
            'JAX': 'CLE',  // Pick 24: CLE via JAX
            'LAR': 'KC',   // Pick 29: KC via LAR
          };
          // Assign records based on draft position — use pointsFor to break ties
          for (const team of imported.teams) {
            const draftIdx = REAL_2026_ORIGINAL_ORDER.indexOf(team.abbreviation);
            if (draftIdx >= 0) {
              const wins = Math.round(2 + (draftIdx / 31) * 12);
              team.record = { ...emptyRecord(), wins, losses: 17 - wins, pointsFor: draftIdx };
            } else {
              team.record = { ...emptyRecord(), wins: 8, losses: 9 };
            }
            // Transfer traded R1 picks
            const newOwnerAbbrev = REAL_2026_R1_TRADES[team.abbreviation];
            if (newOwnerAbbrev) {
              const newOwner = imported.teams.find(t => t.abbreviation === newOwnerAbbrev);
              if (newOwner) {
                const r1Pick = team.draftPicks.find(pk => pk.year === imported.season && pk.round === 1);
                if (r1Pick) {
                  // Move pick from original team to new owner
                  team.draftPicks = team.draftPicks.filter(pk => pk.id !== r1Pick.id);
                  newOwner.draftPicks.push({ ...r1Pick, ownerTeamId: newOwner.id });
                }
              }
            }
          }

          // Generate coaching staff for all teams if not already present
          for (const team of imported.teams) {
            if (!team.coaches || team.coaches.length === 0) {
              team.coaches = generateCoachingStaff();
            }
            if (!team.ownerPersonality) {
              team.ownerPersonality = rollOwnerPersonality();
            }
            if (!team.baseFormation) {
              team.baseFormation = '4-3';
            }
          }
          // Auto-assign OL slots — done from imported.players (allImportedPlayers
          // is defined later, but only adds street FAs which aren't on a team).
          for (const team of imported.teams) {
            const teamOL = imported.players.filter(p => p.teamId === team.id && p.position === 'OL');
            const slotMap = assignOlSlots(teamOL);
            for (const p of teamOL) {
              const slot = slotMap.get(p.id);
              if (slot) (p as { olSlot?: 'LT' | 'LG' | 'C' | 'RG' | 'RT' }).olSlot = slot;
            }
          }
          // Backfill coaching history for all coaches
          for (const team of imported.teams) {
            if (team.coaches) {
              for (const coach of team.coaches) {
                if (!coach.history || coach.history.length === 0) {
                  coach.history = backfillCoachHistory(coach, team.id, imported.teams, imported.season);
                }
              }
            }
          }

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

          const isRegularStart = startMode === 'regular';
          const allImportedPlayers = [...imported.players, ...fbgmFAs];

          // For regular season start, reset all records to 0-0
          const startTeams = isRegularStart
            ? imported.teams.map(t => ({ ...t, record: emptyRecord() }))
            : imported.teams;

          // Only compute re-signing entries for offseason start
          const resigningEntries = isRegularStart ? [] : (() => {
            const expiringPlayers = allImportedPlayers.filter(
              p => p.teamId === userTeam.id && p.contract.yearsLeft === 1 && !p.retired,
            );
            return expiringPlayers.map(p => computeResigningEntry(p, userTeam));
          })();

          // Initialize approval for user team
          const userApproval = defaultApproval();
          userApproval.objectives = generateSeasonObjectives(userTeam, allImportedPlayers, imported.season);
          const teamsWithApproval = startTeams.map(t =>
            t.id === userTeam.id ? { ...t, approval: userApproval } : t,
          );

          set({
            initialized: true,
            season: imported.season,
            week: 1,
            phase: isRegularStart ? 'regular' : 'resigning',
            userTeamId: userTeam.id,
            teams: teamsWithApproval,
            players: allImportedPlayers,
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
            newsLastReadWeek: 0,
            newsLastReadSeason: 0,
            seasonHistory: [],
            saveVersion: SAVE_VERSION,
            resigningPlayers: resigningEntries,
            holdoutDemands: [],
            tradeProposals: [],
            scoutingLevel: 2,
            draftScoutingData: {},
            finalsMvpPlayerId: null, allStarGame: null,
            leagueSettings: { ...DEFAULT_LEAGUE_SETTINGS },
            suppressTradePopups: false,
            weeklyRecaps: [],
            achievements: [],
            tradeRumors: [],
            socialPosts: [],
            rivalries: [],
            firedState: null,
            expansionDraft: null,
            extensionsUsedThisSeason: 0,
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
            coaches: generateCoachingStaff(),
            ownerPersonality: rollOwnerPersonality(),
            baseFormation: '4-3' as const,
          };
        });
        // Auto-assign OL slots for synthetic rosters
        for (const team of teams) {
          const teamOL = allPlayers.filter(p => p.teamId === team.id && p.position === 'OL');
          const slotMap = assignOlSlots(teamOL);
          for (const p of teamOL) {
            const slot = slotMap.get(p.id);
            if (slot) (p as { olSlot?: 'LT' | 'LG' | 'C' | 'RG' | 'RT' }).olSlot = slot;
          }
        }

        // Real 2026 NFL draft order — original team by record (worst to best)
        // Uses BS Football abbreviations: NYS (not NYJ), LAA (not LAR for Rams equiv)
        const GEN_ORIGINAL_ORDER = [
          'LV','NYS','ARI','TEN','NYG','CLE','WAS','NO','KC','CIN',
          'MIA','DAL','ATL','BAL','TB','IND','DET','MIN','CAR','GB',
          'PIT','LAC','PHI','JAX','CHI','BUF','SF','HOU','LAA','DEN','NE','SEA',
        ];
        const GEN_R1_TRADES: Record<string, string> = {
          'ATL': 'LAA', 'BAL': 'LV', 'IND': 'NYS', 'GB': 'DAL', 'JAX': 'CLE', 'LAA': 'KC',
        };
        for (const t of teams) {
          const draftIdx = GEN_ORIGINAL_ORDER.indexOf(t.abbreviation);
          if (draftIdx >= 0) {
            const wins = Math.round(2 + (draftIdx / 31) * 12);
            t.record = { ...emptyRecord(), wins, losses: 17 - wins, pointsFor: draftIdx };
          } else {
            t.record = { ...emptyRecord(), wins: 8, losses: 9 };
          }
          const newOwnerAbbrev = GEN_R1_TRADES[t.abbreviation];
          if (newOwnerAbbrev) {
            const newOwner = teams.find(tt => tt.abbreviation === newOwnerAbbrev);
            if (newOwner) {
              const r1Pick = t.draftPicks.find(pk => pk.year === 2026 && pk.round === 1);
              if (r1Pick) {
                t.draftPicks = t.draftPicks.filter(pk => pk.id !== r1Pick.id);
                newOwner.draftPicks.push({ ...r1Pick, ownerTeamId: newOwner.id });
              }
            }
          }
        }

        // Backfill coaching history for generated teams
        for (const team of teams) {
          if (team.coaches) {
            for (const coach of team.coaches) {
              if (!coach.history || coach.history.length === 0) {
                coach.history = backfillCoachHistory(coach, team.id, teams, 2026);
              }
            }
          }
        }

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

        // Start in re-signing phase (offseason)
        const genExpiring = allPlayers.filter(
          p => p.teamId === userTeam.id && p.contract.yearsLeft === 1 && !p.retired,
        );
        const genResigningEntries = genExpiring.map(p => computeResigningEntry(p, userTeam));

        // Initialize approval
        const genApproval = defaultApproval();
        genApproval.objectives = generateSeasonObjectives(userTeam, allPlayers, 2026);
        const genTeamsWithApproval = teams.map(t =>
          t.id === userTeam.id ? { ...t, approval: genApproval } : t,
        );

        set({
          initialized: true,
          season: 2026,
          week: 1,
          phase: 'resigning',
          userTeamId: userTeam.id,
          teams: genTeamsWithApproval,
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
          newsLastReadWeek: 0,
          newsLastReadSeason: 0,
          seasonHistory: [],
          saveVersion: SAVE_VERSION,
          resigningPlayers: genResigningEntries,
          holdoutDemands: [],
          tradeProposals: [],
          scoutingLevel: 2,
          draftScoutingData: {},
          finalsMvpPlayerId: null, allStarGame: null,
          leagueSettings: { ...DEFAULT_LEAGUE_SETTINGS },
          suppressTradePopups: false,
          weeklyRecaps: [],
          achievements: [],
          tradeRumors: [],
          socialPosts: [],
          rivalries: [],
          firedState: null,
          expansionDraft: null,
          extensionsUsedThisSeason: 0,
        });
      },

      resetLeague: () => {
        set({ initialized: false, ...EMPTY_LEAGUE_STATE });
      },

      setNextGamePlan: (plan) => {
        set({ nextGamePlan: plan ?? undefined });
      },

      ensureDraftClassPreview: () => {
        const state = get();
        // Target the UPCOMING draft year. If the current season's draft has
        // already happened (draftResults populated), the next draft is for
        // state.season + 1. Otherwise it's the current state.season.
        const targetYear = state.draftResults.length > 0 ? state.season + 1 : state.season;
        if (state.draftClassPreview && state.draftClassPreview.season === targetYear) return;
        set({ draftClassPreview: generateDraftClassPreview(targetYear) });
      },

      simWeek: () => {
        const state = get();
        if (state.phase !== 'regular') {
          console.warn('[simWeek] blocked: phase is', state.phase, '(expected regular)');
          return;
        }

        // Guard: if ALL of this week's games are already played, nothing to do.
        // (Prevents double-sim on rapid button clicks or re-renders.)
        const weekGamesAll = state.schedule.filter(g => g.week === state.week);
        if (weekGamesAll.length > 0 && weekGamesAll.every(g => g.played)) {
          console.warn('[simWeek] blocked: all', weekGamesAll.length, 'games for week', state.week, 'already played');
          return;
        }

        const result = simulateOneWeek(state);
        if (!result) {
          console.warn('[simWeek] simulateOneWeek returned null. week:', state.week, 'schedule length:', state.schedule.length, 'unplayed this week:', weekGamesAll.filter(g => !g.played).length);
          return;
        }

        // Generate draft class preview when crossing the trade deadline
        const tradeDeadline = (state.leagueSettings ?? DEFAULT_LEAGUE_SETTINGS).tradeDeadlineWeek;
        if (state.week === tradeDeadline && (!state.draftClassPreview || state.draftClassPreview.season !== state.season)) {
          set({ draftClassPreview: generateDraftClassPreview(state.season) });
        }

        // Generate weekly recap from this week's games
        const simmedWeek = state.week;
        const weekGames = (result.patch.schedule as GameResult[]).filter(g => g.week === simmedWeek && g.played);
        const recap = generateWeeklyRecap(weekGames, result.patch.teams as Team[], result.patch.players as Player[], state.season, simmedWeek, result.patch.newsItems as import('@/types').NewsItem[]);
        const weeklyRecaps = [...state.weeklyRecaps, recap];

        if (result.isSeasonOver) {
          const teams = result.patch.teams as Team[];
          const seeds = computePlayoffSeeds(teams);
          const bracket = buildBracket(seeds, teams);
          // Game plan persists across weeks — community ask (TimNation, others)
          // wanted their slider settings to apply to simmed games too, not just
          // Watch Live. Keep nextGamePlan set so the next sim picks it up.
          set({ ...result.patch, playoffSeeds: seeds, playoffBracket: bracket, weeklyRecaps });
        } else {
          set({ ...result.patch, weeklyRecaps });
        }

        // Update approval for user team based on this week's game
        {
          const st = get();
          const userTeam = st.teams.find(t => t.id === st.userTeamId);
          if (userTeam) {
            const userGame = weekGames.find(g => g.homeTeamId === st.userTeamId || g.awayTeamId === st.userTeamId);
            if (userGame) {
              const won = (userGame.homeTeamId === st.userTeamId && userGame.homeScore > userGame.awayScore) ||
                          (userGame.awayTeamId === st.userTeamId && userGame.awayScore > userGame.homeScore);
              const margin = Math.abs(userGame.homeScore - userGame.awayScore);
              const oppId = userGame.homeTeamId === st.userTeamId ? userGame.awayTeamId : userGame.homeTeamId;
              const isRivalry = (st.rivalries ?? []).some(r => r.intensity >= 30 &&
                ((r.team1Id === st.userTeamId && r.team2Id === oppId) || (r.team2Id === st.userTeamId && r.team1Id === oppId)));
              const approval = userTeam.approval ?? defaultApproval();
              const updated = updateApprovalAfterGame(approval, won, margin, isRivalry);
              set({ teams: st.teams.map(t => t.id === st.userTeamId ? { ...t, approval: updated } : t) });
            }
          }
        }

        // Discipline checks — suspensions, fines, incidents
        {
          const ds = get();
          const suspFreq = (ds.leagueSettings ?? DEFAULT_LEAGUE_SETTINGS).suspensionFrequency ?? 1.0;
          const { events: discEvents, updatedPlayers: discPlayers } = checkDisciplineEvents(
            ds.players, ds.userTeamId, ds.season, ds.week, suspFreq,
          );
          if (discEvents.length > 0) {
            const discNews = disciplineNewsItems(discEvents, ds.userTeamId, ds.season, ds.week);
            set({ players: tickSuspensions(discPlayers), newsItems: [...ds.newsItems, ...discNews] });
          } else {
            set({ players: tickSuspensions(ds.players) });
          }
        }

        // Check achievements after state update
        const newAchievements = checkAchievements(get());
        if (newAchievements.length > 0) {
          const current = get();
          set({ achievements: [...current.achievements, ...newAchievements] });
        }
      },

      simPreseasonWeek: () => {
        const state = get();
        if (state.phase !== 'preseason') return;
        const preSchedule = state.preseasonSchedule ?? [];
        const preWeek = state.preseasonWeek ?? 1;
        const settings = state.leagueSettings ?? DEFAULT_LEAGUE_SETTINGS;
        const numPreGames = settings.preseasonGames ?? 3;

        const weekGames = preSchedule.filter(g => g.week === preWeek && !g.played);
        if (weekGames.length === 0) return;

        // Sim preseason games at ~70% OVR (starters rest, backups play more)
        const simmedGames = weekGames.map(game => {
          const homeRoster = state.players.filter(p => p.teamId === game.homeTeamId && !p.retired && !p.suspension);
          const awayRoster = state.players.filter(p => p.teamId === game.awayTeamId && !p.retired && !p.suspension);

          // Reduce OVR by ~30% for preseason (starters play limited snaps)
          const preseasonRoster = (roster: Player[]) => roster.map(p => ({
            ...p,
            ratings: { ...p.ratings, overall: Math.round(p.ratings.overall * 0.7 + Math.random() * 8) },
          }));

          const result = simulateGame(
            game, preseasonRoster(homeRoster), preseasonRoster(awayRoster),
            0, 0, 0, false, false,
          );
          return { ...result, played: true };
        });

        const newPreSchedule = preSchedule.map(g => {
          const simmed = simmedGames.find(s => s.id === g.id);
          return simmed ?? g;
        });

        // Injuries at 40% of normal rate
        const playerIdsInPreseason = new Set<string>();
        for (const g of simmedGames) {
          for (const pid of Object.keys(g.playerStats)) playerIdsInPreseason.add(pid);
        }
        const preInjuries = generateInjuries(state.players, playerIdsInPreseason);
        // Only apply 40% of injuries
        const filteredInjuries = new Map<string, { type: string; weeksLeft: number }>();
        for (const [pid, inj] of preInjuries) {
          if (Math.random() < 0.4) filteredInjuries.set(pid, inj);
        }
        const injuredPlayers = state.players.map(p => {
          const newInj = filteredInjuries.get(p.id);
          if (newInj && !p.injury) return { ...p, injury: newInj };
          return p;
        });

        const nextPreWeek = preWeek + 1;
        const preseasonOver = nextPreWeek > numPreGames;

        // Generate news for user's preseason game
        const userGame = simmedGames.find(g => g.homeTeamId === state.userTeamId || g.awayTeamId === state.userTeamId);
        let newsItems = state.newsItems;
        if (userGame) {
          const isHome = userGame.homeTeamId === state.userTeamId;
          const userScore = isHome ? userGame.homeScore : userGame.awayScore;
          const oppScore = isHome ? userGame.awayScore : userGame.homeScore;
          const oppTeam = state.teams.find(t => t.id === (isHome ? userGame.awayTeamId : userGame.homeTeamId));
          const won = userScore > oppScore;
          newsItems = [...newsItems, makeNews({
            season: state.season, week: 0, type: 'system', teamId: state.userTeamId,
            headline: `Preseason Game ${preWeek}: ${won ? 'Win' : 'Loss'} vs ${oppTeam?.city ?? 'Opponent'} (${userScore}-${oppScore})`,
            body: 'Preseason results do not count toward the regular season record.',
            isUserTeam: true,
          })];
        }

        if (preseasonOver) {
          set({
            preseasonSchedule: newPreSchedule,
            preseasonWeek: nextPreWeek,
            phase: 'regular',
            week: 1,
            players: injuredPlayers,
            newsItems,
          });
        } else {
          set({
            preseasonSchedule: newPreSchedule,
            preseasonWeek: nextPreWeek,
            players: injuredPlayers,
            newsItems,
          });
        }
      },

      skipPreseason: () => {
        const state = get();
        if (state.phase !== 'preseason') return;
        set({ phase: 'regular', week: 1, preseasonWeek: 0 });
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
        let tradeRumors = [...(current.tradeRumors ?? [])];
        let rivalries = [...(current.rivalries ?? [])];
        let weeklyRecaps = [...current.weeklyRecaps];
        let isSeasonOver = false;

        for (let guard = 0; guard < 200 && week < targetWeek; guard++) {
          const simmedWeek = week;
          const fakeState = { ...current, schedule, teams, players, week, newsItems, tradeProposals, tradeRumors, rivalries, weeklyRecaps, phase: 'regular' as const } as LeagueState;
          const result = simulateOneWeek(fakeState);
          if (!result) break;

          schedule = result.patch.schedule as typeof schedule;
          teams = result.patch.teams as typeof teams;
          players = result.patch.players as typeof players;
          week = result.patch.week as number;
          newsItems = result.patch.newsItems as typeof newsItems;
          tradeProposals = result.patch.tradeProposals as typeof tradeProposals;
          tradeRumors = (result.patch.tradeRumors as typeof tradeRumors) ?? tradeRumors;
          rivalries = (result.patch.rivalries as typeof rivalries) ?? rivalries;

          // Generate recap for the week just simmed
          const weekGames = schedule.filter(g => g.week === simmedWeek && g.played);
          const recap = generateWeeklyRecap(weekGames, teams, players, current.season, simmedWeek, newsItems);
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
          set({ schedule, teams, players, week, newsItems, tradeProposals, tradeRumors, rivalries, weeklyRecaps, phase: 'playoffs', playoffSeeds: seeds, playoffBracket: bracket });
        } else {
          set({ schedule, teams, players, week, newsItems, tradeProposals, tradeRumors, rivalries, weeklyRecaps, phase: 'regular' });
        }
      },

      advanceToPlayoffs: () => {
        const state = get();
        const seeds = computePlayoffSeeds(state.teams);
        const bracket = buildBracket(seeds, state.teams);
        // Decrement injury timers by one week for the bye between the regular
        // season and the wild card round.
        const players = decrementInjuryWeeks(state.players, 1);
        set({ phase: 'playoffs', playoffSeeds: seeds, playoffBracket: bracket, players, playoffInjuryRound: 1 });
      },

      simPlayoffGame: (matchupId: string) => {
        const state = get();
        if (!state.playoffBracket || !state.playoffSeeds) return;

        const matchup = state.playoffBracket.find(m => m.id === matchupId);
        if (!matchup || matchup.winnerId || !matchup.homeTeamId || !matchup.awayTeamId) return;

        // Decrement injuries once per playoff round. The championship sits a
        // week after the conference championship in real life, so round 4 ticks
        // two weeks. We dispatch based on the gap to the last decremented round.
        const lastRound = state.playoffInjuryRound ?? 1;
        const weeksToTick = matchup.round === 4 ? (matchup.round + 1) - lastRound : matchup.round - lastRound;
        const injuryDecPlayers = weeksToTick > 0 ? decrementInjuryWeeks(state.players, weeksToTick) : state.players;

        const homeTeam = state.teams.find(t => t.id === matchup.homeTeamId);
        const awayTeam = state.teams.find(t => t.id === matchup.awayTeamId);
        const homeRosterRaw = injuryDecPlayers.filter(p => p.teamId === matchup.homeTeamId);
        const awayRosterRaw = injuryDecPlayers.filter(p => p.teamId === matchup.awayTeamId);
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

        let result = simulateGame(tempGame, homeRoster, awayRoster);

        // Defensive: if the playoff score matches a regular-season game between
        // the same two teams this season, re-simulate once so users don't see
        // an identical score and think it's a bug. (Math.random() should make
        // duplicates near-impossible, but this is cheap insurance.)
        const sameMatchupRegGame = state.schedule.find(g =>
          g.played &&
          ((g.homeTeamId === matchup.homeTeamId && g.awayTeamId === matchup.awayTeamId) ||
           (g.homeTeamId === matchup.awayTeamId && g.awayTeamId === matchup.homeTeamId)) &&
          g.homeScore === result.homeScore && g.awayScore === result.awayScore,
        );
        if (sameMatchupRegGame) {
          result = simulateGame(tempGame, homeRoster, awayRoster);
        }

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

        const newInjuryRound = weeksToTick > 0 ? (matchup.round === 4 ? matchup.round + 1 : matchup.round) : lastRound;
        // Roll re-injury for any player who played through an injury
        const homeIds = new Set(homeRosterRaw.map(p => p.id));
        const awayIds = new Set(awayRosterRaw.map(p => p.id));
        const bothIds = new Set([...homeIds, ...awayIds]);
        const homeTeamName = homeTeam ? `${homeTeam.city} ${homeTeam.name}` : 'home team';
        const awayTeamName = awayTeam ? `${awayTeam.city} ${awayTeam.name}` : 'away team';
        const gameLabel = `${awayTeamName} at ${homeTeamName}`;
        const reInj = rollReInjuries(injuryDecPlayers, bothIds, gameLabel, state.season, 100 + matchup.round, state.userTeamId);
        set({ playoffBracket: updatedBracket, champions: newChampions, newsItems: [...newNewsItems, ...reInj.news], finalsMvpPlayerId, schedule: updatedSchedule, weeklyRecaps: updatedRecaps, players: reInj.players, playoffInjuryRound: newInjuryRound });
        // Check achievements after each playoff game (catches Champion, etc.)
        const newAch = checkAchievements(get());
        if (newAch.length > 0) {
          const cur = get();
          set({ achievements: [...cur.achievements, ...newAch] });
        }
      },

      simNextPlayoffGame: () => {
        const state = get();
        if (!state.playoffBracket) return;
        // Block championship until All-Star Game is played
        const next = state.playoffBracket
          .filter(m => !m.winnerId && m.homeTeamId && m.awayTeamId)
          .filter(m => m.id !== 'championship' || state.allStarGame?.played)
          .sort((a, b) => a.round - b.round)[0];
        if (!next) {
          // If blocked on All-Star, auto-sim it
          if (!state.allStarGame?.played) {
            const confsDone = state.playoffBracket.find(m => m.id === 'ac-conf')?.winnerId && state.playoffBracket.find(m => m.id === 'nc-conf')?.winnerId;
            if (confsDone) get().simAllStarGame();
          }
          return;
        }
        get().simPlayoffGame(next.id);
      },

      simAllPlayoffGames: () => {
        const state = get();
        if (!state.playoffBracket || !state.playoffSeeds) return;

        let bracket = [...state.playoffBracket.map(m => ({ ...m }))];
        let champions = state.champions ?? [];
        let newsItems = state.newsItems;
        let finalsMvpPlayerId = state.finalsMvpPlayerId;
        const playoffResults: GameResult[] = [];
        let accumulatedPlayers = state.players;
        let injuryRound = state.playoffInjuryRound ?? 1;

        let allStarDone = !!state.allStarGame?.played;
        for (let guard = 0; guard < 200; guard++) {
          const next = bracket
            .filter(m => !m.winnerId && m.homeTeamId && m.awayTeamId)
            .filter(m => m.id !== 'championship' || allStarDone)
            .sort((a, b) => a.round - b.round)[0];
          if (!next) {
            // Auto-sim All-Star if blocking
            if (!allStarDone) {
              get().simAllStarGame();
              allStarDone = true;
              continue;
            }
            break;
          }

          // Bump injury timers once per round (championship ticks two weeks
          // for the bye between conference champ and championship).
          const nextRoundTarget = next.round === 4 ? next.round + 1 : next.round;
          const weeksToTick = nextRoundTarget - injuryRound;
          if (weeksToTick > 0) {
            accumulatedPlayers = decrementInjuryWeeks(accumulatedPlayers, weeksToTick);
            injuryRound = nextRoundTarget;
          }

          const homeRosterRaw = accumulatedPlayers.filter(p => p.teamId === next.homeTeamId);
          const awayRosterRaw = accumulatedPlayers.filter(p => p.teamId === next.awayTeamId);
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

          // Re-injury rolls for any player who played through an injury
          const rosterIds = new Set<string>([...homeRosterRaw, ...awayRosterRaw].map(p => p.id));
          const gameLabel = `${awayTeam?.city ?? 'AWY'} ${awayTeam?.name ?? ''} at ${homeTeam?.city ?? 'HOM'} ${homeTeam?.name ?? ''}`.trim();
          const reInj = rollReInjuries(accumulatedPlayers, rosterIds, gameLabel, state.season, 100 + next.round, state.userTeamId);
          accumulatedPlayers = reInj.players;
          if (reInj.news.length > 0) newsItems = [...newsItems, ...reInj.news];

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

        set({ playoffBracket: bracket, champions, newsItems, finalsMvpPlayerId, schedule: updatedSchedule, weeklyRecaps: updatedRecaps, players: accumulatedPlayers, playoffInjuryRound: injuryRound });
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

        // Always skip the user's matchup so they can watch it live.
        // Previously if the user's game was the only one left in the round,
        // it got auto-simmed and the Watch Live commit would lose to the
        // pre-sim result in a race. Now we always skip, and the playoffs
        // page surfaces a dedicated "Watch Live" button for the user's game.
        const userMatchup = allRoundGames.find(m => m.homeTeamId === state.userTeamId || m.awayTeamId === state.userTeamId);
        const roundGames = userMatchup
          ? allRoundGames.filter(m => m !== userMatchup)
          : allRoundGames;
        if (roundGames.length === 0) return;

        let bracket = [...state.playoffBracket.map(m => ({ ...m }))];
        let champions = state.champions ?? [];
        let newsItems = state.newsItems;
        let finalsMvpPlayerId = state.finalsMvpPlayerId;
        const playoffResults: GameResult[] = [];

        // Decrement injuries once for this round (championship counts as two
        // weeks because of the bye between conference champ and championship).
        const lastRound = state.playoffInjuryRound ?? 1;
        const weeksToTick = currentRound === 4 ? (currentRound + 1) - lastRound : currentRound - lastRound;
        const roundPlayers = weeksToTick > 0 ? decrementInjuryWeeks(state.players, weeksToTick) : state.players;
        const newInjuryRound = weeksToTick > 0 ? (currentRound === 4 ? currentRound + 1 : currentRound) : lastRound;

        for (const game of roundGames) {
          const matchup = bracket.find(m => m.id === game.id);
          if (!matchup || !matchup.homeTeamId || !matchup.awayTeamId) continue;

          const homeRosterRaw = roundPlayers.filter(p => p.teamId === matchup.homeTeamId);
          const awayRosterRaw = roundPlayers.filter(p => p.teamId === matchup.awayTeamId);
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

        // Re-injury rolls for any player who played through in this round
        const playedIds = new Set<string>();
        for (const g of roundGames) {
          if (g.homeTeamId) roundPlayers.filter(p => p.teamId === g.homeTeamId).forEach(p => playedIds.add(p.id));
          if (g.awayTeamId) roundPlayers.filter(p => p.teamId === g.awayTeamId).forEach(p => playedIds.add(p.id));
        }
        const reInjAll = rollReInjuries(roundPlayers, playedIds, `Round ${currentRound}`, state.season, playoffWeek, state.userTeamId);

        set({ playoffBracket: bracket, champions, newsItems: [...newsItems, ...reInjAll.news], finalsMvpPlayerId, schedule: updatedSchedule, weeklyRecaps: updatedRecaps, players: reInjAll.players, playoffInjuryRound: newInjuryRound });
      },

      // PRD-03: Advance from playoffs to re-signing phase
      advanceToResigning: () => {
        const state = get();
        const userTeam = state.teams.find(t => t.id === state.userTeamId);
        if (!userTeam) return;

        // Check if user has been fired BEFORE any offseason moves happen.
        // GMs get fired at the end of a season, not after they've already
        // started making offseason decisions.
        const userApprovalVal = userTeam?.approval?.ownerApproval ?? 50;
        if (userApprovalVal <= 0) {
          set({
            firedState: {
              fired: true,
              season: state.season,
              reason: 'Owner lost patience after repeated underperformance.',
            },
            newsItems: [...state.newsItems, makeNews({
              season: state.season, week: 99, type: 'system',
              headline: `${userTeam.city} ownership has fired the GM after a disastrous tenure. Your time is up.`,
              isUserTeam: true,
            })],
          });
          return; // Block offseason — user must choose next steps
        }

        // Process retirements BEFORE re-signing so retired players' cap is freed up
        const retiredIds = new Set<string>();
        const retirementNews: NewsItem[] = [];
        const playersAfterRetirement = state.players.map(p => {
          const posAging = POSITION_AGING[p.position];
          if (p.retired || !p.teamId || p.age < (posAging?.retireAge ?? 35)) return p;
          const retireAge = posAging?.retireAge ?? 35;
          const retireRate = posAging?.retireRate ?? 0.10;
          const retirementChance = Math.min(0.90, retireRate + (p.age - retireAge) * 0.12);
          if (Math.random() < retirementChance) {
            retiredIds.add(p.id);
            if (p.ratings.overall >= 70) {
              retirementNews.push(makeNews({
                season: state.season,
                week: 0,
                type: 'milestone',
                playerIds: [p.id],
                headline: `${p.firstName} ${p.lastName} announces retirement after ${p.experience} season${p.experience !== 1 ? 's' : ''}.`,
                isUserTeam: p.teamId === state.userTeamId,
              }));
            }
            return { ...p, retired: true };
          }
          return p;
        });

        // Remove retired players from team rosters
        const teamsAfterRetirement = retiredIds.size > 0
          ? state.teams.map(t => {
              const retiredFromTeam = playersAfterRetirement.filter(p => retiredIds.has(p.id) && t.roster.includes(p.id));
              if (retiredFromTeam.length === 0) return t;
              const salaryDrop = retiredFromTeam.reduce((sum, p) => sum + p.contract.salary, 0);
              return {
                ...t,
                roster: t.roster.filter(id => !retiredIds.has(id)),
                depthChart: POSITIONS.reduce<Record<Position, string[]>>((acc, pos) => {
                  acc[pos] = (t.depthChart[pos] ?? []).filter(id => !retiredIds.has(id));
                  return acc;
                }, {} as Record<Position, string[]>),
                totalPayroll: Math.max(0, t.totalPayroll - salaryDrop),
              };
            })
          : state.teams;

        // Include players whose contract expires OR whose next year is all void years
        // (void year contracts need to be re-signed before they auto-void)
        const expiringPlayers = playersAfterRetirement.filter(p => {
          if (p.teamId !== state.userTeamId || p.retired) return false;
          if (p.contract.yearsLeft === 1) return true;
          // Check if only 1 real year left (rest are void)
          if (p.contract.contractYears && p.contract.contractYears.length > 1) {
            const realYears = p.contract.contractYears.filter(y => !y.isVoidYear).length;
            if (realYears === 1) return true;
          }
          return false;
        });

        const currentUserTeam = teamsAfterRetirement.find(t => t.id === state.userTeamId) ?? userTeam;
        const resigningPlayers = expiringPlayers.map(p => computeResigningEntry(p, currentUserTeam));

        // Compute holdout demands for under-contract stars
        const holdoutDemands = computeHoldoutDemands(playersAfterRetirement, state.userTeamId, state.season);
        const holdoutNews: NewsItem[] = holdoutDemands.map(h => {
          const hp = playersAfterRetirement.find(p => p.id === h.playerId);
          if (!hp) return null;
          return makeNews({
            season: state.season,
            week: 0,
            type: 'system',
            teamId: state.userTeamId,
            playerIds: [h.playerId],
            headline: `${hp.firstName} ${hp.lastName} demands a new contract`,
            body: `The ${hp.position} is unhappy with his current deal ($${hp.contract.salary}M/yr) and wants $${h.demandedSalary}M/yr for ${h.demandedYears} years. He will hold out if denied.`,
            isUserTeam: true,
          });
        }).filter((n): n is NewsItem => n !== null);

        // Grow salary cap for the upcoming offseason (so cap space is visible during re-signing)
        const settings = state.leagueSettings ?? DEFAULT_LEAGUE_SETTINGS;
        const capGrowthMult = 1 + (settings.capGrowthRate / 100);

        // Recalculate all team payrolls from scratch + apply cap growth
        // For user's team: exclude expiring players so cap space shows "committed" payroll
        // Each re-signing will add to payroll, making cap space go down (intuitive UX)
        const expiringIds = new Set(expiringPlayers.map(p => p.id));
        const recalcTeams = teamsAfterRetirement.map(t => {
          const basePayroll = recalculateTeamPayroll(t, playersAfterRetirement);
          const expiringPayroll = t.id === state.userTeamId
            ? playersAfterRetirement
                .filter(p => expiringIds.has(p.id) && p.teamId === t.id)
                .reduce((sum, p) => sum + getCapHit(p.contract), 0)
            : 0;
          return {
            ...t,
            salaryCap: Math.round(t.salaryCap * capGrowthMult * 10) / 10,
            totalPayroll: Math.round((basePayroll - expiringPayroll) * 10) / 10,
          };
        });

        // Build SeasonSummary for the just-completed season so /history shows it immediately
        const alreadyInHistory = state.seasonHistory.some(s => s.season === state.season);
        let updatedSeasonHistory = state.seasonHistory;
        if (!alreadyInHistory) {
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

          const acTeams = state.teams.filter(t => t.conference === 'AC');
          const ncTeams = state.teams.filter(t => t.conference === 'NC');
          const bestAc = [...acTeams].sort((a, b) => b.record.wins - a.record.wins || a.record.losses - b.record.losses)[0];
          const bestNc = [...ncTeams].sort((a, b) => b.record.wins - a.record.wins || a.record.losses - b.record.losses)[0];

          const { first: allLeagueFirst, second: allLeagueSecond, allRookie: allRookieTeam } = computeAllLeagueTeams(state);

          const seasonSummary: import('@/types').SeasonSummary = {
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
            retiredPlayers: playersAfterRetirement
              .filter(p => retiredIds.has(p.id) && (p.ratings.overall >= 65 || p.experience >= 5))
              .sort((a, b) => b.ratings.overall - a.ratings.overall)
              .map(p => ({
                playerId: p.id,
                name: `${p.firstName} ${p.lastName}`,
                position: p.position,
                teamId: p.teamId ?? '',
                age: p.age,
              })),
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

          updatedSeasonHistory = [...state.seasonHistory, seasonSummary];
        }

        // Process end-of-season approval for user team
        const approvalNews: import('@/types').NewsItem[] = [];
        // Determine user's playoff result for approval
        const userPR: string = (() => {
          if (!state.playoffBracket) return 'missed';
          const userInPlayoffs = state.playoffBracket.some(m =>
            m.homeTeamId === state.userTeamId || m.awayTeamId === state.userTeamId);
          if (!userInPlayoffs) return 'missed';
          const sb = state.playoffBracket.find(m => m.id === 'championship');
          if (sb?.winnerId === state.userTeamId) return 'champion';
          if (sb?.homeTeamId === state.userTeamId || sb?.awayTeamId === state.userTeamId) return 'runnerup';
          const confGames = state.playoffBracket.filter(m => m.round === 3);
          if (confGames.some(m => m.homeTeamId === state.userTeamId || m.awayTeamId === state.userTeamId)) return 'conference';
          const divGames = state.playoffBracket.filter(m => m.round === 2);
          if (divGames.some(m => m.homeTeamId === state.userTeamId || m.awayTeamId === state.userTeamId)) return 'divisional';
          return 'wildcard';
        })();
        const finalTeams = recalcTeams.map(t => {
          if (t.id !== state.userTeamId) return t;
          const approval = t.approval ?? defaultApproval();
          const evaluated = evaluateObjectives(approval.objectives, t, userPR, playersAfterRetirement, state.season);
          const updated = updateApprovalEndOfSeason({ ...approval, objectives: evaluated }, userPR, evaluated);
          // Generate new objectives for next season
          updated.objectives = generateSeasonObjectives(t, playersAfterRetirement, state.season + 1, userPR);
          // Warning news
          if (updated.warningIssued && !approval.warningIssued) {
            approvalNews.push(makeNews({
              season: state.season, week: 99, type: 'system',
              headline: `Sources say ${t.city} ownership is losing patience with GM. One more bad season could mean changes.`,
              isUserTeam: true,
            }));
          }
          return { ...t, approval: updated };
        });

        set({
          phase: 'resigning',
          resigningPlayers,
          holdoutDemands,
          teams: finalTeams,
          players: playersAfterRetirement,
          newsItems: [...state.newsItems, ...retirementNews, ...holdoutNews, ...approvalNews],
          seasonHistory: updatedSeasonHistory,
        });

        // Sync GM stats to leaderboard (post-playoffs, no draft data yet)
        const gmPayload = buildGmSyncPayload(get());
        if (gmPayload) syncGmStats(gmPayload);
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

        // During re-signing phase, expiring salaries were already removed from payroll
        // so we just add the new salary (no delta needed)
        const capSpaceNeeded = salary;

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

      passOnResigningBatch: (playerIds: string[]) => {
        const state = get();
        const idSet = new Set(playerIds);
        const salaryMap = new Map<string, number>();
        for (const id of playerIds) {
          const p = state.players.find(pl => pl.id === id);
          salaryMap.set(id, p?.contract.salary ?? 0);
        }
        set({
          players: state.players.map(p =>
            idSet.has(p.id) ? { ...p, teamId: null, contract: { ...p.contract, yearsLeft: 0 } } : p,
          ),
          teams: state.teams.map(t => {
            if (t.id !== state.userTeamId) return t;
            const newRoster = t.roster.filter(id => !idSet.has(id));
            const newDepthChart = POSITIONS.reduce<Record<Position, string[]>>((acc, pos) => {
              acc[pos] = (t.depthChart[pos] ?? []).filter(id => !idSet.has(id));
              return acc;
            }, {} as Record<Position, string[]>);
            let payrollDrop = 0;
            for (const id of playerIds) payrollDrop += salaryMap.get(id) ?? 0;
            return { ...t, roster: newRoster, depthChart: newDepthChart, totalPayroll: Math.max(0, t.totalPayroll - payrollDrop) };
          }),
          freeAgents: [...state.freeAgents, ...playerIds],
          resigningPlayers: state.resigningPlayers.filter(e => !idSet.has(e.playerId)),
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

      // Resolve a contract holdout demand
      resolveHoldout: (playerId: string, resolution: 'extend' | 'deny') => {
        const state = get();
        const demand = state.holdoutDemands.find(h => h.playerId === playerId);
        if (!demand || demand.resolved) return;

        const player = state.players.find(p => p.id === playerId);
        if (!player) return;

        const updatedDemands = state.holdoutDemands.map(h =>
          h.playerId === playerId ? { ...h, resolved: true } : h,
        );

        if (resolution === 'deny') {
          // Player holds out — performance penalty until season ends
          const denyNews = makeNews({
            season: state.season,
            week: 0,
            type: 'system',
            teamId: state.userTeamId,
            playerIds: [playerId],
            headline: `${player.firstName} ${player.lastName} begins holdout`,
            body: `After being denied a new contract, the ${player.position} will hold out. Expect reduced performance until the situation is resolved.`,
            isUserTeam: true,
          });

          set({
            holdoutDemands: updatedDemands,
            players: state.players.map(p =>
              p.id === playerId ? { ...p, holdout: true, mood: Math.max(0, p.mood - 10) } : p,
            ),
            newsItems: [...state.newsItems, denyNews],
          });
        } else {
          // Extend — mark resolved, clear holdout flag. UI will open negotiation.
          set({
            holdoutDemands: updatedDemands,
            players: state.players.map(p =>
              p.id === playerId ? { ...p, holdout: false } : p,
            ),
          });
        }
      },

      advanceToDraft: () => {
        const state = get();
        // Draft now comes after free agency (Re-signing → Free Agency → Draft)
        let updatedPlayers = [...state.players];
        let updatedTeams = [...state.teams];

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

        // Detect NFL 2026 roster for hardcoded first-round picks
        const isNfl = state.seasonHistory.length === 0 && isNfl2026Roster(updatedTeams, updatedPlayers);
        let nflMockDraft: { pickNum: number; teamAbbr: string; playerId: string; firstName: string; lastName: string; position: Position; college: string; blurb: string }[] = [];

        // Base draft class: imported or generated
        let baseDraftClass: Player[];
        const draftSettings = state.leagueSettings ?? DEFAULT_LEAGUE_SETTINGS;
        if (importedDraftClass.length > 0) {
          // Imported prospects (from FBGM) lack scouting/combine/college/draftProfile fields.
          // Enrich them so scouting, boom/bust, and display work correctly.
          const scoutLabels = ['High motor', 'Raw but explosive', 'Pro-ready', 'Injury history', 'Combine standout', 'Character concerns', 'Sleeper'];
          baseDraftClass = importedDraftClass.map(p => ({
            ...p,
            scoutingLabel: p.scoutingLabel ?? scoutLabels[Math.floor(Math.random() * scoutLabels.length)],
            scoutingSeed: p.scoutingSeed ?? Math.floor(Math.random() * 10000),
            college: p.college ?? '',
            combineStats: p.combineStats ?? generateCombineStats(p.position, p.ratings, Math.floor(Math.random() * 10000)),
            draftProfile: p.draftProfile ?? 'normal' as const,
          }));

          // Apply boom/bust profiles to imported prospects (same logic as generateDraftClass)
          const sortedByOvr = [...baseDraftClass].sort((a, b) => b.ratings.overall - a.ratings.overall);
          const mid = Math.floor(sortedByOvr.length / 2);
          const bustRate = draftSettings.chaosDraft ? 1.0 : 0.08;
          const boomRate = draftSettings.chaosDraft ? 1.0 : 0.06;
          for (let i = 0; i < sortedByOvr.length; i++) {
            const p = sortedByOvr[i];
            if (p.draftProfile !== 'normal') continue; // already assigned
            if (p.position === 'K' || p.position === 'P') continue;
            if (i < mid && Math.random() < bustRate) {
              p.draftProfile = 'bust';
              const potDrop = draftSettings.chaosDraft ? 10 + Math.floor(Math.random() * 8) : 5 + Math.floor(Math.random() * 6);
              p.potential = Math.max(30, Math.min(99, p.ratings.overall - potDrop));
            } else if (i >= mid && p.scoutingLabel !== 'Sleeper' && Math.random() < boomRate) {
              p.draftProfile = 'boom';
              const potBoost = draftSettings.chaosDraft ? 20 + Math.floor(Math.random() * 10) : 15 + Math.floor(Math.random() * 10);
              p.potential = Math.max(30, Math.min(95, p.ratings.overall + potBoost));
            }
          }
        } else {
          baseDraftClass = generateDraftClass(224, { chaosDraft: draftSettings.chaosDraft }).map((player) => ({
            ...player,
            draftYear: targetDraftYear,
          }));
        }

        let rawDraftClass: Player[];
        if (isNfl) {
          // Create hardcoded first-round prospects — reuse existing imported players if same name exists
          const nflProspects: Player[] = [];
          for (const pick of NFL_2026_FIRST_ROUND) {
            // Check if this player already exists in the base draft class (from FBGM import)
            const existing = baseDraftClass.find(
              bp => bp.firstName === pick.firstName && bp.lastName === pick.lastName
            );
            let p: Player;
            if (existing) {
              // Reuse the imported player, just update OVR/potential/rank
              p = { ...existing };
              const variance = Math.floor(Math.random() * 7) - 3;
              p.ratings = { ...p.ratings, overall: Math.max(55, Math.min(85, pick.ovrBase + variance)) };
              p.potential = pick.potential;
              p.projectedRank = pick.pick;
              p.scoutingLabel = pick.blurb;
              // Remove from baseDraftClass so it's not duplicated
              const idx = baseDraftClass.findIndex(bp => bp.id === existing.id);
              if (idx >= 0) baseDraftClass.splice(idx, 1);
            } else {
              // Create new player
              const variance = Math.floor(Math.random() * 7) - 3;
              const ovr = Math.max(55, Math.min(85, pick.ovrBase + variance));
              p = generatePlayer(pick.position, ovr, {
                age: 21 + (Math.random() < 0.3 ? 1 : 0),
                experience: 0,
              });
              p.firstName = pick.firstName;
              p.lastName = pick.lastName;
              p.position = pick.position;
              p.college = pick.college;
              p.ratings.overall = Math.max(55, Math.min(85, pick.ovrBase + (Math.floor(Math.random() * 7) - 3)));
              p.potential = pick.potential;
              p.contract = { salary: 0, yearsLeft: 0, guaranteed: 0, totalYears: 0 };
              p.draftYear = targetDraftYear;
            }
            p.projectedRank = pick.pick;
            p.scoutingLabel = pick.blurb;
            p.scoutingSeed = p.scoutingSeed ?? Math.floor(Math.random() * 10000);
            p.combineStats = p.combineStats ?? generateCombineStats(p.position, p.ratings, pick.pick);
            nflProspects.push(p);

            nflMockDraft.push({
              pickNum: pick.pick,
              teamAbbr: pick.teamAbbr,
              playerId: p.id,
              firstName: pick.firstName,
              lastName: pick.lastName,
              position: pick.position,
              college: pick.college,
              blurb: pick.blurb,
            });
          }

          // Replace top prospects in the base class with our hardcoded ones
          const baseSorted = baseDraftClass.sort((a, b) => b.ratings.overall - a.ratings.overall);
          const remaining = baseSorted.slice(nflProspects.length); // drop the top N
          rawDraftClass = [...nflProspects, ...remaining];
        } else {
          rawDraftClass = baseDraftClass;
        }

        // Ensure all prospects have projectedRank (imported prospects won't have it)
        const needsRanking = rawDraftClass.some(p => p.projectedRank == null);
        if (needsRanking) {
          const sorted = [...rawDraftClass].sort((a, b) => {
            const aOvr = (a.position === 'K' || a.position === 'P') ? a.ratings.overall - 40 : a.ratings.overall;
            const bOvr = (b.position === 'K' || b.position === 'P') ? b.ratings.overall - 40 : b.ratings.overall;
            return bOvr - aOvr;
          });
          for (let i = 0; i < sorted.length; i++) {
            if (sorted[i].projectedRank == null) sorted[i].projectedRank = i + 1;
          }
        }
        const draftClass = rawDraftClass;

        // --- NFL-correct draft order: group by playoff exit round ---
        // Helper: sort teams by record (worst first)
        const byRecordWorstFirst = (a: Team, b: Team) => {
          const aGames = a.record.wins + a.record.losses + a.record.ties;
          const bGames = b.record.wins + b.record.losses + b.record.ties;
          const aWinPct = aGames > 0 ? (a.record.wins + a.record.ties * 0.5) / aGames : 0;
          const bWinPct = bGames > 0 ? (b.record.wins + b.record.ties * 0.5) / bGames : 0;
          if (aWinPct !== bWinPct) return aWinPct - bWinPct;
          return a.record.pointsFor - b.record.pointsFor;
        };

        // Determine each team's playoff exit round from the bracket
        // 0 = missed playoffs, 1 = lost wild card, 2 = lost divisional,
        // 3 = lost conference championship, 4 = lost super bowl, 5 = won super bowl
        const playoffExitRound = new Map<string, number>();
        const bracket = state.playoffBracket ?? [];
        const playoffTeamIdsSet = new Set<string>();

        if (bracket.length > 0) {
          // Collect all teams that appeared in the playoff bracket
          for (const m of bracket) {
            if (m.homeTeamId) playoffTeamIdsSet.add(m.homeTeamId);
            if (m.awayTeamId) playoffTeamIdsSet.add(m.awayTeamId);
          }

          // Find Super Bowl (round 4) winner
          const superBowl = bracket.find(m => m.round === 4 && m.winnerId);
          const sbWinnerId = superBowl?.winnerId ?? null;
          const sbLoserId = superBowl
            ? (superBowl.homeTeamId === sbWinnerId ? superBowl.awayTeamId : superBowl.homeTeamId)
            : null;

          if (sbWinnerId) playoffExitRound.set(sbWinnerId, 5); // SB winner = last pick
          if (sbLoserId) playoffExitRound.set(sbLoserId, 4);   // SB loser = pick 31

          // Conference championship losers (round 3)
          for (const m of bracket.filter(m => m.round === 3 && m.winnerId)) {
            const loserId = m.homeTeamId === m.winnerId ? m.awayTeamId : m.homeTeamId;
            if (loserId && !playoffExitRound.has(loserId)) {
              playoffExitRound.set(loserId, 3);
            }
          }

          // Divisional round losers (round 2)
          for (const m of bracket.filter(m => m.round === 2 && m.winnerId)) {
            const loserId = m.homeTeamId === m.winnerId ? m.awayTeamId : m.homeTeamId;
            if (loserId && !playoffExitRound.has(loserId)) {
              playoffExitRound.set(loserId, 2);
            }
          }

          // Wild card losers (round 1)
          for (const m of bracket.filter(m => m.round === 1 && m.winnerId)) {
            const loserId = m.homeTeamId === m.winnerId ? m.awayTeamId : m.homeTeamId;
            if (loserId && !playoffExitRound.has(loserId)) {
              playoffExitRound.set(loserId, 1);
            }
          }

          // Any playoff team not yet assigned (e.g. bye-week teams who lost in divisional
          // should already be covered, but just in case)
          for (const tid of playoffTeamIdsSet) {
            if (!playoffExitRound.has(tid)) {
              playoffExitRound.set(tid, 1);
            }
          }
        }

        // Build sorted draft order: non-playoff by record, then each playoff exit group by record
        const nonPlayoffTeams = updatedTeams
          .filter(t => !playoffTeamIdsSet.has(t.id))
          .sort(byRecordWorstFirst);

        const wcLosers = updatedTeams
          .filter(t => playoffExitRound.get(t.id) === 1)
          .sort(byRecordWorstFirst);

        const divLosers = updatedTeams
          .filter(t => playoffExitRound.get(t.id) === 2)
          .sort(byRecordWorstFirst);

        const confLosers = updatedTeams
          .filter(t => playoffExitRound.get(t.id) === 3)
          .sort(byRecordWorstFirst);

        const sbLoser = updatedTeams
          .filter(t => playoffExitRound.get(t.id) === 4);

        const sbWinner = updatedTeams
          .filter(t => playoffExitRound.get(t.id) === 5);

        const sortedTeams = [
          ...nonPlayoffTeams,
          ...wcLosers,
          ...divLosers,
          ...confLosers,
          ...sbLoser,
          ...sbWinner,
        ] as Team[];

        // BS Mode: Anti-Tanking Draft Lottery for bottom 6 non-playoff teams
        const bsMode = state.leagueSettings?.bsMode ?? false;
        let lotteryNews: NewsItem[] = [];
        let lotteryResults: { teamId: string; abbr: string; originalRank: number; lotteryPick: number }[] = [];
        if (bsMode) {
          // If no playoffs happened yet (first season), treat all teams as non-playoff
          const playoffTeamIds = new Set(
            state.playoffSeeds ? [...(state.playoffSeeds.AC ?? []), ...(state.playoffSeeds.NC ?? [])] : []
          );
          const nonPlayoff = playoffTeamIds.size > 0
            ? sortedTeams.filter(t => !playoffTeamIds.has(t.id))
            : sortedTeams; // first season: all teams eligible
          const lotteryPool = nonPlayoff.slice(0, 6);
          if (lotteryPool.length >= 6) {
            const weights = [25, 20, 17, 15, 13, 10];
            const lotteryResult: typeof lotteryPool = [];
            const remaining = [...lotteryPool];
            const remWeights = [...weights];
            for (let pick = 0; pick < lotteryPool.length; pick++) {
              const total = remWeights.reduce((a, b) => a + b, 0);
              let roll = Math.random() * total;
              let winner = 0;
              for (let i = 0; i < remWeights.length; i++) {
                roll -= remWeights[i];
                if (roll <= 0) { winner = i; break; }
              }
              lotteryResult.push(remaining[winner]);
              remaining.splice(winner, 1);
              remWeights.splice(winner, 1);
            }
            const restNonPlayoff = nonPlayoff.slice(6);
            const playoffSorted = sortedTeams.filter(t => playoffTeamIds.has(t.id));
            // Reassign sortedTeams order (used for draft pick ordering)
            const newOrder = [...lotteryResult, ...restNonPlayoff, ...playoffSorted];
            // Rebuild the teamWinPctMap based on lottery order
            for (let i = 0; i < sortedTeams.length; i++) {
              (sortedTeams as typeof newOrder)[i] = newOrder[i];
            }
            // Store lottery results for UI display
            lotteryResults = lotteryResult.map((t, i) => ({
              teamId: t.id,
              abbr: t.abbreviation,
              originalRank: nonPlayoff.indexOf(t) + 1,
              lotteryPick: i + 1,
            }));
            lotteryNews.push(makeNews({
              season: state.season, week: 0, type: 'system',
              headline: `DRAFT LOTTERY: ${lotteryResult[0].city} ${lotteryResult[0].name} win the #1 overall pick!`,
              body: `Lottery order: ${lotteryResult.map((t, i) => `${i + 1}. ${t.abbreviation}`).join(', ')}`,
              isUserTeam: lotteryResult.some(t => t.id === state.userTeamId),
            }));
          }
        }

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
        // Draft order = the OWNER of each pick drafts. draftPickOrder is the
        // canonical pick.id sequence — stays constant across trades, used to
        // re-derive draftOrder when ownership changes.
        let draftOrder = allDraftYearPicks.map(pk => pk.ownerTeamId);
        let draftPickOrder = allDraftYearPicks.map(pk => pk.id);

        // NFL 2026: override first-round order to match the real mock draft,
        // but respect any traded picks (ownerTeamId may differ from originalTeamId).
        //
        // League import generates exactly one round-1 pick per team per year (keyed
        // by originalTeamId). The NFL mock may list a team in multiple slots because
        // they acquired a pick via a real-life trade. For each extra slot, we
        // consume a "donor" pick from a team that's missing from the mock (their
        // real pick was traded away) — moving it to the acquiring team's
        // draftPicks so every slot in draftPickOrder has a unique pick.id.
        if (isNfl && nflMockDraft.length > 0) {
          const round1Picks = allDraftYearPicks.filter(pk => pk.round === 1);
          const pickByOriginalTeam = new Map<string, typeof round1Picks[number]>();
          for (const pk of round1Picks) {
            pickByOriginalTeam.set(pk.originalTeamId, pk);
          }

          // Teams that appear in the mock own at least one round-1 slot; teams that
          // don't appear are "donors" whose original pick was traded away.
          const mockTeamIds = new Set<string>();
          for (const mock of nflMockDraft) {
            const t = updatedTeams.find(t => t.abbreviation === mock.teamAbbr);
            if (t) mockTeamIds.add(t.id);
          }
          const donorPicks: typeof round1Picks = [];
          for (const [origId, pk] of pickByOriginalTeam) {
            if (!mockTeamIds.has(origId)) donorPicks.push(pk);
          }

          const consumedPickIds = new Set<string>();
          // Records pick reassignments: pickId → new owning team id (moves the
          // pick from the donor team's draftPicks to this team's draftPicks).
          const pickReassignments = new Map<string, string>();

          const round1OrderTeams: string[] = [];
          const round1OrderPicks: string[] = [];
          for (const mock of nflMockDraft) {
            const originalTeam = updatedTeams.find(t => t.abbreviation === mock.teamAbbr);
            if (!originalTeam) continue;
            const ownPick = pickByOriginalTeam.get(originalTeam.id);
            let pk: typeof round1Picks[number] | undefined;
            if (ownPick && !consumedPickIds.has(ownPick.id)) {
              pk = ownPick;
            } else {
              pk = donorPicks.shift();
              if (pk) pickReassignments.set(pk.id, originalTeam.id);
            }
            if (!pk) continue;
            consumedPickIds.add(pk.id);
            round1OrderTeams.push(pickReassignments.get(pk.id) ?? pk.ownerTeamId);
            round1OrderPicks.push(pk.id);
          }

          if (pickReassignments.size > 0) {
            // Move each reassigned pick out of its old team's draftPicks and into
            // the new owner's, with ownerTeamId updated.
            const movedPicks = new Map<string, DraftPick>();
            updatedTeams = updatedTeams.map(t => {
              const kept: DraftPick[] = [];
              for (const pk of t.draftPicks) {
                const newOwner = pickReassignments.get(pk.id);
                if (newOwner && newOwner !== t.id) {
                  movedPicks.set(pk.id, { ...pk, ownerTeamId: newOwner });
                } else {
                  kept.push(pk);
                }
              }
              return { ...t, draftPicks: kept };
            });
            updatedTeams = updatedTeams.map(t => {
              const incoming: DraftPick[] = [];
              for (const [pid, newOwner] of pickReassignments) {
                if (newOwner === t.id) {
                  const moved = movedPicks.get(pid);
                  if (moved) incoming.push(moved);
                }
              }
              return incoming.length > 0 ? { ...t, draftPicks: [...t.draftPicks, ...incoming] } : t;
            });
          }

          if (round1OrderTeams.length > 0) {
            draftOrder = [...round1OrderTeams, ...draftOrder.slice(round1OrderTeams.length)];
            draftPickOrder = [...round1OrderPicks, ...draftPickOrder.slice(round1OrderPicks.length)];
          }
        }

        // Ensure EVERY draft class player is in the players array
        // AND update any existing players whose ratings were modified by NFL mock draft
        const draftClassById = new Map(draftClass.map(p => [p.id, p]));
        const existingIds = new Set(updatedPlayers.map(p => p.id));
        const missingFromPlayers = draftClass.filter(p => !existingIds.has(p.id));
        let finalPlayers = [
          ...updatedPlayers.map(p => draftClassById.get(p.id) ?? p), // overlay modified draft prospects
          ...missingFromPlayers,
        ];

        // Generate dynamic mock draft for non-NFL years (or if NFL mock wasn't created)
        if (nflMockDraft.length === 0) {
          const teamsPerRound = updatedTeams.length;
          const r1Order = draftOrder.slice(0, teamsPerRound);
          let mockFreeAgents = new Set(draftClass.map(p => p.id));
          for (let pi = 0; pi < Math.min(r1Order.length, 32); pi++) {
            const pickTeamId = r1Order[pi];
            const pickTeam = updatedTeams.find(t => t.id === pickTeamId);
            if (!pickTeam) continue;
            // Use BPA to project the pick
            const mockState = {
              ...state,
              draftOrder: r1Order.slice(pi),
              freeAgents: [...mockFreeAgents],
              players: finalPlayers,
              teams: updatedTeams,
              nflMockDraft: undefined, // don't use hardcoded mock for projection
            } as LeagueState;
            const projectedId = autoDraftPlayerId(mockState, pickTeamId);
            if (!projectedId) continue;
            const prospect = finalPlayers.find(p => p.id === projectedId);
            if (!prospect) continue;
            mockFreeAgents.delete(projectedId);

            const blurbs: Record<string, string[]> = {
              QB: ['Strong-armed passer with excellent pocket presence.', 'Dual-threat playmaker who can beat you with his arm and legs.', 'Accurate passer with high football IQ and quick release.'],
              RB: ['Dynamic runner with breakaway speed and vision.', 'Physical back who excels between the tackles.', 'Versatile three-down back with soft hands.'],
              WR: ['Route-running technician with reliable hands.', 'Big-play threat with elite speed and separation.', 'Physical receiver who wins contested catches.'],
              TE: ['Matchup nightmare with size and athleticism.', 'Complete tight end who blocks and receives at a high level.', 'Red zone weapon with reliable hands.'],
              OL: ['Powerful lineman with excellent technique.', 'Versatile blocker who can play multiple positions.', 'Anchor in pass protection with strong run blocking.'],
              DL: ['Disruptive force with a quick first step.', 'Interior presence who collapses the pocket.', 'Relentless pass rusher with a deep move arsenal.'],
              LB: ['Sideline-to-sideline defender with range.', 'Hard-hitting linebacker with blitz ability.', 'Instinctive player who reads and reacts quickly.'],
              CB: ['Lockdown corner with fluid hips and ball skills.', 'Physical press corner who disrupts at the line.', 'Rangy defender with elite recovery speed.'],
              S: ['Ball-hawk safety with range and football IQ.', 'Hard-hitting safety who excels in run support.', 'Versatile defender who can play deep or in the box.'],
              K: ['Accurate kicker with strong leg.'], P: ['Booming punter with excellent hangtime.'],
            };
            const posBlurbs = blurbs[prospect.position] ?? ['Solid prospect with upside.'];
            nflMockDraft.push({
              pickNum: pi + 1,
              teamAbbr: pickTeam.abbreviation,
              playerId: projectedId,
              firstName: prospect.firstName,
              lastName: prospect.lastName,
              position: prospect.position,
              college: prospect.college ?? '',
              blurb: posBlurbs[pi % posBlurbs.length],
            });
          }
        }

        // PRD-07: Compute scouting data for draft prospects
        const scoutingData = computeScoutingData(draftClass, state.scoutingLevel);

        // Verify all draft class and mock draft players are in finalPlayers
        if (nflMockDraft.length > 0) {
          const fpIds = new Set(finalPlayers.map(p => p.id));
          for (const mock of nflMockDraft) {
            if (!fpIds.has(mock.playerId)) {
              console.error(`[advanceToDraft] Mock draft player ${mock.firstName} ${mock.lastName} (${mock.playerId}) NOT in finalPlayers! Adding now.`);
              const fix = generatePlayer(mock.position as Position, 70, { age: 21, experience: 0 });
              fix.id = mock.playerId;
              fix.firstName = mock.firstName;
              fix.lastName = mock.lastName;
              fix.position = mock.position as Position;
              fix.college = mock.college;
              fix.contract = { salary: 0, yearsLeft: 0, guaranteed: 0, totalYears: 0 };
              finalPlayers.push(fix);
            }
          }
        }

        // Recalculate all team payrolls from scratch to prevent drift
        const recalcTeams = updatedTeams.map(t => ({
          ...t,
          totalPayroll: recalculateTeamPayroll(t, finalPlayers),
        }));

        set({
          phase: 'draft',
          players: finalPlayers,
          teams: recalcTeams,
          freeAgents: draftClass.map(p => p.id),
          draftOrder,
          draftPickOrder,
          currentDraftYear: targetDraftYear,
          draftResults: [],
          resigningPlayers: [],
          holdoutDemands: [],
          draftScoutingData: scoutingData,
          nflMockDraft: nflMockDraft.length > 0 ? nflMockDraft : undefined,
          scoutingState: {
            scoutPoints: 10 + (state.scoutingLevel || 0) * 5,
            maxScoutPoints: 20,
            filmReviews: {},
            inPersonEvals: {},
            inPersonEvalCount: 0,
            fullEvals: {},
            fullEvalCount: 0,
          },
        });

        // Draft class preview news
        const draftClassByPos: Record<string, number> = {};
        for (const p of draftClass) {
          draftClassByPos[p.position] = (draftClassByPos[p.position] ?? 0) + 1;
        }
        const deepestPos = Object.entries(draftClassByPos).sort((a, b) => b[1] - a[1])[0];
        const thinnestPos = Object.entries(draftClassByPos).sort((a, b) => a[1] - b[1])[0];
        const eliteCount = draftClass.filter(p => p.ratings.overall >= 75).length;
        const topQBs = draftClass.filter(p => p.position === 'QB' && p.ratings.overall >= 65).length;

        const previewHeadline = eliteCount >= 8
          ? `Loaded draft class features ${eliteCount} first-round caliber prospects`
          : eliteCount >= 4
          ? `Solid draft class headlined by ${deepestPos?.[0] ?? 'varied'} depth`
          : `Thin draft class — teams may look to trade down`;

        const previewBody = [
          `Deepest position: ${deepestPos?.[0] ?? '?'} (${deepestPos?.[1] ?? 0} prospects).`,
          `Thinnest position: ${thinnestPos?.[0] ?? '?'} (${thinnestPos?.[1] ?? 0} prospects).`,
          topQBs >= 3 ? `QB-needy teams rejoice — ${topQBs} quarterbacks project as Day 1 starters.` :
          topQBs >= 1 ? `Only ${topQBs} QB${topQBs > 1 ? 's' : ''} project as a first-round talent.` :
          'No elite QBs in this class — expect a run on signal callers in the middle rounds.',
          `${eliteCount} prospects grade out as first-round caliber talent.`,
        ].join(' ');

        const draftPreviewNews = makeNews({
          season: state.season, week: 0, type: 'system',
          headline: previewHeadline,
          body: previewBody,
          isUserTeam: false,
        });

        // Add lottery news, draft preview, and results
        {
          const s = get();
          const extraNews: NewsItem[] = [draftPreviewNews, ...lotteryNews];
          set({
            newsItems: [...s.newsItems, ...extraNews],
            ...(lotteryResults.length > 0 ? { draftLotteryResults: lotteryResults } : {}),
          });
        }

        // Generate offseason trade rumors + AI proposals entering the draft
        const draftState = get();
        const draftRumors = generateTradeRumors(draftState);
        const draftProposals = generateAITradeProposals(draftState);
        if (draftRumors.length > 0 || draftProposals.length > 0) {
          const rumorNews: NewsItem[] = draftRumors.map(r => makeNews({
            season: draftState.season, week: 0, type: 'rumor',
            headline: r.headline, body: r.detail,
            teamId: r.teamId, isUserTeam: r.teamId === draftState.userTeamId,
          }));
          set({
            tradeRumors: [...(draftState.tradeRumors ?? []), ...draftRumors],
            tradeProposals: [...draftState.tradeProposals, ...draftProposals],
            newsItems: [...draftState.newsItems, ...rumorNews],
          });
        }
      },

      draftPlayer: (playerId: string) => {
        const state = get();
        if (state.phase !== 'draft') return;
        let player = state.players.find(p => p.id === playerId);
        if (!player) {
          // Last resort: create the player from mock draft data if available
          const mock = state.nflMockDraft?.find(m => m.playerId === playerId);
          if (mock) {
            const created = generatePlayer(mock.position as Position, 75, { age: 21, experience: 0 });
            created.id = playerId;
            created.firstName = mock.firstName;
            created.lastName = mock.lastName;
            created.position = mock.position as Position;
            created.college = mock.college;
            created.contract = { salary: 0, yearsLeft: 0, guaranteed: 0, totalYears: 0 };
            player = created;
            // Inject into state in the same set() call below
          } else {
            return;
          }
        }

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
        // Critical: filter by year as well as round/owner. Without the year
        // filter, leftover unused picks from a prior draft (e.g., a 2030 R1
        // that was silently skipped) would be wrongly consumed by current-year
        // picks, leaving the current-year pick orphaned in draftResults.
        const draftYear = state.currentDraftYear ?? state.season;
        let pickMarked = false;
        const updatedTeams = state.teams.map(t => {
          const updatedPicks = t.draftPicks.map(pk => {
            if (
              !pickMarked &&
              pk.year === draftYear &&
              pk.ownerTeamId === currentPickTeamId &&
              pk.round === round &&
              !pk.playerId
            ) {
              pickMarked = true;
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

        // Build updated players array — include created player if it wasn't in the original array
        const playerInArray = state.players.some(p => p.id === playerId);
        const draftedPlayer = {
          ...player,
          teamId: currentPickTeamId,
          draftYear: state.season,
          draftPick: overallPick,
          acquiredVia: 'draft' as const, acquiredSeason: state.season,
          contract: { salary: finalSalary, yearsLeft: 4, guaranteed: generateGuaranteed(finalSalary, 4), totalYears: 4, offseasonSigned: true },
        };
        const updatedPlayers2 = playerInArray
          ? state.players.map(p => p.id === playerId ? draftedPlayer : p)
          : [...state.players, draftedPlayer];

        set({
          players: updatedPlayers2,
          teams: updatedTeams,
          freeAgents: newFreeAgents,
          draftOrder: newDraftOrder,
          draftResults: [
            ...state.draftResults,
            { overallPick, round, pickInRound, teamId: currentPickTeamId, playerId },
          ],
          newsItems: newNewsItems,
        });

        // If this was the last pick of the draft, sync GM stats with draft data
        if (newDraftOrder.length === 0) {
          const gmDraftPayload = buildGmSyncPayload(get());
          if (gmDraftPayload) syncGmStats(gmDraftPayload);
        }

        // Draft complete — no auto-advance; user clicks "Start New Season"
      },

      simDraftPick: () => {
        const state = get();
        if (state.phase !== 'draft') return;
        const currentPickTeamId = state.draftOrder[0];
        if (!currentPickTeamId) return;
        const playerId = autoDraftPlayerId(state, currentPickTeamId);
        if (playerId) {
          get().draftPlayer(playerId);
        } else {
          set({ draftOrder: state.draftOrder.slice(1) });
        }
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
        const draftYear = state.currentDraftYear ?? state.season;

        for (let guard = 0; guard < 5000 && draftOrder.length > 0 && freeAgentIds.length > 0; guard++) {
          const pickTeam = draftOrder[0];
          if (pickTeam === state.userTeamId) break; // Stop at user's pick

          const fakeState = { ...state, draftOrder, freeAgents: freeAgentIds, players, teams } as LeagueState;
          const pid = autoDraftPlayerId(fakeState, pickTeam);
          if (!pid) {
            draftOrder = draftOrder.slice(1);
            continue;
          }

          let player = players.find(p => p.id === pid);
          if (!player) {
            // Player ID returned by autoDraftPlayerId but not in players array
            // Create from nflMockDraft data if available, otherwise generate a
            // fresh prospect at this draft slot (never leave a ghost result).
            const mock = state.nflMockDraft?.find(m => m.playerId === pid);
            if (mock) {
              const created = generatePlayer(mock.position as Position, 70, { age: 21, experience: 0 });
              created.id = pid;
              created.firstName = mock.firstName;
              created.lastName = mock.lastName;
              created.position = mock.position as Position;
              created.college = mock.college;
              created.contract = { salary: 0, yearsLeft: 0, guaranteed: 0, totalYears: 0 };
              players = [...players, created];
              player = created;
            } else {
              // No mock fallback — generate a generic prospect with this id
              const fresh = generatePlayer('OL', 65, { age: 21, experience: 0 });
              fresh.id = pid;
              fresh.contract = { salary: 0, yearsLeft: 0, guaranteed: 0, totalYears: 0 };
              players = [...players, fresh];
              player = fresh;
            }
          }

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
          let pickMarkedSim = false;
          teams = teams.map(t => {
            const updPicks = t.draftPicks.map(pk => {
              if (
                !pickMarkedSim &&
                pk.year === draftYear &&
                pk.ownerTeamId === pickTeam &&
                pk.round === round &&
                !pk.playerId
              ) {
                pickMarkedSim = true;
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
        const draftYear = state.currentDraftYear ?? state.season;

        for (let guard = 0; guard < 5000 && draftOrder.length > 0 && freeAgentIds.length > 0; guard++) {
          const pickTeam = draftOrder[0];
          const fakeState = { ...state, draftOrder, freeAgents: freeAgentIds, players, teams } as LeagueState;
          const pid = autoDraftPlayerId(fakeState, pickTeam);
          if (!pid) {
            // Skip this pick — advance draft order and continue
            draftOrder = draftOrder.slice(1);
            continue;
          }

          let player = players.find(p => p.id === pid);
          if (!player) {
            // Player ID returned by autoDraftPlayerId but not in players array
            // Create from nflMockDraft data if available, otherwise generate a
            // fresh prospect at this draft slot (never leave a ghost result).
            const mock = state.nflMockDraft?.find(m => m.playerId === pid);
            if (mock) {
              const created = generatePlayer(mock.position as Position, 70, { age: 21, experience: 0 });
              created.id = pid;
              created.firstName = mock.firstName;
              created.lastName = mock.lastName;
              created.position = mock.position as Position;
              created.college = mock.college;
              created.contract = { salary: 0, yearsLeft: 0, guaranteed: 0, totalYears: 0 };
              players = [...players, created];
              player = created;
            } else {
              // No mock fallback — generate a generic prospect with this id
              const fresh = generatePlayer('OL', 65, { age: 21, experience: 0 });
              fresh.id = pid;
              fresh.contract = { salary: 0, yearsLeft: 0, guaranteed: 0, totalYears: 0 };
              players = [...players, fresh];
              player = fresh;
            }
          }

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
          let pickMarkedSim = false;
          teams = teams.map(t => {
            const updPicks = t.draftPicks.map(pk => {
              if (
                !pickMarkedSim &&
                pk.year === draftYear &&
                pk.ownerTeamId === pickTeam &&
                pk.round === round &&
                !pk.playerId
              ) {
                pickMarkedSim = true;
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

        // Sync GM stats with draft data — fire as soon as the draft completes
        const gmEndDraftPayload = buildGmSyncPayload(get());
        if (gmEndDraftPayload) syncGmStats(gmEndDraftPayload);

        // Draft complete — no auto-advance; user clicks "Start New Season"
      },

      /**
       * Recover from orphan draftResults — entries whose playerId doesn't resolve
       * to a real player. This shouldn't happen, but if state corruption sneaks in
       * (e.g., from a buggy older version), the affected pick slots end up showing
       * as "—" in the table and the user can never use them.
       *
       * Strategy: drop orphan results, also clear the matching team.draftPick.playerId,
       * and prepend the orphan slots back onto draftOrder so they get re-picked.
       * Idempotent — safe to call multiple times; no-op if no orphans.
       */
      recoverOrphanDraftPicks: () => {
        const state = get();
        if (state.phase !== 'draft') return;
        const playerIds = new Set(state.players.map(p => p.id));
        const orphans = state.draftResults.filter(r => !playerIds.has(r.playerId));
        if (orphans.length === 0) return;

        const orphanKey = (r: { teamId: string; round: number }) => `${r.teamId}|${r.round}`;
        const orphanKeys = new Set(orphans.map(orphanKey));
        const orphanResultIds = new Set(orphans.map(o => `${o.overallPick}`));

        // Drop orphans from draftResults
        const cleanResults = state.draftResults.filter(r => !orphanResultIds.has(`${r.overallPick}`));

        // Restore the pick slots to the front of draftOrder, sorted by overallPick
        const slotsToRestore = orphans
          .slice()
          .sort((a, b) => a.overallPick - b.overallPick)
          .map(r => r.teamId);
        const restoredDraftOrder = [...slotsToRestore, ...state.draftOrder];

        // Clear the matching team.draftPicks playerId so they're available again.
        // Match by (ownerTeamId, round) — only the first match per orphan key.
        const consumedKeys = new Set<string>();
        const restoredTeams = state.teams.map(t => ({
          ...t,
          draftPicks: t.draftPicks.map(pk => {
            const key = `${pk.ownerTeamId}|${pk.round}`;
            if (
              orphanKeys.has(key) &&
              !consumedKeys.has(`${pk.id}`) &&
              pk.playerId &&
              !playerIds.has(pk.playerId)
            ) {
              consumedKeys.add(`${pk.id}`);
              return { ...pk, playerId: undefined, pick: undefined };
            }
            return pk;
          }),
        }));

        // Note: do NOT touch draftPickOrder — the same pick.ids still correspond
        // to the same slots; we're just clearing their playerId fields.
        console.warn(
          `[recoverOrphanDraftPicks] Restored ${orphans.length} orphan pick(s):`,
          orphans.map(o => `#${o.overallPick} ${o.teamId}`).join(', '),
        );
        set({
          draftResults: cleanResults,
          draftOrder: restoredDraftOrder,
          teams: restoredTeams,
        });
      },

      advanceToFreeAgency: () => {
        const state = get();

        // When coming from resigning phase, handle unsigned players and AI re-signings first
        let prePlayers = [...state.players];
        let preTeams = [...state.teams];

        if (state.phase === 'resigning') {
          // Handle remaining unsigned user players — remove from team
          const unhandledUserExpiring = new Set(state.resigningPlayers.map(e => e.playerId));
          const unhandledSalary = prePlayers
            .filter(p => unhandledUserExpiring.has(p.id))
            .reduce((sum, p) => sum + p.contract.salary, 0);
          prePlayers = prePlayers.map(p =>
            unhandledUserExpiring.has(p.id) ? { ...p, teamId: null, contract: { ...p.contract, yearsLeft: 0 } } : p,
          );
          preTeams = preTeams.map(t => {
            if (t.id !== state.userTeamId) return t;
            const newRoster = t.roster.filter(id => !unhandledUserExpiring.has(id));
            const newDepthChart = POSITIONS.reduce<Record<Position, string[]>>((acc, pos) => {
              acc[pos] = (t.depthChart[pos] ?? []).filter(id => !unhandledUserExpiring.has(id));
              return acc;
            }, {} as Record<Position, string[]>);
            return { ...t, roster: newRoster, depthChart: newDepthChart, totalPayroll: Math.max(0, t.totalPayroll - unhandledSalary) };
          });

          // AI teams use franchise tag on their best expiring player (OVR >= 70)
          const aiTeamsForTag = preTeams.filter(t => t.id !== state.userTeamId && !t.franchiseTagUsed);
          for (const aiTeam of aiTeamsForTag) {
            const expiring = prePlayers
              .filter(p => p.teamId === aiTeam.id && p.contract.yearsLeft === 1 && !p.retired)
              .sort((a, b) => b.ratings.overall - a.ratings.overall);
            const bestPlayer = expiring[0];
            if (bestPlayer && bestPlayer.ratings.overall >= 70) {
              const tagSalary = computeFranchiseTagSalary(bestPlayer.position, prePlayers, bestPlayer);
              const oldSalary = bestPlayer.contract.salary;
              const aiTeamData = preTeams.find(t => t.id === aiTeam.id);
              const canAffordTag = aiTeamData ? (aiTeamData.totalPayroll + tagSalary - oldSalary) <= aiTeamData.salaryCap : false;
              if (canAffordTag) {
                prePlayers = prePlayers.map(p =>
                  p.id === bestPlayer.id ? { ...p, contract: { salary: tagSalary, yearsLeft: 1, guaranteed: tagSalary, totalYears: 1, offseasonSigned: true } } : p,
                );
                preTeams = preTeams.map(t =>
                  t.id === aiTeam.id ? { ...t, totalPayroll: Math.max(0, t.totalPayroll + (tagSalary - oldSalary)), franchiseTagUsed: true } : t,
                );
              }
            }
          }

          // AI teams auto-resign their own expiring players.
          // Re-sign probability scales with player quality — elite players almost never walk.
          const aiTeams = preTeams.filter(t => t.id !== state.userTeamId);
          for (const aiTeam of aiTeams) {
            const expiringFromAI = prePlayers.filter(
              p => p.teamId === aiTeam.id && p.contract.yearsLeft === 1 && !p.retired,
            ).sort((a, b) => b.ratings.overall - a.ratings.overall);
            let aiTeamPayroll = aiTeam.totalPayroll;
            // Track position counts to enforce roster limits during re-signing
            const aiPosCount: Record<string, number> = {};
            for (const p of prePlayers.filter(pp => pp.teamId === aiTeam.id && !pp.retired && pp.contract.yearsLeft > 1)) {
              aiPosCount[p.position] = (aiPosCount[p.position] || 0) + 1;
            }
            for (const player of expiringFromAI) {
              // Skip if already at position max
              const currentCount = aiPosCount[player.position] || 0;
              if (currentCount >= ROSTER_LIMITS[player.position].max) {
                prePlayers = prePlayers.map(p =>
                  p.id === player.id ? { ...p, contract: { ...p.contract, yearsLeft: 0 } } : p,
                );
                continue;
              }
              const ci = capInflationFactor(aiTeam.salaryCap);
              const marketSalary = estimateSalary(player.ratings.overall, player.position, player.age, player.potential, ci);
              const capSpace = aiTeam.salaryCap - aiTeamPayroll;
              const resignProb = player.ratings.overall >= 85 ? 0.98
                : player.ratings.overall >= 75 ? 0.90
                : player.ratings.overall >= 65 ? 0.75
                : 0.55;
              // Teams will stretch to keep elite players (up to 15% over cap, like a restructure)
              const canAfford = capSpace >= marketSalary || (player.ratings.overall >= 80 && capSpace >= marketSalary * -0.15);
              if (canAfford && Math.random() < resignProb) {
                const salary = Math.max(marketSalary, capSpace > 0 ? marketSalary : capSpace + marketSalary); // reduce if over cap
                const newYears = player.age >= 33 ? 1 + Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * 3);
                const salaryDiff = salary - player.contract.salary;
                prePlayers = prePlayers.map(p =>
                  p.id === player.id ? { ...p, contract: { salary, yearsLeft: newYears, guaranteed: generateGuaranteed(salary, newYears), totalYears: newYears, offseasonSigned: true } } : p,
                );
                aiTeamPayroll += salaryDiff;
                aiPosCount[player.position] = (aiPosCount[player.position] || 0) + 1;
                preTeams = preTeams.map(t =>
                  t.id === aiTeam.id ? { ...t, totalPayroll: Math.max(0, aiTeamPayroll) } : t,
                );
              } else {
                prePlayers = prePlayers.map(p =>
                  p.id === player.id ? { ...p, contract: { ...p.contract, yearsLeft: 0 } } : p,
                );
              }
            }
          }

          // Persist the pre-processed state before FA setup
          set({ players: prePlayers, teams: preTeams });
        }

        // Now set up free agency using current state (which includes resigning cleanup if applicable)
        const faState = get();
        const expiredPlayers = faState.players.filter(
          p => p.teamId && p.contract.yearsLeft <= 0,
        );

        const releaseNews: NewsItem[] = expiredPlayers
          .filter(p => p.ratings.overall >= 75)
          .map(p => {
            const t = faState.teams.find(t => t.id === p.teamId);
            return makeNews({
              season: faState.season,
              week: 0,
              type: 'release',
              teamId: p.teamId!,
              playerIds: [p.id],
              headline: `${p.firstName} ${p.lastName} (${p.position}, ${t?.abbreviation ?? '?'}) enters free agency.`,
              isUserTeam: p.teamId === faState.userTeamId,
            });
          });

        // Include any existing free agents (from prior phases)
        const existingFAIds = (faState.freeAgents ?? []).filter(id => {
          const p = faState.players.find(pl => pl.id === id);
          return p && !p.teamId;
        });

        // Generate supplemental free agents to ensure a healthy market
        // Target: at least 150 FAs available (real pro FA class is 200-400+)
        const baseFACount = expiredPlayers.length + existingFAIds.length;
        const supplementalCount = Math.max(0, 150 - baseFACount);
        const supplementalPlayers: Player[] = [];
        if (supplementalCount > 0) {
          // Mix of camp bodies (38-55 OVR), depth (55-65), and a few mid-tier
          // (65-72). Skewed toward depth so the user can always find cheap
          // signings, not just expensive mid-tier vets.
          for (let i = 0; i < supplementalCount; i++) {
            const pos = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];
            const tierRoll = Math.random();
            const talentMean =
              tierRoll < 0.55 ? 38 + Math.random() * 17 : // 55% camp bodies (38-55)
              tierRoll < 0.90 ? 55 + Math.random() * 10 : // 35% depth (55-65)
              65 + Math.random() * 7;                     // 10% mid-tier (65-72)
            const p = generatePlayer(pos, talentMean, {
              age: 24 + Math.floor(Math.random() * 8),
              experience: 1 + Math.floor(Math.random() * 6),
              teamId: null,
            });
            supplementalPlayers.push(p);
          }
        }

        // Build free agent ID set for faPriority assignment
        const faIdSet = new Set([...expiredPlayers.map(p => p.id), ...existingFAIds, ...supplementalPlayers.map(p => p.id)]);

        const allPlayers = [
          ...faState.players.map(p => {
            const base = p.contract.yearsLeft <= 0 ? { ...p, teamId: null } : p;
            // Assign faPriority for all free agents that don't already have one
            if (faIdSet.has(base.id) && !base.faPriority) {
              return { ...base, faPriority: assignFAPriority(base) };
            }
            return base;
          }),
          ...supplementalPlayers.map(p => p.faPriority ? p : { ...p, faPriority: assignFAPriority(p) }),
        ];

        const faTeams = faState.teams.map(t => {
          const newRoster = t.roster.filter(pid => !expiredPlayers.find(ep => ep.id === pid));
          // Remove expired players from depth chart
          const newDepthChart = POSITIONS.reduce<Record<Position, string[]>>((acc, pos) => {
            acc[pos] = (t.depthChart[pos] ?? []).filter(
              pid => !expiredPlayers.find(ep => ep.id === pid),
            );
            return acc;
          }, {} as Record<Position, string[]>);
          const updatedTeam = { ...t, roster: newRoster, depthChart: newDepthChart };
          // Recalculate payroll from scratch to prevent drift
          return { ...updatedTeam, totalPayroll: recalculateTeamPayroll(updatedTeam, allPlayers) };
        });

        set({
          phase: 'freeAgency',
          players: allPlayers,
          teams: faTeams,
          freeAgents: [...expiredPlayers.map(p => p.id), ...existingFAIds, ...supplementalPlayers.map(p => p.id)],
          faDay: 1,
          newsItems: [...faState.newsItems, ...releaseNews],
          pursuitState: {
            pursuitPoints: 5 + (faState.scoutingLevel || 0) * 3,
            maxPursuitPoints: 11,
            intelReports: {},
          },
        });

        // Compute initial refusals
        const newState = get();
        const userTeamData = newState.teams.find(t => t.id === newState.userTeamId);
        if (userTeamData) {
          set({ faRefusals: computeFARefusals(newState.freeAgents, newState.players, userTeamData, 1) });
        }

        // Generate offseason trade rumors + AI proposals entering free agency
        const rumorState = get();
        const faRumors = generateTradeRumors(rumorState);
        const faProposals = generateAITradeProposals(rumorState);
        if (faRumors.length > 0 || faProposals.length > 0) {
          const rumorNews: NewsItem[] = faRumors.map(r => makeNews({
            season: rumorState.season, week: 0, type: 'rumor',
            headline: r.headline, body: r.detail,
            teamId: r.teamId, isUserTeam: r.teamId === rumorState.userTeamId,
          }));
          set({
            tradeRumors: [...(rumorState.tradeRumors ?? []), ...faRumors],
            tradeProposals: [...rumorState.tradeProposals, ...faProposals],
            newsItems: [...rumorState.newsItems, ...rumorNews],
          });
        }

        // Re-sync GM stats now that the draft is complete (includes draft score)
        const gmFaPayload = buildGmSyncPayload(get());
        if (gmFaPayload) syncGmStats(gmFaPayload);
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

        // Signing pace: Early(1-5): 18-28, Mid-Early(6-10): 12-18, Mid(11-20): 8-12, Late(21-30): 4-8
        const signingsThisDay =
          nextDay <= 5 ? 18 + Math.floor(Math.random() * 11) :
          nextDay <= 10 ? 12 + Math.floor(Math.random() * 7) :
          nextDay <= 20 ? 8 + Math.floor(Math.random() * 5) :
          4 + Math.floor(Math.random() * 5);

        // Score AI teams by need — check roster needs AND upgrade opportunities
        const teamNeedScores: { teamId: string; score: number; needPositions: Position[]; wantPositions: Position[] }[] = [];
        const rosterLimitEnabled = (state.leagueSettings ?? DEFAULT_LEAGUE_SETTINGS).rosterLimitEnabled !== false;
        const rosterCap = rosterLimitEnabled ? 53 : 56;
        for (const t of currentTeams) {
          if (t.id === state.userTeamId) continue;
          const rosterPlayers = currentPlayers.filter(p => p.teamId === t.id && !p.retired);
          if (rosterPlayers.length >= rosterCap) continue;
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
          if (needPositions.length > 0 || wantPositions.length > 0 || rosterPlayers.length < 53 || Math.random() < 0.7) {
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

          // Compute position counts for this team to enforce roster limits
          const aiRoster = currentPlayers.filter(p => p.teamId === aiTeamId && !p.retired);
          const aiPosCounts: Record<string, number> = {};
          for (const p of aiRoster) aiPosCounts[p.position] = (aiPosCounts[p.position] || 0) + 1;

          // AI teams can stretch ~15% over cap for elite FAs (simulating restructures/backloading)
          const effectiveCap = capSpace + teamData.salaryCap * 0.15;
          const availableFAs = currentFreeAgents
            .map(id => currentPlayers.find(p => p.id === id))
            .filter((p): p is Player => !!p && !p.retired)
            .filter(p => {
              // Skip positions already at or above max
              const posCount = aiPosCounts[p.position] || 0;
              if (posCount >= ROSTER_LIMITS[p.position].max) return false;
              const sal = estimateSalary(p.ratings.overall, p.position, p.age, p.potential) * decay;
              return sal <= effectiveCap || (capSpace >= LEAGUE_MINIMUM_SALARY && sal <= LEAGUE_MINIMUM_SALARY * 2);
            })
            .sort((a, b) => {
              const aBonus = needPositions.includes(a.position) ? 200 : wantPositions.includes(a.position) ? 80 : 0;
              const bBonus = needPositions.includes(b.position) ? 200 : wantPositions.includes(b.position) ? 80 : 0;
              return (bBonus + b.ratings.overall) - (aBonus + a.ratings.overall);
            });

          const target = availableFAs[0];
          if (!target) continue;

          const marketSalary = estimateSalary(target.ratings.overall, target.position, target.age, target.potential) * decay;
          // AI willing to slightly exceed current cap space for elite players (restructure assumption)
          const maxAffordable = Math.max(capSpace, capSpace + teamData.salaryCap * 0.10);
          const aiSalary = Math.round(Math.max(LEAGUE_MINIMUM_SALARY, Math.min(marketSalary, maxAffordable)) * 10) / 10;
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

        // Recalculate all team payrolls from scratch to prevent drift from incremental tracking
        currentTeams = currentTeams.map(t => ({
          ...t,
          totalPayroll: recalculateTeamPayroll(t, currentPlayers),
        }));

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
        // persist middleware overhead (serialization + IndexedDB write per call)
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
            nextDay <= 5 ? 18 + Math.floor(Math.random() * 11) :
            nextDay <= 10 ? 12 + Math.floor(Math.random() * 7) :
            nextDay <= 20 ? 8 + Math.floor(Math.random() * 5) :
            4 + Math.floor(Math.random() * 5);

          const teamNeedScores: { teamId: string; score: number; needPositions: Position[]; wantPositions: Position[] }[] = [];
          const rosterLimitEnabled2 = (initialState.leagueSettings ?? DEFAULT_LEAGUE_SETTINGS).rosterLimitEnabled !== false;
          const rosterCap2 = rosterLimitEnabled2 ? 53 : 56;
          for (const t of currentTeams) {
            if (t.id === initialState.userTeamId) continue;
            const rosterPlayers = currentPlayers.filter(p => p.teamId === t.id && !p.retired);
            if (rosterPlayers.length >= rosterCap2) continue;
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
            if (needPositions.length > 0 || wantPositions.length > 0 || rosterPlayers.length < 53 || Math.random() < 0.7) {
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

            const effectiveCap = capSpace + teamData.salaryCap * 0.15;
            const availableFAs = currentFreeAgents
              .map(id => currentPlayers.find(p => p.id === id))
              .filter((p): p is Player => !!p && !p.retired)
              .filter(p => {
                const sal = estimateSalary(p.ratings.overall, p.position, p.age, p.potential) * decay;
                return sal <= effectiveCap || (capSpace >= LEAGUE_MINIMUM_SALARY && sal <= LEAGUE_MINIMUM_SALARY * 2);
              })
              .sort((a, b) => {
                const aBonus = needPositions.includes(a.position) ? 200 : wantPositions.includes(a.position) ? 80 : 0;
                const bBonus = needPositions.includes(b.position) ? 200 : wantPositions.includes(b.position) ? 80 : 0;
                return (bBonus + b.ratings.overall) - (aBonus + a.ratings.overall);
              });

            const target = availableFAs[0];
            if (!target) continue;

            const marketSalary = estimateSalary(target.ratings.overall, target.position, target.age, target.potential) * decay;
            const maxAffordable = Math.max(capSpace, capSpace + teamData.salaryCap * 0.10);
            const aiSalary = Math.round(Math.max(LEAGUE_MINIMUM_SALARY, Math.min(marketSalary, maxAffordable)) * 10) / 10;
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

        // Recalculate all team payrolls from scratch to prevent drift
        currentTeams = currentTeams.map(t => ({
          ...t,
          totalPayroll: recalculateTeamPayroll(t, currentPlayers),
        }));

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
        // Contract-floor guard: cap AAV by OVR so a 30 OVR scrub can't be
        // signed to $500M. The market wouldn't accept that in reality, and
        // the cap-space check above doesn't catch it. (BmoreOriole report.)
        const prospect = state.players.find(p => p.id === playerId);
        if (prospect && userTeam) {
          const ci = capInflationFactor(userTeam.salaryCap);
          const maxForOvr = maxReasonableAAV(prospect.ratings.overall, prospect.position, ci);
          if (salary > maxForOvr * 1.5) {
            console.warn(`[signFreeAgent] Rejected — ${Math.round(salary * 10) / 10}M/yr exceeds max ${Math.round(maxForOvr * 1.5 * 10) / 10}M for ${prospect.ratings.overall} OVR ${prospect.position}`);
            return false;
          }
        }
        // 53-man roster limit (when enabled — default true)
        const rosterLimitOn = (state.leagueSettings ?? DEFAULT_LEAGUE_SETTINGS).rosterLimitEnabled !== false;
        if (rosterLimitOn && userTeam) {
          const userRosterCount = state.players.filter(p => p.teamId === state.userTeamId && !p.retired).length;
          if (userRosterCount >= 53) {
            console.warn('[signFreeAgent] Rejected — user team is at 53-man limit. Cut a player first.');
            return false;
          }
        }

        const player = state.players.find(p => p.id === playerId);

        // --- Step 1: Apply user signing to local variables ---
        const isOffseason = state.phase === 'freeAgency' || state.phase === 'resigning' || state.phase === 'draft';
        let currentPlayers = state.players.map(p =>
          p.id === playerId
            ? { ...p, teamId: state.userTeamId, acquiredVia: 'free-agency' as const, acquiredSeason: state.season, contract: { salary, yearsLeft: years, guaranteed: generateGuaranteed(salary, years), totalYears: years, ...(isOffseason ? { offseasonSigned: true } : {}) } }
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
            // Compute position counts for this team to enforce roster limits
            const aiRosterRS = currentPlayers.filter(p => p.teamId === aiTeamId && !p.retired);
            const aiPosCountsRS: Record<string, number> = {};
            for (const p of aiRosterRS) aiPosCountsRS[p.position] = (aiPosCountsRS[p.position] || 0) + 1;
            const availableFAs = currentFreeAgents
              .map(id => currentPlayers.find(p => p.id === id))
              .filter((p): p is Player => !!p && !p.retired)
              .filter(p => {
                // Skip positions already at or above max
                const posCount = aiPosCountsRS[p.position] || 0;
                if (posCount >= ROSTER_LIMITS[p.position].max) return false;
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

        // Approval impact for signing star players
        if (player && player.ratings.overall >= 70) {
          currentTeams = currentTeams.map(t => {
            if (t.id !== state.userTeamId) return t;
            const approval = t.approval ?? defaultApproval();
            return { ...t, approval: updateApprovalForMove(approval, 'sign_star') };
          });
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

        // Approval impact for releasing star players
        let finalRelTeams = updatedTeams;
        if (player.ratings.overall >= 70) {
          finalRelTeams = finalRelTeams.map(t => {
            if (t.id !== state.userTeamId) return t;
            const approval = t.approval ?? defaultApproval();
            return { ...t, approval: updateApprovalForMove(approval, 'trade_away_star') };
          });
        }

        set({
          players: state.players.map(p =>
            p.id === playerId
              ? { ...p, teamId: null, onIR: false, contract: { salary: contract.salary, yearsLeft: contract.yearsLeft, guaranteed: contract.guaranteed, totalYears: contract.totalYears } }
              : p,
          ),
          teams: finalRelTeams,
          freeAgents: [...state.freeAgents, playerId],
          newsItems: [...state.newsItems, releaseNews],
        });
      },

      autoCutToRosterLimit: (teamId?: string) => {
        const state = get();
        const rosterLimitOn = (state.leagueSettings ?? DEFAULT_LEAGUE_SETTINGS).rosterLimitEnabled !== false;
        if (!rosterLimitOn) return;
        const ROSTER_CAP = 53;

        const targetTeams = teamId ? state.teams.filter(t => t.id === teamId) : state.teams;
        const cutsByTeam = new Map<string, string[]>();

        for (const t of targetTeams) {
          const teamPlayers = state.players.filter(p => p.teamId === t.id && !p.retired);
          if (teamPlayers.length <= ROSTER_CAP) continue;
          // Sort by OVR ascending but PROTECT position minimums — never cut a
          // player if their position would drop below ROSTER_LIMITS.min.
          // Without this, backup RBs get cut and RB1 ends up with 100% of
          // carries, producing 2k+ rushing yard seasons.
          const posCount: Record<string, number> = {};
          for (const p of teamPlayers) posCount[p.position] = (posCount[p.position] ?? 0) + 1;
          const sorted = [...teamPlayers].sort((a, b) => a.ratings.overall - b.ratings.overall);
          const cuts: string[] = [];
          const needToCut = teamPlayers.length - ROSTER_CAP;
          for (const p of sorted) {
            if (cuts.length >= needToCut) break;
            const posMin = ROSTER_LIMITS[p.position]?.min ?? 1;
            if ((posCount[p.position] ?? 0) <= posMin) continue; // protect position minimum
            cuts.push(p.id);
            posCount[p.position] = (posCount[p.position] ?? 1) - 1;
          }
          if (cuts.length > 0) cutsByTeam.set(t.id, cuts);
        }
        if (cutsByTeam.size === 0) return;

        const allCutIds = new Set<string>();
        for (const ids of cutsByTeam.values()) ids.forEach(id => allCutIds.add(id));

        const updatedPlayers = state.players.map(p => {
          if (!allCutIds.has(p.id)) return p;
          return {
            ...p,
            teamId: null,
            onIR: false,
            contract: {
              salary: p.contract.salary,
              yearsLeft: p.contract.yearsLeft,
              guaranteed: p.contract.guaranteed,
              totalYears: p.contract.totalYears,
            },
          };
        });

        const updatedTeams = state.teams.map(t => {
          const cuts = cutsByTeam.get(t.id);
          if (!cuts || cuts.length === 0) return t;
          const cutSet = new Set(cuts);
          const cutPlayers = state.players.filter(p => cutSet.has(p.id));
          const salaryFreed = cutPlayers.reduce((s, p) => s + (p.contract.salary ?? 0), 0);
          const chart = POSITIONS.reduce<Record<Position, string[]>>((acc, pos) => {
            acc[pos] = (t.depthChart[pos] ?? []).filter(id => !cutSet.has(id));
            return acc;
          }, {} as Record<Position, string[]>);
          return {
            ...t,
            roster: t.roster.filter(id => !cutSet.has(id)),
            totalPayroll: Math.max(0, t.totalPayroll - salaryFreed),
            depthChart: chart,
          };
        });

        set({
          players: updatedPlayers,
          teams: updatedTeams,
          freeAgents: [...state.freeAgents, ...allCutIds],
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

      setBaseFormation: (formation: '3-4' | '4-3' | 'Nickel') => {
        const state = get();
        if (!state.userTeamId) return;
        set({
          teams: state.teams.map(t =>
            t.id === state.userTeamId ? { ...t, baseFormation: formation } : t,
          ),
        });
      },

      togglePlayingThroughInjury: (playerId: string) => {
        const state = get();
        const player = state.players.find(p => p.id === playerId);
        if (!player || player.teamId !== state.userTeamId) return;
        // Only allowed on user's team, for injured players with ≤3 weeks left,
        // and not on IR (IR and play-through are mutually exclusive).
        if (player.onIR) return;
        const currentlyOn = !!player.playingThroughInjury;
        if (!currentlyOn) {
          if (!player.injury || player.injury.weeksLeft <= 0 || player.injury.weeksLeft > 3) return;
        }
        set({
          players: state.players.map(p =>
            p.id === playerId ? { ...p, playingThroughInjury: !currentlyOn } : p,
          ),
        });
      },

      extendPlayer: (playerId: string, salary: number, years: number) => {
        const state = get();
        const player = state.players.find(p => p.id === playerId);
        if (!player || player.teamId !== state.userTeamId) return false;

        // Eligibility checks
        if (player.contract.yearsLeft < 1) return false;
        if (player.holdout) return false;
        if (player.onIR) return false;
        if ((state.extensionsUsedThisSeason ?? 0) >= 3) return false;
        if (player.lastRestructuredSeason === state.season) return false;

        const userTeam = state.teams.find(t => t.id === state.userTeamId);
        if (!userTeam) return false;

        const oldContract = player.contract;
        const oldCapHit = getCapHit(oldContract);

        // Calculate unamortized bonus from any prior restructures (becomes dead cap)
        const unamortizedBonus = getUnamortizedBonus(oldContract);
        const deadCapAmount = Math.round(unamortizedBonus * 10) / 10;

        // Build new contract
        const newGuaranteed = generateGuaranteed(salary, years);
        const newContract: import('@/types').Contract = {
          salary,
          yearsLeft: years,
          guaranteed: newGuaranteed,
          totalYears: years,
        };

        // Dead cap entries from unamortized bonus
        const newDeadCap: DeadCapEntry[] = deadCapAmount > 0
          ? [{
              playerName: `${player.firstName} ${player.lastName}`,
              amount: deadCapAmount,
              yearsLeft: 1,
              source: 'extension' as const,
              season: state.season,
            }]
          : [];

        // Update payroll: remove old cap hit, add new salary, add dead cap charge
        const payrollDelta = salary - oldCapHit + deadCapAmount;

        const extensionsUsed = state.extensionsUsedThisSeason ?? 0;

        set({
          players: state.players.map(p =>
            p.id === playerId
              ? {
                  ...p,
                  contract: newContract,
                  lastRestructuredSeason: state.season,
                  mood: Math.min(100, (p.mood ?? 70) + 15),
                }
              : p,
          ),
          teams: state.teams.map(t =>
            t.id === state.userTeamId
              ? {
                  ...t,
                  totalPayroll: Math.max(0, t.totalPayroll + payrollDelta),
                  deadCap: [...(t.deadCap ?? []), ...newDeadCap],
                }
              : t,
          ),
          extensionsUsedThisSeason: extensionsUsed + 1,
          newsItems: [...state.newsItems, makeNews({
            season: state.season, week: state.week, type: 'signing',
            teamId: state.userTeamId, playerIds: [playerId],
            headline: `${player.firstName} ${player.lastName} signed a ${years}-year, $${salary}M/yr extension with the ${userTeam.city} ${userTeam.name}.${deadCapAmount > 0 ? ` ($${deadCapAmount}M dead cap from prior restructure)` : ''}`,
            isUserTeam: true,
          })],
        });

        return true;
      },

      // PRD-04: Execute a trade
      executeTrade: (
        offeredPlayerIds,
        offeredPickIds,
        receivedPlayerIds,
        receivedPickIds,
        counterpartTeamId,
        skipValueCheck,
        forceGodMode,
      ) => {
        const state = get();
        // God Mode force: skip deadline and playoff checks
        if (!forceGodMode) {
          const tradeDeadline = (state.leagueSettings ?? DEFAULT_LEAGUE_SETTINGS).tradeDeadlineWeek;
          if (state.phase === 'regular' && state.week > tradeDeadline + 1) return { success: false, reason: 'Trade deadline has passed' };
          if (state.phase === 'playoffs') return { success: false, reason: 'No trades during playoffs' };
        }

        const userTeam = state.teams.find(t => t.id === state.userTeamId);
        const aiTeam = state.teams.find(t => t.id === counterpartTeamId);
        if (!userTeam || !aiTeam) return { success: false, reason: 'Team not found' };

        // Evaluate trade values (pick values account for team record)
        const offeredValue = offeredPlayerIds.reduce((sum, id) => {
          const p = state.players.find(pl => pl.id === id);
          return sum + (p ? playerTradeValue(p) : 0);
        }, 0) + offeredPickIds.reduce((sum, id) => {
          const pick = userTeam.draftPicks.find(pk => pk.id === id);
          return sum + (pick ? pickTradeValue(pick, state.teams) : 0);
        }, 0);

        const receivedValue = receivedPlayerIds.reduce((sum, id) => {
          const p = state.players.find(pl => pl.id === id);
          return sum + (p ? playerTradeValue(p) : 0);
        }, 0) + receivedPickIds.reduce((sum, id) => {
          const pick = aiTeam.draftPicks.find(pk => pk.id === id);
          return sum + (pick ? pickTradeValue(pick, state.teams) : 0);
        }, 0);

        // AI accepts if within 5% value (skip for AI-initiated proposals or God Mode force)
        if (!skipValueCheck && !forceGodMode && offeredValue < receivedValue * 0.95) return { success: false, reason: 'Trade value too low — AI rejected' };

        // Cap check (skipped in God Mode force)
        const offeredSalaryTotal = offeredPlayerIds.reduce((sum, id) => {
          const p = state.players.find(pl => pl.id === id);
          return sum + (p ? p.contract.salary : 0);
        }, 0);
        const receivedSalaryTotal = receivedPlayerIds.reduce((sum, id) => {
          const p = state.players.find(pl => pl.id === id);
          return sum + (p ? p.contract.salary : 0);
        }, 0);
        const netSalaryChange = receivedSalaryTotal - offeredSalaryTotal;
        if (!forceGodMode) {
          const currentlyOverCap = userTeam.totalPayroll > userTeam.salaryCap;
          const newPayroll = userTeam.totalPayroll + netSalaryChange;
          if (currentlyOverCap) {
            if (netSalaryChange > 0) {
              return { success: false, reason: `Trade adds $${Math.round(netSalaryChange * 10) / 10}M in salary — must shed salary or stay flat when over the cap` };
            }
          } else {
            if (newPayroll > userTeam.salaryCap) {
              return { success: false, reason: `Trade would put you $${Math.round((newPayroll - userTeam.salaryCap) * 10) / 10}M over the cap — send more salary out or receive less` };
            }
          }
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
            return { ...p, teamId: counterpartTeamId, acquiredVia: 'trade' as const, acquiredSeason: state.season, contract: cleanContract };
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
            return { ...p, teamId: state.userTeamId, acquiredVia: 'trade' as const, acquiredSeason: state.season, contract: cleanContract };
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

        // During draft phase, re-derive draftOrder from the canonical draftPickOrder.
        // The pick.id sequence stays constant — we just look up each pick's
        // current owner from updatedTeams. This preserves the original NFL mock
        // draft order (or any custom slotting) without re-sorting by win-pct.
        let updatedDraftOrder = state.draftOrder;
        if (state.phase === 'draft' && (offeredPickIds.length > 0 || receivedPickIds.length > 0)) {
          if (state.draftPickOrder) {
            const pickOwnerById = new Map<string, string>();
            for (const t of updatedTeams) {
              for (const pk of t.draftPicks) {
                pickOwnerById.set(pk.id, pk.ownerTeamId);
              }
            }
            const picksAlreadyMade = state.draftPickOrder.length - state.draftOrder.length;
            updatedDraftOrder = state.draftPickOrder
              .slice(picksAlreadyMade)
              .map(pid => pickOwnerById.get(pid))
              .filter((tid): tid is string => !!tid);
          } else {
            // Legacy save fallback (pre-draftPickOrder): sort remaining picks
            // by (round, originalTeamId's win-pct slot). Imperfect for NFL mock
            // round 1 ordering, but better than letting draftOrder go stale.
            const sortedTeamsByRecord = [...state.teams].sort((a, b) => {
              const aWp = a.record.wins + a.record.losses > 0 ? a.record.wins / (a.record.wins + a.record.losses) : 0.5;
              const bWp = b.record.wins + b.record.losses > 0 ? b.record.wins / (b.record.wins + b.record.losses) : 0.5;
              return aWp - bWp;
            });
            const teamWinPctIndex = new Map(sortedTeamsByRecord.map((t, i) => [t.id, i]));
            const allPicksThisYear = updatedTeams.flatMap(t =>
              t.draftPicks.filter(pk => pk.year === state.season),
            );
            allPicksThisYear.sort((a, b) => {
              if (a.round !== b.round) return a.round - b.round;
              return (teamWinPctIndex.get(a.originalTeamId) ?? 16) - (teamWinPctIndex.get(b.originalTeamId) ?? 16);
            });
            const picksAlreadyMade = state.teams.length * 7 - state.draftOrder.length;
            updatedDraftOrder = allPicksThisYear.map(pk => pk.ownerTeamId).slice(picksAlreadyMade);
          }
        }

        // Approval impact for trading star players
        const tradedStars = [...offeredPlayerIds, ...receivedPlayerIds]
          .map(id => state.players.find(p => p.id === id))
          .filter((p): p is Player => !!p && p.ratings.overall >= 70);
        let finalTeams = updatedTeams;
        for (const star of tradedStars) {
          const isAcquiring = receivedPlayerIds.includes(star.id);
          const moveType = isAcquiring ? 'trade_for_star' : 'trade_away_star';
          finalTeams = finalTeams.map(t => {
            if (t.id !== state.userTeamId) return t;
            const approval = t.approval ?? defaultApproval();
            return { ...t, approval: updateApprovalForMove(approval, moveType as 'trade_for_star' | 'trade_away_star') };
          });
        }

        // During the re-signing phase, if we acquired a player with an expiring
        // contract, add them to the user's re-signing queue so the user gets a
        // chance to re-sign them before they hit free agency.
        let updatedResigningPlayers = state.resigningPlayers;
        if (state.phase === 'resigning') {
          const newExpiringPlayers = receivedPlayerIds
            .map(id => updatedPlayers.find(p => p.id === id))
            .filter((p): p is Player => !!p && p.contract.yearsLeft <= 1 && !p.retired);
          if (newExpiringPlayers.length > 0) {
            const userTeamForResign = finalTeams.find(t => t.id === state.userTeamId);
            const newEntries = newExpiringPlayers
              .filter(p => !updatedResigningPlayers.some(e => e.playerId === p.id))
              .map(p => computeResigningEntry(p, userTeamForResign!));
            updatedResigningPlayers = [...updatedResigningPlayers, ...newEntries];
          }
        }

        set({
          players: updatedPlayers,
          teams: finalTeams,
          draftOrder: updatedDraftOrder,
          resigningPlayers: updatedResigningPlayers,
          newsItems: [...state.newsItems, tradeNews],
        });

        return { success: true };
      },

      generateCounterOffer: (receivedPlayerIds, receivedPickIds, counterpartTeamId) => {
        const state = get();
        const userTeam = state.teams.find(t => t.id === state.userTeamId);
        const aiTeam = state.teams.find(t => t.id === counterpartTeamId);
        if (!userTeam || !aiTeam) return null;

        // Calculate what the AI wants (value of players/picks the user is asking for)
        const targetValue = receivedPlayerIds.reduce((sum, id) => {
          const p = state.players.find(pl => pl.id === id);
          return sum + (p ? playerTradeValue(p) : 0);
        }, 0) + receivedPickIds.reduce((sum, id) => {
          const pick = aiTeam.draftPicks.find(pk => pk.id === id);
          return sum + (pick ? pickTradeValue(pick, state.teams) : 0);
        }, 0);

        // AI wants at least 90% of the value
        const neededValue = targetValue * 0.95;

        // Collect user's available assets sorted by value
        const userRoster = state.players
          .filter(p => p.teamId === state.userTeamId && !p.retired && !receivedPlayerIds.includes(p.id))
          .map(p => ({ id: p.id, value: playerTradeValue(p), salary: p.contract.salary, ovr: p.ratings.overall }))
          .sort((a, b) => a.value - b.value); // ascending — prefer sending lower value players

        const userPicks = userTeam.draftPicks
          .filter(pk => pk.year >= state.season && !pk.playerId)
          .map(pk => ({ id: pk.id, value: pickTradeValue(pk, state.teams), round: pk.round }))
          .sort((a, b) => b.round - a.round); // prefer sending later picks first

        const sendPlayerIds: string[] = [];
        const sendPickIds: string[] = [];
        let accumulated = 0;

        // Strategy: build a realistic package — mix of a player + 1-2 picks
        // First, find the best player match (closest to target value without massive overshoot)
        const sortedByCloseness = [...userRoster]
          .filter(p => p.ovr >= 55 && p.value <= neededValue * 1.3)
          .sort((a, b) => b.value - a.value); // highest value first

        // Add the best player match as anchor
        if (sortedByCloseness.length > 0 && neededValue > 100) {
          const anchor = sortedByCloseness[0];
          sendPlayerIds.push(anchor.id);
          accumulated += anchor.value;
        }

        // Fill remaining gap with high-value picks first (max 3 picks)
        const picksByValue = [...userPicks].sort((a, b) => b.value - a.value);
        for (const pk of picksByValue) {
          if (accumulated >= neededValue || sendPickIds.length >= 3) break;
          sendPickIds.push(pk.id);
          accumulated += pk.value;
        }

        // If still short, add another player
        if (accumulated < neededValue) {
          for (const p of sortedByCloseness) {
            if (accumulated >= neededValue) break;
            if (sendPlayerIds.includes(p.id)) continue;
            sendPlayerIds.push(p.id);
            accumulated += p.value;
          }
        }

        // Last resort: more picks (still capped at 5 total)
        if (accumulated < neededValue) {
          for (const pk of picksByValue) {
            if (accumulated >= neededValue || sendPickIds.length >= 5) break;
            if (sendPickIds.includes(pk.id)) continue;
            sendPickIds.push(pk.id);
            accumulated += pk.value;
          }
        }

        if (accumulated < neededValue) return null; // can't match

        // Trim excess: remove the last added asset if we're way over
        while (sendPickIds.length > 1) {
          const lastPick = userPicks.find(pk => pk.id === sendPickIds[sendPickIds.length - 1]);
          if (lastPick && accumulated - lastPick.value >= neededValue) {
            sendPickIds.pop();
            accumulated -= lastPick.value;
          } else break;
        }
        while (sendPlayerIds.length > 1) {
          const lastPlayer = userRoster.find(p => p.id === sendPlayerIds[sendPlayerIds.length - 1]);
          if (lastPlayer && accumulated - lastPlayer.value >= neededValue) {
            sendPlayerIds.pop();
            accumulated -= lastPlayer.value;
          } else break;
        }

        return { sendPlayerIds, sendPickIds };
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
        const tradeResult = get().executeTrade(
          proposal.requestedPlayerIds,
          proposal.requestedPickIds,
          proposal.offeredPlayerIds,
          proposal.offeredPickIds,
          proposal.proposingTeamId,
          true, // skip AI value check — AI already proposed this
        );

        // Only mark as accepted/rejected if the trade succeeded or was explicitly rejected
        // If it failed (e.g. cap issue), keep it pending so user can try again
        if (tradeResult.success) {
          set({
            tradeProposals: state.tradeProposals.map(p =>
              p.id === proposalId ? { ...p, status: 'accepted' } : p,
            ),
          });
        }
        // If trade failed, proposal stays 'pending' — user can adjust roster and retry

        return tradeResult.success;
      },

      rejectAllTradeProposals: () => {
        const state = get();
        set({
          tradeProposals: state.tradeProposals.map(p =>
            p.status === 'pending' ? { ...p, status: 'rejected' as const } : p,
          ),
        });
      },

      solicitTradingBlockProposals: (blockedPlayerIds: string[], blockedPickIds: string[], seekPositions: Position[], seekDraftPicks?: boolean) => {
        const state = get();
        // Block during playoffs and past in-season trade deadline
        const blockDl = (state.leagueSettings ?? DEFAULT_LEAGUE_SETTINGS).tradeDeadlineWeek;
        if (state.phase === 'playoffs') return;
        if (state.phase === 'regular' && state.week > blockDl + 1) return;

        const blockedPlayers = blockedPlayerIds
          .map(id => state.players.find(p => p.id === id))
          .filter((p): p is Player => !!p && p.teamId === state.userTeamId);
        const userTeam = state.teams.find(t => t.id === state.userTeamId);
        const blockedPicks = blockedPickIds
          .map(id => userTeam?.draftPicks.find(pk => pk.id === id))
          .filter((pk): pk is DraftPick => !!pk);

        if (blockedPlayers.length === 0 && blockedPicks.length === 0) return;

        const totalBlockedValue = blockedPlayers.reduce((s, p) => s + playerTradeValue(p), 0)
          + blockedPicks.reduce((s, pk) => s + pickTradeValue(pk, state.teams), 0);

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
            .sort((a, b) => pickTradeValue(b, state.teams) - pickTradeValue(a, state.teams));

          // ── Build offer based on what user WANTS ──

          // Step 1: If user wants draft picks, lead with picks
          if (seekDraftPicks) {
            for (const pk of aiPicks) {
              if (offeredValue >= targetMin) break;
              const pv = pickTradeValue(pk, state.teams);
              if (offeredValue + pv > hardCeiling) continue;
              offeredPickIds.push(pk.id);
              offeredValue += pv;
            }
          }

          // AI protection: never offer franchise-caliber players unless the incoming
          // value is truly elite (e.g. multiple 1sts or a superstar in return).
          // A single 1st round pick (1000 value) shouldn't land a 90+ OVR star.
          const aiCanOffer = (p: Player) => {
            const pv = playerTradeValue(p);
            // Top-3 on roster by OVR are protected — won't trade unless incoming value
            // is at least 80% of their individual trade value
            const sorted = [...aiRoster].sort((a, b) => b.ratings.overall - a.ratings.overall);
            const isTop3 = sorted.slice(0, 3).some(s => s.id === p.id);
            if (isTop3 && totalBlockedValue < pv * 0.8) return false;
            // Never offer 85+ OVR players for less than their full value
            if (p.ratings.overall >= 85 && totalBlockedValue < pv * 0.7) return false;
            // Don't offer players worth more than 1.5x what we're getting
            if (pv > totalBlockedValue * 1.5) return false;
            return true;
          };

          // Step 2: If user specified positions, offer ONLY those positions
          if (hasPosPreference) {
            const seekCandidates = aiRoster
              .filter(p => seekPosSet.has(p.position) && aiCanOffer(p))
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
              .filter(p => !blockedPositions.has(p.position) && aiCanOffer(p))
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
              const pv = pickTradeValue(pk, state.teams);
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

      // Scout a prospect — costs 1 scout point, narrows OVR range to ±2 and unlocks evaluation
      deepScoutPlayer: (playerId: string) => {
        const state = get();
        const scoutData = state.draftScoutingData[playerId];
        if (!scoutData || scoutData.deepScouted) return;

        const deepScoutedCount = Object.values(state.draftScoutingData).filter(d => d.deepScouted).length;
        if (deepScoutedCount >= 15) return; // hard cap at 15 scouts

        // Narrow the error to ±2 and re-center scoutedOvr closer to true OVR
        const player = state.players.find(p => p.id === playerId);
        const trueOvr = player?.ratings.overall ?? scoutData.scoutedOvr;
        // Scout estimate: within ±2 of true OVR with deterministic noise
        const seed = seedFromId(playerId, 88);
        const noise = (seed % 5) - 2; // -2 to +2
        const scoutedOvr = Math.max(20, Math.min(99, trueOvr + noise));

        set({
          draftScoutingData: {
            ...state.draftScoutingData,
            [playerId]: { ...scoutData, deepScouted: true, error: 2, scoutedOvr },
          },
        });
      },

      // Full scout — generates all tier data in one action for 1 scout point
      scoutPlayer: (playerId: string) => {
        const state = get();
        const ss = migrateScoutingState(state.scoutingState);
        // if (ss.scoutPoints < 1) return false; // TODO: re-enable when point limits are added
        if (ss.filmReviews[playerId]) return false; // already scouted
        const player = state.players.find(p => p.id === playerId);
        if (!player) return false;

        // Temporarily give enough points for all tiers
        const savedPoints = ss.scoutPoints;
        set({ scoutingState: { ...ss, scoutPoints: 100 } });

        // Generate all three tiers
        get().filmReviewPlayer(playerId);
        get().inPersonEvalPlayer(playerId);
        get().fullEvalPlayer(playerId);

        // Unlimited scouting — restore original points (no deduction)
        // TODO: re-enable `savedPoints - 1` when point limits are added
        const finalSs = get().scoutingState!;
        set({ scoutingState: { ...finalSs, scoutPoints: savedPoints } });

        // Also mark as deep-scouted in legacy system
        const scoutData = state.draftScoutingData[playerId];
        if (scoutData && !scoutData.deepScouted) {
          const seed = seedFromId(playerId, 88);
          const noise = (seed % 5) - 2;
          set({
            draftScoutingData: {
              ...get().draftScoutingData,
              [playerId]: { ...scoutData, deepScouted: true, error: 2, scoutedOvr: Math.max(20, Math.min(99, player.ratings.overall + noise)) },
            },
          });
        }
        return true;
      },

      // Tier 1: Film Review (free if called after scoutPlayer) — OVR range ±6, strength/weakness, projection tier, potential hint, blurb
      filmReviewPlayer: (playerId: string) => {
        const state = get();
        const ss = migrateScoutingState(state.scoutingState);
        if (ss.scoutPoints < 1) return false;
        if (ss.filmReviews[playerId]) return false;
        const player = state.players.find(p => p.id === playerId);
        if (!player) return false;

        const POS_KEYS: Record<string, string[]> = {
          QB: ['throwing', 'carrying', 'blocking'], RB: ['carrying', 'catching', 'blocking'],
          WR: ['catching', 'carrying', 'blocking'], TE: ['catching', 'blocking', 'carrying'],
          OL: ['blocking', 'tackling', 'carrying'], DL: ['passRush', 'tackling', 'blocking'],
          LB: ['tackling', 'coverage', 'passRush'], CB: ['coverage', 'tackling', 'catching'],
          S: ['coverage', 'tackling', 'catching'], K: ['kicking', 'blocking'], P: ['kicking', 'blocking'],
        };
        const keys = POS_KEYS[player.position] ?? ['tackling', 'coverage', 'blocking'];
        const bestKey = keys.reduce((best, k) => (player.ratings[k as keyof typeof player.ratings] ?? 0) > (player.ratings[best as keyof typeof player.ratings] ?? 0) ? k : best, keys[0]);
        const worstKey = keys.reduce((worst, k) => (player.ratings[k as keyof typeof player.ratings] ?? 0) < (player.ratings[worst as keyof typeof player.ratings] ?? 0) ? k : worst, keys[0]);

        const STRENGTH_NOTES: Record<string, string> = { throwing: 'Elite arm talent', carrying: 'Natural ball carrier', catching: 'Sure hands', coverage: 'Lockdown coverage skills', passRush: 'Explosive first step', blocking: 'Mauler in the trenches', tackling: 'Sure tackler', kicking: 'Big leg' };
        const WEAKNESS_NOTES: Record<string, string> = { throwing: 'Accuracy concerns', carrying: 'Ball security issues', catching: 'Inconsistent hands', coverage: 'Struggles in man coverage', passRush: 'Disappears against good tackles', blocking: 'Gets overpowered', tackling: 'Missed tackles', kicking: 'Inconsistent under pressure' };

        const ovr = player.ratings.overall;
        const pot = player.potential;
        const seed = seedFromId(playerId, 77);
        const noise = ((seed % 13) - 6); // -6 to +6
        const projTier = ovr >= 80 ? 'Starter' : ovr >= 70 ? 'Rotational' : ovr >= 60 ? 'Backup' : 'Project';

        const review = {
          ovrRange: { low: Math.max(30, ovr + noise - 6), high: Math.min(99, ovr + noise + 6) },
          strength: STRENGTH_NOTES[bestKey] ?? 'Solid all-around',
          weakness: WEAKNESS_NOTES[worstKey] ?? 'Limited upside',
          projectionTier: projTier as 'Starter' | 'Rotational' | 'Backup' | 'Project',
          potentialHint: (pot >= 80 ? 'high' : pot >= 65 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
          blurb: generateFilmReviewBlurb(player),
        };

        set({
          scoutingState: {
            ...ss,
            scoutPoints: ss.scoutPoints - 1,
            filmReviews: { ...ss.filmReviews, [playerId]: review },
          },
        });
        return true;
      },

      // Tier 2: In-Person Eval (3 points, requires tier 1, cap 8) — tighter OVR ±3, personality, character, bust/boom 50%
      inPersonEvalPlayer: (playerId: string) => {
        const state = get();
        const ss = migrateScoutingState(state.scoutingState);
        // if (ss.scoutPoints < 3) return false; // TODO: re-enable when point limits are added
        if (!ss.filmReviews[playerId]) return false; // requires tier 1
        if (ss.inPersonEvals[playerId]) return false;
        const player = state.players.find(p => p.id === playerId);
        if (!player) return false;

        const ovr = player.ratings.overall;
        const seed = seedFromId(playerId, 99);
        const noise = ((seed % 7) - 3); // -3 to +3
        const profile = player.draftProfile ?? 'normal';
        // In-person eval has a 35% chance to detect bust/boom (was 50%).
        // Even when detected, it's the FULL EVAL that confirms — and full
        // eval is now imprecise too, so the user always carries some risk.
        const detected = Math.random() < 0.35;

        const PERSONALITIES = ['high_character', 'confident', 'reserved', 'red_flag'] as const;
        const personality = profile === 'bust' && Math.random() < 0.4 ? 'red_flag'
          : profile === 'boom' && Math.random() < 0.4 ? 'high_character'
          : PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];

        const CHARACTER_NOTES: Record<string, string> = {
          high_character: 'Coaches rave about his work ethic and leadership.',
          confident: 'Carries himself like a pro. Confident presence.',
          reserved: 'Quiet demeanor. Hard to read but focused.',
          red_flag: 'Some maturity concerns flagged by our staff.',
        };

        // Reveal some position-relevant rating keys
        const POS_KEYS_EVAL: Record<string, string[]> = {
          QB: ['throwing', 'carrying', 'blocking'], RB: ['carrying', 'catching', 'blocking'],
          WR: ['catching', 'carrying', 'blocking'], TE: ['catching', 'blocking', 'carrying'],
          OL: ['blocking', 'tackling', 'carrying'], DL: ['passRush', 'tackling', 'blocking'],
          LB: ['tackling', 'coverage', 'passRush'], CB: ['coverage', 'tackling', 'catching'],
          S: ['coverage', 'tackling', 'catching'], K: ['kicking', 'blocking'], P: ['kicking', 'blocking'],
        };
        const revealedKeys = (POS_KEYS_EVAL[player.position] ?? ['throwing']).slice(0, 2);

        // In-person observation generation (deterministic from seed)
        const spd = player.ratings.speed ?? 50;
        const str = player.ratings.strength ?? 50;
        const agi = player.ratings.agility ?? 50;

        const BODY_TYPES: Record<string, string[]> = {
          QB: [spd >= 70 ? 'Lean, athletic build. Moves like a basketball player in the pocket.' : 'Thick lower half, sturdy frame. Built to absorb hits and stand tall.', str >= 70 ? 'Surprisingly powerful through the core. Shrugs off contact at the line.' : 'Slight frame. Scouts worry about durability over a 17-game season.'],
          RB: [spd >= 75 ? 'Compact, explosive build. Low center of gravity with burst you can see from the stands.' : 'Thick, between-the-tackles frame. Carries his weight well for the position.', str >= 70 ? 'Tree-trunk legs. Defenders bounce off him at the point of contact.' : 'Lean build, more of a finesse runner. Needs to add functional strength.'],
          WR: [spd >= 80 ? 'Long strider with track speed. Passes the eyeball test immediately — elite build for the position.' : agi >= 70 ? 'Quick-twitch athlete. Fluid in and out of breaks, hips are loose.' : 'Solidly built but nothing that jumps off the page physically. Wins with technique.'],
          OL: [str >= 75 ? 'Massive frame, moves well for his size. Feet are quicker than the tape suggests.' : 'Adequate size but scouts flagged he carries some bad weight. Needs to convert to lean muscle.'],
          DL: [spd >= 70 ? 'Explosive first step is even more apparent in person. Long arms, great leverage.' : str >= 75 ? 'Thick, powerful build. Hard to move at the point of attack.' : 'Tweener body type — not quite big enough inside, not quite fast enough outside.'],
          LB: [spd >= 70 ? 'Sideline-to-sideline athlete. Covers ground effortlessly.' : 'Downhill thumper. Built to fill gaps and take on blocks.'],
          CB: [agi >= 75 ? 'Fluid hips, smooth transitions. Passes the eyeball test for coverage ability.' : 'Stiff in transition. Hips are tighter than the tape showed — could be an issue against elite route runners.'],
          S: [spd >= 70 ? 'Rangey athlete. Covers a lot of ground and closes on the ball quickly.' : 'Compact, physical safety. More of a box player than a center-field type.'],
          TE: [str >= 70 ? 'Thick, Y-tight end frame. In-line blocker who can also run seams.' : spd >= 65 ? 'Move tight end build. Matchup weapon but needs to develop as a blocker.' : 'Tweener body. Not quite athletic enough to be a consistent mismatch.'],
          K: ['Smooth delivery, consistent mechanics.'], P: ['Good leg speed and follow-through.'],
        };
        const bodyPool = BODY_TYPES[player.position] ?? ['Adequate build for the position.'];
        const bodyType = bodyPool[seed % bodyPool.length];

        const awareness = player.ratings.awareness ?? 50;
        const IQ_NOTES = awareness >= 80
          ? ['Lit up the whiteboard session. Diagnosed coverages before coaches finished drawing them.', 'Exceptional football IQ. Articulated his reads with the detail of a coach.']
          : awareness >= 65
          ? ['Solid understanding of concepts. Answered questions competently but didn\'t blow anyone away.', 'Adequate processor. Can handle a standard playbook but may struggle with complex pre-snap reads.']
          : ['Struggled in the film room. When asked about specific reads, gave vague, athletic-instinct answers.', 'Processing speed is a concern. Production may have been scheme-dependent rather than IQ-driven.'];
        const footballIQ = IQ_NOTES[seed % IQ_NOTES.length];

        const COMPETE_NOTES = personality === 'high_character'
          ? ['Welcomed every challenge during the workout. When he failed a drill, he immediately asked to run it again.', 'Teammates gravitate toward him. Coaches said he raised the intensity of every drill just by being there.']
          : personality === 'red_flag'
          ? ['Body language flagged during competitive drills. Got visibly frustrated after mistakes and went quiet.', 'Coaches deliberately challenged his opinions during meetings. He got defensive rather than engaging.']
          : personality === 'confident'
          ? ['Carries himself with alpha energy. Talked trash during competitive drills — but backed it up.', 'Stayed composed under pressure. When put in uncomfortable situations, handled it with maturity.']
          : ['Reserved during group activities but competed hard individually. Internalized corrections without pushback.', 'Quiet competitor. Didn\'t say much but his effort never wavered. Let his play speak.'];
        const competitiveness = COMPETE_NOTES[seed % COMPETE_NOTES.length];

        const medicalSeed = (seed * 7) % 100;
        const medicalFlag = medicalSeed < 12
          ? player.age >= 22 ? 'Team doctors flagged range of motion concern in the right shoulder. Needs follow-up imaging.' : 'Mild lateral knee laxity noted during physical. Not a dealbreaker but worth monitoring.'
          : medicalSeed < 20
          ? 'Minor ankle sprain history. Full range of motion, no structural concerns.'
          : null;

        const MOTIVATION_NOTES = [
          'Comes from a football family. Father played college ball. This isn\'t just a job — it\'s identity.',
          'First-generation college student. Football was his way out. The drive is real and deeply personal.',
          'Stable background, supportive family. Mature beyond his years. Low-maintenance personality.',
          'Lost a parent young. Coaches say it gave him a perspective and seriousness beyond his age.',
          'Grew up in a tough neighborhood. Football is his lifeline — expect maximum effort every snap.',
          'Well-rounded kid. Interests outside football. Some scouts love the maturity, others worry about commitment.',
        ];
        const motivation = MOTIVATION_NOTES[seed % MOTIVATION_NOTES.length];

        const evalResult = {
          ovrRange: { low: Math.max(30, ovr + noise - 3), high: Math.min(99, ovr + noise + 3) },
          personality,
          characterNotes: CHARACTER_NOTES[personality],
          revealedBustBoom: detected,
          bustBoomResult: detected ? profile as 'bust' | 'boom' | 'normal' : undefined,
          revealedRatingKeys: revealedKeys,
          bodyType,
          footballIQ,
          competitiveness,
          medicalFlag,
          motivation,
        };

        set({
          scoutingState: {
            ...ss,
            scoutPoints: ss.scoutPoints - 3,
            inPersonEvals: { ...ss.inPersonEvals, [playerId]: evalResult },
            inPersonEvalCount: ss.inPersonEvalCount + 1,
          },
        });
        return true;
      },

      // Tier 3: Full Eval (5 points, requires tier 2, cap 3) — exact OVR ±1, guaranteed bust/boom
      fullEvalPlayer: (playerId: string) => {
        const state = get();
        const ss = migrateScoutingState(state.scoutingState);
        // if (ss.scoutPoints < 5) return false; // TODO: re-enable when point limits are added
        if (!ss.inPersonEvals[playerId]) return false; // requires tier 2
        if (ss.fullEvals[playerId]) return false;
        const player = state.players.find(p => p.id === playerId);
        if (!player) return false;

        const ovr = player.ratings.overall;
        const seed = seedFromId(playerId, 111);
        // Wider noise: ±3 instead of ±1 — scouting reduces uncertainty but
        // doesn't make picks risk-free.
        const noise = ((seed % 7) - 3);
        const profile = player.draftProfile ?? 'normal';

        // Bust/boom reveal is now PROBABILISTIC + IMPRECISE.
        // 65% chance to reveal correctly, 35% chance to mislabel.
        // When mislabeled: a real boom may show as 'normal' or 'bust',
        // a real bust may show as 'normal' or 'boom'. Adds genuine
        // gambling risk to every pick.
        const reveal = Math.random();
        let revealedProfile: 'bust' | 'boom' | 'normal';
        if (reveal < 0.65) {
          revealedProfile = profile as 'bust' | 'boom' | 'normal';
        } else {
          // Wrong answer — pick a different profile
          const alts: ('bust' | 'boom' | 'normal')[] =
            profile === 'bust' ? ['normal', 'boom']
            : profile === 'boom' ? ['normal', 'bust']
            : ['bust', 'boom'];
          revealedProfile = alts[Math.floor(Math.random() * alts.length)];
        }

        const fullResult = {
          exactOvr: Math.max(30, Math.min(99, ovr + noise)),
          bustBoomResult: revealedProfile,
        };

        set({
          scoutingState: {
            ...ss,
            scoutPoints: ss.scoutPoints - 5,
            fullEvals: { ...ss.fullEvals, [playerId]: fullResult },
            fullEvalCount: ss.fullEvalCount + 1,
          },
        });
        return true;
      },

      // Free Agency Intel Report
      intelReportFA: (playerId: string) => {
        const state = get();
        const ps = state.pursuitState;
        if (!ps || ps.pursuitPoints < 1) return false;
        if (ps.intelReports[playerId]) return false; // already scouted

        const player = state.players.find(p => p.id === playerId);
        if (!player) return false;

        const userTeam = state.teams.find(t => t.id === state.userTeamId);
        if (!userTeam) return false;

        const seed = seedFromId(playerId, 55);
        const pickBySeed = <T>(arr: T[], s: number): T => arr[s % arr.length];

        // ── Priority ──
        const priority = player.faPriority ?? assignFAPriority(player);
        const priorityLabels: Record<string, string> = {
          money: 'Show Me The Money',
          winning: 'Ring Chaser',
          role: 'Starter Or Bust',
          loyalty: 'Hometown Loyalty',
        };
        const priorityDetails: Record<string, string[]> = {
          money: [
            'This player is purely motivated by the highest offer on the table.',
            'His agent has made it clear — top dollar or they walk.',
            'Financial security is the #1 priority. Pay up or lose him.',
          ],
          winning: [
            'He wants to play for a contender. Winning matters more than money.',
            'Ring chasing is real — he\'ll take less to compete for a title.',
            'His inner circle says he\'s focused on championship upside.',
          ],
          role: [
            'He wants a guaranteed starting role. Don\'t pitch a backup spot.',
            'Playing time is everything. He needs to know he\'ll be THE guy.',
            'His camp has indicated he\'ll walk if he doesn\'t see a clear path to starting.',
          ],
          loyalty: [
            'He values continuity and relationships with the coaching staff.',
            'Loyalty runs deep — if he\'s been here before, that matters.',
            'He\'s the type who values culture and familiarity over flashy offers.',
          ],
        };
        const priorityLabel = priorityLabels[priority];
        const priorityDetail = pickBySeed(priorityDetails[priority], seed);

        // ── True Asking Salary (same formula as initNegotiation) ──
        const ci = capInflationFactor(userTeam.salaryCap);
        const marketSalary = estimateSalary(player.ratings.overall, player.position, player.age, player.potential, ci);
        const mood = player.mood ?? 70;
        const moodSalaryMult = mood < 30 ? 1.15 : mood < 50 ? 1.08 : mood < 60 ? 1.03 : mood >= 85 ? 0.95 : 1.0;
        const trueAskingSalary = Math.round(marketSalary * moodSalaryMult * 10) / 10;
        const trueAskingYears = player.age >= 32 ? 1 : player.age >= 28 ? 2 : 3;

        // ── Priority Alignment ──
        const totalGames = userTeam.record.wins + userTeam.record.losses + userTeam.record.ties;
        const winPct = totalGames > 0 ? (userTeam.record.wins + userTeam.record.ties * 0.5) / totalGames : 0.5;
        const userRosterAtPos = state.players.filter(p => p.teamId === state.userTeamId && p.position === player.position && !p.retired);
        const wouldStart = userRosterAtPos.length === 0 || userRosterAtPos.every(p => p.ratings.overall < player.ratings.overall);
        const wasOnTeam = player.draftTeamId === state.userTeamId || player.acquiredVia === 'draft';
        const priorityAligned =
          (priority === 'winning' && winPct >= 0.55) ||
          (priority === 'role' && wouldStart) ||
          (priority === 'loyalty' && wasOnTeam) ||
          (priority === 'money'); // money is always 'aligned' — you just pay

        // ── Closing Offer ──
        const closingSalary = Math.round(trueAskingSalary * 0.88 * (priorityAligned ? 0.95 : 1.0) * 10) / 10;
        const closingYears = trueAskingYears;
        const closingOfferDetails = [
          `Offering around $${closingSalary}M/yr for ${closingYears} year${closingYears > 1 ? 's' : ''} should get the deal done.`,
          `Your sweet spot is $${closingSalary}M/yr, ${closingYears} year${closingYears > 1 ? 's' : ''}. Go in at that and you have a strong shot.`,
          `Intel suggests $${closingSalary}M/yr over ${closingYears} year${closingYears > 1 ? 's' : ''} closes this deal.`,
        ];
        const closingOfferDetail = pickBySeed(closingOfferDetails, seed + 1);

        // ── Willingness ──
        const faRefusals = state.faRefusals ?? [];
        const isRefusing = faRefusals.includes(playerId);
        let willingness: 'eager' | 'open' | 'reluctant' | 'not_interested';
        if (isRefusing && mood < 30) {
          willingness = 'not_interested';
        } else if (isRefusing) {
          willingness = 'reluctant';
        } else if (mood >= 75 && (priorityAligned || winPct >= 0.55)) {
          willingness = 'eager';
        } else if (mood >= 50) {
          willingness = 'open';
        } else {
          willingness = 'reluctant';
        }
        const willingnessReasons: Record<string, string[]> = {
          eager: [
            'He\'s genuinely excited about the opportunity here.',
            'Word is he\'s already telling friends he wants to sign with you.',
            'His camp reached out first — that\'s a great sign.',
          ],
          open: [
            'He\'s open to hearing your pitch, but won\'t commit without a solid offer.',
            'No strong feelings either way — a fair deal will swing him.',
            'He\'s listening, but not desperate. Come correct.',
          ],
          reluctant: [
            'He has reservations about the team direction. You\'ll need to sell him.',
            'His agent is lukewarm — expects better offers elsewhere.',
            'Don\'t expect an easy sell. He needs convincing.',
          ],
          not_interested: [
            'He has zero interest in playing here. Intel suggests this is a dead end.',
            'Multiple sources confirm he won\'t even take the meeting.',
            'His agent flat-out said "don\'t bother." This is a long shot at best.',
          ],
        };
        const willingnessReason = pickBySeed(willingnessReasons[willingness], seed + 2);

        // ── Competing Teams ──
        const competingTeams: string[] = [];
        const aiTeams = state.teams.filter(t => t.id !== state.userTeamId);
        for (const t of aiTeams) {
          const capSpace = t.salaryCap - t.totalPayroll;
          if (capSpace < trueAskingSalary * 0.5) continue;
          const posCount = state.players.filter(p => p.teamId === t.id && p.position === player.position && !p.retired).length;
          const posMax = ROSTER_LIMITS[player.position].max;
          if (posCount >= posMax) continue;
          const starterOvr = state.players
            .filter(p => p.teamId === t.id && p.position === player.position && !p.retired)
            .sort((a, b) => b.ratings.overall - a.ratings.overall)[0]?.ratings.overall ?? 0;
          if (player.ratings.overall > starterOvr - 5) {
            // Deterministic selection based on seed + team index
            const teamSeed = seedFromId(t.id + playerId, 55);
            if (teamSeed % 3 !== 0) continue; // ~33% of eligible teams
            competingTeams.push(t.abbreviation);
          }
          if (competingTeams.length >= 5) break;
        }

        // ── Market Heat ──
        const ovr = player.ratings.overall;
        let marketHeat: 'cold' | 'moderate' | 'hot' | 'bidding_war';
        if (competingTeams.length >= 4 && ovr >= 78) {
          marketHeat = 'bidding_war';
        } else if (competingTeams.length >= 2 && ovr >= 70) {
          marketHeat = 'hot';
        } else if (competingTeams.length >= 1) {
          marketHeat = 'moderate';
        } else {
          marketHeat = 'cold';
        }
        const marketHeatDetails: Record<string, string[]> = {
          cold: [
            'The phone isn\'t ringing for this player. You\'re the only team in the mix.',
            'Very little market interest. You have all the leverage.',
            'No competition — he\'s available at a discount if you want him.',
          ],
          moderate: [
            'A few teams have kicked the tires, but no one is pushing hard.',
            'There\'s interest, but nothing urgent. You have time to negotiate.',
            'Moderate market — a couple teams have inquired.',
          ],
          hot: [
            'Multiple teams are in on this player. Move fast or lose him.',
            'His agent is fielding several strong offers. Don\'t lowball.',
            'Hot market — expect competition from ' + competingTeams.slice(0, 2).join(' and ') + '.',
          ],
          bidding_war: [
            'This is an all-out bidding war. Every contender wants him.',
            'His agent is playing teams against each other. Expect to overpay.',
            'Top-tier market — you\'ll need an aggressive offer to win this.',
          ],
        };
        const marketHeatDetail = pickBySeed(marketHeatDetails[marketHeat], seed + 3);

        // ── Agent Style ──
        const agentStyles: ('hardball' | 'collaborative' | 'impatient' | 'relationship')[] = ['hardball', 'collaborative', 'impatient', 'relationship'];
        const agentStyle = agentStyles[seed % 4];
        const agentStyleDetails: Record<string, string[]> = {
          hardball: [
            'His agent plays hardball — expect high initial demands and slow movement.',
            'Known as a tough negotiator. Don\'t expect quick concessions.',
            'This agent will push for every dollar. Be patient but firm.',
          ],
          collaborative: [
            'His agent is easy to work with — they\'ll find middle ground quickly.',
            'A collaborative negotiator. Fair offers get fair responses.',
            'This agent values good relationships. Come in reasonable and you\'ll get a deal done.',
          ],
          impatient: [
            'His agent wants this done fast. Dragging it out will kill the deal.',
            'Don\'t waste time with lowballs — this agent has a short fuse.',
            'Speed matters here. Put your best offer forward early.',
          ],
          relationship: [
            'This agent values the personal connection. Build rapport first.',
            'Relationship-driven — past dealings with this agent matter.',
            'A handshake-deal type. Trust and respect go a long way.',
          ],
        };
        const agentStyleDetail = pickBySeed(agentStyleDetails[agentStyle], seed + 4);

        // ── Agent Tip ──
        const agentTips: Record<string, string[]> = {
          hardball: [
            'Tip: Start close to his asking price. This agent won\'t budge much.',
            'Tip: Add an extra year to show commitment — hardball agents respect security.',
            'Tip: Don\'t go below 90% of asking. He\'ll walk.',
          ],
          collaborative: [
            'Tip: A fair opening offer will be met with a reasonable counter.',
            'Tip: Splitting the difference usually works with this agent.',
            'Tip: Be transparent about your cap situation — honesty works here.',
          ],
          impatient: [
            'Tip: Lead with your best offer. You won\'t get many rounds.',
            'Tip: Don\'t ask for time to think — this agent moves on fast.',
            'Tip: One strong offer beats three mediocre ones.',
          ],
          relationship: [
            'Tip: If this player was on your team before, mention it. Loyalty matters.',
            'Tip: Highlight your coaching staff and culture — this agent cares about fit.',
            'Tip: A slightly lower offer with the right pitch can beat a higher one elsewhere.',
          ],
        };
        const agentTip = pickBySeed(agentTips[agentStyle], seed + 5);

        // ── Fit Assessment ──
        const fitAssessments = priorityAligned
          ? [
            'Strong scheme fit. Your team checks all his boxes.',
            'He\'d step into a great situation here. High fit score.',
            'This is one of the best landing spots for him — and he knows it.',
          ]
          : [
            'Fit is questionable. His priorities don\'t align well with what you offer.',
            'He\'d be coming here despite the situation, not because of it.',
            'Not an ideal fit on paper, but the right offer could overcome that.',
          ];
        const fitAssessment = pickBySeed(fitAssessments, seed + 6);

        // ── Deal Path ──
        let dealPath: 'strong' | 'possible' | 'uphill' | 'unlikely';
        if (willingness === 'eager' && (marketHeat === 'cold' || marketHeat === 'moderate')) {
          dealPath = 'strong';
        } else if (willingness === 'eager' || (willingness === 'open' && marketHeat !== 'bidding_war')) {
          dealPath = 'possible';
        } else if (willingness === 'not_interested' || (willingness === 'reluctant' && marketHeat === 'bidding_war')) {
          dealPath = 'unlikely';
        } else {
          dealPath = 'uphill';
        }
        const dealPathDetails: Record<string, string[]> = {
          strong: [
            'All signs point to a deal getting done. Execute cleanly and he\'s yours.',
            'This is about as good as it gets in free agency. Close it out.',
            'High confidence this deal gets done if you offer fair value.',
          ],
          possible: [
            'There\'s a real path here, but you\'ll need a competitive offer.',
            'Doable, but don\'t take it for granted. Bring your A-game.',
            'Odds are in your favor if you play your cards right.',
          ],
          uphill: [
            'This will be tough. Expect resistance and be ready to overpay.',
            'An uphill battle — possible, but you\'ll need to exceed market value.',
            'Don\'t expect a discount here. You\'re swimming upstream.',
          ],
          unlikely: [
            'Realistically, this deal probably doesn\'t happen. But stranger things have occurred.',
            'A long shot. Don\'t invest too many resources chasing this one.',
            'Intel suggests you\'re better off looking elsewhere.',
          ],
        };
        const dealPathDetail = pickBySeed(dealPathDetails[dealPath], seed + 7);

        // ── Concerns ──
        const concerns: string[] = [];
        if (player.ratings.stamina < 60) concerns.push('Durability concerns — low stamina rating may lead to injuries.');
        if (player.age >= 32) concerns.push('Age-related decline is a real risk at ' + player.age + ' years old.');
        if (player.age >= 35) concerns.push('Retirement could come at any time. Short-term investment only.');
        if (mood < 40) concerns.push('Locker room red flag — low morale could spread to teammates.');
        if (mood < 25) concerns.push('Serious attitude problems reported. Handle with care.');
        if (player.scoutingLabel?.toLowerCase().includes('bust')) concerns.push('History of underperforming expectations.');
        if (player.injury) concerns.push('Currently dealing with an injury (' + player.injury.type + ').');
        if (player.ratings.overall < 60) concerns.push('Below-average talent level. Depth signing only.');
        if (concerns.length === 0) concerns.push('No major red flags identified.');

        // ── Intel Blurb ──
        const pName = `${player.firstName} ${player.lastName}`;
        const blurbTemplates = [
          `${pName} is a ${willingness} target with a ${marketHeat.replace('_', ' ')} market. His priority is ${priority}${priorityAligned ? ' (aligned with your team)' : ''}. Best path: offer ~$${closingSalary}M/yr.`,
          `Intel summary on ${pName}: ${willingness} to sign, ${marketHeat.replace('_', ' ')} demand, ${agentStyle} agent. ${priorityAligned ? 'Your team fits his priorities.' : 'Priority mismatch — may need to overpay.'} Target: $${closingSalary}M.`,
          `${pName} (${player.position}, ${ovr} OVR): ${dealPath} deal path. ${competingTeams.length > 0 ? 'Competing with ' + competingTeams.join(', ') + '.' : 'No known competition.'} ${priorityAligned ? 'Strong fit.' : 'Fit concerns.'}`,
        ];
        const intelBlurb = pickBySeed(blurbTemplates, seed + 8);

        // ── Mechanical Effects ──
        const salaryDiscount = 0.88;
        const patienceBonus = 1;
        // Override refusal if player is at least reluctant-willing (not 'not_interested')
        const overridesRefusal = willingness !== 'not_interested';

        const report = {
          priority,
          priorityLabel,
          priorityDetail,
          trueAskingSalary,
          trueAskingYears,
          closingOffer: { salary: closingSalary, years: closingYears },
          closingOfferDetail,
          willingness,
          willingnessReason,
          competingTeams,
          marketHeat,
          marketHeatDetail,
          agentStyle,
          agentStyleDetail,
          agentTip,
          priorityAligned,
          fitAssessment,
          dealPath,
          dealPathDetail,
          concerns,
          intelBlurb,
          salaryDiscount,
          patienceBonus,
          overridesRefusal,
        };

        // Remove from faRefusals if intel overrides
        let newRefusals = state.faRefusals;
        if (overridesRefusal && faRefusals.includes(playerId)) {
          newRefusals = faRefusals.filter(id => id !== playerId);
        }

        set({
          pursuitState: {
            ...ps,
            pursuitPoints: ps.pursuitPoints - 1,
            intelReports: { ...ps.intelReports, [playerId]: report },
          },
          faRefusals: newRefusals,
        });

        return true;
      },

      // Replace a coach (fire + hire new one in the same role)
      replaceCoach: (role: import('@/types').CoachRole, specificCoach?: import('@/types').Coach) => {
        const state = get();
        const newCoach = specificCoach ?? generateCoach(role);
        const updatedTeams = state.teams.map(t => {
          if (t.id !== state.userTeamId) return t;
          const coaches = (t.coaches ?? []).map(c => c.role === role ? newCoach : c);
          // If role didn't exist, add it
          if (!coaches.some(c => c.role === role)) coaches.push(newCoach);
          return { ...t, coaches };
        });
        const oldCoach = state.teams.find(t => t.id === state.userTeamId)?.coaches?.find(c => c.role === role);
        const roleLabel = role === 'HC' ? 'Head Coach' : role === 'OC' ? 'Offensive Coordinator' : 'Defensive Coordinator';
        set({
          teams: updatedTeams,
          newsItems: [...state.newsItems, makeNews({
            season: state.season, week: state.week, type: 'signing',
            teamId: state.userTeamId,
            headline: `${roleLabel} change: ${oldCoach ? `${oldCoach.firstName} ${oldCoach.lastName} fired` : 'Vacancy filled'}. ${newCoach.firstName} ${newCoach.lastName} hired.`,
            isUserTeam: true,
          })],
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

      // All-Pro Game — played between conference championships and the big game
      simAllStarGame: () => {
        const state = get();
        if (state.allStarGame?.played) return;

        // Build All-Star rosters: top 25 healthy players per conference
        const acTeamIds = new Set(state.teams.filter(t => t.conference === 'AC').map(t => t.id));
        const ncTeamIds = new Set(state.teams.filter(t => t.conference === 'NC').map(t => t.id));
        const healthy = (p: Player) => !p.retired && p.teamId && (!p.injury || p.injury.weeksLeft === 0);
        const acAllStars = state.players.filter(p => healthy(p) && acTeamIds.has(p.teamId!))
          .sort((a, b) => b.ratings.overall - a.ratings.overall).slice(0, 25);
        const ncAllStars = state.players.filter(p => healthy(p) && ncTeamIds.has(p.teamId!))
          .sort((a, b) => b.ratings.overall - a.ratings.overall).slice(0, 25);

        // Pick a "home" team for display (use first AC team and first NC team)
        const acTeam = state.teams.find(t => t.conference === 'AC');
        const ncTeam = state.teams.find(t => t.conference === 'NC');

        const tempGame: GameResult = {
          id: 'all-star', week: 99, season: state.season,
          homeTeamId: acTeam?.id ?? '', awayTeamId: ncTeam?.id ?? '',
          homeScore: 0, awayScore: 0, played: false, playerStats: {},
        };
        const result = simulateGame(tempGame, acAllStars, ncAllStars);

        // Find MVP (best performer)
        let bestScore = -1;
        let mvpId = '';
        for (const [pid, stats] of Object.entries(result.playerStats)) {
          const s = stats as Partial<import('@/types').PlayerStats>;
          const score = (s.passYards ?? 0) * 0.04 + (s.passTDs ?? 0) * 6 +
            (s.rushYards ?? 0) * 0.1 + (s.rushTDs ?? 0) * 6 +
            (s.receivingYards ?? 0) * 0.1 + (s.receivingTDs ?? 0) * 6 +
            (s.tackles ?? 0) * 1 + (s.sacks ?? 0) * 3 + (s.defensiveINTs ?? 0) * 5;
          if (score > bestScore) { bestScore = score; mvpId = pid; }
        }

        const mvpPlayer = state.players.find(p => p.id === mvpId);
        const newsItems = [...state.newsItems, makeNews({
          season: state.season, week: 99, type: 'milestone',
          headline: `All-Pro Game: AC ${result.homeScore} - NC ${result.awayScore}${mvpPlayer ? `. MVP: ${mvpPlayer.firstName} ${mvpPlayer.lastName}` : ''}`,
          isUserTeam: false,
        })];

        set({
          allStarGame: { played: true, acScore: result.homeScore, ncScore: result.awayScore, mvpPlayerId: mvpId || null },
          newsItems,
        });
      },

      startNewSeason: () => {
        // Auto-fill K and P for user's team if missing — sign best available from FA
        {
          const preState = get();
          const userTeam = preState.teams.find(t => t.id === preState.userTeamId);
          if (userTeam && (preState.phase === 'freeAgency' || preState.phase === 'draft')) {
            let updatedPlayers = preState.players;
            let updatedTeams = preState.teams;
            let updatedFreeAgents = [...(preState.freeAgents ?? [])];
            const autoSignNews: NewsItem[] = [];

            for (const specialPos of ['K', 'P'] as Position[]) {
              const rosterPlayers = updatedPlayers.filter(p => p.teamId === preState.userTeamId && !p.retired && p.position === specialPos);
              if (rosterPlayers.length > 0) continue;

              // Find best available FA at this position
              const bestFA = updatedFreeAgents
                .map(id => updatedPlayers.find(p => p.id === id))
                .filter((p): p is Player => !!p && !p.retired && p.position === specialPos)
                .sort((a, b) => b.ratings.overall - a.ratings.overall)[0];

              if (bestFA) {
                const sal = LEAGUE_MINIMUM_SALARY;
                updatedPlayers = updatedPlayers.map(p =>
                  p.id === bestFA.id
                    ? { ...p, teamId: preState.userTeamId, contract: { salary: sal, yearsLeft: 1, guaranteed: 0, totalYears: 1, offseasonSigned: true } }
                    : p,
                );
                updatedFreeAgents = updatedFreeAgents.filter(id => id !== bestFA.id);
                const ut = updatedTeams.find(t => t.id === preState.userTeamId)!;
                const chart = insertIntoDepthChart(ut.depthChart, specialPos, bestFA.id, updatedPlayers);
                updatedTeams = updatedTeams.map(t =>
                  t.id === preState.userTeamId
                    ? { ...t, roster: [...t.roster, bestFA.id], totalPayroll: t.totalPayroll + sal, depthChart: chart }
                    : t,
                );
                autoSignNews.push(makeNews({
                  season: preState.season, week: 0, type: 'signing',
                  teamId: preState.userTeamId, playerIds: [bestFA.id],
                  headline: `Auto-signed ${bestFA.firstName} ${bestFA.lastName} (${specialPos}) to fill roster requirement.`,
                  isUserTeam: true,
                }));
              }
            }

            if (autoSignNews.length > 0) {
              set({
                players: updatedPlayers,
                teams: updatedTeams,
                freeAgents: updatedFreeAgents,
                newsItems: [...preState.newsItems, ...autoSignNews],
              });
            }
          }
        }

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

        // ------ Record awards on player objects ------
        const awardPlayerIds = new Set<string>();
        const playerAwardMap = new Map<string, { award: string; season: number }[]>();
        const addAward = (playerId: string, award: string) => {
          awardPlayerIds.add(playerId);
          const list = playerAwardMap.get(playerId) ?? [];
          list.push({ award, season: state.season });
          playerAwardMap.set(playerId, list);
        };
        for (const a of awards) {
          addAward(a.playerId, a.award);
        }
        // Championship MVP
        if (state.finalsMvpPlayerId) {
          addAward(state.finalsMvpPlayerId, 'Championship MVP');
        }
        // All-League 1st Team
        for (const entry of allLeagueFirst) {
          addAward(entry.playerId, 'All-League 1st Team');
        }
        // All-League 2nd Team
        for (const entry of allLeagueSecond) {
          addAward(entry.playerId, 'All-League 2nd Team');
        }
        // All-Rookie Team
        for (const entry of allRookieTeam) {
          addAward(entry.playerId, 'All-Rookie Team');
        }

        const playersWithAwards = awardPlayerIds.size > 0
          ? state.players.map(p => {
              const newAwards = playerAwardMap.get(p.id);
              if (!newAwards) return p;
              return { ...p, awards: [...(p.awards ?? []), ...newAwards] };
            })
          : state.players;

        const agedPlayers = playersWithAwards.map(p => {
          // Clear teamId on previously retired players so they don't re-appear in lists
          if (p.retired) return p.teamId ? { ...p, teamId: null, stats: emptyStats() } : p;

          if (p.teamId === null) {
            const isFutureProspect =
              p.draftYear !== null && p.draftYear >= newSeason && p.experience === 0;
            // Also protect rookies drafted this season who are unsigned (UDFAs etc.)
            const isRecentDraft = p.draftYear !== null && p.draftYear >= state.season && p.experience <= 1;
            // Only auto-retire unsigned FAs who are clearly aged out (33+).
            // Don't filter by OVR — depth bodies (40-55 OVR practice-squad
            // tier) need to stay in the pool so the user can always find
            // cheap options at every position.
            if (!isFutureProspect && !isRecentDraft && p.age >= 33) {
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

          // Save current season stats to seasonLog before clearing
          const hasStats = p.stats.gamesPlayed > 0;
          const updatedLog = hasStats && p.teamId
            ? [...(p.seasonLog ?? []), { season: state.season, teamId: p.teamId, stats: { ...p.stats } }]
            : (p.seasonLog ?? []);

          return {
            ...p,
            age: p.age + 1,
            experience: isUnsignedFutureProspect ? 0 : p.experience + 1,
            stats: emptyStats(),
            seasonLog: updatedLog.length > 0 ? updatedLog : undefined,
            injury: null,
            onIR: false,
            contract: advancedContract,
          };
        });

        const devSettings = state.leagueSettings ?? DEFAULT_LEAGUE_SETTINGS;

        // Build per-player coaching development multipliers
        const coachDevMultipliers = new Map<string, number>();
        for (const team of state.teams) {
          const teamPlayers = agedPlayers.filter(p => p.teamId === team.id && !p.retired);
          for (const tp of teamPlayers) {
            coachDevMultipliers.set(tp.id, positionCoachDevMultiplier(team.coaches, tp.position));
          }
        }

        const developedPlayers = developPlayers(
          agedPlayers,
          state.season,
          devSettings.progressionRate / 100,
          devSettings.regressionRate / 100,
          coachDevMultipliers,
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

          const updatedTeam = {
            ...t,
            record: emptyRecord(),
            roster: newRoster,
            deadCap: updatedDeadCap,
          };
          // For user team: freeze payroll so cap space stays consistent from end of FA
          // through the regular season. advanceToResigning will recalculate next offseason.
          // For AI teams: recalculate normally since they don't show cap to the user.
          const totalPayroll = t.id === state.userTeamId
            ? t.totalPayroll
            : recalculateTeamPayroll(updatedTeam, afterVoidPlayers);

          return {
            ...updatedTeam,
            totalPayroll,
            depthChart: newDepthChart,
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

        // Cap growth already applied in advanceToResigning — no double-apply
        let grownTeams = newTeams;

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
            const leagueMin = (state.leagueSettings ?? DEFAULT_LEAGUE_SETTINGS).leagueMinSalary ?? LEAGUE_MINIMUM_SALARY;
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

        // Final AI signing sweep: any unsigned player OVR >= 50 gets picked up
        // This prevents good players from sitting unsigned at season start
        const remainingFAs = allPlayersForNewSeason
          .filter(p => !p.teamId && !p.retired && !(p.draftYear != null && p.draftYear >= newSeason && p.experience === 0))
          .sort((a, b) => b.ratings.overall - a.ratings.overall);

        for (const fa of remainingFAs) {
          if (fa.ratings.overall < 50) break; // Only sign 50+ OVR players
          // Find a team with cap space and need at this position
          const targetTeam = grownTeams
            .filter(t => t.id !== state.userTeamId)
            .map(t => {
              const rosterCount = allPlayersForNewSeason.filter(p => p.teamId === t.id && !p.retired).length;
              const posCount = allPlayersForNewSeason.filter(p => p.teamId === t.id && !p.retired && p.position === fa.position).length;
              const capSpace = t.salaryCap - t.totalPayroll;
              const minNeeded = ROSTER_LIMITS[fa.position].min - posCount;
              return { team: t, rosterCount, posCount, capSpace, minNeeded };
            })
            .filter(({ capSpace }) => capSpace >= LEAGUE_MINIMUM_SALARY)
            .sort((a, b) => {
              // Prioritize: position need, then most cap space
              if (a.minNeeded > 0 && b.minNeeded <= 0) return -1;
              if (b.minNeeded > 0 && a.minNeeded <= 0) return 1;
              return b.capSpace - a.capSpace;
            })[0];

          if (!targetTeam) continue;
          const sal = Math.round(Math.max(LEAGUE_MINIMUM_SALARY, Math.min(
            estimateSalary(fa.ratings.overall, fa.position, fa.age, fa.potential) * 0.5,
            targetTeam.capSpace
          )) * 10) / 10;
          const years = fa.age >= 32 ? 1 : fa.age >= 28 ? 2 : 3;

          // Sign the player
          const faIdx = allPlayersForNewSeason.findIndex(p => p.id === fa.id);
          if (faIdx >= 0) {
            allPlayersForNewSeason[faIdx] = {
              ...allPlayersForNewSeason[faIdx],
              teamId: targetTeam.team.id,
              contract: { salary: sal, yearsLeft: years, guaranteed: generateGuaranteed(sal, years), totalYears: years, offseasonSigned: true },
            };
          }
          const teamIdx = grownTeams.findIndex(t => t.id === targetTeam.team.id);
          if (teamIdx >= 0) {
            const t = grownTeams[teamIdx];
            grownTeams[teamIdx] = {
              ...t,
              roster: [...t.roster, fa.id],
              totalPayroll: t.totalPayroll + sal,
              depthChart: insertIntoDepthChart(t.depthChart, fa.position, fa.id, allPlayersForNewSeason),
            };
          }
        }

        // Preserve unsigned players as free agents for in-season signings
        // Exclude future draft prospects — they should only be available via the draft
        const unsignedPlayerIds = allPlayersForNewSeason
          .filter(p => !p.teamId && !p.retired && !(p.draftYear != null && p.draftYear >= newSeason && p.experience === 0))
          .map(p => p.id);

        // Generate street free agents so there's always a pool for in-season signings.
        // Always inject at least 50 fresh sub-55 OVR depth bodies regardless of how
        // many mid-tier vets are already in the pool — otherwise users with lots of
        // accumulated unsigned vets see ONLY mid-tier and never any cheap depth.
        const streetFATarget = 80;
        const currentFACount = unsignedPlayerIds.length;
        const lowDepthMin = 50;
        const streetFACount = Math.max(lowDepthMin, streetFATarget - currentFACount);
        const streetFAs: import('@/types').Player[] = [];
        if (streetFACount > 0) {
          for (let i = 0; i < streetFACount; i++) {
            const pos = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];
            // Skewed low: 70% camp bodies (38-50 OVR), 30% depth (50-60).
            // These are the cheap signings users actually need at season start.
            const tierRoll = Math.random();
            const talentMean = tierRoll < 0.70
              ? 38 + Math.random() * 12  // 70% camp body (38-50)
              : 50 + Math.random() * 10; // 30% depth (50-60)
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

        // Coach progression and AI coaching carousel
        const coachProgress = progressCoaches(grownTeams, newSeason);
        const coachCarousel = processCoachingCarousel(coachProgress.teams, state.userTeamId, newSeason);
        const coachNews: import('@/types').NewsItem[] = [...coachProgress.news, ...coachCarousel.news].map(headline =>
          makeNews({ season: newSeason, week: 0, type: 'signing', headline, isUserTeam: false }),
        );
        const teamsAfterCoaches = coachCarousel.teams;

        const numPreseasonGames = (state.leagueSettings ?? DEFAULT_LEAGUE_SETTINGS).preseasonGames ?? 3;
        const enterPreseason = numPreseasonGames > 0;
        const preseasonSchedule = enterPreseason ? generatePreseasonSchedule(teamsAfterCoaches, numPreseasonGames, newSeason) : undefined;

        set({
          season: newSeason,
          week: enterPreseason ? 0 : 1,
          phase: enterPreseason ? 'preseason' : 'regular',
          preseasonSchedule,
          preseasonWeek: enterPreseason ? 1 : 0,
          players: allPlayersForNewSeason,
          teams: teamsAfterCoaches,
          schedule: newSchedule,
          draftResults: [],
          draftPickOrder: undefined,
          currentDraftYear: undefined,
          freeAgents: seasonFreeAgents,
          faDay: 0,
          faRefusals: [],
          playoffBracket: null,
          playoffSeeds: null,
          playoffInjuryRound: undefined,
          newsItems: [...retirementNews, ...voidNews, ...aiRestructureNews, ...coachNews, ...(() => {
            // Generate preseason news
            const preseasonNews: NewsItem[] = [];
            const userT = grownTeams.find(t => t.id === state.userTeamId);
            const userRoster = allPlayersForNewSeason.filter(p => p.teamId === state.userTeamId && !p.retired);
            if (userT) {
              const avgOvr = userRoster.length > 0 ? Math.round(userRoster.reduce((s, p) => s + p.ratings.overall, 0) / userRoster.length) : 60;
              preseasonNews.push(makeNews({
                season: newSeason, week: 0, type: 'system', teamId: state.userTeamId,
                headline: `Season ${newSeason} Preview: ${userT.city} ${userT.name}`,
                body: `The ${userT.name} enter the season with a roster averaging ${avgOvr} OVR across ${userRoster.length} players. ${avgOvr >= 70 ? 'This is a playoff-caliber squad.' : avgOvr >= 63 ? 'A competitive roster with room to grow.' : 'A rebuilding year — development is key.'}`,
                isUserTeam: true,
              }));
              // Top rookies
              const rookies = userRoster.filter(p => p.experience === 0).sort((a, b) => b.ratings.overall - a.ratings.overall);
              if (rookies.length > 0) {
                const top = rookies[0];
                preseasonNews.push(makeNews({
                  season: newSeason, week: 0, type: 'system', teamId: state.userTeamId, playerIds: [top.id],
                  headline: `Rookie Watch: ${top.firstName} ${top.lastName} (${top.position}, ${top.ratings.overall} OVR)`,
                  body: `The ${top.position} ${top.draftPick ? `was picked #${top.draftPick} overall` : 'signed as a free agent'} and is expected to contribute immediately.`,
                  isUserTeam: true,
                }));
              }
            }
            // Power rankings headline
            const ranked = [...grownTeams].sort((a, b) => {
              const aRoster = allPlayersForNewSeason.filter(p => p.teamId === a.id && !p.retired);
              const bRoster = allPlayersForNewSeason.filter(p => p.teamId === b.id && !p.retired);
              const aAvg = aRoster.length > 0 ? aRoster.reduce((s, p) => s + p.ratings.overall, 0) / aRoster.length : 0;
              const bAvg = bRoster.length > 0 ? bRoster.reduce((s, p) => s + p.ratings.overall, 0) / bRoster.length : 0;
              return bAvg - aAvg;
            });
            const top3 = ranked.slice(0, 3);
            preseasonNews.push(makeNews({
              season: newSeason, week: 0, type: 'system',
              headline: `Preseason Power Rankings: ${top3.map((t, i) => `${i + 1}. ${t.abbreviation}`).join(', ')}`,
              body: `The ${top3[0]?.city} ${top3[0]?.name} are the preseason favorites heading into Season ${newSeason}.`,
              isUserTeam: false,
            }));
            return preseasonNews;
          })()],
          seasonHistory: state.seasonHistory.some(s => s.season === state.season)
            ? state.seasonHistory.map(s => s.season === state.season ? newSummary : s)
            : [...state.seasonHistory, newSummary],
          resigningPlayers: [],
          holdoutDemands: [],
          tradeProposals: [],
          draftScoutingData: {},
          finalsMvpPlayerId: null, allStarGame: null,
          weeklyRecaps: [],
          tradeRumors: [],
          socialPosts: (state.socialPosts ?? []).filter(p => state.season - p.timestamp.season <= 2),
          rivalries: decayRivalries(state.rivalries ?? []),
          extensionsUsedThisSeason: 0,
          // BS Mode: compute QB tiers at season start
          ...(state.leagueSettings?.bsMode ? {
            qbTiers: computeLeagueQBTiers(grownTeams, allPlayersForNewSeason),
          } : { qbTiers: undefined }),
        });

        // BS Mode: generate QB Pyramid news
        if (state.leagueSettings?.bsMode) {
          const freshState = get();
          const tiers = freshState.qbTiers ?? {};
          const elites = Object.entries(tiers).filter(([, v]) => v.tier === 'Elite' || v.tier === 'Franchise');
          if (elites.length > 0) {
            const names = elites.map(([tid, v]) => {
              const qb = freshState.players.find(p => p.id === v.playerId);
              const tm = freshState.teams.find(t => t.id === tid);
              return `${qb?.firstName} ${qb?.lastName} (${tm?.abbreviation}, ${v.tier})`;
            }).join(', ');
            set({ newsItems: [...freshState.newsItems, makeNews({
              season: newSeason, week: 0, type: 'system',
              headline: `QB Tier Pyramid: ${elites.length} Elite/Franchise QBs this season`,
              body: names,
              isUserTeam: false,
            })] });
          }
        }

        // Auto-cut every team to the 53-man limit if enabled. Runs after all
        // FA/draft signings have settled so AI rosters that ballooned over the
        // cap during the offseason get trimmed before Week 1.
        get().autoCutToRosterLimit();
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
        // BS Mode: assign personalities to existing players when first enabled
        let updatedPlayers = state.players;
        if (newSettings.bsMode && !oldSettings.bsMode) {
          updatedPlayers = state.players.map(p => {
            if (p.personality) return p;
            // Deterministic hash from player ID
            let h = 0;
            for (let i = 0; i < (p.id?.length ?? 0); i++) h = ((h << 5) - h + p.id.charCodeAt(i)) | 0;
            const roll = (Math.abs(h) % 100) / 100;
            const personality: import('@/types').PersonalityTrait =
              roll < 0.08 ? 'irrational_confidence' :
              roll < 0.20 ? 'clutch' :
              roll < 0.30 ? 'pressure_fold' : 'steady';
            return { ...p, personality };
          });
        }
        set({ leagueSettings: newSettings, teams: updatedTeams, players: updatedPlayers });
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

          // Decrement injury timers for this round (championship ticks two
          // weeks due to the bye). Guarded by playoffInjuryRound so auto-simmed
          // games in the same round don't decrement again.
          const matchupForRound = state.playoffBracket.find(m => m.id === matchupId);
          const playedRound = matchupForRound?.round ?? 1;
          const lastInjuryRound = state.playoffInjuryRound ?? 1;
          const targetRound = playedRound === 4 ? playedRound + 1 : playedRound;
          const injuryWeeksToTick = targetRound - lastInjuryRound;
          let tickedPlayers = state.players;
          if (injuryWeeksToTick > 0) {
            tickedPlayers = decrementInjuryWeeks(tickedPlayers, injuryWeeksToTick);
          }

          // Update player stats on top of any injury decrements
          const newPlayers = tickedPlayers.map(p => {
            const playerStats = result.playerStats?.[p.id];
            if (!playerStats) return p;
            return { ...p, stats: addStats(p.stats, playerStats) };
          });

          // Re-injury rolls for any player who played through their injury
          const gameTeamIds = new Set([result.homeTeamId, result.awayTeamId]);
          const playedIds = new Set(newPlayers.filter(p => p.teamId && gameTeamIds.has(p.teamId)).map(p => p.id));
          const ht = state.teams.find(t => t.id === result.homeTeamId);
          const at = state.teams.find(t => t.id === result.awayTeamId);
          const gameLabel = `${at?.city ?? 'AWY'} at ${ht?.city ?? 'HOM'}`;
          const reInj = rollReInjuries(newPlayers, playedIds, gameLabel, state.season, 100 + playedRound, state.userTeamId);

          const newInjuryRound = injuryWeeksToTick > 0 ? targetRound : lastInjuryRound;
          set({ playoffBracket: bracket, champions, newsItems: [...newsItems, ...reInj.news], finalsMvpPlayerId, schedule: updatedSchedule, weeklyRecaps: updatedRecaps, players: reInj.players, playoffInjuryRound: newInjuryRound });
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

      editPlayer: (playerId: string, updates: Partial<Player>) => {
        const state = get();
        const settings = state.leagueSettings ?? DEFAULT_LEAGUE_SETTINGS;
        if (!settings.godMode) return;

        const updatedPlayers = state.players.map(p => {
          if (p.id !== playerId) return p;
          const merged = { ...p, ...updates };
          // Merge ratings if provided
          if (updates.ratings) {
            merged.ratings = { ...p.ratings, ...updates.ratings };
          }
          // If user explicitly set OVR, respect it. Otherwise recalculate from ratings.
          if (updates.ratings?.overall !== undefined) {
            merged.ratings.overall = updates.ratings.overall;
          } else {
            const pos = updates.position ?? p.position;
            merged.ratings.overall = recalculateOvr(merged.ratings, pos);
          }
          return merged;
        });

        // Handle team transfers
        const oldPlayer = state.players.find(p => p.id === playerId);
        let updatedTeams = state.teams;
        if (oldPlayer && updates.teamId !== undefined && updates.teamId !== oldPlayer.teamId) {
          // Remove from old team roster
          if (oldPlayer.teamId) {
            updatedTeams = updatedTeams.map(t =>
              t.id === oldPlayer.teamId
                ? { ...t, roster: t.roster.filter(id => id !== playerId) }
                : t,
            );
          }
          // Add to new team roster
          if (updates.teamId) {
            updatedTeams = updatedTeams.map(t =>
              t.id === updates.teamId
                ? { ...t, roster: [...t.roster, playerId] }
                : t,
            );
          }
        }

        // Rebuild depth chart for the affected team
        const editedPlayer = updatedPlayers.find(p => p.id === playerId);
        const affectedTeamId = editedPlayer?.teamId ?? oldPlayer?.teamId;
        if (affectedTeamId) {
          updatedTeams = updatedTeams.map(t => {
            if (t.id !== affectedTeamId) return t;
            const teamPlayers = updatedPlayers.filter(p => p.teamId === affectedTeamId && !p.retired);
            return { ...t, depthChart: buildDefaultDepthChart(teamPlayers) };
          });
        }

        set({ players: updatedPlayers, teams: updatedTeams });
      },

      createPlayer: (data) => {
        const state = get();
        const settings = state.leagueSettings ?? DEFAULT_LEAGUE_SETTINGS;
        if (!settings.godMode) return null;

        const p = generatePlayer(data.position, data.overall, {
          age: data.age,
          experience: 0,
          teamId: state.userTeamId,
        });
        p.firstName = data.firstName;
        p.lastName = data.lastName;
        p.potential = data.potential;
        p.ratings.overall = data.overall;
        p.acquiredVia = 'initial';
        p.acquiredSeason = state.season;

        // Add to user team roster
        const updatedTeams = state.teams.map(t =>
          t.id === state.userTeamId
            ? { ...t, roster: [...t.roster, p.id] }
            : t,
        );

        set({
          players: [...state.players, p],
          teams: updatedTeams,
        });

        return p.id;
      },

      setSuppressTradePopups: (val: boolean) => {
        set({ suppressTradePopups: val });
      },

      saveToSlot: async (slot: number) => {
        const stored = await idbGetItem('gridiron-gm-autosave');
        if (stored) {
          await idbSetItem(`gridiron-gm-save-${slot}`, stored);
        }
      },

      loadFromSlot: async (slot: number) => {
        const data = await idbGetItem(`gridiron-gm-save-${slot}`);
        if (!data) return;
        await idbSetItem('gridiron-gm-autosave', data);
        window.location.reload();
      },

      // Expansion draft actions
      createExpansionTeam: (config: ExpansionTeamConfig) => {
        const state = get();
        if (state.expansionDraft) return false; // already in progress
        if (state.phase !== 'freeAgency' && state.phase !== 'resigning') return false;
        const settings = state.leagueSettings ?? DEFAULT_LEAGUE_SETTINGS;
        if (!settings.godMode) return false;

        const newTeam = createExpansionTeamObject(config, state.season, state.teams.length);

        set({
          expansionDraft: {
            phase: 'protection',
            configs: [config],
            expansionTeamIds: [newTeam.id],
            protectedPlayers: {},
            picks: [],
            currentPickIndex: 0,
          },
          // Store new team in teams array
          teams: [...state.teams, newTeam],
        });
        return true;
      },

      protectPlayers: (teamId: string, playerIds: string[]) => {
        const state = get();
        const ed = state.expansionDraft;
        if (!ed || ed.phase !== 'protection') return false;
        const limit = computeProtectionLimit(53);
        if (playerIds.length > limit) return false;

        set({
          expansionDraft: {
            ...ed,
            protectedPlayers: { ...ed.protectedPlayers, [teamId]: playerIds },
          },
        });
        return true;
      },

      runExpansionDraftAction: () => {
        const state = get();
        const ed = state.expansionDraft;
        if (!ed || ed.phase !== 'protection') return;

        const expansionTeams = state.teams.filter(t => ed.expansionTeamIds.includes(t.id));
        const otherTeams = state.teams.filter(t => !ed.expansionTeamIds.includes(t.id));
        const result = runExpansionDraft(
          otherTeams,
          ed.expansionTeamIds,
          state.teams,
          state.players,
          ed.protectedPlayers,
          state.season,
        );

        const expansionNews: NewsItem[] = result.picks.map(pick => {
          const player = result.updatedPlayers.find(p => p.id === pick.playerId);
          const fromTeam = state.teams.find(t => t.id === pick.fromTeamId);
          return makeNews({
            season: state.season, week: 0, type: 'trade',
            teamId: pick.expansionTeamId, playerIds: [pick.playerId],
            headline: `Expansion Draft: ${player?.firstName ?? '?'} ${player?.lastName ?? '?'} (${player?.position ?? '?'}) selected from ${fromTeam?.abbreviation ?? '?'}.`,
            isUserTeam: pick.fromTeamId === state.userTeamId,
          });
        });

        // Use the updated players and teams from the result, rebuild depth charts
        let updatedTeams = result.updatedTeams.map(t => {
          const teamPlayers = result.updatedPlayers.filter(p => p.teamId === t.id && !p.retired);
          return { ...t, depthChart: buildDefaultDepthChart(teamPlayers), totalPayroll: recalculateTeamPayroll(t, result.updatedPlayers) };
        });

        set({
          teams: updatedTeams,
          players: result.updatedPlayers,
          newsItems: [...state.newsItems, ...expansionNews],
          expansionDraft: { ...ed, phase: 'complete', picks: result.picks, currentPickIndex: result.picks.length },
        });
      },

      cancelExpansionDraft: () => {
        const state = get();
        const ed = state.expansionDraft;
        // Remove expansion teams that were added
        if (ed) {
          const expIds = new Set(ed.expansionTeamIds);
          set({
            teams: state.teams.filter(t => !expIds.has(t.id)),
            expansionDraft: null,
          });
        } else {
          set({ expansionDraft: null });
        }
      },

      getTeam: (id: string) => get().teams.find(t => t.id === id),
      getPlayer: (id: string) => get().players.find(p => p.id === id),
      getTeamRoster: (teamId: string) => get().players.filter(p => p.teamId === teamId),
      getWeekGames: (week: number) => get().schedule.filter(g => g.week === week),

      importDraftClass: (prospects, targetYear) => {
        const state = get();
        const year = targetYear ?? state.season;
        const validPositions = new Set(POSITIONS as readonly string[]);

        let count = 0;
        let skipped = 0;
        const newPlayers: Player[] = [];

        for (const prospect of prospects) {
          // Validate required fields
          if (!prospect.firstName || typeof prospect.firstName !== 'string' || !prospect.firstName.trim()) { skipped++; continue; }
          if (!prospect.lastName || typeof prospect.lastName !== 'string' || !prospect.lastName.trim()) { skipped++; continue; }
          if (!validPositions.has(prospect.position)) { skipped++; continue; }

          const pos = prospect.position as Position;
          // Clamp overall to 40-99 or generate random 55-80
          const rawOvr = prospect.overall ?? (55 + Math.floor(Math.random() * 26));
          const ovr = Math.max(40, Math.min(99, Math.round(rawOvr)));

          // Generate base player from position and overall
          const player = generatePlayer(pos, ovr, {
            age: prospect.age ?? (21 + Math.floor(Math.random() * 2)),
            experience: 0,
          });

          // Overlay imported data
          player.firstName = prospect.firstName.trim();
          player.lastName = prospect.lastName.trim();
          if (prospect.college) player.college = prospect.college;

          // Overlay detailed ratings if provided, then recalculate OVR
          const ratingKeys: (keyof Omit<PlayerRatings, 'overall'>)[] = [
            'speed', 'strength', 'agility', 'awareness', 'stamina',
            'throwing', 'catching', 'carrying', 'blocking',
            'tackling', 'coverage', 'passRush', 'kicking',
          ];
          if (prospect.ratings) {
            for (const key of ratingKeys) {
              const val = prospect.ratings[key];
              if (val !== undefined && typeof val === 'number') {
                player.ratings[key] = Math.max(20, Math.min(99, Math.round(val)));
              }
            }
            player.ratings.overall = recalculateOvr(player.ratings, pos);
          } else if (prospect.overall !== undefined) {
            // No detailed ratings but user specified an overall — scale all
            // generated ratings proportionally so the player's actual OVR
            // matches what the user requested. Without this, generatePlayer's
            // random variance can produce an OVR 10-15 points off the target.
            const currentOvr = player.ratings.overall;
            if (currentOvr > 0 && Math.abs(currentOvr - ovr) > 1) {
              const scale = ovr / currentOvr;
              for (const key of ratingKeys) {
                player.ratings[key] = Math.max(25, Math.min(99, Math.round(player.ratings[key] * scale)));
              }
              player.ratings.overall = recalculateOvr(player.ratings, pos);
            }
          }

          // Clamp potential to [overall, 99] or generate default
          if (prospect.potential !== undefined) {
            player.potential = Math.max(player.ratings.overall, Math.min(99, Math.round(prospect.potential)));
          } else {
            player.potential = Math.max(player.ratings.overall, Math.min(99, player.ratings.overall + 5 + Math.floor(Math.random() * 11)));
          }

          // Set draft prospect fields
          player.teamId = null;
          player.contract = { salary: 0, yearsLeft: 0, guaranteed: 0, totalYears: 0 };
          player.draftYear = year;
          player.scoutingLabel = ['High motor', 'Raw but explosive', 'Pro-ready', 'Combine standout', 'Sleeper'][Math.floor(Math.random() * 5)];
          player.scoutingSeed = Math.floor(Math.random() * 10000);
          player.draftProfile = 'normal';
          player.combineStats = generateCombineStats(pos, player.ratings, Math.floor(Math.random() * 10000));
          player.subPosition = deriveSubPosition(player);

          newPlayers.push(player);
          count++;
        }

        if (count === 0) return { count: 0, skipped };

        // Assign projected ranks for the imported class
        const sorted = [...newPlayers].sort((a, b) => {
          const aOvr = (a.position === 'K' || a.position === 'P') ? a.ratings.overall - 40 : a.ratings.overall;
          const bOvr = (b.position === 'K' || b.position === 'P') ? b.ratings.overall - 40 : b.ratings.overall;
          return bOvr - aOvr;
        });
        for (let i = 0; i < sorted.length; i++) {
          sorted[i].projectedRank = i + 1;
        }

        // Merge into state
        const updatedPlayers = [...state.players, ...newPlayers];
        const updatedFreeAgents = state.phase === 'draft'
          ? [...state.freeAgents, ...newPlayers.map(p => p.id)]
          : state.freeAgents;

        set({ players: updatedPlayers, freeAgents: updatedFreeAgents });
        return { count, skipped };
      },

      switchTeam: (newTeamId: string) => {
        const state = get();
        if (!state.teams.find(t => t.id === newTeamId)) return;
        set({ userTeamId: newTeamId });
      },
    }),
    {
      name: 'gridiron-gm-autosave',
      version: SAVE_VERSION,
      storage: createJSONStorage(() => idbStorage),
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
      onRehydrateStorage: () => (state) => {
        // Auto-set initialized if we have a saved game
        if (state && state.userTeamId && state.teams && state.teams.length > 0) {
          useGameStore.setState({ initialized: true });
        }
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
          // Strip playerStats from non-user games to reduce save size
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
        if (version < 15) {
          // Add holdoutDemands to state
          if (!state.holdoutDemands) state.holdoutDemands = [];
        }
        if (version < 16) {
          // Add tradeRumors and rivalries to state
          if (!state.tradeRumors) state.tradeRumors = [];
          if (!state.rivalries) state.rivalries = [];
        }
        if (version < 17) {
          // Ensure all three arrays exist after migration
          if (!state.holdoutDemands) state.holdoutDemands = [];
          if (!state.tradeRumors) state.tradeRumors = [];
          if (!state.rivalries) state.rivalries = [];
        }
        if (version < 18) {
          // Generate coaching staff for teams that don't have one
          for (const team of (state as any).teams ?? []) {
            if (!team.coaches || team.coaches.length === 0) {
              team.coaches = generateCoachingStaff();
            }
          }
        }
        if (version < 19) {
          // Ensure all teams have draft picks for current season + next 2 years
          const currentSeason = (state as any).season ?? 2026;
          const yearsNeeded = [currentSeason, currentSeason + 1, currentSeason + 2];
          for (const team of (state as any).teams ?? []) {
            if (!team.draftPicks) team.draftPicks = [];
            for (const yr of yearsNeeded) {
              const hasPicksForYear = team.draftPicks.some(
                (pk: any) => pk.year === yr && pk.originalTeamId === team.id
              );
              if (!hasPicksForYear) {
                for (let round = 1; round <= 7; round++) {
                  team.draftPicks.push({
                    id: uuid(),
                    year: yr,
                    round,
                    originalTeamId: team.id,
                    ownerTeamId: team.id,
                  });
                }
              }
            }
          }
        }
        if (version < 20) {
          // Backfill detailed sub-position on every player (Phase 1).
          const players20 = (state as any).players as Array<Record<string, unknown>> | undefined;
          if (Array.isArray(players20)) {
            for (const p of players20) {
              if (!p.subPosition) {
                p.subPosition = deriveSubPosition(p as Parameters<typeof deriveSubPosition>[0]);
              }
            }
          }
        }
        if (version < 21) {
          // Backfill position coaches for existing teams that only have HC/OC/DC
          for (const team of (state as any).teams ?? []) {
            if (team.coaches && team.coaches.length > 0 && team.coaches.length <= 3) {
              team.coaches = [...team.coaches, ...generatePositionCoaches()];
            }
          }
        }
        if (version < 22) {
          // Retroactively reconcile injury timers for saves currently in the
          // playoffs. Prior to this version, playoff rounds didn't decrement
          // injury weeksLeft, so players healing during playoffs stayed stuck.
          // Infer elapsed weeks from the furthest advanced round in the bracket.
          const phase = (state as any).phase;
          if (phase === 'playoffs') {
            const bracket = ((state as any).playoffBracket as Array<Record<string, unknown>> | null) ?? [];
            let maxStartedRound = 0;
            for (const m of bracket) {
              const round = (m.round as number) ?? 0;
              if (m.winnerId && round > maxStartedRound) maxStartedRound = round;
            }
            // Weeks elapsed since regular-season end:
            //   advanceToPlayoffs → 1 (bye before wild card)
            //   round 1 started  → 1  (wild card weekend = the advance week)
            //   round 2 started  → 2
            //   round 3 started  → 3
            //   round 4 started  → 5  (extra bye between conf champ and championship)
            const weeksElapsed =
              maxStartedRound >= 4 ? 5 :
              maxStartedRound >= 1 ? maxStartedRound :
              1;
            const players = (state as any).players as Array<Record<string, unknown>> | undefined;
            if (Array.isArray(players)) {
              for (const p of players) {
                const inj = p.injury as { weeksLeft?: number } | null | undefined;
                if (inj && typeof inj.weeksLeft === 'number' && inj.weeksLeft > 0) {
                  const newLeft = inj.weeksLeft - weeksElapsed;
                  if (newLeft <= 0) {
                    p.injury = null;
                  } else {
                    p.injury = { ...inj, weeksLeft: newLeft };
                  }
                }
              }
            }
            (state as any).playoffInjuryRound = maxStartedRound >= 4 ? 5 : Math.max(1, maxStartedRound);
          }
        }
        if (version < 23) {
          // Roll an owner personality for any team that doesn't have one.
          for (const team of (state as any).teams ?? []) {
            if (!team.ownerPersonality) {
              team.ownerPersonality = rollOwnerPersonality();
            }
          }
        }
        if (version < 24) {
          // Repair SEA/SF player assignments that were baked into saves
          // before the roster JSON was corrected (tofftanaut Discord report).
          // Matches by (firstName, lastName) → correct team abbreviation.
          const ROSTER_CORRECTIONS: Record<string, string> = {
            'Leonard|Williams': 'SEA',
            'AJ|Barner': 'SEA',
            'Tyrice|Knight': 'SEA',
            'Nehemiah|Pritchett': 'SEA',
            'Chris|Paul Jr.': 'SEA',
            'Byron|Murphy II': 'SEA',
            'Alex|Leatherwood': 'SF',
            'Yetur|Gross-Matos': 'SF',
          };
          const teams24 = ((state as any).teams ?? []) as Array<Record<string, unknown>>;
          const abbrToId24 = new Map<string, string>();
          for (const t of teams24) {
            abbrToId24.set(t.abbreviation as string, t.id as string);
          }
          const players24 = ((state as any).players ?? []) as Array<Record<string, unknown>>;
          for (const p of players24) {
            const key = `${p.firstName}|${p.lastName}`;
            const targetAbbr = ROSTER_CORRECTIONS[key];
            if (!targetAbbr) continue;
            const targetTeamId = abbrToId24.get(targetAbbr);
            if (!targetTeamId) continue;
            const oldTeamId = p.teamId as string | null;
            if (oldTeamId === targetTeamId) continue;
            p.teamId = targetTeamId;
            for (const t of teams24) {
              const rosterArr = t.roster as string[] | undefined;
              if (rosterArr && rosterArr.includes(p.id as string) && t.id !== targetTeamId) {
                t.roster = rosterArr.filter(rid => rid !== (p.id as string));
              }
            }
            const newTeam = teams24.find(t => t.id === targetTeamId);
            if (newTeam) {
              const rosterArr = (newTeam.roster as string[] | undefined) ?? [];
              if (!rosterArr.includes(p.id as string)) {
                newTeam.roster = [...rosterArr, p.id as string];
              }
            }
          }
        }
        if (version < 25) {
          // Backfill college stats + Heisman flags on draft prospects in
          // existing saves. Without this, leagues created before the Apr 16
          // college-stats feature shipped would never see the badges
          // (305mike Discord report).
          const players25 = ((state as any).players ?? []) as Array<Record<string, unknown>>;
          const prospects = players25.filter(p =>
            (p.experience as number) === 0 &&
            !p.draftYear &&
            !p.retired
          );
          for (const p of prospects) {
            if (!p.collegeStats) {
              const seed = (p.scoutingSeed as number) ?? Math.floor(Math.random() * 10000);
              p.collegeStats = generateCollegeStats(
                p.position as Parameters<typeof generateCollegeStats>[0],
                ((p.ratings as { overall?: number })?.overall) ?? 60,
                seed,
              );
            }
          }
          // Heisman: top 3 skill-position prospects flagged as finalists,
          // top one as winner.
          const skillCandidates = prospects
            .filter(p => ['QB', 'RB', 'WR', 'TE'].includes(p.position as string))
            .sort((a, b) => ((b.ratings as { overall: number })?.overall ?? 0) - ((a.ratings as { overall: number })?.overall ?? 0))
            .slice(0, 3);
          for (const p of skillCandidates) {
            p.heismanFinalist = true;
          }
          if (skillCandidates[0]) skillCandidates[0].heismanWinner = true;
        }
        if (version < 26) {
          // Phase 2 depth chart: assign per-team OL slots (LT/LG/C/RG/RT) and
          // a default base formation. TimNation/Kidcoffeyblack feature requests.
          const teams26 = ((state as any).teams ?? []) as Array<Record<string, unknown>>;
          const players26 = ((state as any).players ?? []) as Array<Record<string, unknown>>;
          for (const team of teams26) {
            if (!team.baseFormation) team.baseFormation = '4-3';
            const teamRoster = players26.filter(p =>
              p.teamId === team.id && !p.retired && p.position === 'OL',
            );
            const slotMap = assignOlSlots(teamRoster as Parameters<typeof assignOlSlots>[0]);
            for (const p of teamRoster) {
              const slot = slotMap.get(p.id as string);
              if (slot) p.olSlot = slot;
            }
          }
        }
        if (version < 27) {
          // Fix teams whose primaryColor is white (#ffffff or near-white).
          // FBGM rosters sometimes list white as the primary for Colts/Dolphins,
          // which renders invisible against the light page bg.
          const teams27 = ((state as any).teams ?? []) as Array<Record<string, unknown>>;
          const lum = (hex: string): number => {
            const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
            if (!m) return 0.5;
            const r = parseInt(m[1].slice(0, 2), 16) / 255;
            const g = parseInt(m[1].slice(2, 4), 16) / 255;
            const b = parseInt(m[1].slice(4, 6), 16) / 255;
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
          };
          for (const t of teams27) {
            const primary = (t.primaryColor as string | undefined) ?? '';
            const secondary = (t.secondaryColor as string | undefined) ?? '';
            if (primary && lum(primary) > 0.85) {
              if (secondary && lum(secondary) < 0.85) {
                t.primaryColor = secondary;
                t.secondaryColor = primary;
              } else {
                t.primaryColor = '#1E3A8A';
              }
            }
          }
        }
        return state;
      },
    },
  ),
);

// ---------------------------------------------------------------------------
// flushToStorage: force-write current state to IndexedDB
// ---------------------------------------------------------------------------

/**
 * Serialize the current store state using the same partialize logic as the
 * persist middleware, then write directly to IndexedDB. Returns a Promise
 * that resolves once the write is confirmed.
 *
 * Call this before router.push() after any store mutation to guarantee the
 * navigation target will rehydrate fresh data.
 */
export async function flushToStorage(): Promise<void> {
  const state = useGameStore.getState();
  const opts = (useGameStore as any).persist?.getOptions?.();
  const partialize = opts?.partialize ?? ((s: any) => s);
  const partialized = partialize(state);
  const serialized = JSON.stringify({ state: partialized, version: SAVE_VERSION });
  await flushPersist(serialized);
}

/**
 * Synchronous fallback: write a recovery snapshot to localStorage.
 * Use in beforeunload handlers where async is unreliable.
 */
export function flushToStorageSync(): void {
  const state = useGameStore.getState();
  const opts = (useGameStore as any).persist?.getOptions?.();
  const partialize = opts?.partialize ?? ((s: any) => s);
  const partialized = partialize(state);
  const serialized = JSON.stringify({ state: partialized, version: SAVE_VERSION });
  flushPersistSync(serialized);
}
