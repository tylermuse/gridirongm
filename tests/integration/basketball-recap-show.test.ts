/**
 * Episodic recap show (#15): a finished season produces a deterministic studio
 * rundown — cold open, champion, awards, sign-off — with well-formed segments.
 */
import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import { initializePlayoffs, simAllPlayoffs, isRegularSeasonComplete } from '@/../apps/bs-basketball/src/lib/playoffs';
import { buildRecap } from '@/../apps/bs-basketball/src/lib/recap/recap';
import { buildRecapShow, HOSTS } from '@/../apps/bs-basketball/src/lib/recap/show';

function finishedSeason() {
  let league = createNewBasketballLeague({ rngSeed: 'recap-show' });
  let g = 0;
  while (!isRegularSeasonComplete(league) && g++ < 400) { const r = simNextDay(league); if (!r) break; league = r.league; }
  return simAllPlayoffs(initializePlayoffs(league))!.league;
}

describe('recap show', () => {
  it('builds a deterministic, well-formed studio rundown', () => {
    const league = finishedSeason();
    const recap = buildRecap(league);
    expect(recap).not.toBeNull();

    const show = buildRecapShow(league, recap!);
    // Always has at least a cold open + sign-off.
    expect(show.length).toBeGreaterThanOrEqual(2);
    expect(show[0].chapter).toBe('Cold Open');
    expect(show[show.length - 1].chapter).toBe('Sign-Off');

    for (const s of show) {
      expect(s.line).toBeTruthy();
      expect(HOSTS[s.host]).toBeDefined();
    }

    // Deterministic across rebuilds.
    const again = buildRecapShow(league, recap!);
    expect(again.map(s => s.line)).toEqual(show.map(s => s.line));
  });
});
