/**
 * Schedule generator integration test.
 *
 * Why this is the first test:
 *   - generateSchedule() is a pure function (no store, no React, no IndexedDB)
 *     so it isolates whether the Vitest infrastructure itself works without
 *     dragging in all the heavier engine dependencies.
 *   - The schedule is structurally tight — 32 teams, 17 games each, no
 *     double-bookings, byes in weeks 5-14 — so regressions are easy to catch
 *     with simple assertions.
 *   - Phase 2 will move schedule.ts into @bs/sport-football. This test
 *     becomes the safety net that proves the move didn't break it.
 *
 * If this test passes:
 *   ✓ Vitest config loads correctly
 *   ✓ The `@/` path alias resolves
 *   ✓ TypeScript engine code compiles in the Vitest pipeline
 *   ✓ Imports from src/lib/engine/ work
 *
 * Then the heavier tests (season-loop, draft, trade, free-agency, save-load)
 * can pattern-match this and add their own concerns on top.
 */

import { describe, it, expect } from 'vitest';
import { generateSchedule } from '@/lib/engine/schedule';
import { makeFixtureTeams, countGamesPerTeam, gamesByWeek } from './_helpers';

describe('generateSchedule', () => {
  it('produces an 18-week, 17-game-per-team schedule for 32 teams', () => {
    const teams = makeFixtureTeams(32);
    const games = generateSchedule(teams, 2026);

    // Every team plays 17 games (1 bye)
    const gameCounts = countGamesPerTeam(games);
    for (const team of teams) {
      expect(gameCounts[team.id]).toBe(17);
    }

    // 32 teams × 17 games / 2 (each game counts for 2 teams) = 272 total games
    expect(games.length).toBe(272);
  });

  it('schedules games across exactly 18 weeks', () => {
    const teams = makeFixtureTeams(32);
    const games = generateSchedule(teams, 2026);
    const byWeek = gamesByWeek(games);
    const weeks = Object.keys(byWeek).map(Number).sort((a, b) => a - b);

    expect(weeks[0]).toBe(1);
    expect(weeks[weeks.length - 1]).toBe(18);
    // All weeks 1-18 should have at least one game
    for (let w = 1; w <= 18; w++) {
      expect(byWeek[w]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('gives every team exactly one bye, spread across multiple weeks', () => {
    const teams = makeFixtureTeams(32);
    const games = generateSchedule(teams, 2026);
    const byWeek = gamesByWeek(games);

    // Count byes per team by inverting the games-per-week lookup
    const byesPerTeam: Record<string, number> = Object.fromEntries(teams.map(t => [t.id, 0]));
    const weeksWithByes = new Set<number>();
    for (let w = 1; w <= 18; w++) {
      const teamsThatWeek = new Set<string>();
      for (const g of byWeek[w] ?? []) {
        teamsThatWeek.add(g.homeTeamId);
        teamsThatWeek.add(g.awayTeamId);
      }
      for (const t of teams) {
        if (!teamsThatWeek.has(t.id)) {
          byesPerTeam[t.id]++;
          weeksWithByes.add(w);
        }
      }
    }
    // Every team has exactly one bye
    for (const team of teams) {
      expect(byesPerTeam[team.id], `team ${team.id} has ${byesPerTeam[team.id]} byes`).toBe(1);
    }
    // Byes are spread across the season, not stacked into a single week.
    // (The NFL-style scheduler aims for weeks 5-14, the fallback uses a
    // wider range — either is acceptable here. Catching "all byes in one
    // week" is the real regression risk.)
    expect(weeksWithByes.size).toBeGreaterThanOrEqual(4);
  });

  it('does not schedule a team twice in the same week', () => {
    const teams = makeFixtureTeams(32);
    const games = generateSchedule(teams, 2026);
    const byWeek = gamesByWeek(games);

    for (const [weekStr, weekGames] of Object.entries(byWeek)) {
      const seen = new Map<string, number>();
      for (const g of weekGames) {
        seen.set(g.homeTeamId, (seen.get(g.homeTeamId) ?? 0) + 1);
        seen.set(g.awayTeamId, (seen.get(g.awayTeamId) ?? 0) + 1);
      }
      for (const [teamId, count] of seen) {
        expect(count, `Team ${teamId} scheduled ${count}x in week ${weekStr}`).toBe(1);
      }
    }
  });

  it('stamps every game with the correct season', () => {
    const teams = makeFixtureTeams(32);
    const games = generateSchedule(teams, 2026);
    for (const g of games) {
      expect(g.season).toBe(2026);
    }
  });

  it('produces all games in "unplayed" state with zero scores', () => {
    const teams = makeFixtureTeams(32);
    const games = generateSchedule(teams, 2026);
    for (const g of games) {
      expect(g.played).toBe(false);
      expect(g.homeScore).toBe(0);
      expect(g.awayScore).toBe(0);
    }
  });
});
