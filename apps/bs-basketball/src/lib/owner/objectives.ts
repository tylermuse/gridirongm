/**
 * Owner objectives (BS Hoops front office).
 *
 * At the start of each season the owner hands the user's GM 2–3 concrete goals
 * derived from team context — how good the roster is relative to the league
 * (top-8 OVR rank), how old it is, and how last season went. A contender is
 * asked to win games and playoff rounds; a rebuild is asked to improve, develop
 * a young player and keep the books clean.
 *
 *   - Deterministic per save + season + team (seeded from league.id) — the same
 *     save always gets the same objectives, and the set is frozen once stored.
 *   - Persisted on `league.sportData.ownerObjectives` (optional; old saves get a
 *     set lazily on their next simmed day, or at the next season start).
 *   - Progress is computed live (pure) for the dashboard / GM hub cards.
 *   - Graded at season end (met / partial / missed) inside `applySeasonApproval`
 *     and archived on `sportData.ownerObjectiveHistory[season]` so the owner
 *     message can quote the grade.
 *
 * APPROVAL WEIGHT (documented contract with approval.ts):
 *   met = +4, partial = +1, missed = −4 owner approval each, total clamped to
 *   ±OBJECTIVE_APPROVAL_CAP (10). The results-driven swing (wins vs 41 +
 *   playoff run) is clamped to ±30, so objectives are meaningful — they can flip
 *   a borderline season across the firing line — but never dominant.
 */

import {
  basketballTeamCapStatus,
  type BasketballPlayer,
  type BasketballTeam,
  type TeamCapStatus,
} from '@bs/sport-basketball';
import type { BaseLeagueState, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import { getBracket } from '../playoffs';
import { teamDeadCap } from '../roster/deadCap';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export const SEASON_GAMES = 82;
export const OBJECTIVE_APPROVAL_CAP = 10;
export const OBJECTIVE_POINTS: Record<ObjectiveGradeValue, number> = { met: 4, partial: 1, missed: -4, pending: 0 };

export type ObjectiveKind = 'wins' | 'improve' | 'playoffs' | 'playoff_round' | 'tax' | 'budget' | 'develop';
export type TeamPosture = 'contend' | 'balanced' | 'rebuild';
export type ObjectiveGradeValue = 'met' | 'partial' | 'missed' | 'pending';

export interface HoopsObjective {
  id: string;
  kind: ObjectiveKind;
  description: string;
  /** wins / improve: win total. playoff_round: series wins. tax/budget: $ payroll ceiling.
   *  develop: target OVR. playoffs: 1. */
  target: number;
  /** improve: last season's wins. develop: OVR when the objective was set. */
  baseline?: number;
  /** develop: the player to develop. */
  playerId?: string;
  playerName?: string;
}

export interface ObjectiveSet {
  season: number;
  teamId: TeamId;
  posture: TeamPosture;
  objectives: HoopsObjective[];
}

export interface ObjectiveGrade {
  id: string;
  kind: ObjectiveKind;
  description: string;
  grade: ObjectiveGradeValue;
  detail: string;
}

export interface ObjectiveSeasonRecord extends ObjectiveSet {
  grades: ObjectiveGrade[];
  approvalDelta: number;
}

export type ProgressStatus = 'met' | 'on_track' | 'at_risk' | 'behind' | 'pending' | 'missed';

export interface ObjectiveProgress {
  objective: HoopsObjective;
  /** 0..1 fill for the progress bar. */
  pct: number;
  status: ProgressStatus;
  detail: string;
}

interface ObjectivesSportData {
  ownerObjectives?: ObjectiveSet;
  ownerObjectiveHistory?: Record<number, ObjectiveSeasonRecord>;
  [key: string]: unknown;
}

// ===========================================================================
// Deterministic seeding
// ===========================================================================

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const fmtM = (n: number) => `$${(n / 1e6).toFixed(1)}M`;

// ===========================================================================
// Team context
// ===========================================================================

function rosterOf(league: LeagueState, team: BasketballTeam): BasketballPlayer[] {
  const players = league.players as Record<string, BasketballPlayer>;
  return team.playerIds.map(id => players[id]).filter((p): p is BasketballPlayer => !!p);
}

function top8(roster: BasketballPlayer[]): BasketballPlayer[] {
  return [...roster].sort((a, b) => b.ratings.overall - a.ratings.overall).slice(0, 8);
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

export interface TeamContext {
  /** 1 = best top-8 roster in the league. */
  strengthRank: number;
  teamCount: number;
  /** 0..1 blended strength score (roster rank + last season). */
  score: number;
  avgAge: number;
  lastWins: number | null;
  /** Furthest round reached last season (1 = R1 … 4 = Finals), 0 = missed, null = unknown. */
  lastPlayoffRound: number | null;
  posture: TeamPosture;
}

interface HistoryLike {
  teamRecords?: { teamId: string; wins: number }[];
  playoffRound?: Record<string, number>;
}

export function teamContext(league: LeagueState, teamId: TeamId): TeamContext | null {
  const team = league.teams.find(t => t.id === teamId) as BasketballTeam | undefined;
  if (!team) return null;
  const strengths = (league.teams as BasketballTeam[]).map(t => ({
    id: t.id,
    s: avg(top8(rosterOf(league, t)).map(p => p.ratings.overall)),
  }));
  strengths.sort((a, b) => b.s - a.s);
  const strengthRank = strengths.findIndex(x => x.id === teamId) + 1;
  const teamCount = strengths.length;
  const rosterPct = teamCount > 1 ? 1 - (strengthRank - 1) / (teamCount - 1) : 0.5;

  const core = top8(rosterOf(league, team));
  const avgAge = avg(core.map(p => p.age));

  const prev = (league.seasonHistory as Record<number, HistoryLike | undefined>)[league.currentSeason - 1];
  const lastRec = prev?.teamRecords?.find(r => r.teamId === teamId);
  const lastWins = lastRec ? lastRec.wins : null;
  const lastPlayoffRound = prev ? (prev.playoffRound?.[teamId] ?? 0) : null;

  const lastPct = lastWins == null ? null : clamp((lastWins - 20) / 45, 0, 1);
  const score = lastPct == null ? rosterPct : rosterPct * 0.65 + lastPct * 0.35;

  let posture: TeamPosture = score >= 0.66 ? 'contend' : score < 0.36 ? 'rebuild' : 'balanced';
  // A young, middling roster is a rebuild-in-progress rather than a contender.
  if (posture === 'balanced' && avgAge <= 24.5 && score < 0.5) posture = 'rebuild';
  return { strengthRank, teamCount, score, avgAge, lastWins, lastPlayoffRound, posture };
}

// ===========================================================================
// Generation
// ===========================================================================

/** Best young player with room to grow, and the OVR target the owner wants. */
function developCandidate(roster: BasketballPlayer[]): { p: BasketballPlayer; target: number } | null {
  const pool = roster
    .filter(p => p.age <= 24 && p.development.potential - p.ratings.overall >= 4 && p.ratings.overall < 75)
    .sort((a, b) => (b.development.potential - b.ratings.overall) + b.ratings.overall * 0.5
      - ((a.development.potential - a.ratings.overall) + a.ratings.overall * 0.5));
  const p = pool[0];
  if (!p) return null;
  // "Develop to 75+" for a near-75 prospect; otherwise a realistic +4 bump.
  const target = p.ratings.overall >= 70 ? 75 : Math.min(75, p.ratings.overall + 4);
  return { p, target };
}

/**
 * Generate this season's objectives for `teamId`. Pure + deterministic for a
 * given league state (save id + season + team seed the small jitters).
 */
export function generateSeasonObjectives(league: LeagueState, teamId: TeamId): ObjectiveSet | null {
  const team = league.teams.find(t => t.id === teamId) as BasketballTeam | undefined;
  const ctx = teamContext(league, teamId);
  if (!team || !ctx) return null;
  const season = league.currentSeason;
  const seed = (k: string) => hash(`${league.id}-${season}-${teamId}-${k}`);
  const jitter = (seed('wins') % 5) - 2; // −2..+2
  const roster = rosterOf(league, team);
  const cap = capStatus(league, team);
  const objectives: HoopsObjective[] = [];
  const id = (k: string) => `${season}-${teamId}-${k}`;

  // Expected wins from the blended strength score: ~19 (worst) to ~63 (best).
  const expectedWins = Math.round(41 + (ctx.score - 0.5) * 44);

  if (ctx.posture === 'contend') {
    const winTarget = clamp(expectedWins + jitter, 48, 62);
    objectives.push({ id: id('wins'), kind: 'wins', description: `Win ${winTarget}+ games`, target: winTarget });
    const deepRun = ctx.strengthRank <= 3 && (ctx.lastPlayoffRound ?? 0) >= 3;
    objectives.push(deepRun
      ? { id: id('round'), kind: 'playoff_round', description: 'Reach the Conference Finals', target: 2 }
      : { id: id('round'), kind: 'playoff_round', description: 'Win a playoff round', target: 1 });
  } else if (ctx.posture === 'balanced') {
    const winTarget = clamp(expectedWins + jitter, 38, 50);
    objectives.push({ id: id('wins'), kind: 'wins', description: `Win ${winTarget}+ games`, target: winTarget });
    objectives.push({ id: id('playoffs'), kind: 'playoffs', description: 'Make the playoffs', target: 1 });
  } else {
    if (ctx.lastWins != null && ctx.lastWins <= 42) {
      const target = Math.min(50, ctx.lastWins + 8);
      objectives.push({ id: id('improve'), kind: 'improve', description: `Improve by 8+ wins (${target}+)`, target, baseline: ctx.lastWins });
    } else {
      const winTarget = clamp(expectedWins + jitter, 22, 36);
      objectives.push({ id: id('wins'), kind: 'wins', description: `Win ${winTarget}+ games`, target: winTarget });
    }
  }

  // Third slot / rebuild slots: money + development, chosen from context.
  const nearTax = cap.payroll > cap.taxThreshold * 0.97;
  const dev = developCandidate(roster);
  const devObj = (): HoopsObjective | null => dev
    ? {
        id: id('develop'), kind: 'develop',
        description: `Develop ${dev.p.firstName} ${dev.p.lastName} to ${dev.target}+ OVR`,
        target: dev.target, baseline: dev.p.ratings.overall, playerId: dev.p.id,
        playerName: `${dev.p.firstName} ${dev.p.lastName}`,
      }
    : null;
  const taxObj: HoopsObjective = {
    id: id('tax'), kind: 'tax',
    description: cap.isOverTax ? 'Get under the luxury tax' : 'Stay under the luxury tax',
    target: cap.taxThreshold,
  };
  // Budget = current payroll rounded up to the next $5M, but never below the cap.
  const budget = Math.max(cap.cap, Math.ceil(budgetSpend(league, team, cap) / 5_000_000) * 5_000_000);
  const budgetObj: HoopsObjective = { id: id('budget'), kind: 'budget', description: `Stay within budget (${fmtM(budget)} payroll)`, target: budget };

  if (ctx.posture === 'rebuild') {
    const d = devObj();
    if (d) objectives.push(d);
    objectives.push(nearTax ? taxObj : budgetObj);
  } else if (nearTax) {
    objectives.push(taxObj);
  } else {
    // Seeded pick between development and a budget ask for the 3rd objective.
    const d = devObj();
    if (d && seed('third') % 2 === 0) objectives.push(d);
    else if (ctx.posture === 'balanced' && d) objectives.push(d);
    // contenders without a prospect (or the seed said no) keep 2 objectives.
  }

  return { season, teamId, posture: ctx.posture, objectives: objectives.slice(0, 3) };
}

// ===========================================================================
// Persistence helpers
// ===========================================================================

export function getStoredObjectives(league: LeagueState): ObjectiveSet | null {
  const set = (league.sportData as ObjectivesSportData | undefined)?.ownerObjectives;
  if (!set || !league.userTeamId) return null;
  if (set.season !== league.currentSeason || set.teamId !== league.userTeamId) return null;
  return set;
}

/** Stored objectives for the current season, or a (non-persisted) preview. */
export function currentObjectives(league: LeagueState): ObjectiveSet | null {
  if (!league.userTeamId) return null;
  return getStoredObjectives(league) ?? generateSeasonObjectives(league, league.userTeamId);
}

/**
 * Freeze this season's objectives onto the save if missing (or set for another
 * team after a takeover). Skipped once the playoffs/offseason begin — those
 * seasons are already decided; old saves start at the next season instead.
 */
export function ensureSeasonObjectives(league: LeagueState): LeagueState {
  if (!league.userTeamId) return league;
  if (league.currentPhase === 'playoffs' || league.currentPhase === 'offseason') return league;
  if (getBracket(league)) return league;
  if (getStoredObjectives(league)) return league;
  const set = generateSeasonObjectives(league, league.userTeamId);
  if (!set) return league;
  return { ...league, sportData: { ...(league.sportData as ObjectivesSportData), ownerObjectives: set } };
}

export function objectiveHistory(league: LeagueState): Record<number, ObjectiveSeasonRecord> {
  return (league.sportData as ObjectivesSportData | undefined)?.ownerObjectiveHistory ?? {};
}

// ===========================================================================
// Measurement
// ===========================================================================

/**
 * Coach dead money for the season (written by the coaching branch under
 * team.sportData.coachDeadMoney). Read defensively — a number, a per-season
 * map, or a list of { season, amount } — and 0 when absent. Counts toward the
 * "stay within budget" objective (a team expense), not the luxury tax.
 */
export function coachDeadMoneyFor(team: BasketballTeam, season: number): number {
  const raw = (team.sportData as { coachDeadMoney?: unknown } | undefined)?.coachDeadMoney;
  if (typeof raw === 'number') return raw;
  if (Array.isArray(raw)) {
    return raw.reduce((s: number, e: unknown) => {
      const x = e as { season?: number; amount?: number };
      return x && x.season === season && typeof x.amount === 'number' ? s + x.amount : s;
    }, 0);
  }
  if (raw && typeof raw === 'object') {
    const v = (raw as Record<string, unknown>)[String(season)];
    return typeof v === 'number' ? v : 0;
  }
  return 0;
}

/** Spend the budget objective measures: cap payroll (incl. player dead cap) + coach dead money. */
function budgetSpend(league: LeagueState, team: BasketballTeam, cap: TeamCapStatus): number {
  return cap.payroll + coachDeadMoneyFor(team, league.currentSeason);
}

function capStatus(league: LeagueState, team: BasketballTeam): TeamCapStatus {
  return basketballTeamCapStatus(rosterOf(league, team), league.currentSeason, teamDeadCap(team, league.currentSeason));
}

/** Series wins + whether the team made the 16-team main bracket / play-in. */
function playoffStanding(league: LeagueState, teamId: TeamId): { inBracket: boolean; inPlayIn: boolean; seriesWon: number } | null {
  const b = getBracket(league);
  if (!b) return null;
  let inBracket = false;
  let seriesWon = 0;
  for (const s of b.rounds.flat()) {
    if (s.teamA === teamId || s.teamB === teamId) inBracket = true;
    if (s.winnerTeamId === teamId) seriesWon++;
  }
  const inPlayIn = (b.playIn ?? []).some(s => s.teamA === teamId || s.teamB === teamId);
  return { inBracket, inPlayIn, seriesWon };
}

function conferenceSeed(league: LeagueState, team: BasketballTeam): number {
  const conf = (team.sportData as { conference?: string }).conference;
  const ranked = (league.teams as BasketballTeam[])
    .filter(t => (t.sportData as { conference?: string }).conference === conf)
    .sort((a, b) => (b.record.wins - a.record.wins) || (a.record.losses - b.record.losses)
      || ((b.record.pointsFor - b.record.pointsAgainst) - (a.record.pointsFor - a.record.pointsAgainst)));
  return ranked.findIndex(t => t.id === team.id) + 1;
}

// ===========================================================================
// Live progress
// ===========================================================================

export function objectiveProgress(league: LeagueState, set: ObjectiveSet): ObjectiveProgress[] {
  const team = league.teams.find(t => t.id === set.teamId) as BasketballTeam | undefined;
  if (!team) return [];
  const { wins, losses } = team.record;
  const gp = wins + losses;
  const remaining = Math.max(0, SEASON_GAMES - gp);
  const pace = gp > 0 ? Math.round((wins / gp) * SEASON_GAMES) : null;
  const po = playoffStanding(league, set.teamId);
  const seed = conferenceSeed(league, team);
  const cap = capStatus(league, team);
  const players = league.players as Record<string, BasketballPlayer>;

  return set.objectives.map(o => {
    switch (o.kind) {
      case 'wins':
      case 'improve': {
        const pct = clamp(wins / o.target, 0, 1);
        if (wins >= o.target) return { objective: o, pct: 1, status: 'met', detail: `${wins}–${losses} · clinched` };
        if (wins + remaining < o.target) return { objective: o, pct, status: 'missed', detail: `${wins}–${losses} · out of reach` };
        const status: ProgressStatus = pace == null ? 'pending' : pace >= o.target ? 'on_track' : pace >= o.target - 4 ? 'at_risk' : 'behind';
        return { objective: o, pct, status, detail: pace == null ? `0 of ${o.target} wins` : `${wins}–${losses} · ${pace}-win pace` };
      }
      case 'playoffs': {
        if (po) {
          return po.inBracket
            ? { objective: o, pct: 1, status: 'met', detail: 'In the playoff field' }
            : { objective: o, pct: po.inPlayIn ? 0.6 : 0.2, status: po.inPlayIn ? 'at_risk' : 'missed', detail: po.inPlayIn ? 'Play-in' : 'Missed the field' };
        }
        const status: ProgressStatus = gp === 0 ? 'pending' : seed <= 6 ? 'on_track' : seed <= 10 ? 'at_risk' : 'behind';
        return { objective: o, pct: clamp((15 - seed) / 9, 0, 1), status, detail: gp === 0 ? 'Season not started' : `#${seed} in the conference` };
      }
      case 'playoff_round': {
        if (po) {
          if (po.seriesWon >= o.target) return { objective: o, pct: 1, status: 'met', detail: `${po.seriesWon} series won` };
          const b = getBracket(league)!;
          const alive = po.inBracket && !b.rounds.flat().some(s => s.winnerTeamId && s.winnerTeamId !== set.teamId && (s.teamA === set.teamId || s.teamB === set.teamId));
          return { objective: o, pct: clamp(po.seriesWon / o.target, 0, 1) * 0.9 + (po.inBracket ? 0.1 : 0), status: alive ? 'at_risk' : 'missed', detail: alive ? `${po.seriesWon} of ${o.target} series won` : po.inBracket ? 'Eliminated' : 'Missed the field' };
        }
        const status: ProgressStatus = gp === 0 ? 'pending' : seed <= 4 ? 'on_track' : seed <= 8 ? 'at_risk' : 'behind';
        return { objective: o, pct: clamp((11 - seed) / 10, 0, 1) * 0.5, status, detail: gp === 0 ? 'Season not started' : `#${seed} seed pace` };
      }
      case 'tax':
      case 'budget': {
        const spend = o.kind === 'budget' ? budgetSpend(league, team, cap) : cap.payroll;
        const under = spend <= o.target;
        const gap = o.target - spend;
        return {
          objective: o,
          pct: under ? 1 : clamp(o.target / spend, 0, 1),
          status: under ? 'on_track' : 'behind',
          detail: under ? `${fmtM(gap)} under` : `${fmtM(-gap)} over`,
        };
      }
      case 'develop': {
        const p = o.playerId ? players[o.playerId] : undefined;
        if (!p) return { objective: o, pct: 0, status: 'missed', detail: 'No longer in the league' };
        const base = o.baseline ?? p.ratings.overall;
        const pct = o.target > base ? clamp((p.ratings.overall - base) / (o.target - base), 0, 1) : 1;
        return { objective: o, pct, status: p.ratings.overall >= o.target ? 'met' : 'pending', detail: `${p.ratings.overall} OVR now · graded after offseason development` };
      }
    }
  });
}

// ===========================================================================
// Season-end grading
// ===========================================================================

export interface GradeOptions {
  /** Post-offseason-development OVR by player id (enterOffseason supplies it).
   *  Without it, develop objectives grade as 'pending'. */
  developedOverall?: Record<string, number>;
}

export function gradeObjectives(league: LeagueState, set: ObjectiveSet, opts: GradeOptions = {}): ObjectiveGrade[] {
  const team = league.teams.find(t => t.id === set.teamId) as BasketballTeam | undefined;
  if (!team) return [];
  const { wins, losses } = team.record;
  const po = playoffStanding(league, set.teamId);
  const cap = capStatus(league, team);
  const players = league.players as Record<string, BasketballPlayer>;
  const g = (o: HoopsObjective, grade: ObjectiveGradeValue, detail: string): ObjectiveGrade =>
    ({ id: o.id, kind: o.kind, description: o.description, grade, detail });

  return set.objectives.map(o => {
    switch (o.kind) {
      case 'wins':
        return g(o, wins >= o.target ? 'met' : wins >= o.target - 4 ? 'partial' : 'missed', `${wins}–${losses}`);
      case 'improve': {
        const base = o.baseline ?? 0;
        return g(o, wins >= o.target ? 'met' : wins > base ? 'partial' : 'missed', `${wins} wins (was ${base})`);
      }
      case 'playoffs':
        return g(o, po?.inBracket ? 'met' : po?.inPlayIn ? 'partial' : 'missed', po?.inBracket ? 'Made the playoffs' : po?.inPlayIn ? 'Lost in the play-in' : 'Missed the playoffs');
      case 'playoff_round': {
        const won = po?.seriesWon ?? 0;
        const grade: ObjectiveGradeValue = won >= o.target ? 'met' : (won > 0 || (o.target === 1 && po?.inBracket)) ? 'partial' : 'missed';
        return g(o, grade, po?.inBracket ? `${won} series won` : 'Missed the playoffs');
      }
      case 'tax':
      case 'budget': {
        const over = (o.kind === 'budget' ? budgetSpend(league, team, cap) : cap.payroll) - o.target;
        const grade: ObjectiveGradeValue = over <= 0 ? 'met' : (o.kind === 'tax' ? over <= 5_000_000 : over <= o.target * 0.05) ? 'partial' : 'missed';
        return g(o, grade, over <= 0 ? `${fmtM(-over)} under` : `${fmtM(over)} over`);
      }
      case 'develop': {
        const p = o.playerId ? players[o.playerId] : undefined;
        if (!p) return g(o, 'missed', 'Left the league');
        const dev = o.playerId ? opts.developedOverall?.[o.playerId] : undefined;
        if (dev == null) return g(o, 'pending', `${p.ratings.overall} OVR — graded after development`);
        const base = o.baseline ?? p.ratings.overall;
        const grade: ObjectiveGradeValue = dev >= o.target ? 'met' : (dev - base >= 3 || o.target - dev <= 2) ? 'partial' : 'missed';
        return g(o, grade, `${base} → ${dev} OVR`);
      }
    }
  });
}

/** Owner-approval swing from a set of grades (see header for the weights). */
export function objectiveApprovalDelta(grades: ObjectiveGrade[]): number {
  const raw = grades.reduce((s, x) => s + OBJECTIVE_POINTS[x.grade], 0);
  return clamp(raw, -OBJECTIVE_APPROVAL_CAP, OBJECTIVE_APPROVAL_CAP);
}

/** Grade the stored objectives for the season just played (empty when none were set). */
export function gradeSeasonObjectives(league: LeagueState, opts: GradeOptions = {}): { set: ObjectiveSet; grades: ObjectiveGrade[] } | null {
  const set = getStoredObjectives(league);
  if (!set) return null;
  return { set, grades: gradeObjectives(league, set, opts) };
}

/** Archive a graded season on sportData (keeps the current set in place). */
export function storeObjectiveGrades(league: LeagueState, set: ObjectiveSet, grades: ObjectiveGrade[], approvalDelta: number): LeagueState {
  const sd = league.sportData as ObjectivesSportData;
  return {
    ...league,
    sportData: {
      ...sd,
      ownerObjectiveHistory: { ...(sd.ownerObjectiveHistory ?? {}), [set.season]: { ...set, grades, approvalDelta } },
    },
  };
}

/** Players whose post-development OVR the grader needs (develop objectives). */
export function developObjectivePlayerIds(league: LeagueState): string[] {
  const set = getStoredObjectives(league);
  return (set?.objectives ?? []).filter(o => o.kind === 'develop' && o.playerId).map(o => o.playerId!);
}

/** Archived grades for `season`, else a live grade of the stored set (the
 *  awards/recap pages render before the offseason rollover archives them). */
export function seasonObjectiveGrades(league: LeagueState, season: number): { grades: ObjectiveGrade[]; delta: number } {
  const archived = objectiveHistory(league)[season];
  if (archived) return { grades: archived.grades, delta: archived.approvalDelta };
  const set = getStoredObjectives(league);
  if (!set || set.season !== season) return { grades: [], delta: 0 };
  const grades = gradeObjectives(league, set);
  return { grades, delta: objectiveApprovalDelta(grades) };
}
