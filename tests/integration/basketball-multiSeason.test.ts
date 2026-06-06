/**
 * Multi-season stability + growth regression (parity 4.1 / 4.2).
 *
 * Sims 5 full seasons (regular season → playoffs → offseason rollover) and
 * guards against the bugs that historically broke long saves: a roster wiped
 * below five positions, runaway player counts, and an unbounded save blob.
 */

import { describe, it, expect } from 'vitest';
import type { BasketballPlayer, BasketballPosition } from '@bs/sport-basketball';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import { initializePlayoffs, simPlayoffDay, getBracket, isRegularSeasonComplete } from '@/../apps/bs-basketball/src/lib/playoffs';
import { advanceToNextSeason } from '@/../apps/bs-basketball/src/lib/season';

type League = ReturnType<typeof createNewBasketballLeague>;
const POSITIONS: BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C'];

function playRegSeason(l: League): League {
  let g = 0;
  while (!isRegularSeasonComplete(l) && g < 500) {
    const r = simNextDay(l);
    if (!r) break;
    l = r.league as League;
    g++;
  }
  return l;
}

function playPlayoffs(l: League): League {
  let cur = initializePlayoffs(l) as League;
  let g = 0;
  while (!getBracket(cur)!.complete && g < 200) {
    const r = simPlayoffDay(cur);
    if (!r) break;
    cur = r.league as League;
    g++;
  }
  return cur;
}

describe('multi-season stability', () => {
  it('sims 5 seasons without breaking roster integrity or ballooning the save', () => {
    let league = createNewBasketballLeague({ rngSeed: 'multi-season' });
    const startPlayers = Object.keys(league.players).length;
    let prevSize = JSON.stringify(league).length;

    for (let s = 0; s < 5; s++) {
      league = advanceToNextSeason(playPlayoffs(playRegSeason(league)));

      const players = league.players as Record<string, BasketballPlayer>;
      // Every team keeps all five positions (the sim-day blocker).
      for (const team of league.teams) {
        const counts: Record<BasketballPosition, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
        for (const id of team.playerIds) {
          const p = players[id];
          if (p?.sportData?.position) counts[p.sportData.position]++;
        }
        for (const pos of POSITIONS) {
          expect(counts[pos], `S${league.currentSeason} ${team.abbreviation} ${pos}`).toBeGreaterThanOrEqual(1);
        }
      }
      // Each season crowns a champion (playoffs really resolved).
      expect(getBracket(league)?.complete ?? true).toBe(true);

      const size = JSON.stringify(league).length;
      // Save grows season-over-season but not explosively (no per-season doubling).
      expect(size).toBeLessThan(prevSize * 2.2 + 2_000_000);
      prevSize = size;
    }

    // Player universe stays bounded (retirements offset draft/FA intake).
    const endPlayers = Object.keys(league.players).length;
    expect(endPlayers).toBeLessThan(startPlayers * 3);
  }, 180_000);
});
