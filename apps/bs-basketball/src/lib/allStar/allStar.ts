/**
 * All-Star Game (Discord ask, Nov 12 2026: "why isn't there an All-Star game?").
 *
 * At the All-Star break — the midpoint of the regular season (~game 41, the
 * same moment The Show's "All-Star Break Special" airs) — each conference names
 * 12 All-Stars from first-half production, and East vs West play an exhibition
 * through the normal sim engine.
 *
 *   - Starters ("fan vote"): 2 guards + 3 frontcourt per conference.
 *   - Reserves ("coaches"): 2 more guards, 3 more frontcourt, 2 wild cards.
 *   - Injured selections keep the honor but sit; the commissioner names an
 *     injury replacement from the same position group.
 *   - The game is an exhibition: fast pace, perimeter-heavy, deep benches. It is NOT added
 *     to `league.games`, so it never touches standings, season stats, awards,
 *     fatigue or injuries. The result lives on
 *     `league.sportData.allStarGames[season]` (kept across seasons for history).
 *
 * Pure functions — `maybePlayAllStarGame` is called at the end of each simmed
 * day and is a no-op except on the day the break begins.
 */

import {
  basketballAdapter,
  buildDefaultBasketballLineup,
  basketballPositionGroup,
  perGame,
  addBasketballStats,
  emptyBasketballStats,
  type BasketballPlayer,
  type BasketballPosition,
  type BasketballStats,
  type BasketballTeam,
  type BasketballLineup,
  type BasketballGamePlan,
} from '@bs/sport-basketball';
import type { BaseLeagueState, GameContext, PlayerId, TeamId } from '@bs/core/adapter';
import type { BasketballRatings } from '@bs/sport-basketball';
import { getInjuries, canPlayThrough, type InjuryMap } from '../injuries';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export type AllStarSide = 'east' | 'west';
export type AllStarConference = 'Eastern' | 'Western';

export interface AllStarSelection {
  playerId: string;
  name: string;
  teamId: TeamId | null;
  position: BasketballPosition;
  /** First-half line at selection, e.g. "27.1 / 6.2 / 5.4". */
  statline: string;
  starter: boolean;
  /** Named but hurt on game day — keeps the honor, doesn't play. */
  injured?: boolean;
  /** Commissioner's injury replacement. */
  replacement?: boolean;
}

export interface AllStarLine {
  min: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
}

export interface AllStarGame {
  season: number;
  /** Last regular-season day before the break. */
  day: number;
  rosters: Record<AllStarSide, AllStarSelection[]>;
  finalScore: Record<AllStarSide, number>;
  quarterScores: Record<AllStarSide, number>[];
  overtime: boolean;
  /** Compact box score keyed by player id (only players who played). */
  lines: Record<string, AllStarLine>;
  mvpId: string | null;
  winner: AllStarSide;
}

interface AllStarSportData {
  allStarGames?: Record<number, AllStarGame>;
  [k: string]: unknown;
}

const PER_CONF = 12;
const STARTER_GUARDS = 2;
const STARTER_FRONT = 3;
const RESERVE_GUARDS = 2;
const RESERVE_FRONT = 3;

export const SIDE_LABEL: Record<AllStarSide, string> = { east: 'East', west: 'West' };
const SIDE_CONF: Record<AllStarSide, AllStarConference> = { east: 'Eastern', west: 'Western' };

// ===========================================================================
// Accessors
// ===========================================================================

export function getAllStarGames(league: LeagueState): Record<number, AllStarGame> {
  return (league.sportData as AllStarSportData | undefined)?.allStarGames ?? {};
}

export function getAllStarGame(league: LeagueState, season = league.currentSeason): AllStarGame | null {
  return getAllStarGames(league)[season] ?? null;
}

function regularDay(g: LeagueState['games'][number]): number | null {
  const sd = g.sportData as { dayOfSeason?: number; isPlayoff?: boolean } | undefined;
  if (sd?.isPlayoff || typeof sd?.dayOfSeason !== 'number') return null;
  return sd.dayOfSeason;
}

/** The last regular-season day BEFORE the break: the midpoint of the schedule
 *  (day 85 of a 170-day season ≈ game 41). Null when there's no schedule. */
export function getAllStarDay(league: LeagueState): number | null {
  let last = -Infinity;
  for (const g of league.games) {
    const d = regularDay(g);
    if (d != null && d > last) last = d;
  }
  if (!isFinite(last) || last <= 0) return null;
  return Math.floor(last / 2);
}

function earliestScheduledRegularDay(league: LeagueState): number {
  let min = Infinity;
  for (const g of league.games) {
    if (g.status !== 'scheduled') continue;
    const d = regularDay(g);
    if (d != null && d < min) min = d;
  }
  return min;
}

/** Whether the break is still ahead this season (drives the "Sim to All-Star
 *  Break" button). */
export function allStarBreakAhead(league: LeagueState): boolean {
  if (getAllStarGame(league)) return false;
  const day = getAllStarDay(league);
  if (day == null) return false;
  return earliestScheduledRegularDay(league) <= day;
}

// ===========================================================================
// Selection
// ===========================================================================

function firstHalfStats(league: LeagueState): Map<PlayerId, BasketballStats> {
  const acc = new Map<PlayerId, BasketballStats>();
  for (const g of league.games) {
    if (g.status !== 'played') continue;
    if ((g.sportData as { isPlayoff?: boolean } | undefined)?.isPlayoff) continue;
    for (const pid of Object.keys(g.boxScores) as PlayerId[]) {
      acc.set(pid, addBasketballStats(acc.get(pid) ?? emptyBasketballStats(), g.boxScores[pid]));
    }
  }
  return acc;
}

const isGuard = (pos: BasketballPosition) => basketballPositionGroup(pos) === 'G';

function line(s: BasketballStats): string {
  const pg = perGame(s);
  return `${(pg.points ?? 0).toFixed(1)} / ${(pg.totalRebounds ?? 0).toFixed(1)} / ${(pg.assists ?? 0).toFixed(1)}`;
}

function isOut(injuries: InjuryMap, id: string, day: number): boolean {
  const inj = injuries[id];
  return !!inj && inj.returnDay > day && !canPlayThrough(inj);
}

/** Name each conference's 12 All-Stars (plus injury replacements). */
export function selectAllStars(league: LeagueState, day: number): Record<AllStarSide, AllStarSelection[]> {
  const stats = firstHalfStats(league);
  const teams = league.teams as BasketballTeam[];
  const confOf = new Map<string, AllStarConference>(teams.map(t => [t.id, t.sportData.conference]));
  const winPct = new Map<string, number>(teams.map(t => {
    const gp = t.record.wins + t.record.losses;
    return [t.id, gp > 0 ? t.record.wins / gp : 0.5];
  }));
  const avgTeamGames = teams.length
    ? teams.reduce((n, t) => n + t.record.wins + t.record.losses, 0) / teams.length
    : 0;
  const minGames = Math.max(1, Math.floor(avgTeamGames * 0.5));
  const injuries = getInjuries(league);

  // Same production model as All-League (BUG-35 win factor so a tanking team's
  // stat-padder doesn't crowd out winners), plus a touch of OVR for "name
  // recognition" — it's a popularity contest as much as a stat sheet.
  const score = (p: BasketballPlayer, s: BasketballStats): number => {
    const pg = perGame(s);
    const efg = s.fieldGoalsAttempted > 0 ? (s.fieldGoalsMade + 0.5 * s.threePointsMade) / s.fieldGoalsAttempted : 0;
    const base = (pg.points ?? 0) * 1.0 + (pg.assists ?? 0) * 0.8 + (pg.totalRebounds ?? 0) * 0.6
      + ((pg.steals ?? 0) + (pg.blocks ?? 0)) * 1.2
      + (s.plusMinus / Math.max(1, s.gamesPlayed)) * 0.8 + (efg - 0.5) * 15
      + p.ratings.overall * 0.15;
    const tid = p.rosterSlot?.teamId;
    const pct = tid ? winPct.get(tid) ?? 0.5 : 0.5;
    const factor = Math.max(0.8, Math.min(1.2, 1 + (pct - 0.5) * 0.6));
    return base * factor;
  };

  const out = {} as Record<AllStarSide, AllStarSelection[]>;
  for (const side of ['east', 'west'] as AllStarSide[]) {
    const conf = SIDE_CONF[side];
    const pool = (Object.values(league.players) as BasketballPlayer[])
      .filter(p => p.rosterSlot?.teamId && confOf.get(p.rosterSlot.teamId) === conf)
      .map(p => ({ p, s: stats.get(p.id) ?? emptyBasketballStats() }))
      .filter(x => x.s.gamesPlayed >= minGames)
      .map(x => ({ ...x, v: score(x.p, x.s) }))
      .sort((a, b) => b.v - a.v);

    const taken = new Set<string>();
    const pick = (n: number, want: (pos: BasketballPosition) => boolean, starter: boolean): AllStarSelection[] => {
      const picks: AllStarSelection[] = [];
      for (const x of pool) {
        if (picks.length >= n) break;
        if (taken.has(x.p.id) || !want(x.p.sportData.position)) continue;
        taken.add(x.p.id);
        picks.push({
          playerId: x.p.id,
          name: `${x.p.firstName} ${x.p.lastName}`,
          teamId: x.p.rosterSlot?.teamId ?? null,
          position: x.p.sportData.position,
          statline: line(x.s),
          starter,
        });
      }
      return picks;
    };

    const roster = [
      ...pick(STARTER_GUARDS, isGuard, true),
      ...pick(STARTER_FRONT, pos => !isGuard(pos), true),
      ...pick(RESERVE_GUARDS, isGuard, false),
      ...pick(RESERVE_FRONT, pos => !isGuard(pos), false),
    ];
    roster.push(...pick(PER_CONF - roster.length, () => true, false));

    // Injury replacements: the next-best healthy player at the same group.
    for (const sel of [...roster]) {
      if (!isOut(injuries, sel.playerId, day)) continue;
      sel.injured = true;
      const guard = isGuard(sel.position);
      const healthy = (pos: BasketballPosition) => isGuard(pos) === guard;
      const rep = pool.find(x => !taken.has(x.p.id) && healthy(x.p.sportData.position) && !isOut(injuries, x.p.id, day))
        ?? pool.find(x => !taken.has(x.p.id) && !isOut(injuries, x.p.id, day));
      if (!rep) continue;
      taken.add(rep.p.id);
      roster.push({
        playerId: rep.p.id,
        name: `${rep.p.firstName} ${rep.p.lastName}`,
        teamId: rep.p.rosterSlot?.teamId ?? null,
        position: rep.p.sportData.position,
        statline: line(rep.s),
        starter: false,
        replacement: true,
      });
    }
    out[side] = roster;
  }

  // An injured starter's spot goes to the best healthy reserve at his group
  // (the NBA's "coach picks the replacement starter").
  for (const side of ['east', 'west'] as AllStarSide[]) {
    const r = out[side];
    for (const sel of r) {
      if (!sel.starter || !sel.injured) continue;
      const g = isGuard(sel.position);
      const sub = r.find(x => !x.starter && !x.injured && isGuard(x.position) === g)
        ?? r.find(x => !x.starter && !x.injured);
      if (sub) sub.starter = true;
    }
  }
  return out;
}

// ===========================================================================
// The game
// ===========================================================================

const ALL_STAR_PLAN: BasketballGamePlan = {
  pace: 'fast',
  offensiveFocus: 'perimeter',
  shotRisk: 'balanced',
  defensiveScheme: 'switch',
  pressure: 'pack',
  rotation: 'bench',
} as BasketballGamePlan;

function sideTeam(side: AllStarSide, roster: BasketballPlayer[]): BasketballTeam {
  const conf = SIDE_CONF[side];
  return {
    id: `allstar-${side}` as TeamId,
    city: SIDE_LABEL[side],
    name: 'All-Stars',
    abbreviation: side === 'east' ? 'EAST' : 'WEST',
    primaryColor: side === 'east' ? '#1d4ed8' : '#b91c1c',
    secondaryColor: '#ffffff',
    playerIds: roster.map(p => p.id),
    rosterBuckets: {},
    draftPicks: [],
    record: { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, streak: [], otherResults: 0 },
    coachIds: [],
    sportData: {
      conference: conf,
      division: side === 'east' ? 'Atlantic' : 'Pacific',
      pace: 'fast',
      defensiveScheme: 'conservative',
      gamePlan: ALL_STAR_PLAN,
    },
  } as unknown as BasketballTeam;
}

function sideLineup(players: BasketballPlayer[], starters: Set<string>): BasketballLineup {
  const base = buildDefaultBasketballLineup(players);
  const starterPlayers = players.filter(p => starters.has(p.id));
  if (starterPlayers.length !== 5) return { ...base, pace: 'fast' };
  // Guards first, then wings/forwards, the center (if any) last.
  const rank = (p: BasketballPlayer) => (isGuard(p.sportData.position) ? 0 : p.sportData.position === 'C' ? 2 : 1);
  const ordered = [...starterPlayers].sort((a, b) => rank(a) - rank(b) || b.ratings.overall - a.ratings.overall);
  return {
    ...base,
    starters: ordered.map(p => p.id) as BasketballLineup['starters'],
    bench: players.filter(p => !starters.has(p.id)).sort((a, b) => b.ratings.overall - a.ratings.overall).map(p => p.id),
    pace: 'fast',
  };
}

function toLine(s: BasketballStats): AllStarLine {
  return {
    min: Math.round(s.minutes), pts: s.points, reb: s.totalRebounds, ast: s.assists,
    stl: s.steals, blk: s.blocks, fgm: s.fieldGoalsMade, fga: s.fieldGoalsAttempted,
    tpm: s.threePointsMade, tpa: s.threePointsAttempted,
  };
}

/** Select both rosters and sim the game. */
export function playAllStarGame(league: LeagueState, day: number): AllStarGame | null {
  const rosters = selectAllStars(league, day);
  const players = league.players as Record<string, BasketballPlayer>;
  const dressed = (side: AllStarSide) => rosters[side]
    .filter(s => !s.injured)
    .map(s => players[s.playerId])
    .filter((p): p is BasketballPlayer => !!p);
  const east = dressed('east');
  const west = dressed('west');
  if (east.length < 5 || west.length < 5) return null;

  // Alternate hosts by year; no home-court edge in an exhibition.
  const homeSide: AllStarSide = league.currentSeason % 2 === 0 ? 'west' : 'east';
  const awaySide: AllStarSide = homeSide === 'east' ? 'west' : 'east';
  const sidePlayers = { east, west };
  const snap = (side: AllStarSide) => {
    const ps = sidePlayers[side];
    const starters = new Set(rosters[side].filter(s => s.starter && !s.injured).map(s => s.playerId));
    return {
      team: sideTeam(side, ps),
      availablePlayers: ps,
      lineup: sideLineup(ps, starters),
      coach: null,
    };
  };
  const ctx: GameContext = {
    season: league.currentSeason,
    tick: day,
    competitionId: 'all-star',
    isPlayoff: false,
    homeAdvantage: 0,
    rngSeed: `allstar-${league.currentSeason}`,
  };
  const result = basketballAdapter.simEngine.simGame(snap(homeSide), snap(awaySide), ctx);
  const fs = result.finalScore ?? { home: 0, away: 0 };
  const sd = result.sportData as { quarterScores?: { home: number; away: number }[]; wentToOvertime?: boolean } | undefined;
  const finalScore = { [homeSide]: fs.home, [awaySide]: fs.away } as Record<AllStarSide, number>;
  const winner: AllStarSide = finalScore.east > finalScore.west ? 'east' : 'west';

  const lines: Record<string, AllStarLine> = {};
  for (const [pid, s] of Object.entries(result.boxScores ?? {})) {
    if ((s as BasketballStats).minutes > 0) lines[pid] = toLine(s as BasketballStats);
  }

  // MVP: best game score on the winning side.
  const gameScore = (l: AllStarLine) => l.pts + 0.4 * l.fgm - 0.7 * l.fga + 0.7 * l.reb + 0.7 * l.ast + l.stl + 0.7 * l.blk + 0.5 * l.tpm;
  const winners = new Set<string>(sidePlayers[winner].map(p => p.id));
  let mvpId: string | null = null;
  let best = -Infinity;
  for (const [pid, l] of Object.entries(lines)) {
    if (!winners.has(pid)) continue;
    const v = gameScore(l);
    if (v > best) { best = v; mvpId = pid; }
  }

  return {
    season: league.currentSeason,
    day,
    rosters,
    finalScore,
    quarterScores: (sd?.quarterScores ?? []).map(q => ({ [homeSide]: q.home, [awaySide]: q.away } as Record<AllStarSide, number>)),
    overtime: !!sd?.wentToOvertime,
    lines,
    mvpId,
    winner,
  };
}

/**
 * Called after every simmed regular-season day. Plays the All-Star Game once,
 * on the day the break begins (the next scheduled day is past the midpoint).
 * `prevTick` is the calendar day before the sim — saves already past the break
 * when this shipped don't get a late "All-Star Game" in the second half.
 */
export function maybePlayAllStarGame(league: LeagueState, prevTick: number): LeagueState {
  if (getAllStarGame(league)) return league;
  const day = getAllStarDay(league);
  if (day == null || prevTick > day) return league;
  if (earliestScheduledRegularDay(league) <= day) return league;
  const game = playAllStarGame(league, day);
  if (!game) return league;
  const sd = (league.sportData as AllStarSportData | undefined) ?? {};
  return {
    ...league,
    sportData: {
      ...sd,
      allStarGames: { ...(sd.allStarGames ?? {}), [league.currentSeason]: game },
    },
  };
}

/** Toast suffix when a sim crossed the break, e.g.
 *  " · ⭐ All-Star Game: West 171, East 164 (MVP: J. Doe)". */
export function allStarNote(before: LeagueState, after: LeagueState): string {
  if (getAllStarGame(before)) return '';
  const g = getAllStarGame(after);
  if (!g) return '';
  const loser: AllStarSide = g.winner === 'east' ? 'west' : 'east';
  const mvp = g.mvpId ? (after.players as Record<string, BasketballPlayer>)[g.mvpId] : null;
  return ` · ⭐ All-Star Game: ${SIDE_LABEL[g.winner]} ${g.finalScore[g.winner]}, ${SIDE_LABEL[loser]} ${g.finalScore[loser]}`
    + (mvp ? ` (MVP: ${mvp.firstName[0]}. ${mvp.lastName})` : '');
}

/** Seasons a player was named an All-Star / won All-Star MVP (career chips). */
export function playerAllStarSeasons(league: LeagueState, playerId: string): { selections: number[]; mvps: number[] } {
  const selections: number[] = [];
  const mvps: number[] = [];
  for (const g of Object.values(getAllStarGames(league))) {
    if ([...g.rosters.east, ...g.rosters.west].some(s => s.playerId === playerId)) selections.push(g.season);
    if (g.mvpId === playerId) mvps.push(g.season);
  }
  return { selections: selections.sort(), mvps: mvps.sort() };
}
