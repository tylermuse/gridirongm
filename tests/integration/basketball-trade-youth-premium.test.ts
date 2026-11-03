/**
 * Regression for the "Chicago trades its top-5 rookie for a journeyman big"
 * offer: a 19-yo 78/90 on a rookie deal was valued the same as a 27-yo 80-OVR
 * center, and a rebuilding AI happily sent him out at "value for value".
 */
import { describe, it, expect } from 'vitest';
import {
  generateBasketballPlayer,
  basketballTradeValue,
  type BasketballPlayer,
  type BasketballPosition,
} from '@bs/sport-basketball';
import type { BaseContract } from '@bs/core/adapter';

const SEASON = 2026;

function contract(annual: number, years: number): BaseContract {
  const yrs = [];
  for (let i = 0; i < years; i++) yrs.push({ season: SEASON + i, baseSalary: annual, proratedBonus: 0, guaranteed: true });
  return { years: yrs, signedSeason: SEASON, guaranteedAtSigning: annual * years, modifications: [], sportData: null };
}

function mk(ovr: number, age: number, salary: number, years: number, position: BasketballPosition, potential = ovr): BasketballPlayer {
  const p = generateBasketballPlayer({ targetOverall: ovr, age, position, rngSeed: `yp-${ovr}-${age}-${position}` });
  return {
    ...p,
    ratings: { ...p.ratings, overall: ovr },
    development: { ...p.development, potential },
    contract: contract(salary, years),
  };
}

const val = (p: BasketballPlayer) => basketballTradeValue(p, { season: SEASON });

describe('trade value — youth/potential premium', () => {
  it('a 19-yo top-5 rookie (78/90) is worth far more than a 27-yo 80-OVR center', () => {
    const wilson = mk(78, 19, 9_800_000, 4, 'PF', 90);
    const gafford = mk(80, 27, 17_300_000, 3, 'C', 80);
    expect(val(wilson)).toBeGreaterThan(val(gafford) * 1.4);
  });

  it('potential matters for the young and barely for vets', () => {
    const youngGap = val(mk(72, 20, 5_000_000, 3, 'SG', 88)) - val(mk(72, 20, 5_000_000, 3, 'SG', 72));
    const vetGap = val(mk(72, 30, 5_000_000, 3, 'SG', 88)) - val(mk(72, 30, 5_000_000, 3, 'SG', 72));
    expect(youngGap).toBeGreaterThan(300);
    expect(vetGap).toBeLessThan(youngGap / 5);
  });

  it('a rookie keeps roughly the value of the pick that selected him', () => {
    // Pick #4 ≈ 2,390 PTS pre-draft; the player it became shouldn't crater.
    const wilson = mk(78, 19, 9_800_000, 4, 'PF', 90);
    expect(val(wilson)).toBeGreaterThan(2200);
    expect(val(wilson)).toBeLessThan(3400); // but not a franchise superstar yet
  });
});
