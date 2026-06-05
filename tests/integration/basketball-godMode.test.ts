/**
 * God Mode (parity 3.1): a save-level toggle that unlocks editing a player's
 * overall, age, and potential — and edits are no-ops while it's off.
 */

import { describe, it, expect } from 'vitest';
import { computeOverall } from '@bs/sport-basketball';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { isGodMode, setGodMode, editPlayer } from '@/../apps/bs-basketball/src/lib/godMode/godMode';
import type { BasketballPlayer } from '@bs/sport-basketball';

function firstPlayer(league: ReturnType<typeof createNewBasketballLeague>) {
  const id = league.teams[0].playerIds[0];
  return { id, p: league.players[id] as BasketballPlayer };
}

describe('god mode', () => {
  it('edits are no-ops until God Mode is enabled', () => {
    const league = createNewBasketballLeague({ rngSeed: 'god-off' });
    const { id, p } = firstPlayer(league);
    expect(isGodMode(league)).toBe(false);
    const after = editPlayer(league, id, { setOverall: 99 });
    expect((after.players[id] as BasketballPlayer).ratings.overall).toBe(p.ratings.overall);
  });

  it('sets overall (attributes scale to match), age, and potential', () => {
    let league = createNewBasketballLeague({ rngSeed: 'god-on' });
    league = setGodMode(league, true);
    expect(isGodMode(league)).toBe(true);

    const { id } = firstPlayer(league);
    league = editPlayer(league, id, { setOverall: 95, age: 27, potential: 97 });
    const edited = league.players[id] as BasketballPlayer;

    // Overall lands at the target and stays consistent with attributes (so it
    // survives the aging recompute).
    expect(edited.ratings.overall).toBeGreaterThanOrEqual(93);
    expect(edited.ratings.overall).toBeLessThanOrEqual(97);
    expect(edited.ratings.overall).toBe(computeOverall(edited.ratings, edited.sportData.position));
    expect(edited.age).toBe(27);
    expect(edited.development.potential).toBe(97);
  });

  it('clamps potential to at least the overall', () => {
    let league = setGodMode(createNewBasketballLeague({ rngSeed: 'god-clamp' }), true);
    const { id } = firstPlayer(league);
    league = editPlayer(league, id, { setOverall: 80, potential: 50 });
    const edited = league.players[id] as BasketballPlayer;
    expect(edited.development.potential).toBeGreaterThanOrEqual(edited.ratings.overall);
  });
});
