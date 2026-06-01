/**
 * Team leaders + league-rank context (2.3 / 2.0): per-category team leaders are
 * real roster players and team-stat ranks are dense 1..30 with the right
 * direction (Opp PPG ranks ascending — lower is better).
 */
import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simThroughDay } from '@/../apps/bs-basketball/src/lib/sim/simRange';
import { teamLeaders, teamStatRanks } from '@/../apps/bs-basketball/src/lib/dashboard/leaders';
import type { BasketballTeam } from '@bs/sport-basketball';

describe('team leaders + rank context', () => {
  it('derives category leaders and bounded ranks', () => {
    const fresh = createNewBasketballLeague({ rngSeed: 'leaders' });
    const league = simThroughDay(fresh, 40).league;
    const team = league.teams[0] as BasketballTeam;

    const leaders = teamLeaders(league, team);
    expect(leaders.map(l => l.category)).toEqual(['Points', 'Rebounds', 'Assists', 'Defense']);
    for (const l of leaders) {
      expect(team.playerIds).toContain(l.player.id);
      expect(l.value).toBeGreaterThan(0);
      expect(l.meta).toMatch(/Age \d+ · OVR \d+ · POT \d+/);
    }

    const ranks = teamStatRanks(league, team);
    for (const r of [ranks.ppg, ranks.oppPpg, ranks.diff]) {
      expect(r.of).toBe(league.teams.length);
      expect(r.rank).toBeGreaterThanOrEqual(1);
      expect(r.rank).toBeLessThanOrEqual(r.of);
    }

    // The #1 PPG team in the league ranks 1st.
    const top = (league.teams as BasketballTeam[]).reduce((a, b) => {
      const ga = a.record.wins + a.record.losses, gb = b.record.wins + b.record.losses;
      return (a.record.pointsFor / Math.max(1, ga)) >= (b.record.pointsFor / Math.max(1, gb)) ? a : b;
    });
    expect(teamStatRanks(league, top).ppg.rank).toBe(1);
  });
});
