/**
 * Phase 2E-2 — Injuries integration tests.
 *
 * Simming a full season produces injuries; injured players are held out of the
 * sim; injuries heal by their return day; a rollover wipes them clean.
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import { isRegularSeasonComplete } from '@/../apps/bs-basketball/src/lib/playoffs';
import {
  getInjuries, isInjuredOn, healthyPlayers, clearHealed,
} from '@/../apps/bs-basketball/src/lib/injuries';
import type { BasketballPlayer } from '@bs/sport-basketball';

describe('injuries', () => {
  it('accumulates injuries over a season and holds injured players out', () => {
    let league = createNewBasketballLeague({ rngSeed: 'inj-season-run' });
    let everSawInjured = false;
    let g = 0;
    while (!isRegularSeasonComplete(league) && g++ < 400) {
      const r = simNextDay(league);
      if (!r) break;
      league = r.league;
      const injuries = getInjuries(league);
      const day = league.currentTick;
      // Any currently-injured player must be absent from their team's healthy set.
      for (const id of Object.keys(injuries)) {
        if (isInjuredOn(injuries, id, day)) {
          everSawInjured = true;
          const p = league.players[id] as BasketballPlayer;
          const team = league.teams.find(t => t.playerIds.includes(p.id));
          if (team) {
            const roster = team.playerIds.map(pid => league.players[pid] as BasketballPlayer);
            expect(healthyPlayers(roster, injuries, day).some(h => h.id === id)).toBe(false);
          }
        }
      }
    }
    // Over a full 1230-game season, injuries should have occurred.
    expect(everSawInjured).toBe(true);
  });

  it('heals injuries by their return day', () => {
    const league = createNewBasketballLeague({ rngSeed: 'inj-heal-run' });
    const pid = league.teams[0].playerIds[0];
    const injured = {
      ...league,
      sportData: {
        ...(league.sportData as object),
        injuries: { [pid]: { playerId: pid, bodyPart: 'ankle', severity: 'minor' as const, occurredDay: 5, returnDay: 12 } },
      },
    };
    expect(isInjuredOn(getInjuries(injured), pid, 10)).toBe(true);
    // Past the return day → cleared.
    const healed = clearHealed(injured, 12);
    expect(getInjuries(healed)[pid]).toBeUndefined();
    expect(isInjuredOn(getInjuries(injured), pid, 12)).toBe(false);
  });
});
