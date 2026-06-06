/**
 * GM award nominees (parity 3.3 Phase B): GM of the Year by win%, Best Rebuild
 * by win improvement over the prior season.
 */

import { describe, it, expect } from 'vitest';
import { deriveNominees } from '@/../apps/bs-basketball/src/lib/gm/awards';

describe('deriveNominees', () => {
  const rows = [
    { userId: 'a', wins: 60, losses: 22 }, // .732
    { userId: 'b', wins: 50, losses: 32 }, // .610
    { userId: 'c', wins: 41, losses: 41 }, // .500
    { userId: 'd', wins: 30, losses: 52 }, // .366
    { userId: 'e', wins: 0, losses: 0 },   // no games — excluded
  ];
  const prior = new Map<string, number>([
    ['a', 58], // +2
    ['c', 20], // +21  ← big rebuild
    ['d', 45], // -15  ← regressed, excluded
  ]);

  it('ranks GM of the Year by win% (min 1 game), top 3', () => {
    const { gm_of_year } = deriveNominees(rows, prior);
    expect(gm_of_year.map(n => n.userId)).toEqual(['a', 'b', 'c']);
    expect(gm_of_year[0].value).toBeCloseTo(60 / 82, 4);
    expect(gm_of_year.find(n => n.userId === 'e')).toBeUndefined();
  });

  it('ranks Best Rebuild by win improvement, excluding regressions / no-prior', () => {
    const { best_rebuild } = deriveNominees(rows, prior);
    expect(best_rebuild.map(n => n.userId)).toEqual(['c', 'a']); // +21, +2
    expect(best_rebuild[0].value).toBe(21);
    // 'd' regressed (-15) and 'b'/'e' had no prior season → excluded.
    expect(best_rebuild.find(n => n.userId === 'd')).toBeUndefined();
    expect(best_rebuild.find(n => n.userId === 'b')).toBeUndefined();
  });
});
