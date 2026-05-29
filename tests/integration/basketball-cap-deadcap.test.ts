/**
 * Dead cap + market salary tests.
 *
 * Builds on the cap-foundation commit. Covers:
 *   - Straight release dead cap (each year hits when owed)
 *   - Waive-and-stretch (spreads over 2N+1 years)
 *   - Stretch preview comparison
 *   - Market salary scales correctly with OVR, age, position
 *   - Market contract length scales with star tier + age
 */

import { describe, it, expect } from 'vitest';
import {
  basketballDeadCapForRelease,
  basketballStretchPreview,
  basketballMarketSalary,
  basketballMarketContractYears,
  basketballSalaryCap,
  LEAGUE_MINIMUM_SALARY,
  generateBasketballPlayer,
} from '@bs/sport-basketball';
import type { BaseContract, ContractYear, TeamId, RosterSlotRef } from '@bs/core/adapter';
import type { BasketballPlayer } from '@bs/sport-basketball/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeContract(opts: {
  startSeason: number;
  years: number;
  startSalary: number;
  raisePct?: number;
  allGuaranteed?: boolean;
  finalYearGuaranteed?: boolean;
}): BaseContract {
  const years: ContractYear[] = [];
  let salary = opts.startSalary;
  const guaranteed = opts.allGuaranteed ?? true;
  for (let i = 0; i < opts.years; i++) {
    const isFinal = i === opts.years - 1;
    years.push({
      season: opts.startSeason + i,
      baseSalary: Math.round(salary),
      proratedBonus: 0,
      guaranteed: isFinal && opts.finalYearGuaranteed !== undefined ? opts.finalYearGuaranteed : guaranteed,
    });
    salary *= (1 + (opts.raisePct ?? 0));
  }
  return {
    years,
    signedSeason: opts.startSeason,
    guaranteedAtSigning: years.filter(y => y.guaranteed).reduce((s, y) => s + y.baseSalary, 0),
    modifications: [],
    sportData: {},
  };
}

function attachContract(player: BasketballPlayer, contract: BaseContract): BasketballPlayer {
  return {
    ...player,
    contract,
    rosterSlot: { teamId: 'team-test' as TeamId, bucket: 'active' } satisfies RosterSlotRef,
  };
}

// ---------------------------------------------------------------------------
// Dead cap — straight release (waive)
// ---------------------------------------------------------------------------

describe('dead cap — straight release', () => {
  it('each guaranteed year hits as dead cap in its original year', () => {
    const player = attachContract(
      generateBasketballPlayer({ age: 28, targetOverall: 80 }),
      makeContract({ startSeason: 2026, years: 3, startSalary: 10_000_000 }),
    );
    const entries = basketballDeadCapForRelease(player, { releaseSeason: 2026, mode: 'waive' });
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({ season: 2026, amount: 10_000_000 });
    expect(entries[1]).toMatchObject({ season: 2027, amount: 10_000_000 });
    expect(entries[2]).toMatchObject({ season: 2028, amount: 10_000_000 });
  });

  it('skips non-guaranteed years', () => {
    const player = attachContract(
      generateBasketballPlayer({ age: 28, targetOverall: 80 }),
      makeContract({
        startSeason: 2026,
        years: 4,
        startSalary: 10_000_000,
        finalYearGuaranteed: false,
      }),
    );
    const entries = basketballDeadCapForRelease(player, { releaseSeason: 2026, mode: 'waive' });
    expect(entries).toHaveLength(3); // years 4 is unguaranteed; not in dead cap
  });

  it('skips years before the release season', () => {
    const player = attachContract(
      generateBasketballPlayer({ age: 28, targetOverall: 80 }),
      makeContract({ startSeason: 2026, years: 3, startSalary: 10_000_000 }),
    );
    // Release mid-contract in 2027 — only 2027 + 2028 should be dead cap
    const entries = basketballDeadCapForRelease(player, { releaseSeason: 2027, mode: 'waive' });
    expect(entries).toHaveLength(2);
    expect(entries[0].season).toBe(2027);
    expect(entries[1].season).toBe(2028);
  });

  it('returns empty for player with no contract', () => {
    const player = generateBasketballPlayer({ age: 28, targetOverall: 80 });
    const entries = basketballDeadCapForRelease(player, { releaseSeason: 2026, mode: 'waive' });
    expect(entries).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Dead cap — waive-and-stretch
// ---------------------------------------------------------------------------

describe('dead cap — waive-and-stretch', () => {
  it('spreads over (2N+1) years', () => {
    // 3 remaining years of $10M = $30M total → stretch over 7 years
    const player = attachContract(
      generateBasketballPlayer({ age: 30, targetOverall: 80 }),
      makeContract({ startSeason: 2026, years: 3, startSalary: 10_000_000 }),
    );
    const entries = basketballDeadCapForRelease(player, { releaseSeason: 2026, mode: 'stretch' });
    expect(entries).toHaveLength(7);
    const total = entries.reduce((s, e) => s + e.amount, 0);
    expect(total).toBe(30_000_000);
    // Each year roughly $30M / 7 ≈ $4.29M
    for (const e of entries.slice(0, -1)) {
      expect(e.amount).toBeCloseTo(30_000_000 / 7, -4); // within $10k
    }
  });

  it('hits the release season as year 1', () => {
    const player = attachContract(
      generateBasketballPlayer({ age: 30, targetOverall: 80 }),
      makeContract({ startSeason: 2026, years: 2, startSalary: 8_000_000 }),
    );
    const entries = basketballDeadCapForRelease(player, { releaseSeason: 2027, mode: 'stretch' });
    expect(entries[0].season).toBe(2027);
  });

  it('returns empty when no remaining guaranteed money', () => {
    const player = attachContract(
      generateBasketballPlayer({ age: 28, targetOverall: 80 }),
      makeContract({
        startSeason: 2026,
        years: 1,
        startSalary: 5_000_000,
        allGuaranteed: false,
      }),
    );
    const entries = basketballDeadCapForRelease(player, { releaseSeason: 2026, mode: 'stretch' });
    expect(entries).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Stretch preview
// ---------------------------------------------------------------------------

describe('stretch preview', () => {
  it('reports year-1 savings and term extension', () => {
    const player = attachContract(
      generateBasketballPlayer({ age: 30, targetOverall: 80 }),
      makeContract({ startSeason: 2026, years: 3, startSalary: 10_000_000 }),
    );
    const preview = basketballStretchPreview(player, 2026);
    expect(preview).not.toBeNull();
    // Year 1 savings: waive=$10M, stretch≈$4.3M → savings ≈ $5.7M
    expect(preview!.yearOneSavings).toBeGreaterThan(5_000_000);
    expect(preview!.yearOneSavings).toBeLessThan(7_000_000);
    // Term extension: 7 years vs 3 years = +4 years
    expect(preview!.termExtensionYears).toBe(4);
  });

  it('returns null for player with no contract', () => {
    const player = generateBasketballPlayer({ age: 28, targetOverall: 80 });
    expect(basketballStretchPreview(player, 2026)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Market salary
// ---------------------------------------------------------------------------

describe('market salary', () => {
  it('superstar (95+) gets ~25-30% of cap', () => {
    const star = generateBasketballPlayer({ age: 27, targetOverall: 96 });
    const cap = basketballSalaryCap(2026);
    const salary = basketballMarketSalary(star, { season: 2026 });
    expect(salary).toBeGreaterThan(cap * 0.20);
    expect(salary).toBeLessThan(cap * 0.36);
  });

  it('rotation starter (75-80) gets ~7-12% of cap', () => {
    const starter = generateBasketballPlayer({ age: 27, targetOverall: 78 });
    const cap = basketballSalaryCap(2026);
    const salary = basketballMarketSalary(starter, { season: 2026 });
    expect(salary).toBeGreaterThan(cap * 0.05);
    expect(salary).toBeLessThan(cap * 0.14);
  });

  it('bench guy (65-69) gets near league minimum', () => {
    const bench = generateBasketballPlayer({ age: 27, targetOverall: 67 });
    const salary = basketballMarketSalary(bench, { season: 2026 });
    expect(salary).toBeLessThan(5_000_000);
    expect(salary).toBeGreaterThanOrEqual(LEAGUE_MINIMUM_SALARY);
  });

  it('older players (35+) get less than peak players with same OVR', () => {
    const peak = generateBasketballPlayer({ age: 27, targetOverall: 85 });
    const old = generateBasketballPlayer({ age: 36, targetOverall: 85 });
    const peakSalary = basketballMarketSalary(peak, { season: 2026 });
    const oldSalary = basketballMarketSalary(old, { season: 2026 });
    expect(oldSalary).toBeLessThan(peakSalary);
  });

  it('centers + wings command a premium vs guards (same OVR)', () => {
    const guard = generateBasketballPlayer({ age: 27, targetOverall: 80, position: 'PG' });
    const center = generateBasketballPlayer({ age: 27, targetOverall: 80, position: 'C' });
    const guardSalary = basketballMarketSalary(guard, { season: 2026 });
    const centerSalary = basketballMarketSalary(center, { season: 2026 });
    expect(centerSalary).toBeGreaterThan(guardSalary);
  });

  it('deterministic with the same noiseSeed', () => {
    const p = generateBasketballPlayer({ age: 27, targetOverall: 80 });
    const a = basketballMarketSalary(p, { season: 2026, noiseSeed: 'fixed' });
    const b = basketballMarketSalary(p, { season: 2026, noiseSeed: 'fixed' });
    expect(a).toBe(b);
  });

  it('scales with the cap year', () => {
    const p = generateBasketballPlayer({ age: 27, targetOverall: 85 });
    const salary2026 = basketballMarketSalary(p, { season: 2026 });
    const salary2030 = basketballMarketSalary(p, { season: 2030 });
    expect(salary2030).toBeGreaterThan(salary2026); // cap grew, so does salary
  });
});

// ---------------------------------------------------------------------------
// Market contract length
// ---------------------------------------------------------------------------

describe('market contract length', () => {
  it('young stars want 5 years', () => {
    const star = generateBasketballPlayer({ age: 26, targetOverall: 90 });
    expect(basketballMarketContractYears(star)).toBe(5);
  });

  it('aging stars want shorter deals', () => {
    const oldStar = generateBasketballPlayer({ age: 34, targetOverall: 90 });
    const years = basketballMarketContractYears(oldStar);
    expect(years).toBeLessThan(5);
    expect(years).toBeGreaterThanOrEqual(2);
  });

  it('fringe players (sub-73) want 1-2 year deals', () => {
    const fringe = generateBasketballPlayer({ age: 30, targetOverall: 68 });
    const years = basketballMarketContractYears(fringe);
    expect(years).toBeLessThanOrEqual(2);
  });
});
