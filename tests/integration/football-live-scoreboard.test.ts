/**
 * Around-the-League live scoreboard helpers (feature: live other-game scores +
 * halftime updates). Covers the two pure pieces the live scoreboard relies on:
 *   - splitScoreByQuarter: believable, deterministic per-quarter cumulative
 *     progression that always ends exactly at the real final.
 *   - resolveWeekGameResult: the reuse rule simulateOneWeek uses so the
 *     scoreboard's finals equal the committed weekly results.
 */

import { describe, it, expect } from 'vitest';
import { splitScoreByQuarter, resolveWeekGameResult } from '@/lib/engine/store';
import type { GameResult } from '@/types';

describe('splitScoreByQuarter', () => {
  it('is monotonic, length 4, and ends exactly at the final score', () => {
    for (const [h, a] of [[24, 17], [0, 3], [45, 42], [7, 0], [31, 31]] as const) {
      const { home, away } = splitScoreByQuarter(`g-${h}-${a}`, h, a);
      expect(home).toHaveLength(4);
      expect(away).toHaveLength(4);
      expect(home[3]).toBe(h);
      expect(away[3]).toBe(a);
      for (let i = 1; i < 4; i++) {
        expect(home[i]).toBeGreaterThanOrEqual(home[i - 1]);
        expect(away[i]).toBeGreaterThanOrEqual(away[i - 1]);
        expect(home[i]).toBeLessThanOrEqual(h);
        expect(away[i]).toBeLessThanOrEqual(a);
      }
    }
  });

  it('is deterministic for the same seed and total', () => {
    const a = splitScoreByQuarter('game-abc', 28, 21);
    const b = splitScoreByQuarter('game-abc', 28, 21);
    expect(a).toEqual(b);
  });

  it('returns all zeros for a shutout side', () => {
    const { away } = splitScoreByQuarter('shutout', 30, 0);
    expect(away).toEqual([0, 0, 0, 0]);
  });
});

describe('resolveWeekGameResult', () => {
  const result = { id: 'gm1', week: 5, homeScore: 20, awayScore: 13, played: true } as unknown as GameResult;
  const stash = { week: 5, results: { gm1: result }, splits: { gm1: { home: [7, 14, 17, 20], away: [0, 3, 10, 13] } } };

  it('returns the stashed result when the week matches', () => {
    expect(resolveWeekGameResult(stash, 5, 'gm1')).toBe(result);
  });

  it('returns undefined when the week differs (stale stash)', () => {
    expect(resolveWeekGameResult(stash, 6, 'gm1')).toBeUndefined();
  });

  it('returns undefined when there is no stash or no entry', () => {
    expect(resolveWeekGameResult(null, 5, 'gm1')).toBeUndefined();
    expect(resolveWeekGameResult(stash, 5, 'nope')).toBeUndefined();
  });
});
