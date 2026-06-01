/**
 * Depth chart + roster roles (#21): each position lists its players starter-first
 * then by OVR, with a health read; roles tag the 5 starters, a rotation tier, and
 * reserves (young reserves → two-way).
 */
import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { depthChart, rosterRoles, POSITIONS } from '@/../apps/bs-basketball/src/lib/roster/depthChart';
import { buildDefaultBasketballLineup } from '@/../apps/bs-basketball/src/lib/lineup';
import type { BasketballPlayer } from '@bs/sport-basketball';

function userRoster() {
  const league = createNewBasketballLeague({ rngSeed: 'depth' });
  const team = league.teams[0];
  const players = league.players as Record<string, BasketballPlayer>;
  const roster = team.playerIds.map(id => players[id]).filter((p): p is BasketballPlayer => !!p);
  const starters = [...buildDefaultBasketballLineup(roster).starters];
  return { roster, starters };
}

describe('depth chart', () => {
  it('orders each position starter-first then by OVR', () => {
    const { roster, starters } = userRoster();
    const chart = depthChart(roster, starters);
    expect(chart.map(c => c.position)).toEqual(POSITIONS);

    for (const col of chart) {
      // Starter (if any) is listed first.
      const firstStarterIdx = col.entries.findIndex(e => e.isStarter);
      if (firstStarterIdx >= 0) expect(firstStarterIdx).toBe(0);
      // Within the non-starter tail, OVR is non-increasing.
      const tail = col.entries.filter(e => !e.isStarter);
      for (let i = 1; i < tail.length; i++) expect(tail[i - 1].player.ratings.overall).toBeGreaterThanOrEqual(tail[i].player.ratings.overall);
      // Health reflects count.
      expect(col.health).toBe(col.entries.length <= 1 ? 'thin' : col.entries.length === 2 ? 'ok' : 'deep');
    }
  });

  it('tags exactly the chosen starters as starters', () => {
    const { roster, starters } = userRoster();
    const roles = rosterRoles(roster, starters);
    const tagged = [...roles.entries()].filter(([, r]) => r === 'starter').map(([id]) => id).sort();
    expect(tagged).toEqual(starters.filter(Boolean).sort());
    // Every roster player has a role.
    for (const p of roster) expect(roles.has(p.id)).toBe(true);
  });
});
