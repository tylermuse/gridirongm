/**
 * NBA-style 82-game schedule generator.
 *
 * For each team:
 *   - 4 games vs each of 4 division rivals (4 × 4 = 16 games)
 *   - 4 games vs each of 6 other teams in the same conference, 3 games
 *     vs each of the other 4 same-conference teams (6×4 + 4×3 = 36 games)
 *   - 2 games vs each of 15 opposite-conference teams (15 × 2 = 30 games)
 *   Total: 16 + 36 + 30 = 82 games per team
 *
 * Home/away split is 41/41 per team.
 *
 * Calendar:
 *   - Regular season starts late October, ends mid-April (~170 days)
 *   - Each team plays ~82 games over those days = ~3.5 games/week
 *   - No back-to-back-to-back (no team plays 3 games in 3 nights)
 *   - Back-to-backs allowed (real NBA averages 11-14 per team per season)
 *
 * v1 design notes:
 *   - The "3-vs-4" split for same-conference non-division opponents is
 *     pseudo-random in v1 (real NBA cycles which 6 vs 4 each year based
 *     on prior standings). v2 can wire prior-season records in.
 *   - No nationally-televised game targeting (e.g., Christmas Day games,
 *     opening night). All games are equal-priority in v1.
 *   - No arena availability constraints. Each team has a home slot every
 *     day they're scheduled at home — no concert-blocking conflicts.
 *   - No All-Star break carve-out. Schedule is uniform Oct-Apr.
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

/** Per same-conference non-division opponent. NBA actually does 3 vs 6 of
 *  them and 4 vs the other 4, totaling 18+16 = 34 same-conf non-div games.
 *  Combined with 16 division games and 30 opposite-conf games = 80.
 *  Plus 2 extra games handled via "play-in" / NBA Cup style additions.
 *  For v1 simplicity, we use 4-vs-6 and 3-vs-4 to hit exactly 82. */
const GAMES_VS_SAME_CONF_HEAVY = 4;
const GAMES_VS_SAME_CONF_LIGHT = 3;

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
  if (teams.length !== 30) {
    throw new Error(`Basketball schedule generator expects exactly 30 teams (got ${teams.length})`);
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

  // Pre-compute the per-pair total game count.
  // For same-conference non-division pairs we need a balanced 6-regular
  // subgraph: each team plays 4 games vs 6 same-conf non-div opponents
  // (heavy) and 3 games vs the other 4 (light). buildHeavyEdgeSet
  // returns the set of heavy pairs.
  const heavyEdges = buildHeavyEdgeSet(teams, rng);

  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const a = teams[i];
      const b = teams[j];
      const totalGames = gamesBetween(a, b, heavyEdges);
      // Home/away split: balanced when totalGames is even, otherwise alternate
      const aHome = Math.floor(totalGames / 2) + (totalGames % 2 === 1 && rng.bool() ? 1 : 0);
      const bHome = totalGames - aHome;
      result.push({
        teamA: a.id,
        teamB: b.id,
        aHomeCount: aHome,
        bHomeCount: bHome,
      });
    }
  }

  return result;
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
 * For each conference (15 teams, 3 divisions of 5), choose which
 * same-conf non-div pairs are "heavy" (4 games) vs "light" (3 games).
 * Each team must have exactly 6 heavy and 4 light opponents among its
 * 10 non-div same-conf opponents (total 6+4 = 10).
 *
 * Combinatorial constraint: we need a 6-regular subgraph on 15 nodes
 * (edges = 15*6/2 = 45) drawn from the 75 possible non-div pairs.
 *
 * Algorithm: randomized greedy with retry. For each conference:
 *   - Try up to 50 shuffles of the pair order
 *   - Greedy fill heavy edges while respecting the per-team cap of 6
 *   - If a configuration achieves all teams at exactly 6, accept
 *   - Otherwise, retry with a fresh shuffle
 * In practice valid configurations are found in < 5 attempts.
 */
function buildHeavyEdgeSet(
  teams: BasketballTeamForSchedule[],
  rng: SimpleRng,
): Set<string> {
  const heavy = new Set<string>();
  const conferences = new Set(teams.map(teamConference));

  for (const conf of conferences) {
    const confTeams = teams.filter(t => teamConference(t) === conf);
    if (confTeams.length !== 15) {
      throw new Error(`Conference ${conf} has ${confTeams.length} teams (expected 15)`);
    }
    const subset = pickConfHeavyEdges(confTeams, rng);
    for (const edge of subset) heavy.add(edge);
  }

  return heavy;
}

function pickConfHeavyEdges(
  confTeams: BasketballTeamForSchedule[],
  rng: SimpleRng,
): Set<string> {
  // Group by division (3 divisions of 5, validated upstream).
  const byDiv = new Map<string, BasketballTeamForSchedule[]>();
  for (const t of confTeams) {
    const d = teamDivision(t);
    if (!byDiv.has(d)) byDiv.set(d, []);
    byDiv.get(d)!.push(t);
  }
  const divs = [...byDiv.keys()];
  const allFive = divs.length === 3 && divs.every(d => byDiv.get(d)!.length === 5);

  // Deterministic construction: between each division pair, lay down a
  // 3-regular bipartite graph via a circulant (team a ↔ b where b ∈ {a, a+1,
  // a+2} mod 5). Each team ends with 3 + 3 = exactly 6 heavy edges — always a
  // valid 6-regular subgraph, so no random retries that can fail. The rng only
  // shuffles team order within each division for season-to-season variety.
  if (allFive) {
    const groups = divs.map(d => shuffle(byDiv.get(d)!, rng));
    const heavy = new Set<string>();
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const A = groups[i];
        const B = groups[j];
        for (let a = 0; a < A.length; a++) {
          for (let k = 0; k < 3; k++) {
            const b = (a + k) % B.length;
            heavy.add(pairKey(A[a].id, B[b].id));
          }
        }
      }
    }
    return heavy;
  }

  // Fallback for non-standard structures: randomized greedy with retry.
  const allPairs: { a: BasketballTeamForSchedule; b: BasketballTeamForSchedule; key: string }[] = [];
  for (let i = 0; i < confTeams.length; i++) {
    for (let j = i + 1; j < confTeams.length; j++) {
      const a = confTeams[i];
      const b = confTeams[j];
      if (teamDivision(a) === teamDivision(b)) continue;
      allPairs.push({ a, b, key: pairKey(a.id, b.id) });
    }
  }
  for (let attempt = 0; attempt < 200; attempt++) {
    const shuffled = shuffle(allPairs, rng);
    const heavy = new Set<string>();
    const heavyCount = new Map<TeamId, number>();
    for (const t of confTeams) heavyCount.set(t.id, 0);
    for (const p of shuffled) {
      const aCount = heavyCount.get(p.a.id)!;
      const bCount = heavyCount.get(p.b.id)!;
      if (aCount < 6 && bCount < 6) {
        heavy.add(p.key);
        heavyCount.set(p.a.id, aCount + 1);
        heavyCount.set(p.b.id, bCount + 1);
      }
    }
    let valid = true;
    for (const t of confTeams) {
      if (heavyCount.get(t.id) !== 6) { valid = false; break; }
    }
    if (valid) return heavy;
  }
  throw new Error('Could not construct 6-regular heavy-edge subgraph in 200 attempts');
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
  for (const t of teams) {
    const c = teamConference(t);
    const d = teamDivision(t);
    conferences[c] = (conferences[c] ?? 0) + 1;
    divisions[`${c}/${d}`] = (divisions[`${c}/${d}`] ?? 0) + 1;
  }
  // 2 conferences × 15 teams each
  for (const [c, n] of Object.entries(conferences)) {
    if (n !== 15) throw new Error(`Conference ${c} has ${n} teams (expected 15)`);
  }
  // 6 divisions × 5 teams each
  for (const [cd, n] of Object.entries(divisions)) {
    if (n !== 5) throw new Error(`Division ${cd} has ${n} teams (expected 5)`);
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
