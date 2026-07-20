/**
 * Regression: non-32-team leagues (historical era rosters + expansion) must
 * produce a valid schedule instead of throwing.
 *
 * Root cause (yo46363, Jul 2026): the Montana 1994 (28 teams, 2-3 team
 * divisions) and Greatest Show on Turf 1999 (31 teams, odd) rosters imported
 * fine, but generateScheduleFallback hard-required every team to hit exactly
 * 17 games with 6 division games each. Odd counts can't be paired every week
 * and small divisions can't reach 6 division games, so it threw "Unable to
 * generate schedule". newLeague swallowed that in a try/catch and silently
 * generated a fictional stock league ("Dallas Wranglers" / "Minnesota Frost"),
 * which is what users saw. This locks in that the schedule generator handles
 * arbitrary team counts and division layouts without throwing.
 */
import { describe, it, expect } from 'vitest';
import { generateSchedule } from '@/lib/engine/schedule';
import type { Team, GameResult } from '@/types';

const CONFS = ['AC', 'NC'] as const;
const DIVS = ['North', 'South', 'East', 'West'] as const;

function makeTeams(n: number): Team[] {
  const teams: Team[] = [];
  for (let i = 0; i < n; i++) {
    teams.push({
      id: `team-${i}`,
      city: `City ${i}`,
      name: `Team ${i}`,
      abbreviation: `T${i}`,
      conference: CONFS[i % 2],
      division: DIVS[Math.floor(i / 2) % 4],
    } as unknown as Team);
  }
  return teams;
}

function tally(schedule: GameResult[], teams: Team[]) {
  const games = new Map<string, number>(teams.map((t) => [t.id, 0]));
  const home = new Map<string, number>(teams.map((t) => [t.id, 0]));
  const opponents = new Map<string, string[]>(teams.map((t) => [t.id, []]));
  const weeks = new Set<number>();
  for (const g of schedule) {
    weeks.add(g.week);
    expect(g.homeTeamId).not.toBe(g.awayTeamId);
    games.set(g.homeTeamId, (games.get(g.homeTeamId) ?? 0) + 1);
    games.set(g.awayTeamId, (games.get(g.awayTeamId) ?? 0) + 1);
    home.set(g.homeTeamId, (home.get(g.homeTeamId) ?? 0) + 1);
    opponents.get(g.homeTeamId)!.push(g.awayTeamId);
    opponents.get(g.awayTeamId)!.push(g.homeTeamId);
  }
  return { games, home, opponents, weeks };
}

function assertNoDoubleBooking(schedule: GameResult[]): void {
  const perWeek = new Map<number, Set<string>>();
  for (const g of schedule) {
    if (!perWeek.has(g.week)) perWeek.set(g.week, new Set());
    const seen = perWeek.get(g.week)!;
    expect(seen.has(g.homeTeamId)).toBe(false);
    expect(seen.has(g.awayTeamId)).toBe(false);
    seen.add(g.homeTeamId);
    seen.add(g.awayTeamId);
  }
}

describe('generateSchedule — non-standard league sizes', () => {
  // 28 = Montana 1994, 31 = GSoT 1999, plus even/odd + expansion sizes.
  for (const n of [28, 29, 30, 31, 33, 34]) {
    it(`builds a valid schedule for ${n} teams without throwing`, () => {
      const teams = makeTeams(n);
      const target = Math.min(17, n - 1);

      let schedule: GameResult[] = [];
      expect(() => { schedule = generateSchedule(teams, 1994); }).not.toThrow();
      expect(schedule.length).toBeGreaterThan(0);

      const { games, home, opponents } = tally(schedule, teams);

      // No team is double-booked in a single week.
      assertNoDoubleBooking(schedule);

      for (const t of teams) {
        const gp = games.get(t.id) ?? 0;
        // Each team plays the target, or target-1 if it drew the odd bye.
        expect(gp).toBeGreaterThanOrEqual(target - 1);
        expect(gp).toBeLessThanOrEqual(target);

        const opps = opponents.get(t.id) ?? [];
        expect(opps).not.toContain(t.id); // never plays itself
        // Whichever builder runs, no opponent is faced more than twice
        // (the greedy builder schedules home-and-away division rivals).
        const counts = new Map<string, number>();
        for (const o of opps) counts.set(o, (counts.get(o) ?? 0) + 1);
        for (const c of counts.values()) expect(c).toBeLessThanOrEqual(2);

        // Home/away roughly balanced.
        const h = home.get(t.id) ?? 0;
        expect(Math.abs(h - (gp - h))).toBeLessThanOrEqual(4);
      }

      // At least one team hits the full target (sanity on round count).
      expect([...games.values()].some((g) => g === target)).toBe(true);
    });
  }

  it('32-team leagues schedule cleanly (17 games/team)', () => {
    // Note: these synthetic teams carry no prior-season record, so the
    // NFL-style generator (which seeds on prior finish) may hand off to the
    // round-robin fallback. Either path must give every team 17 games over a
    // standard-length season without throwing. The NFL path itself is
    // unchanged by this fix and is exercised in production by the 32-team
    // 2007/2026 rosters.
    const teams = makeTeams(32);
    let schedule: GameResult[] = [];
    expect(() => { schedule = generateSchedule(teams, 2026); }).not.toThrow();
    const { games, weeks } = tally(schedule, teams);
    for (const t of teams) expect(games.get(t.id)).toBe(17);
    const maxWeek = Math.max(...weeks);
    expect(maxWeek).toBeGreaterThanOrEqual(17);
    expect(maxWeek).toBeLessThanOrEqual(18);
  });
});
