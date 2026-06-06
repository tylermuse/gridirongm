/**
 * Ranked award-race leaderboards (football-parity Award Race page): top-10 per
 * category, sorted by score, with stat lines; COY entries are teams.
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import { computeAwardRaces } from '@/../apps/bs-basketball/src/lib/awards/computeAwardRaces';

describe('computeAwardRaces', () => {
  it('returns null before any games, then ranked top-10 boards', () => {
    let league = createNewBasketballLeague({ rngSeed: 'races' });
    expect(computeAwardRaces(league)).toBeNull();

    for (let i = 0; i < 40; i++) { const r = simNextDay(league); if (!r) break; league = r.league; }
    const races = computeAwardRaces(league)!;
    expect(races).not.toBeNull();
    expect(races.map(r => r.key)).toEqual(['mvp', 'dpoy', 'roy', 'sixthMan', 'mip', 'coy']);

    const mvp = races.find(r => r.key === 'mvp')!;
    expect(mvp.entries.length).toBeGreaterThan(0);
    expect(mvp.entries.length).toBeLessThanOrEqual(10);
    for (let i = 1; i < mvp.entries.length; i++) expect(mvp.entries[i - 1].score).toBeGreaterThanOrEqual(mvp.entries[i].score);
    expect(mvp.entries[0].keyStatLine).toMatch(/PPG/);

    const coy = races.find(r => r.key === 'coy')!;
    expect(coy.entries.every(e => e.isCoach)).toBe(true);
  });
});
