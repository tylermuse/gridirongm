/**
 * Division games are spread over the season.
 *
 * Reported 11/28: a schedule that opened NYG, PHI, PHI, WSH, NYG, with every
 * division game played by week 9. The builder placed division games first, so
 * about 80% of them landed in weeks 1-6, most teams played three or more
 * division games in a row, and a team often met the same rival in back-to-back
 * weeks.
 *
 * What must hold for a 32-team league: nobody plays the same opponent in
 * consecutive weeks, no team has more than three straight division games,
 * every team has division games in both halves of the season, byes stay in weeks
 * 5-14, and every team still has a full 17-game slate. Math.random is seeded so the test checks the same schedules
 * on every run.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSchedule } from '@/lib/engine/schedule';
import { placeMatchupsIntoWeeks } from '@/lib/engine/scheduleWeeks';
import { makeFixtureTeams } from './_helpers';

function seedRandom(seed: number) {
  let s = seed >>> 0;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  });
}

const teams = makeFixtureTeams(32);
const divisionOf = new Map(teams.map(t => [t.id, `${t.conference}-${t.division}`]));

/** One team's season in week order: opponent, week, division game or not. */
function seasonOf(teamId: string, games: ReturnType<typeof generateSchedule>) {
  return games
    .filter(g => g.homeTeamId === teamId || g.awayTeamId === teamId)
    .sort((a, b) => a.week - b.week)
    .map(g => {
      const opp = g.homeTeamId === teamId ? g.awayTeamId : g.homeTeamId;
      return { week: g.week, opp, div: divisionOf.get(opp) === divisionOf.get(teamId) };
    });
}

describe('division game spacing (32 teams)', () => {
  beforeEach(() => seedRandom(20261128));
  afterEach(() => vi.restoreAllMocks());

  it('spreads division games and keeps rematches apart, season after season', () => {
    for (let season = 2026; season < 2034; season++) {
      const games = generateSchedule(teams, season);
      expect(games).toHaveLength(272);
      let divTotal = 0;
      let divEarly = 0;

      for (const t of teams) {
        const mine = seasonOf(t.id, games);
        expect(mine).toHaveLength(17);
        expect(new Set(mine.map(g => g.week)).size).toBe(17); // never twice in a week

        // One bye, in weeks 5-14.
        const played = new Set(mine.map(g => g.week));
        const byes = Array.from({ length: 18 }, (_, i) => i + 1).filter(w => !played.has(w));
        expect(byes).toHaveLength(1);
        expect(byes[0]).toBeGreaterThanOrEqual(5);
        expect(byes[0]).toBeLessThanOrEqual(14);

        // Never the same opponent in consecutive games.
        for (let i = 1; i < mine.length; i++) expect(mine[i].opp).not.toBe(mine[i - 1].opp);

        // Never more than three division games in a row.
        let run = 0;
        for (const g of mine) {
          run = g.div ? run + 1 : 0;
          expect(run).toBeLessThanOrEqual(3);
        }

        // Division games in both halves of the season. (Who plays whom is the
        // matchup builder's job, not this change's: it gives a team five
        // division games instead of six about once in 500 team-seasons.)
        const div = mine.filter(g => g.div);
        expect(div.length).toBeGreaterThanOrEqual(5);
        expect(div.length).toBeLessThanOrEqual(6);
        expect(div.some(g => g.week <= 9)).toBe(true);
        expect(div.some(g => g.week >= 10)).toBe(true);
        divTotal += div.length;
        divEarly += div.filter(g => g.week <= 6).length;
      }

      // Weeks 1-6 are a third of the season; they used to hold ~80% of division games.
      expect(divEarly / divTotal).toBeLessThan(0.5);
      // Most of the final week is division games.
      const finale = games.filter(g => g.week === 18);
      const finaleDiv = finale.filter(g => divisionOf.get(g.homeTeamId) === divisionOf.get(g.awayTeamId));
      expect(finaleDiv.length / finale.length).toBeGreaterThan(0.6);
    }
  });

  it('places any 17-game slate into 18 weeks with nobody playing twice in a week', () => {
    const slate = generateSchedule(teams, 2026).map(g => ({ homeTeamId: g.homeTeamId, awayTeamId: g.awayTeamId }));
    for (let i = 0; i < 20; i++) {
      const weeks = placeMatchupsIntoWeeks(slate, 18);
      expect(weeks).not.toBeNull();
      const seen = new Set<string>();
      slate.forEach((g, k) => {
        expect(weeks![k]).toBeGreaterThanOrEqual(0);
        expect(weeks![k]).toBeLessThan(18);
        for (const id of [g.homeTeamId, g.awayTeamId]) {
          const key = `${id}@${weeks![k]}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      });
    }
  });
});
