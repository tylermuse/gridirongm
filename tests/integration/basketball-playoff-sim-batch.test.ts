/**
 * Sim Round / Sim All Playoffs.
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import {
  initializePlayoffs, simPlayoffRound, simAllPlayoffs, getBracket, isRegularSeasonComplete,
} from '@/../apps/bs-basketball/src/lib/playoffs';

function toPlayoffs(seed: string) {
  let league = createNewBasketballLeague({ rngSeed: seed });
  let g = 0;
  while (!isRegularSeasonComplete(league) && g++ < 400) { const r = simNextDay(league); if (!r) break; league = r.league; }
  return initializePlayoffs(league);
}

describe('playoff batch sim', () => {
  it('sim round advances exactly one round (play-in first)', () => {
    const league = toPlayoffs('po-round');
    const before = getBracket(league)!;
    expect(before.playIn!.some(s => s.winnerTeamId)).toBe(false);

    // The first round to resolve is the play-in.
    const out1 = simPlayoffRound(league)!;
    const afterPlayIn = getBracket(out1.league)!;
    expect(afterPlayIn.playIn!.every(s => s.winnerTeamId)).toBe(true);
    expect(afterPlayIn.complete).toBe(false);
    // The conference finals certainly haven't started.
    expect(afterPlayIn.rounds[2].some(s => s.winnerTeamId)).toBe(false);

    // The next sim-round resolves the first round proper.
    const out2 = simPlayoffRound(out1.league)!;
    const afterR1 = getBracket(out2.league)!;
    expect(afterR1.rounds[0].every(s => s.winnerTeamId)).toBe(true);
    expect(afterR1.complete).toBe(false);
  });

  it('sim all playoffs reaches a champion', () => {
    const out = simAllPlayoffs(toPlayoffs('po-all'))!;
    const b = getBracket(out.league)!;
    expect(b.complete).toBe(true);
    expect(b.championTeamId).toBeTruthy();
    expect(out.champion).toBe(b.championTeamId);
  });
});
