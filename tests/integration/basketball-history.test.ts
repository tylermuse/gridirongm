/**
 * Phase 2E-4 — League history integration tests.
 *
 * Rolling a completed season forward records a rich history entry (champion,
 * runner-up, Finals MVP, MVP, scoring leader) and accumulates career stats.
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import {
  initializePlayoffs, simPlayoffDay, getBracket, isRegularSeasonComplete,
} from '@/../apps/bs-basketball/src/lib/playoffs';
import { advanceToNextSeason } from '@/../apps/bs-basketball/src/lib/season';
import { getSeasonHistory } from '@/../apps/bs-basketball/src/lib/history';
import type { BasketballPlayer } from '@bs/sport-basketball';

function completeSeason(seed: string) {
  let league = createNewBasketballLeague({ rngSeed: seed });
  let g = 0;
  while (!isRegularSeasonComplete(league) && g++ < 400) { const r = simNextDay(league); if (!r) break; league = r.league; }
  league = initializePlayoffs(league); g = 0;
  while (!getBracket(league)!.complete && g++ < 200) { const r = simPlayoffDay(league); if (!r) break; league = r.league; }
  return league;
}

describe('league history', () => {
  it('records a rich season entry on rollover', () => {
    const done = completeSeason('history-entry');
    const championId = getBracket(done)!.championTeamId;
    const prevSeason = done.currentSeason;

    const next = advanceToNextSeason(done);
    const hist = getSeasonHistory(next);

    expect(hist).toHaveLength(1);
    const entry = hist[0];
    expect(entry.season).toBe(prevSeason);
    expect(entry.champion).toBe(championId);
    expect(entry.runnerUp).toBeTruthy();
    expect(entry.mvp).toBeTruthy();
    expect(entry.mvp!.name).toMatch(/\w+ \w+/);
    expect(entry.finalsMvp).toBeTruthy();
    expect(entry.scoringLeader).toBeTruthy();
  });

  it('accumulates career stats across the rollover', () => {
    const done = completeSeason('history-career');
    const next = advanceToNextSeason(done);
    // At least some surviving players have non-zero career points now.
    const withCareer = (Object.values(next.players) as BasketballPlayer[]).filter(p => (p.careerStats?.points ?? 0) > 0);
    expect(withCareer.length).toBeGreaterThan(50);
  });

  it('appends a second season without clobbering the first', () => {
    const done1 = completeSeason('history-two');
    const s1 = done1.currentSeason;
    let league = advanceToNextSeason(done1);

    // Play and complete the second season, then roll again.
    let g = 0;
    while (!isRegularSeasonComplete(league) && g++ < 400) { const r = simNextDay(league); if (!r) break; league = r.league; }
    league = initializePlayoffs(league); g = 0;
    while (!getBracket(league)!.complete && g++ < 200) { const r = simPlayoffDay(league); if (!r) break; league = r.league; }
    const s2 = league.currentSeason;
    league = advanceToNextSeason(league);

    const hist = getSeasonHistory(league);
    expect(hist.map(h => h.season).sort()).toEqual([s1, s2].sort());
    // Newest first.
    expect(hist[0].season).toBe(s2);
  });
});
