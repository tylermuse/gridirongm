/**
 * Clinch markers (P2.4 / 2.6): nobody clinches early; a fully-decided season
 * produces a conference top seed (z) and eliminates the bottom teams (e).
 */
import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import { isRegularSeasonComplete } from '@/../apps/bs-basketball/src/lib/playoffs';
import { clinchMarks } from '@/../apps/bs-basketball/src/lib/standings/clinch';

describe('clinch markers', () => {
  it('shows nothing on day one', () => {
    const league = createNewBasketballLeague({ rngSeed: 'clinch-early' });
    const marks = clinchMarks(league);
    expect([...marks.values()].every(m => m === null)).toBe(true);
  });

  it('crowns a top seed and eliminates teams once the season is decided', () => {
    let league = createNewBasketballLeague({ rngSeed: 'clinch-late' });
    let g = 0;
    while (!isRegularSeasonComplete(league) && g++ < 400) { const r = simNextDay(league); if (!r) break; league = r.league; }

    const marks = clinchMarks(league);
    const vals = [...marks.values()];
    // With zero games remaining, the field is settled: each conference has a top
    // seed (z) and the bottom teams are eliminated (e).
    expect(vals.filter(m => m === 'z').length).toBe(2); // one per conference
    expect(vals.filter(m => m === 'e').length).toBeGreaterThan(0);
    // No team is both in and out.
    for (const m of vals) expect(['z', 'y', 'x', 'e', null]).toContain(m);
  });
});
