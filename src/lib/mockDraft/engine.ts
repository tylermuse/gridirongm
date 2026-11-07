/**
 * Pure /mock-draft engine: no React, no store, no league state.
 *
 * A mock is fully described by (seed, rounds, user teams, user picks). Every
 * screen, share link and OG image gets its picks by replaying that state with
 * replayDraft, so there is exactly one code path and undo is just "replay with
 * one fewer user pick".
 */

import { ROSTER_LIMITS, type Position } from '@/types';
import { chooseDraftPick, type DraftAIProspect, type DraftAITeamContext } from '@/lib/engine/draftAI';
import { gradeValue, pickGrade, teamDraftGrade } from '@/lib/engine/draftGrades';

/* ─── Data file shape (public/mock/nfl-2027.json) ───────────── */

export interface MockTeam {
  tid: number;
  abbrev: string;
  region: string;
  name: string;
  colors: string[];
  /** Team logo from the roster file, the same one the game shows. Empty if the file has none. */
  imgURL?: string;
  cid: number;
  did: number;
  won: number;
  lost: number;
  tied: number;
  pf: number;
  pa: number;
  sos: number;
  countByPosition: Record<Position, number>;
  bestQbOvr: number;
  hasDevQB: boolean;
  /** Mean OVR of the team's starters at each position (scripts/build_mock_draft.py STARTERS). Display only. */
  starterOvr?: Record<Position, number>;
}

export interface MockOrderEntry {
  pick: number;
  round: number;
  pickInRound: number;
  /** Current owner of the pick. */
  tid: number;
  originalTid: number;
  dpid: number;
}

export interface MockProspect {
  pid: number;
  rank: number;
  firstName: string;
  lastName: string;
  pos: Position;
  college: string;
  ovr: number;
  pot: number;
  value: number;
  age: number;
  /** Inches. */
  hgt: number;
  weight: number;
  imgURL?: string;
}

export interface MockDraftData {
  draftYear: number;
  season: number;
  asOf: string;
  currentWeek: number;
  numRounds: number;
  teams: MockTeam[];
  order: MockOrderEntry[];
  prospects: MockProspect[];
}

/* ─── Settings ──────────────────────────────────────────────── */

export const ROUND_OPTIONS = [1, 3, 7] as const;
export type MockRounds = (typeof ROUND_OPTIONS)[number];

export const BOARD_POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'];

export interface DraftSettings {
  /** 32-bit seed for the AI's noise. */
  seed: number;
  rounds: MockRounds;
  /** Teams the user drafts for, in the order they were chosen. Empty = all AI. */
  userTids: number[];
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 4294967296);
}

/** Same LCG as tests/unit/mockDraftData.test.ts. Integer math only, so it is identical in every browser. */
export function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

export function slotsForRounds(data: MockDraftData, rounds: number): MockOrderEntry[] {
  return data.order.filter((slot) => slot.round <= rounds);
}

/* ─── Replay ────────────────────────────────────────────────── */

export interface MadePick {
  slot: MockOrderEntry;
  prospect: MockProspect;
  isUser: boolean;
  grade: string;
}

export interface ReplayResult {
  /** Every pick made so far. Stops at the first user slot with no pick yet. */
  picks: MadePick[];
  /** The user slot waiting on a pick, or null once the draft is complete. */
  onClock: MockOrderEntry | null;
  complete: boolean;
  /** Undrafted prospects at the stopping point, in rank order. */
  available: MockProspect[];
  /** Live position counts per team at the stopping point. */
  countsByTeam: Map<number, Record<Position, number>>;
  /** A user pick was not on the board, or there were more user picks than user slots. */
  invalid: boolean;
}

/**
 * Grade one pick. Always pass the full 7-round pick count: pickGrade derives the
 * round from `totalPicks / 7`, so passing a 1-round draft's 32 would read pick 6
 * as round 2. It grades `value`, not `ovr`: pickGrade's expectations (pick 1 ~82,
 * pick 32 ~67) are for a draft-eve class, while this class is mostly 50-60 OVR a
 * year out. On `ovr`, taking the best player available in round 1 grades C or D.
 */
export function gradePick(data: MockDraftData, pick: number, prospect: MockProspect): string {
  return pickGrade(pick, data.order.length, prospect.value, prospect.pot);
}

/** Letter grade for a set of picks, or null if there are none. */
export function classGrade(picks: MadePick[]): string | null {
  if (picks.length === 0) return null;
  return teamDraftGrade(picks.reduce((sum, p) => sum + gradeValue(p.grade), 0) / picks.length);
}

export function replayDraft(data: MockDraftData, settings: DraftSettings, userPicks: number[]): ReplayResult {
  const rng = seededRng(settings.seed);
  const userTids = new Set(settings.userTids);
  const prospectsById = new Map(data.prospects.map((p) => [p.pid, p]));
  const contexts = new Map<number, DraftAITeamContext>(
    data.teams.map((t) => [
      t.tid,
      { countByPosition: { ...t.countByPosition }, bestQbOvr: t.bestQbOvr, hasDevQB: t.hasDevQB },
    ]),
  );

  let aiBoard: DraftAIProspect[] = data.prospects.map((p) => ({
    id: String(p.pid),
    position: p.pos,
    overall: p.ovr,
    potential: p.pot,
    // Without boardScore the AI ranks on current OVR, which is noise for a pre-draft class.
    boardScore: p.value * 15,
  }));

  const picks: MadePick[] = [];
  let userPicksUsed = 0;
  let onClock: MockOrderEntry | null = null;
  let invalid = false;

  for (const slot of slotsForRounds(data, settings.rounds)) {
    const team = contexts.get(slot.tid);
    if (!team) {
      invalid = true;
      break;
    }
    const isUser = userTids.has(slot.tid);
    let pid: number | undefined;
    if (isUser) {
      if (userPicksUsed >= userPicks.length) {
        onClock = slot;
        break;
      }
      pid = userPicks[userPicksUsed++];
    } else {
      // TODO(consensus): pass a hand-curated round-1 list as mockPlayerId. The AI takes
      // ~8 QBs in round 1 because of its QB-need logic; real drafts take 3-5.
      const id = chooseDraftPick({ overallPick: slot.pick, available: aiBoard, team, rng });
      pid = id === undefined ? undefined : Number(id);
    }

    const prospect = pid === undefined ? undefined : prospectsById.get(pid);
    const boardIndex = prospect ? aiBoard.findIndex((p) => p.id === String(prospect.pid)) : -1;
    if (!prospect || boardIndex < 0) {
      invalid = true;
      break;
    }
    aiBoard = aiBoard.filter((_, i) => i !== boardIndex);
    team.countByPosition[prospect.pos] = (team.countByPosition[prospect.pos] ?? 0) + 1;
    picks.push({ slot, prospect, isUser, grade: gradePick(data, slot.pick, prospect) });
  }

  if (!onClock && userPicksUsed < userPicks.length) invalid = true;

  const taken = new Set(picks.map((p) => p.prospect.pid));
  return {
    picks,
    onClock,
    complete: !onClock && !invalid,
    available: data.prospects.filter((p) => !taken.has(p.pid)),
    countsByTeam: new Map([...contexts].map(([tid, ctx]) => [tid, ctx.countByPosition])),
    invalid,
  };
}

/**
 * Positions the team is short at. K and P never show: the data file caps every
 * count at max-1 so the AI's roster-max penalty stays quiet, which makes K and
 * P read 0 for all 32 teams whether or not they have a specialist.
 */
export function teamNeeds(counts: Record<Position, number>): Position[] {
  return BOARD_POSITIONS.filter((pos) => pos !== 'K' && pos !== 'P' && (counts[pos] ?? 0) < ROSTER_LIMITS[pos].min);
}

/* ─── Share URL ─────────────────────────────────────────────── */

/**
 * Short hash of everything that changes a replay or a grade. The weekly refresh
 * can keep every pid and still move the order, which would silently change an
 * old link's results, so "are the pids still there" is not enough of a check.
 */
export function dataFingerprint(data: MockDraftData): string {
  const source = JSON.stringify([
    data.order.map((o) => [o.pick, o.tid]),
    data.teams.map((t) => [t.tid, t.countByPosition, t.bestQbOvr, t.hasDevQB]),
    data.prospects.map((p) => [p.pid, p.pos, p.ovr, p.pot, p.value]),
  ]);
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function isAllTeams(data: MockDraftData, userTids: number[]): boolean {
  return userTids.length === data.teams.length;
}

/** The query string for a finished mock. Built by hand so `,` stays readable. */
export function encodeShareQuery(data: MockDraftData, settings: DraftSettings, userPicks: number[]): string {
  const parts = [`s=${settings.seed.toString(36)}`, `r=${settings.rounds}`];
  if (settings.userTids.length > 0) {
    parts.push(`t=${isAllTeams(data, settings.userTids) ? 'all' : settings.userTids.join(',')}`);
  }
  if (userPicks.length > 0) parts.push(`p=${userPicks.map((pid) => pid.toString(36)).join('.')}`);
  parts.push(`d=${dataFingerprint(data)}`);
  return parts.join('&');
}

export type ShareState =
  | { kind: 'none' }
  /** A share link we can't reproduce. `hint` carries whatever still applies to the setup screen. */
  | { kind: 'stale'; hint: { rounds?: MockRounds; userTids: number[] } }
  | { kind: 'ok'; settings: DraftSettings; userPicks: number[]; replay: ReplayResult };

function parseRounds(raw: string | null): MockRounds | undefined {
  return ROUND_OPTIONS.find((r) => String(r) === raw);
}

function parseTeams(data: MockDraftData, raw: string | null): number[] | null {
  if (!raw) return [];
  if (raw === 'all') return data.teams.map((t) => t.tid);
  const valid = new Set(data.teams.map((t) => t.tid));
  const tids = raw.split(',').map((part) => (/^\d+$/.test(part) ? Number(part) : NaN));
  if (tids.some((tid) => !valid.has(tid)) || new Set(tids).size !== tids.length) return null;
  return tids;
}

function parseSeed(raw: string | null): number | null {
  if (!raw || !/^[0-9a-z]{1,7}$/.test(raw)) return null;
  const seed = parseInt(raw, 36);
  return seed < 4294967296 ? seed : null;
}

function parsePicks(raw: string | null): number[] | null {
  if (!raw) return [];
  const parts = raw.split('.');
  if (parts.some((part) => !/^[0-9a-z]{1,6}$/.test(part))) return null;
  return parts.map((part) => parseInt(part, 36));
}

export function parseShareQuery(data: MockDraftData, params: URLSearchParams): ShareState {
  if (!params.has('s')) return { kind: 'none' };

  const rounds = parseRounds(params.get('r'));
  const userTids = parseTeams(data, params.get('t'));
  const stale: ShareState = { kind: 'stale', hint: { rounds, userTids: userTids ?? [] } };

  const seed = parseSeed(params.get('s'));
  const userPicks = parsePicks(params.get('p'));
  if (seed === null || !rounds || !userTids || !userPicks) return stale;
  if (params.get('d') !== dataFingerprint(data)) return stale;

  const settings: DraftSettings = { seed, rounds, userTids };
  const replay = replayDraft(data, settings, userPicks);
  // A share link is always a finished draft.
  return replay.complete ? { kind: 'ok', settings, userPicks, replay } : stale;
}

/* ─── Display helpers ───────────────────────────────────────── */

export function heightLabel(inches: number): string {
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

export function recordLabel(team: Pick<MockTeam, 'won' | 'lost' | 'tied'>): string {
  return team.tied > 0 ? `${team.won}-${team.lost}-${team.tied}` : `${team.won}-${team.lost}`;
}

/** `asOf` is a bare date, which JS parses as UTC midnight. Format in UTC or US visitors see the day before. */
export function asOfLabel(asOf: string): string {
  return new Date(`${asOf}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export type ProspectTier = 'Blue-chip' | '1st-round' | 'Day 2' | 'Day 3';

/** Cut so the tiers roughly match the draft: 37 prospects are 75+ pot, 107 are 65+. */
export function prospectTier(pot: number): ProspectTier {
  if (pot >= 80) return 'Blue-chip';
  if (pot >= 75) return '1st-round';
  if (pot >= 65) return 'Day 2';
  return 'Day 3';
}

/* ─── Team pages (/mock-draft/2027/[team]) ──────────────────── */

/**
 * URL slug for a team page: the nickname, lowercased (`bears`, `49ers`). Search
 * traffic is "bears mock draft", not "chi mock draft". The 32 nicknames are
 * unique; a test guards that. The same slug is the tool's `?team=` preselect.
 */
export function teamSlug(team: Pick<MockTeam, 'name'>): string {
  return team.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function findTeamBySlug(data: MockDraftData, slug: string): MockTeam | undefined {
  const wanted = slug.toLowerCase();
  return data.teams.find((t) => teamSlug(t) === wanted);
}

/**
 * The `?team=bears` preselect from a team page's CTA. A team with no 1st-round
 * pick (it was traded) starts at 3 rounds, or setup would open with it greyed out.
 */
export function parseTeamPreselect(
  data: MockDraftData,
  params: URLSearchParams,
): { userTids: number[]; rounds: MockRounds } | null {
  const raw = params.get('team');
  const team = raw ? findTeamBySlug(data, raw) : undefined;
  if (!team) return null;
  const hasFirst = data.order.some((slot) => slot.round === 1 && slot.tid === team.tid);
  return { userTids: [team.tid], rounds: hasFirst ? 1 : 3 };
}

export type NeedReason = 'qb' | 'below-min' | 'weak' | 'thin';

export interface TeamNeed {
  pos: Position;
  reason: NeedReason;
  /** Starters' average OVR ('qb', 'weak'), or players on the roster ('below-min', 'thin'). */
  value: number;
  /** What it falls short of: 75 OVR, the roster minimum, or the league median count. 'weak' has none. */
  bar: number;
  /** League rank of the starters at this position, 1 = best. Absent when the data file has no starterOvr. */
  rank?: number;
}

/** QB under this OVR, with no young high-potential QB behind him, reads as a need. Matches the AI's "priority" range. */
export const QB_NEED_OVR = 75;
/** Starters ranked this low or worse (of 32) at a position make it a need. Bottom quarter of the league. */
export const WEAK_RANK = 25;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** League rank (1 = best) of the team's starters at pos, or undefined without starterOvr in the data. */
export function starterRank(data: MockDraftData, team: MockTeam, pos: Position): number | undefined {
  const mine = team.starterOvr?.[pos];
  if (mine === undefined) return undefined;
  return 1 + data.teams.filter((t) => (t.starterOvr?.[pos] ?? -Infinity) > mine).length;
}

/**
 * Where the team is weak, most pressing first. teamNeeds only flags a position
 * under the roster minimum, which is 2 of 32 teams mid-season, so this also
 * counts quality and depth:
 *   - qb: best QB under 75 OVR with no young high-potential QB developing
 *   - below-min: fewer players than the roster minimum
 *   - weak: starters rank in the league's bottom quarter (starterOvr)
 *   - thin: fewer players than the league median
 * Pass the live counts from a mock in progress and a position the team has
 * drafted at counts as addressed. K and P stay out (see teamNeeds).
 */
export function teamDraftNeeds(
  data: MockDraftData,
  team: MockTeam,
  liveCounts: Record<Position, number> = team.countByPosition,
): TeamNeed[] {
  const addressed = (pos: Position) => (liveCounts[pos] ?? 0) > (team.countByPosition[pos] ?? 0);
  const qb: TeamNeed[] = [];
  const belowMin: TeamNeed[] = [];
  const weak: TeamNeed[] = [];
  const thin: TeamNeed[] = [];

  for (const pos of BOARD_POSITIONS) {
    if (pos === 'K' || pos === 'P') continue;
    const count = liveCounts[pos] ?? 0;
    const rank = starterRank(data, team, pos);
    if (count < ROSTER_LIMITS[pos].min) {
      belowMin.push({ pos, reason: 'below-min', value: count, bar: ROSTER_LIMITS[pos].min, rank });
      continue;
    }
    if (addressed(pos)) continue;
    if (pos === 'QB') {
      if (team.hasDevQB) continue;
      if (team.bestQbOvr < QB_NEED_OVR) {
        qb.push({ pos, reason: 'qb', value: team.bestQbOvr, bar: QB_NEED_OVR, rank });
        continue;
      }
    }
    if (rank !== undefined && rank >= WEAK_RANK) {
      weak.push({ pos, reason: 'weak', value: team.starterOvr?.[pos] ?? 0, bar: 0, rank });
      continue;
    }
    const leagueMedian = median(data.teams.map((t) => t.countByPosition[pos] ?? 0));
    if (pos !== 'QB' && count < leagueMedian) thin.push({ pos, reason: 'thin', value: count, bar: leagueMedian, rank });
  }

  weak.sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0));
  return [...qb, ...belowMin, ...weak, ...thin];
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

/** One-line reason for a need, e.g. "OL: starters average 60.2 OVR, 29th of 32". */
export function needLabel(need: TeamNeed, teamCount = 32): string {
  const ranked = need.rank !== undefined ? `, ${ordinal(need.rank)} of ${teamCount}` : '';
  switch (need.reason) {
    case 'qb':
      return `QB: best QB is ${need.value} OVR${ranked}, with no young passer developing behind him`;
    case 'below-min':
      return `${need.pos}: only ${need.value} on the roster, under the minimum of ${need.bar}`;
    case 'weak':
      return `${need.pos}: starters average ${need.value} OVR${ranked}`;
    case 'thin':
      return `${need.pos}: ${need.value} on the roster, fewer than most teams (${need.bar})`;
  }
}

/**
 * The fixed all-AI 7-round mock the team pages show. One replay for all 32
 * pages, so no prospect goes to two teams. It changes whenever the weekly data
 * refresh does, and the tool can replay it from encodeShareQuery.
 */
export const HOUSE_MOCK_SETTINGS: DraftSettings = { seed: 2027, rounds: 7, userTids: [] };

export function houseMock(data: MockDraftData): ReplayResult {
  return replayDraft(data, HOUSE_MOCK_SETTINGS, []);
}

/* ─── Handing a mock to the game ────────────────────────────── */

/**
 * The game's startAtMockDraft input for a finished mock: every slot of the
 * 7-round order (so later rounds follow the mock's order too), with the mock's
 * pick on each slot it made. Structurally the store's MockDraftStartPlan; it's
 * redeclared rather than imported so this file never pulls in the game store.
 */
export function draftStartPlan(
  data: MockDraftData,
  replay: Pick<ReplayResult, 'picks'>,
): { draftYear: number; slots: { round: number; originalTid: number; tid: number; pid?: number }[] } {
  const pidByPick = new Map(replay.picks.map((p) => [p.slot.pick, p.prospect.pid]));
  return {
    draftYear: data.draftYear,
    slots: data.order.map((slot) => ({
      round: slot.round,
      originalTid: slot.originalTid,
      tid: slot.tid,
      ...(pidByPick.has(slot.pick) ? { pid: pidByPick.get(slot.pick) } : {}),
    })),
  };
}

/* ─── Scout panel (public/mock/scout-2027.json) ─────────────── */

/** Researched from public reporting (scripts/data/mock_scout_profiles_2027.json). */
export interface ScoutProfile {
  college: string | null;
  classYear: string | null;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  nflComp: string | null;
  stats2025: string | null;
  honors: string | null;
  notes: string | null;
  sources: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface ScoutEntry {
  /** FBGM ratings, 0-100, zeros dropped. */
  ratings: Partial<Record<RatingKey, number>>;
  skills: string[];
  profile?: ScoutProfile;
}

export interface ScoutData {
  asOf: string;
  /** When the written profiles were compiled (a bare date). */
  researchedAt: string | null;
  prospects: Record<string, ScoutEntry>;
}

export type RatingKey =
  | 'stre' | 'spd' | 'endu' | 'thv' | 'thp' | 'tha' | 'bsc' | 'elu' | 'rtr' | 'hnd'
  | 'rbk' | 'pbk' | 'pcv' | 'tck' | 'prs' | 'rns' | 'kpw' | 'kac' | 'ppw' | 'pac';

export const RATING_LABELS: Record<RatingKey, string> = {
  stre: 'Strength',
  spd: 'Speed',
  endu: 'Endurance',
  thv: 'Vision',
  thp: 'Arm strength',
  tha: 'Accuracy',
  bsc: 'Ball security',
  elu: 'Elusiveness',
  rtr: 'Route running',
  hnd: 'Hands',
  rbk: 'Run blocking',
  pbk: 'Pass blocking',
  pcv: 'Coverage',
  tck: 'Tackling',
  prs: 'Pass rush',
  rns: 'Run defense',
  kpw: 'Kick power',
  kac: 'Kick accuracy',
  ppw: 'Punt power',
  pac: 'Punt accuracy',
};

/** The ratings that matter for each position, most important first. */
export const POSITION_RATINGS: Record<Position, RatingKey[]> = {
  QB: ['tha', 'thp', 'thv', 'elu', 'spd'],
  RB: ['spd', 'elu', 'bsc', 'stre', 'hnd'],
  WR: ['rtr', 'hnd', 'spd', 'elu', 'stre'],
  TE: ['hnd', 'rtr', 'rbk', 'stre', 'spd'],
  OL: ['pbk', 'rbk', 'stre', 'endu'],
  DL: ['prs', 'rns', 'stre', 'spd', 'tck'],
  LB: ['tck', 'rns', 'pcv', 'prs', 'spd'],
  CB: ['pcv', 'spd', 'tck', 'hnd', 'elu'],
  S: ['pcv', 'tck', 'spd', 'rns', 'hnd'],
  K: ['kpw', 'kac'],
  P: ['ppw', 'pac'],
};

/** FBGM skill tags, spelled out. */
export const SKILL_LABELS: Record<string, string> = {
  Pa: 'Accurate passer',
  Pd: 'Deep passer',
  Ps: 'Smart passer',
  A: 'Athlete',
  X: 'Explosive runner',
  H: 'Sure hands',
  Bp: 'Pass blocker',
  Br: 'Run blocker',
  PR: 'Pass rusher',
  RS: 'Run stopper',
  L: 'Lockdown coverage',
};

/** Starters ranked this high or better (of 32) make the prospect a luxury pick. */
export const STRONG_RANK = 8;

/**
 * How a prospect fits the team on the clock, in one line. Judged on the
 * team's starters rather than its headcount: the data file caps every count
 * just under the roster max, so most teams look "full" everywhere.
 */
export function scoutFit(
  data: MockDraftData,
  team: MockTeam,
  prospect: MockProspect,
  liveCounts: Record<Position, number> = team.countByPosition,
): { fit: 'need' | 'depth' | 'luxury'; text: string } {
  const need = teamDraftNeeds(data, team, liveCounts).find((n) => n.pos === prospect.pos);
  if (need) return { fit: 'need', text: `Fills a ${team.abbrev} need. ${needLabel(need, data.teams.length)}.` };
  const rank = starterRank(data, team, prospect.pos);
  const ranked = rank !== undefined ? `${team.abbrev}'s ${prospect.pos} starters rank ${ordinal(rank)} of ${data.teams.length}` : '';
  if (rank !== undefined && rank <= STRONG_RANK) {
    return { fit: 'luxury', text: `A luxury pick: ${ranked}.` };
  }
  return { fit: 'depth', text: ranked ? `Not a pressing need: ${ranked}.` : `Not a pressing ${team.abbrev} need.` };
}
