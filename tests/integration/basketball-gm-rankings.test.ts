/**
 * GM Rankings (#8): every front office is scored and ranked by a composite GM
 * score. Ranks are dense + ordered, scores bounded, the user appears, and the
 * ranking is deterministic.
 */
import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simThroughDay } from '@/../apps/bs-basketball/src/lib/sim/simRange';
import { gmRankings } from '@/../apps/bs-basketball/src/lib/rankings/gmRankings';

describe('gm rankings', () => {
  it('ranks all front offices, ordered and bounded', () => {
    const fresh = createNewBasketballLeague({ rngSeed: 'gm-rank' });
    const league = { ...simThroughDay(fresh, 60).league, userTeamId: fresh.teams[3].id };

    const ranked = gmRankings(league);
    expect(ranked.length).toBe(league.teams.length);

    // Dense 1..N ranks, sorted by score descending.
    expect(ranked.map(r => r.rank)).toEqual(ranked.map((_, i) => i + 1));
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);

    for (const r of ranked) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      for (const v of Object.values(r.components)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); }
      expect(r.tier.label).toBeTruthy();
    }

    // The user is ranked exactly once.
    expect(ranked.filter(r => r.isUser)).toHaveLength(1);

    // Deterministic.
    const again = gmRankings(league);
    expect(again.map(r => `${r.teamId}:${r.score}`)).toEqual(ranked.map(r => `${r.teamId}:${r.score}`));
  });
});
