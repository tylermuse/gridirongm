/** FA day clock + price decay (Gap 3 Option A). */
import { describe, it, expect } from 'vitest';
import { faPriceDecay, faPhase, FA_DAYS } from '@/../apps/bs-basketball/src/lib/freeAgency';

describe('FA price decay', () => {
  it('starts at full price and decays to the floor', () => {
    expect(faPriceDecay(0)).toBe(1);
    expect(faPriceDecay(FA_DAYS)).toBeCloseTo(0.6, 5);
    // Monotonic non-increasing across the window.
    for (let d = 1; d <= FA_DAYS; d++) expect(faPriceDecay(d)).toBeLessThanOrEqual(faPriceDecay(d - 1));
    // Clamps past the window.
    expect(faPriceDecay(99)).toBe(0.6);
  });

  it('labels each phase of the window', () => {
    expect(faPhase(0).label).toBe('Full Market');
    expect(faPhase(10).label).toBe('Cooling');
    expect(faPhase(20).label).toBe('Dropping');
    expect(faPhase(30).label).toBe('Bargain Bin');
  });
});
