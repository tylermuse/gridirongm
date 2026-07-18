/**
 * Commissioner salary-cap override (§1.5 — hoops parity with football).
 *
 * A league can set a flat cap that replaces the inflation-based one for every
 * season. The override lives in a module-level cache; these tests reset it after
 * each case so it can't leak into the rest of the suite (basketballSalaryCap is
 * read by many other tests).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { basketballSalaryCap, setSalaryCapOverride, getSalaryCapOverride } from '@bs/sport-basketball';

afterEach(() => setSalaryCapOverride(null));

describe('commissioner salary cap override', () => {
  it('default is the inflation-based cap when no override is set', () => {
    setSalaryCapOverride(null);
    expect(getSalaryCapOverride()).toBeNull();
    expect(basketballSalaryCap(2027)).toBeGreaterThan(basketballSalaryCap(2026)); // inflates YoY
  });

  it('a set override replaces the cap flatly across seasons', () => {
    setSalaryCapOverride(200_000_000);
    expect(getSalaryCapOverride()).toBe(200_000_000);
    expect(basketballSalaryCap(2026)).toBe(200_000_000);
    expect(basketballSalaryCap(2030)).toBe(200_000_000);
  });

  it('clearing reverts to the inflation-based cap', () => {
    setSalaryCapOverride(200_000_000);
    setSalaryCapOverride(null);
    expect(getSalaryCapOverride()).toBeNull();
    expect(basketballSalaryCap(2027)).toBeGreaterThan(basketballSalaryCap(2026));
  });

  it('ignores non-positive values (treated as no override)', () => {
    setSalaryCapOverride(0);
    expect(getSalaryCapOverride()).toBeNull();
    setSalaryCapOverride(-5);
    expect(getSalaryCapOverride()).toBeNull();
  });
});
