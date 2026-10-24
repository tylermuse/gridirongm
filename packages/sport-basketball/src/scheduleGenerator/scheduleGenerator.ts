/**
 * NBA-style 82-game schedule generator — generalized to 30, 31 or 32 teams.
 *
 * League shape: two conferences of 15 or 16 teams, each split into three
 * divisions of 5 or 6 (a 16-team conference is 6/5/5).
 *
 * Matchup formula (per team T in a conference of size C, own division size D,
 * opposite conference size O):
 *   - 2 games vs each opposite-conference team            → 2·O
 *   - in-conference budget B = 82 − 2·O, spread over the C−1 conference rivals,
 *     each played 3 ("light") or 4 ("heavy") times:
 *       heavy rivals H = B − 3·(C−1); every division rival is heavy (D−1 of
 *       them), so T plays 4 games vs H−(D−1) non-division rivals and 3 vs the
 *       rest.
 *
 *   30 teams (15/15, divisions 5/5/5):        O=15 → 30 cross, B=52, H=10:
 *       4×4 div + 6×4 + 4×3 non-div + 15×2 = 82            (classic layout)
 *   31 teams (15 + 16, the 16 is 6/5/5):
 *       15-team conf: O=16 → 32 cross, B=50, H=8 → 4×4 div + 4×4 + 6×3 = 50
 *       16-team conf: O=15 → 30 cross, B=52, H=7 →
 *         6-team div: 5×4 div + 2×4 + 8×3 = 52;  5-team div: 4×4 + 3×4 + 8×3 = 52
 *   32 teams (16/16, each 6/5/5): O=16 → 32 cross, B=50, H=5 →
 *         6-team div: 5×4 div + 0×4 + 10×3 = 50; 5-team div: 4×4 + 1×4 + 10×3 = 50
 *
 * The non-division heavy pairs form a degree-constrained subgraph inside each
 * conference (a circulant construction for all-5 divisions, a randomized
 * Havel–Hakimi fill otherwise).
 *
 * Home/away: every 2- or 4-game pair splits evenly. The odd (3-game) pairs leave
 * one "extra" game each; every team has an even number of them (82 is even and
 * every other pair is even), so the extra-game graph is Eulerian and orienting
 * it along closed trails gives each team exactly half — 41 home / 41 away.
 *
 * Calendar:
 *   - Regular season starts late October, ends mid-April (~170 days)
 *   - Each team plays ~82 games over those days = ~3.5 games/week
 *   - No back-to-back-to-back (no team plays 3 games in 3 nights)
 *   - Back-to-backs allowed (real NBA averages 11-14 per team per season)
 *
 * v1 design notes:
 *   - Which non-division rivals are "heavy" is pseudo-random per season (real
 *     NBA cycles them on prior standings).
 *   - No nationally-televised game targeting, arena constraints, or All-Star
 *     break carve-out. Schedule is uniform Oct-Apr.
 */

import type { BaseGameResult, TeamId, GameId, CompetitionId, BaseTeam } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '../types';

export type BasketballTeamForSchedule = BaseTeam<BasketballRatings, BasketballStats>;

// ===========================================================================
// Constants
// ===========================================================================

/** Games per opponent. */
const GAMES_VS_DIVISION_RIVAL = 4;
const GAMES_VS_OPPOSITE_CONFERENCE = 2;

/** Per same-conference non-division opponent: "heavy" rivals 4 games, "light"
 *  rivals 3 (see the header formula for how many of each). */
const GAMES_VS_SAME_CONF_HEAVY = 4;
const GAMES_VS_SAME_CONF_LIGHT = 3;

/** Regular-season games per team. */
const GAMES_PER_TEAM = 82;

/** Supported league sizes. */
export const MIN_BASKETBALL_TEAMS = 30;
export const MAX_BASKETBALL_TEAMS = 32;

/** Calendar: ~170 days. Real NBA season opens mid-October, ends mid-April. */
const SEASON_DAYS = 170;

// ===========================================================================
// Public API
// ===========================================================================

export interface ScheduleGenOptions {
  /** Year of the regular season (2026 = 2026-27 NBA season). */
  season: number;
  /** Season opening date (ISO YYYY-MM-DD). Default: October 22 of season year. */
  seasonStart?: string;
  /** Total games per team. Default 82. Pass smaller numbers for shortened
   *  test scenarios. */
  gamesPerTeam?: number;
  /** RNG seed for reproducible scheduling. */
  rngSeed?: string;
}

export function generateBasketballSchedule(
  teams: BasketballTeamForSchedule[],
  opts: ScheduleGenOptions,
): BaseGameResult<BasketballStats>[] {
  if (teams.length < MIN_BASKETBALL_TEAMS || teams.length > MAX_BASKETBALL_TEAMS) {
    throw new Error(`Basketball schedule generator expects 30-32 teams (got ${teams.length})`);
  }
  validateConferenceStructure(teams);

  const rng = makeSimpleRng(opts.rngSeed ?? `bball-schedule-${opts.season}`);

  // Step 1: build the matchup table — for each pair of teams, how many
  // total games + which team is home for how many.
  const matchups = buildMatchupCounts(teams, rng);

  // Step 2: turn matchups into specific (home, away) games (no dates yet).
  const allGames = matchupsToGames(matchups);

  // Step 3: assign dates over the season calendar, respecting:
  //   - No team plays twice on the same day
  //   - No team plays 3 games in 3 nights (B2B allowed, B2B2B forbidden)
  //   - Games spread roughly evenly across the calendar
  const seasonStart = opts.seasonStart ?? `${opts.season}-10-22`;
  const scheduled = assignDates(allGames, teams, seasonStart, rng);

  // Step 4: wrap into BaseGameResult shape
  return scheduled.map((g, idx) => ({
    id: `${opts.season}-bball-g${idx + 1}` as GameId,
    season: opts.season,
    competitionId: 'primary' as CompetitionId,
    date: g.date,
    homeTeamId: g.homeTeamId,
    awayTeamId: g.awayTeamId,
    status: 'scheduled' as const,
    finalScore: null,
    boxScores: {},
    sportData: { dayOfSeason: g.dayOfSeason },
  }));
}

// ===========================================================================
// Step 1: matchup counts
// ===========================================================================

interface MatchupCount {
  teamA: TeamId;
  teamB: TeamId;
  /** Games where A is home. */
  aHomeCount: number;
  /** Games where B is home. */
  bHomeCount: number;
}

function buildMatchupCounts(
  teams: BasketballTeamForSchedule[],
  rng: SimpleRng,
): MatchupCount[] {
  const result: MatchupCount[] = [];

  // Which same-conference non-division pairs are "heavy" (4 games) vs "light"
  // (3). buildHeavyEdgeSet returns the set of heavy pairs.
  const heavyEdges = buildHeavyEdgeSet(teams, rng);

  // Odd-count pairs leave one "extra" game whose host is decided by the
  // Eulerian orientation below (so every team lands on exactly 41 home games).
  const oddPairs: { idx: number; a: TeamId; b: TeamId }[] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const a = teams[i];
      const b = teams[j];
      const totalGames = gamesBetween(a, b, heavyEdges);
      const half = Math.floor(totalGames / 2);
      if (totalGames % 2 === 1) oddPairs.push({ idx: result.length, a: a.id, b: b.id });
      result.push({ teamA: a.id, teamB: b.id, aHomeCount: half, bHomeCount: half });
    }
  }

  for (const { idx, homeIsA } of orientExtraGames(oddPairs, rng)) {
    if (homeIsA) result[idx].aHomeCount += 1;
    else result[idx].bHomeCount += 1;
  }

  return result;
}

/**
 * Orient the extra games so each team hosts exactly half of its own extras.
 * Every vertex has even degree (see the header), so walking closed trails and
 * orienting edges along the walk gives in-degree === out-degree everywhere.
 */
function orientExtraGames(
  pairs: { idx: number; a: TeamId; b: TeamId }[],
  rng: SimpleRng,
): { idx: number; homeIsA: boolean }[] {
  const adj = new Map<TeamId, number[]>(); // team → indices into `pairs`
  for (let e = 0; e < pairs.length; e++) {
    for (const t of [pairs[e].a, pairs[e].b]) {
      if (!adj.has(t)) adj.set(t, []);
      adj.get(t)!.push(e);
    }
  }
  for (const [t, list] of adj) adj.set(t, shuffle(list, rng));
  const used = new Array<boolean>(pairs.length).fill(false);
  const out: { idx: number; homeIsA: boolean }[] = [];
  const nextUnused = (t: TeamId): number => {
    const list = adj.get(t)!;
    while (list.length && used[list[list.length - 1]]) list.pop();
    return list.length ? list[list.length - 1] : -1;
  };
  for (const start of shuffle([...adj.keys()], rng)) {
    while (nextUnused(start) !== -1) {
      let cur = start;
      for (;;) {
        const e = nextUnused(cur);
        if (e === -1) break; // even degrees → only ever stuck back at `start`
        used[e] = true;
        const p = pairs[e];
        // Travel cur → other: `cur` is the away side, `other` hosts.
        const other = p.a === cur ? p.b : p.a;
        out.push({ idx: p.idx, homeIsA: p.a === other });
        cur = other;
      }
    }
  }
  return out;
}

function gamesBetween(
  a: BasketballTeamForSchedule,
  b: BasketballTeamForSchedule,
  heavyEdges: Set<string>,
): number {
  const aConf = teamConference(a);
  const bConf = teamConference(b);
  const aDiv = teamDivision(a);
  const bDiv = teamDivision(b);

  if (aConf !== bConf) return GAMES_VS_OPPOSITE_CONFERENCE;
  if (aDiv === bDiv) return GAMES_VS_DIVISION_RIVAL;
  return heavyEdges.has(pairKey(a.id, b.id)) ? GAMES_VS_SAME_CONF_HEAVY : GAMES_VS_SAME_CONF_LIGHT;
}

/** Canonical pair key (sorted team IDs joined by '~'). */
function pairKey(a: TeamId, b: TeamId): string {
  return a < b ? `${a}~${b}` : `${b}~${a}`;
}

/**
 * For each conference choose which same-conf non-div pairs are "heavy" (4
 * games). Each team needs exactly `target` heavy non-division rivals (from the
 * header formula — it can differ by division size in a 16-team conference).
 */
function buildHeavyEdgeSet(
  teams: BasketballTeamForSchedule[],
  rng: SimpleRng,
): Set<string> {
  const heavy = new Set<string>();
  const conferences = [...new Set(teams.map(teamConference))];

  for (const conf of conferences) {
    const confTeams = teams.filter(t => teamConference(t) === conf);
    const opposite = teams.length - confTeams.length;
    const budget = GAMES_PER_TEAM - GAMES_VS_OPPOSITE_CONFERENCE * opposite;
    const heavyRivals = (budget - GAMES_VS_SAME_CONF_LIGHT * (confTeams.length - 1))
      / (GAMES_VS_SAME_CONF_HEAVY - GAMES_VS_SAME_CONF_LIGHT);
    const target = new Map<TeamId, number>();
    for (const t of confTeams) {
      const divSize = confTeams.filter(o => teamDivision(o) === teamDivision(t)).length;
      const need = heavyRivals - (divSize - 1);
      const nonDivOpponents = confTeams.length - divSize;
      if (need < 0 || need > nonDivOpponents) {
        throw new Error(`Conference ${conf}: no ${GAMES_PER_TEAM}-game layout for a ${divSize}-team division (need ${need} heavy of ${nonDivOpponents})`);
      }
      target.set(t.id, need);
    }
    const subset = pickConfHeavyEdges(confTeams, target, rng);
    for (const edge of subset) heavy.add(edge);
  }

  return heavy;
}

function pickConfHeavyEdges(
  confTeams: BasketballTeamForSchedule[],
  target: Map<TeamId, number>,
  rng: SimpleRng,
): Set<string> {
  const byDiv = new Map<string, BasketballTeamForSchedule[]>();
  for (const t of confTeams) {
    const d = teamDivision(t);
    if (!byDiv.has(d)) byDiv.set(d, []);
    byDiv.get(d)!.push(t);
  }
  const divs = [...byDiv.keys()];
  const allFive = divs.length === 3 && divs.every(d => byDiv.get(d)!.length === 5);
  const targets = new Set(target.values());
  const perTeam = [...targets][0] ?? 0;

  // Deterministic construction for 3×5 conferences with a uniform even target:
  // between each division pair lay down a (target/2)-regular bipartite graph via
  // a circulant (team a ↔ b where b ∈ {a, …, a+target/2−1} mod 5). A 30-team
  // league uses target 6 (3 per division pair — the classic layout); a 15-team
  // conference in a 31-team league uses 4. The rng only shuffles team order
  // within each division for season-to-season variety.
  if (allFive && targets.size === 1 && perTeam % 2 === 0 && perTeam / 2 <= 5) {
    const span = perTeam / 2;
    const groups = divs.map(d => shuffle(byDiv.get(d)!, rng));
    const heavy = new Set<string>();
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const A = groups[i];
        const B = groups[j];
        for (let a = 0; a < A.length; a++) {
          for (let k = 0; k < span; k++) {
            const b = (a + k) % B.length;
            heavy.add(pairKey(A[a].id, B[b].id));
          }
        }
      }
    }
    return heavy;
  }

  // General structures (6/5/5 divisions, mixed targets): randomized
  // Havel–Hakimi — repeatedly satisfy the neediest team by linking it to the
  // neediest eligible (other-division) rivals. Retries on the rare dead end.
  const total = [...target.values()].reduce((s, n) => s + n, 0);
  if (total % 2 !== 0) throw new Error('Heavy-edge targets have an odd sum — no valid layout');
  for (let attempt = 0; attempt < 500; attempt++) {
    const remaining = new Map(target);
    const heavy = new Set<string>();
    const order = shuffle(confTeams, rng);
    let ok = true;
    for (;;) {
      let pickT: BasketballTeamForSchedule | null = null;
      for (const t of order) {
        const r = remaining.get(t.id)!;
        if (r > 0 && (!pickT || r > remaining.get(pickT.id)!)) pickT = t;
      }
      if (!pickT) break;
      const cur = pickT;
      const need = remaining.get(cur.id)!;
      const candidates = shuffle(order, rng)
        .filter(o => o.id !== cur.id
          && teamDivision(o) !== teamDivision(cur)
          && remaining.get(o.id)! > 0
          && !heavy.has(pairKey(cur.id, o.id)))
        .sort((x, y) => remaining.get(y.id)! - remaining.get(x.id)!);
      if (candidates.length < need) { ok = false; break; }
      for (const o of candidates.slice(0, need)) {
        heavy.add(pairKey(cur.id, o.id));
        remaining.set(o.id, remaining.get(o.id)! - 1);
      }
      remaining.set(cur.id, 0);
    }
    if (ok) return heavy;
  }
  throw new Error('Could not construct the heavy-edge subgraph in 500 attempts');
}

// ===========================================================================
// Step 2: matchups → flat game list
// ===========================================================================

interface UnscheduledGame {
  homeTeamId: TeamId;
  awayTeamId: TeamId;
}

function matchupsToGames(matchups: MatchupCount[]): UnscheduledGame[] {
  const games: UnscheduledGame[] = [];
  for (const m of matchups) {
    for (let k = 0; k < m.aHomeCount; k++) {
      games.push({ homeTeamId: m.teamA, awayTeamId: m.teamB });
    }
    for (let k = 0; k < m.bHomeCount; k++) {
      games.push({ homeTeamId: m.teamB, awayTeamId: m.teamA });
    }
  }
  return games;
}

// ===========================================================================
// Step 3: date assignment
// ===========================================================================

interface ScheduledGame {
  homeTeamId: TeamId;
  awayTeamId: TeamId;
  /** ISO date string. */
  date: string;
  /** Day number within the season (0 = opening day). */
  dayOfSeason: number;
}

function assignDates(
  games: UnscheduledGame[],
  teams: BasketballTeamForSchedule[],
  seasonStart: string,
  rng: SimpleRng,
): ScheduledGame[] {
  // Track per-team "days played" for spreading + B2B2B prevention
  const daysByTeam = new Map<TeamId, number[]>();
  for (const t of teams) daysByTeam.set(t.id, []);

  // Shuffle games so order doesn't bias scheduling
  const shuffled = shuffle(games, rng);
  const scheduled: ScheduledGame[] = [];

  for (const g of shuffled) {
    const day = findValidDay(
      daysByTeam.get(g.homeTeamId)!,
      daysByTeam.get(g.awayTeamId)!,
      SEASON_DAYS,
      rng,
    );
    daysByTeam.get(g.homeTeamId)!.push(day);
    daysByTeam.get(g.awayTeamId)!.push(day);
    scheduled.push({
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      date: addDaysIso(seasonStart, day),
      // 1-indexed so day-of-season runs 1..170. (The calendar `date` above
      // stays 0-based off seasonStart, so opening night is still seasonStart.)
      // This keeps the sim-runner's "next scheduled day > 0" scan from
      // silently skipping opening-night games.
      dayOfSeason: day + 1,
    });
  }

  return scheduled;
}

/** Find a day in [0, maxDay) where neither team is already scheduled AND
 *  no B2B2B is created for either team. Full-enumerates rather than
 *  random-sampling so we never miss a valid clean day when one exists. */
function findValidDay(
  homeDays: number[],
  awayDays: number[],
  maxDay: number,
  rng: SimpleRng,
): number {
  // Pass 1: collect every day where the strict constraint holds (no B2B2B)
  const cleanDays: number[] = [];
  for (let day = 0; day < maxDay; day++) {
    if (isDayValid(day, homeDays, awayDays, /* allowB2B2B */ false)) {
      cleanDays.push(day);
    }
  }
  if (cleanDays.length > 0) {
    // Pick a random clean day — randomization spreads load across the season
    return cleanDays[rng.int(cleanDays.length)];
  }
  // Pass 2: allow B2B2B. Should be rare with a healthy 170-day calendar
  // but better than failing outright.
  const fallbackDays: number[] = [];
  for (let day = 0; day < maxDay; day++) {
    if (isDayValid(day, homeDays, awayDays, /* allowB2B2B */ true)) {
      fallbackDays.push(day);
    }
  }
  if (fallbackDays.length > 0) {
    return fallbackDays[rng.int(fallbackDays.length)];
  }
  throw new Error(`Could not find any valid day for scheduling (maxDay=${maxDay})`);
}

function isDayValid(
  day: number,
  homeDays: number[],
  awayDays: number[],
  allowB2B2B: boolean,
): boolean {
  // Neither team can already be scheduled on this day
  if (homeDays.includes(day) || awayDays.includes(day)) return false;
  if (allowB2B2B) return true;
  // B2B2B check: if a team already plays day-1 AND day-2, adding a game on
  // day would create a B2B2B. Same for day+1, day+2.
  for (const teamDays of [homeDays, awayDays]) {
    if (createsThreeInThree(day, teamDays)) return false;
  }
  return true;
}

function createsThreeInThree(day: number, existingDays: number[]): boolean {
  // Check if `day` plus 2 of `existingDays` forms a 3-game-in-3-night cluster
  const window = existingDays.filter(d => Math.abs(d - day) <= 2);
  if (window.length < 2) return false;
  // Find any pair in window such that {day, d1, d2} spans exactly 3 days
  // and includes all 3 of those consecutive days
  for (let i = 0; i < window.length; i++) {
    for (let j = i + 1; j < window.length; j++) {
      const trio = [day, window[i], window[j]].sort((x, y) => x - y);
      if (trio[2] - trio[0] === 2 && trio[1] - trio[0] === 1) return true;
    }
  }
  return false;
}

function addDaysIso(start: string, days: number): string {
  const d = new Date(start + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ===========================================================================
// Conference / division helpers — read from team.sportData
// ===========================================================================

function teamConference(team: BasketballTeamForSchedule): string {
  const sd = team.sportData as { conference?: string } | undefined;
  if (!sd?.conference) {
    throw new Error(`Team ${team.id} missing sportData.conference (need 'Eastern' or 'Western')`);
  }
  return sd.conference;
}

function teamDivision(team: BasketballTeamForSchedule): string {
  const sd = team.sportData as { division?: string } | undefined;
  if (!sd?.division) {
    throw new Error(`Team ${team.id} missing sportData.division (need 'Atlantic' | 'Central' | ...)`);
  }
  return sd.division;
}

function validateConferenceStructure(teams: BasketballTeamForSchedule[]): void {
  const conferences: Record<string, number> = {};
  const divisions: Record<string, number> = {};
  const divsPerConf: Record<string, Set<string>> = {};
  for (const t of teams) {
    const c = teamConference(t);
    const d = teamDivision(t);
    conferences[c] = (conferences[c] ?? 0) + 1;
    divisions[`${c}/${d}`] = (divisions[`${c}/${d}`] ?? 0) + 1;
    (divsPerConf[c] ??= new Set()).add(d);
  }
  if (Object.keys(conferences).length !== 2) {
    throw new Error(`Expected 2 conferences (got ${Object.keys(conferences).length})`);
  }
  // 2 conferences × 15 or 16 teams, 3 divisions each
  for (const [c, n] of Object.entries(conferences)) {
    if (n !== 15 && n !== 16) throw new Error(`Conference ${c} has ${n} teams (expected 15 or 16)`);
    if (divsPerConf[c].size !== 3) throw new Error(`Conference ${c} has ${divsPerConf[c].size} divisions (expected 3)`);
  }
  // Divisions of 5 (one may be 6 inside a 16-team conference)
  for (const [cd, n] of Object.entries(divisions)) {
    if (n !== 5 && n !== 6) throw new Error(`Division ${cd} has ${n} teams (expected 5 or 6)`);
  }
}

// ===========================================================================
// Tiny seeded RNG (avoiding the sim's createRng to keep schedule
// generation self-contained; same algorithm)
// ===========================================================================

interface SimpleRng {
  int(n: number): number;
  bool(): boolean;
  pick<T>(arr: readonly T[]): T;
}

function makeSimpleRng(seed: string): SimpleRng {
  let s = hashString(seed);
  function next(): number {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    int(n: number): number {
      return Math.floor(next() * n);
    },
    bool(): boolean {
      return next() < 0.5;
    },
    pick<T>(arr: readonly T[]): T {
      return arr[Math.floor(next() * arr.length)];
    },
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffle<T>(arr: T[], rng: SimpleRng): T[] {
  const result = arr.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
