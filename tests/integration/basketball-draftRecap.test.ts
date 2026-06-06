/**
 * Draft big board + recap (parity 2.1d): the board ranks the pool best-first;
 * the recap grades every pick and flags steals/reaches once the draft is done.
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import { initializePlayoffs, simPlayoffDay, getBracket, isRegularSeasonComplete } from '@/../apps/bs-basketball/src/lib/playoffs';
import { enterOffseason } from '@/../apps/bs-basketball/src/lib/season';
import { getDraft, autoPickUntilUser, buildBigBoard, buildDraftRecap } from '@/../apps/bs-basketball/src/lib/draft';

type League = ReturnType<typeof createNewBasketballLeague>;
function reg(l: League): League { let g = 0; while (!isRegularSeasonComplete(l) && g < 500) { const r = simNextDay(l); if (!r) break; l = r.league as League; g++; } return l; }
function po(l: League): League { let c = initializePlayoffs(l) as League, g = 0; while (!getBracket(c)!.complete && g < 200) { const r = simPlayoffDay(c); if (!r) break; c = r.league as League; g++; } return c; }

describe('draft big board + recap', () => {
  it('ranks the board and grades the completed draft', () => {
    let league = enterOffseason(po(reg(createNewBasketballLeague({ rngSeed: 'recap' })))) as League;

    // Big board: ranked best-first, contiguous ranks, A grades near the top.
    const board = buildBigBoard(league)!;
    expect(board.length).toBeGreaterThan(0);
    expect(board.map(b => b.rank)).toEqual(board.map((_, i) => i + 1));
    const firstA = board.findIndex(b => b.grade === 'A');
    const firstD = board.findIndex(b => b.grade === 'D');
    if (firstA >= 0 && firstD >= 0) expect(firstA).toBeLessThan(firstD);

    // Recap is null until the draft completes.
    expect(buildDraftRecap(league)).toBeNull();

    league = autoPickUntilUser(league, null) as League;
    expect(getDraft(league)!.complete).toBe(true);

    const recap = buildDraftRecap(league)!;
    expect(recap.picks.length).toBeGreaterThan(0);
    for (const p of recap.picks) {
      expect(p.grade).toMatch(/^[ABCDF][+-]?$/);
      expect(p.valueRank).toBeGreaterThanOrEqual(1);
      expect(p.delta).toBe(p.overall - p.valueRank);
    }
    // Steals fell past their value; reaches went early.
    expect(recap.steals.every(p => p.delta >= 6)).toBe(true);
    expect(recap.reaches.every(p => p.delta <= -6)).toBe(true);
  }, 120_000);
});
