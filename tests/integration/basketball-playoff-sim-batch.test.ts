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
  it('sim round advances exactly one round', () => {
    const league = toPlayoffs('po-round');
    const before = getBracket(league)!;
    const r1Resolved = before.rounds[0].filter(s => s.winnerTeamId).length;
    expect(r1Resolved).toBe(0);

    const out = simPlayoffRound(league)!;
    const after = getBracket(out.league)!;
    // The whole first round is now decided.
    expect(after.rounds[0].every(s => s.winnerTeamId)).toBe(true);
    // But the conference finals haven't started (round didn't blow past one).
    expect(after.complete).toBe(false);
    expect(after.rounds[2].some(s => s.winnerTeamId)).toBe(false);
  });

  it('sim all playoffs reaches a champion', () => {
    const out = simAllPlayoffs(toPlayoffs('po-all'))!;
    const b = getBracket(out.league)!;
    expect(b.complete).toBe(true);
    expect(b.championTeamId).toBeTruthy();
    expect(out.champion).toBe(b.championTeamId);
  });
});
