/**
 * Season honors — All-NBA / All-Defensive / All-Rookie teams + retirements.
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import { isRegularSeasonComplete } from '@/../apps/bs-basketball/src/lib/playoffs';
import { computeHonors } from '@/../apps/bs-basketball/src/lib/awards';

function fullSeason(seed: string) {
  let league = createNewBasketballLeague({ rngSeed: seed });
  let g = 0;
  while (!isRegularSeasonComplete(league) && g++ < 400) { const r = simNextDay(league); if (!r) break; league = r.league; }
  return league;
}

describe('season honors', () => {
  it('builds positionally-balanced All-NBA teams', () => {
    const honors = computeHonors(fullSeason('honors-allnba'))!;
    expect(honors.allNBA).toHaveLength(3);
    for (const team of honors.allNBA) {
      // Five players, one at each position, all distinct.
      expect(team.players).toHaveLength(5);
      expect(new Set(team.players.map(p => p.position)).size).toBe(5);
    }
    // First-team players don't reappear on second/third.
    const first = new Set(honors.allNBA[0].players.map(p => p.playerId));
    const second = new Set(honors.allNBA[1].players.map(p => p.playerId));
    expect([...first].some(id => second.has(id))).toBe(false);
  });

  it('builds All-Defensive + All-Rookie teams', () => {
    const honors = computeHonors(fullSeason('honors-other'))!;
    expect(honors.allDefensive.length).toBeGreaterThan(0);
    expect(honors.allDefensive[0].players).toHaveLength(5);
    expect(honors.allRookie.length).toBeGreaterThan(0);
    expect(honors.allRookie[0].players.length).toBeGreaterThan(0);
    // Rookie statlines look like "x / y / z".
    expect(honors.allRookie[0].players[0].statline).toMatch(/\d/);
  });

  it('projects an offseason retirement class', () => {
    const honors = computeHonors(fullSeason('honors-retire'))!;
    // Over a 30-team league there are always some age-driven retirements.
    expect(honors.retirements.length).toBeGreaterThan(0);
    // Sorted by overall (most notable first).
    for (let i = 1; i < honors.retirements.length; i++) {
      expect(honors.retirements[i - 1].overall).toBeGreaterThanOrEqual(honors.retirements[i].overall);
    }
  });
});
