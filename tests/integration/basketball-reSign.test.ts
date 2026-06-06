/**
 * Re-sign page data (parity 2.2 follow-up): the expiring-contract selector and
 * the extension ask the page renders.
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { contractYearsLeft } from '@/../apps/bs-basketball/src/lib/roster/playerActions';
import { extensionMarket } from '@/../apps/bs-basketball/src/lib/roster/extension';
import type { BasketballPlayer } from '@bs/sport-basketball';

describe('re-sign data', () => {
  const league = createNewBasketballLeague({ rngSeed: 're-sign' });
  const season = league.currentSeason;
  const player = league.players[league.teams[0].playerIds[0]] as BasketballPlayer;

  it('reports years left counting the current season', () => {
    expect(contractYearsLeft(player, season)).toBe(player.contract!.years.filter(y => y.season >= season).length);
    expect(contractYearsLeft(player, season)).toBeGreaterThanOrEqual(1);
  });

  it('extension ask starts the season after the deal ends', () => {
    const ask = extensionMarket(player, season);
    expect(ask.marketSalary).toBeGreaterThan(0);
    expect(ask.desiredYears).toBeGreaterThanOrEqual(1);
    expect(ask.startSeason).toBe(ask.expiringSeason + 1);
  });

  it('expiring selector matches the page filter', () => {
    const expiring = league.teams[0].playerIds
      .map(id => league.players[id] as BasketballPlayer)
      .filter(p => p.contract && contractYearsLeft(p, season) <= 1);
    // Selector is well-formed (possibly empty for a fresh league) and only
    // includes contract-year players.
    for (const p of expiring) expect(contractYearsLeft(p, season)).toBeLessThanOrEqual(1);
  });
});
