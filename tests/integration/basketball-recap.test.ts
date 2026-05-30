/**
 * Phase 2E-7 — Season recap integration tests.
 *
 * A live recap (playoffs just finished) carries the champion + marquee awards;
 * after rollover the recap falls back to the history record.
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import {
  initializePlayoffs, simPlayoffDay, getBracket, isRegularSeasonComplete,
} from '@/../apps/bs-basketball/src/lib/playoffs';
import { advanceToNextSeason } from '@/../apps/bs-basketball/src/lib/season';
import { buildRecap } from '@/../apps/bs-basketball/src/lib/recap';

function completeSeason(seed: string) {
  let league = createNewBasketballLeague({ rngSeed: seed });
  let g = 0;
  while (!isRegularSeasonComplete(league) && g++ < 400) { const r = simNextDay(league); if (!r) break; league = r.league; }
  league = initializePlayoffs(league); g = 0;
  while (!getBracket(league)!.complete && g++ < 200) { const r = simPlayoffDay(league); if (!r) break; league = r.league; }
  return league;
}

describe('season recap', () => {
  it('returns null before any season finishes', () => {
    const fresh = createNewBasketballLeague({ rngSeed: 'recap-fresh' });
    expect(buildRecap(fresh)).toBeNull();
  });

  it('builds a live recap when the playoffs finish', () => {
    const done = completeSeason('recap-live');
    const recap = buildRecap(done)!;
    expect(recap.source).toBe('live');
    expect(recap.season).toBe(done.currentSeason);
    expect(recap.champion).toBe(getBracket(done)!.championTeamId);
    expect(recap.mvp).toBeTruthy();
    expect(recap.finalsMvp).toBeTruthy();
    expect(recap.scoringLeader).toBeTruthy();
    expect(recap.otherAwards.length).toBeGreaterThan(0);
  });

  it('falls back to the history recap after rollover', () => {
    const done = completeSeason('recap-hist');
    const prevSeason = done.currentSeason;
    const championId = getBracket(done)!.championTeamId;
    const next = advanceToNextSeason(done);

    const recap = buildRecap(next)!;
    expect(recap.source).toBe('history');
    expect(recap.season).toBe(prevSeason);
    expect(recap.champion).toBe(championId);
    expect(recap.mvp).toBeTruthy();
  });
});
