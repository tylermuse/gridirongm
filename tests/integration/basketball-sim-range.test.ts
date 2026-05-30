/**
 * Bulk-sim integration tests: sim a week / to the deadline / rest of season,
 * and the trade-window gate.
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { isRegularSeasonComplete } from '@/../apps/bs-basketball/src/lib/playoffs';
import { simThroughDay, tradeWindowClosed, TRADE_DEADLINE_DAY } from '@/../apps/bs-basketball/src/lib/sim/simRange';

describe('bulk simulation', () => {
  it('sims through a target day and stops', () => {
    const league = createNewBasketballLeague({ rngSeed: 'range-week' });
    const r = simThroughDay(league, 7);
    expect(r.gamesSimmed).toBeGreaterThan(0);
    expect(r.league.currentTick).toBeLessThanOrEqual(7);
    // No remaining scheduled game has a day <= 7.
    const stragglers = r.league.games.filter(
      g => g.status === 'scheduled' && ((g.sportData as { dayOfSeason: number }).dayOfSeason <= 7),
    );
    expect(stragglers).toHaveLength(0);
  });

  it('sims to the trade deadline', () => {
    const league = createNewBasketballLeague({ rngSeed: 'range-deadline' });
    const r = simThroughDay(league, TRADE_DEADLINE_DAY);
    expect(r.league.currentTick).toBeLessThanOrEqual(TRADE_DEADLINE_DAY);
    expect(r.league.currentTick).toBeGreaterThan(100);
    expect(tradeWindowClosed(r.league).closed).toBe(false); // still at/under the deadline
  });

  it('sims the rest of the regular season', () => {
    const league = createNewBasketballLeague({ rngSeed: 'range-season' });
    const r = simThroughDay(league, null);
    expect(isRegularSeasonComplete(r.league)).toBe(true);
    expect(r.league.games.filter(g => g.status === 'played').length).toBe(1230);
  });

  it('closes the trade window after the deadline passes', () => {
    const league = createNewBasketballLeague({ rngSeed: 'range-window' });
    const before = simThroughDay(league, TRADE_DEADLINE_DAY);
    expect(tradeWindowClosed(before.league).closed).toBe(false);
    const after = simThroughDay(before.league, TRADE_DEADLINE_DAY + 10);
    expect(after.league.currentTick).toBeGreaterThan(TRADE_DEADLINE_DAY);
    expect(tradeWindowClosed(after.league).closed).toBe(true);
  });
});
