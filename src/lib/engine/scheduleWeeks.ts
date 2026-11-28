/**
 * Week placement for a season's matchups.
 *
 * schedule.ts decides WHO plays whom; this file decides WHEN. It is two steps:
 *
 * 1. `placeMatchupsIntoWeeks` puts every matchup in a week so no team plays
 *    twice in one week. (For 32 teams with 17 games in 18 weeks that leaves
 *    each team exactly one open week, its bye.)
 * 2. `spreadWeeks` then reorders a valid placement so it reads like a real
 *    schedule: byes in weeks 5-14, the two games against a division rival kept
 *    apart, division games spread over the season instead of bunched, and the
 *    last week made up of division games.
 *
 * Both steps only ever move games by swapping two weeks along a chain of teams
 * (a team's week-A game goes to week B, so its week-B opponent's game goes to
 * week A, and so on until the chain closes or reaches a team with a free
 * week). A swap like that can never make a team play twice in a week, so the
 * placement stays valid throughout and step 2 cannot break step 1.
 *
 * Why this replaced the old slotter: it filled weeks greedily in random order
 * and failed whenever a matchup was left over, which was every time (its bye
 * plan put an odd number of teams on bye in most weeks, so somebody always had
 * no opponent). Every 32-team league silently used the non-standard-league
 * fallback instead, and that one schedules division games first: about 80% of
 * them landed in weeks 1-6, often against the same rival in back-to-back weeks.
 */

export interface WeekGame {
  homeTeamId: string;
  awayTeamId: string;
}

function shuffled<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Team-by-week grid of game indexes (-1 = no game that week). */
class Grid {
  readonly teamIndex = new Map<string, number>();
  readonly home: number[];
  readonly away: number[];
  readonly week: number[];
  /** at[team * weeks + week] = game index */
  readonly at: Int32Array;

  constructor(games: WeekGame[], readonly weeks: number) {
    for (const g of games) {
      for (const id of [g.homeTeamId, g.awayTeamId]) {
        if (!this.teamIndex.has(id)) this.teamIndex.set(id, this.teamIndex.size);
      }
    }
    this.home = games.map(g => this.teamIndex.get(g.homeTeamId)!);
    this.away = games.map(g => this.teamIndex.get(g.awayTeamId)!);
    this.week = games.map(() => -1);
    this.at = new Int32Array(this.teamIndex.size * weeks).fill(-1);
  }

  get teamCount(): number { return this.teamIndex.size; }
  game(team: number, week: number): number { return this.at[team * this.weeks + week]; }
  opponent(g: number, team: number): number { return this.home[g] === team ? this.away[g] : this.home[g]; }

  put(g: number, week: number): void {
    this.week[g] = week;
    this.at[this.home[g] * this.weeks + week] = g;
    this.at[this.away[g] * this.weeks + week] = g;
  }
  private lift(g: number): void {
    const w = this.week[g];
    this.at[this.home[g] * this.weeks + w] = -1;
    this.at[this.away[g] * this.weeks + w] = -1;
  }

  /** Games in weeks a/b reachable from `team` by following opponents. */
  chain(team: number, a: number, b: number): { games: number[]; teams: number[] } {
    const games: number[] = [];
    const teams: number[] = [team];
    const seenGame = new Set<number>();
    const seenTeam = new Set<number>([team]);
    for (let i = 0; i < teams.length; i++) {
      for (const w of [a, b]) {
        const g = this.game(teams[i], w);
        if (g < 0 || seenGame.has(g)) continue;
        seenGame.add(g);
        games.push(g);
        const opp = this.opponent(g, teams[i]);
        if (!seenTeam.has(opp)) { seenTeam.add(opp); teams.push(opp); }
      }
    }
    return { games, teams };
  }

  /** Move every listed game from week a to b and from b to a. */
  swap(games: number[], a: number, b: number): void {
    const target = games.map(g => (this.week[g] === a ? b : a));
    for (const g of games) this.lift(g);
    games.forEach((g, i) => this.put(g, target[i]));
  }
}

/**
 * Give every matchup a week (0-based) so no team plays twice in a week.
 * Returns null only if it cannot be done in `weeks` weeks.
 */
export function placeMatchupsIntoWeeks(games: WeekGame[], weeks: number): number[] | null {
  for (let attempt = 0; attempt < 25; attempt++) {
    const grid = new Grid(games, weeks);
    const order = shuffled(games.map((_, i) => i));
    let ok = true;
    for (const g of order) {
      const u = grid.home[g];
      const v = grid.away[g];
      const freeU: number[] = [];
      const freeV: number[] = [];
      for (let w = 0; w < weeks; w++) {
        if (grid.game(u, w) < 0) freeU.push(w);
        if (grid.game(v, w) < 0) freeV.push(w);
      }
      const shared = freeU.filter(w => freeV.includes(w));
      if (shared.length > 0) {
        grid.put(g, shared[Math.floor(Math.random() * shared.length)]);
        continue;
      }
      // No week is open for both. Take a week open for u (a) and one open for
      // v (b), and swap a/b along v's chain: that frees week a for v too,
      // unless the chain runs into u.
      let placed = false;
      for (const a of shuffled(freeU)) {
        for (const b of shuffled(freeV)) {
          const chain = grid.chain(v, a, b);
          if (chain.teams.includes(u)) continue;
          grid.swap(chain.games, a, b);
          grid.put(g, a);
          placed = true;
          break;
        }
        if (placed) break;
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return grid.week.slice();
  }
  return null;
}

export interface SpreadOptions {
  /** True when the two teams are in the same division. */
  sameDivision: (teamAId: string, teamBId: string) => boolean;
  /** First and last week (1-based) a bye may fall in. Default 5-14. */
  byeWindow?: [number, number];
  /** Search effort. Default 6000 swaps (about 30ms for 32 teams). */
  iterations?: number;
}

/**
 * Reorder a valid placement (`weekOf[i]` = 0-based week of `games[i]`) into a
 * natural-looking one. Never makes a team play twice in a week. Returns the new
 * 0-based weeks.
 */
export function spreadWeeks(games: WeekGame[], weekOf: number[], weeks: number, opts: SpreadOptions): number[] {
  if (games.length === 0 || weeks < 2) return weekOf.slice();
  const grid = new Grid(games, weeks);
  games.forEach((_, g) => grid.put(g, weekOf[g]));
  const n = grid.teamCount;
  const isDiv = games.map(g => opts.sameDivision(g.homeTeamId, g.awayTeamId));
  const hasDivGames = new Array<boolean>(n).fill(false);
  games.forEach((_, g) => { if (isDiv[g]) { hasDivGames[grid.home[g]] = true; hasDivGames[grid.away[g]] = true; } });
  const [byeFrom, byeTo] = opts.byeWindow ?? [5, 14];
  const half = Math.floor(weeks / 2);

  /** How unnatural one team's season looks. 0 = nothing to complain about. */
  function teamCost(t: number): number {
    let cost = 0;
    let open = 0;
    let openWeek = -1;
    let divRun = 0;
    let venueRun = 0;
    let lastVenueHome: boolean | null = null;
    let divFirstHalf = 0;
    let divSecondHalf = 0;
    const lastMet = new Map<number, number>();
    for (let w = 0; w < weeks; w++) {
      const g = grid.game(t, w);
      if (g < 0) { open++; openWeek = w; continue; }
      const opp = grid.opponent(g, t);
      // Rematches: never back to back, and preferably a month or more apart.
      const prev = lastMet.get(opp);
      if (prev !== undefined) {
        const gap = w - prev;
        if (gap === 1) cost += 60;
        else if (gap === 2) cost += 16;
        else if (gap === 3) cost += 6;
        else if (gap === 4) cost += 2;
      }
      lastMet.set(opp, w);
      // Division games: two in a row happens, three in a row should not.
      if (isDiv[g]) {
        divRun++;
        if (divRun === 2) cost += 2;
        if (divRun >= 3) cost += 14;
        if (w < half) divFirstHalf++; else divSecondHalf++;
      } else {
        divRun = 0;
      }
      // Three straight home or road games.
      const atHome = grid.home[g] === t;
      venueRun = atHome === lastVenueHome ? venueRun + 1 : 1;
      lastVenueHome = atHome;
      if (venueRun >= 3) cost += 5;
      // The season ends with division games.
      if (w === weeks - 1 && !isDiv[g] && hasDivGames[t]) cost += 20;
    }
    // A single open week is a bye: keep it in the bye window.
    if (open === 1 && (openWeek + 1 < byeFrom || openWeek + 1 > byeTo)) cost += 80;
    // Division games in both halves of the season.
    if (hasDivGames[t]) {
      if (divFirstHalf < 2) cost += (2 - divFirstHalf) * 8;
      if (divSecondHalf < 2) cost += (2 - divSecondHalf) * 8;
    }
    return cost;
  }

  /** No more than 6 teams off in any one week. */
  function byeCrowding(): number {
    let cost = 0;
    for (let w = 0; w < weeks; w++) {
      let open = 0;
      for (let t = 0; t < n; t++) if (grid.game(t, w) < 0) open++;
      if (open > 6 && open < n) cost += (open - 6) * 20;
    }
    return cost;
  }

  const costs = Array.from({ length: n }, (_, t) => teamCost(t));
  let crowd = byeCrowding();
  const iterations = opts.iterations ?? 6000;
  const allTeams = Array.from({ length: n }, (_, t) => t);

  for (let i = 0; i < iterations; i++) {
    const a = Math.floor(Math.random() * weeks);
    let b = Math.floor(Math.random() * (weeks - 1));
    if (b >= a) b++;
    // Mostly one chain of teams; sometimes the two whole weeks.
    let moved: { games: number[]; teams: number[] };
    if (Math.random() < 0.12) {
      const gs: number[] = [];
      grid.week.forEach((w, g) => { if (w === a || w === b) gs.push(g); });
      moved = { games: gs, teams: allTeams };
    } else {
      moved = grid.chain(Math.floor(Math.random() * n), a, b);
    }
    if (moved.games.length === 0) continue;

    let before = crowd;
    for (const t of moved.teams) before += costs[t];
    grid.swap(moved.games, a, b);
    const nextCosts = moved.teams.map(t => teamCost(t));
    const nextCrowd = byeCrowding();
    let after = nextCrowd;
    for (const c of nextCosts) after += c;

    // Cooling: early on accept some swaps that make things slightly worse so
    // the search does not get stuck; by the end only improvements.
    const temperature = 6 * (1 - i / iterations) ** 2;
    const delta = after - before;
    if (delta <= 0 || (temperature > 0.05 && Math.random() < Math.exp(-delta / temperature))) {
      moved.teams.forEach((t, k) => { costs[t] = nextCosts[k]; });
      crowd = nextCrowd;
    } else {
      grid.swap(moved.games, a, b);
    }
  }
  return grid.week.slice();
}
