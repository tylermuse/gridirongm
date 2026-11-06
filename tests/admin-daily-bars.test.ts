import { describe, expect, it } from 'vitest';
import { niceTicks, xLabelIndexes } from '../src/app/admin/analytics/DailyBars';

describe('niceTicks', () => {
  it('starts at zero, reaches the max, and only uses whole numbers', () => {
    for (const max of [0, 1, 2, 3, 7, 9, 10, 11, 57, 84, 100, 101, 444, 999, 1000, 2723, 12345]) {
      const ticks = niceTicks(max);
      expect(ticks[0]).toBe(0);
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(max);
      expect(ticks.every(Number.isInteger)).toBe(true);
      expect(ticks.length).toBeLessThanOrEqual(6);
    }
  });

  it('picks round steps', () => {
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(84)).toEqual([0, 25, 50, 75, 100]);
  });
});

describe('xLabelIndexes', () => {
  it('always includes the first and last bars', () => {
    expect(xLabelIndexes(30)[0]).toBe(0);
    expect(xLabelIndexes(30).at(-1)).toBe(29);
    expect(xLabelIndexes(90)).toHaveLength(6);
  });

  it('labels every bar on short ranges and handles tiny series', () => {
    expect(xLabelIndexes(7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(xLabelIndexes(1)).toEqual([0]);
    expect(xLabelIndexes(0)).toEqual([]);
  });
});
