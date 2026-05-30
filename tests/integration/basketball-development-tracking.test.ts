/**
 * Phase 2E-1 — Player development tracking integration tests.
 *
 * Rolling a season forward snapshots each player's pre-aging ratings and appends
 * a year-by-year log entry; aging then produces visible rating deltas.
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import {
  initializePlayoffs, simPlayoffDay, getBracket, isRegularSeasonComplete,
} from '@/../apps/bs-basketball/src/lib/playoffs';
import { advanceToNextSeason } from '@/../apps/bs-basketball/src/lib/season';
import { ratingDeltas } from '@/../apps/bs-basketball/src/lib/development';
import type { BasketballPlayer } from '@bs/sport-basketball';

function completeSeason(seed: string) {
  let league = createNewBasketballLeague({ rngSeed: seed });
  let g = 0;
  while (!isRegularSeasonComplete(league) && g++ < 400) { const r = simNextDay(league); if (!r) break; league = r.league; }
  league = initializePlayoffs(league); g = 0;
  while (!getBracket(league)!.complete && g++ < 200) { const r = simPlayoffDay(league); if (!r) break; league = r.league; }
  return league;
}

describe('development tracking', () => {
  it('snapshots prevRatings + a season-log entry, and aging produces deltas', () => {
    const done = completeSeason('dev-track');
    const prevSeason = done.currentSeason;
    const next = advanceToNextSeason(done);

    const players = Object.values(next.players) as BasketballPlayer[];
    const withLog = players.filter(p => (p.sportData.seasonLog?.length ?? 0) > 0);
    expect(withLog.length).toBeGreaterThan(50);

    const sample = withLog[0];
    expect(sample.sportData.seasonLog![0].season).toBe(prevSeason);
    expect(sample.sportData.seasonLog![0].gamesPlayed).toBeGreaterThan(0);
    expect(sample.sportData.prevRatings).toBeTruthy();

    // Aging moved at least some players' ratings → non-empty deltas.
    const changed = players.filter(p => ratingDeltas(p).length > 0);
    expect(changed.length).toBeGreaterThan(20);
  });

  it('logs a second entry on the next rollover', () => {
    let league = advanceToNextSeason(completeSeason('dev-two'));
    let g = 0;
    while (!isRegularSeasonComplete(league) && g++ < 400) { const r = simNextDay(league); if (!r) break; league = r.league; }
    league = initializePlayoffs(league); g = 0;
    while (!getBracket(league)!.complete && g++ < 200) { const r = simPlayoffDay(league); if (!r) break; league = r.league; }
    league = advanceToNextSeason(league);

    const twoSeasonGuy = (Object.values(league.players) as BasketballPlayer[])
      .find(p => (p.sportData.seasonLog?.length ?? 0) >= 2);
    expect(twoSeasonGuy).toBeTruthy();
    const seasons = twoSeasonGuy!.sportData.seasonLog!.map(e => e.season);
    expect(new Set(seasons).size).toBe(seasons.length); // distinct seasons
  });
});
