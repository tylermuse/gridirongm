/**
 * Coach development wiring (parity: coaching matters for the rebuild loop).
 *
 * A player-development coach accelerates a young player's growth. The effect
 * is opt-in: omitting developmentMultiplier (or passing 1.0) reproduces the
 * un-coached aging curve byte-for-byte, so existing development tests are
 * unaffected.
 */
import { describe, it, expect } from 'vitest';
import {
  developBasketballPlayer,
  generateBasketballPlayer,
  resolveBasketballPDCEffect,
} from '@bs/sport-basketball';

describe('coach-driven development', () => {
  it('is neutral when the multiplier is omitted or 1.0', () => {
    const young = generateBasketballPlayer({ position: 'PG', targetOverall: 70, age: 20 });
    const baseline = developBasketballPlayer(young, 2027, { rngSeed: 'fixed' });
    const explicitOne = developBasketballPlayer(young, 2027, { rngSeed: 'fixed', developmentMultiplier: 1 });
    expect(explicitOne.ratings.overall).toBe(baseline.ratings.overall);
  });

  it('a strong development coach grows a young player at least as fast', () => {
    const young = generateBasketballPlayer({ position: 'SF', targetOverall: 68, age: 20 });
    // Same seed → identical gaussian draw, so the only difference is the multiplier.
    const poor = developBasketballPlayer(young, 2027, { rngSeed: 's', developmentMultiplier: resolveBasketballPDCEffect(55, 20) });
    const elite = developBasketballPlayer(young, 2027, { rngSeed: 's', developmentMultiplier: resolveBasketballPDCEffect(95, 20) });
    expect(elite.ratings.overall).toBeGreaterThanOrEqual(poor.ratings.overall);
  });

  it('does not help players past their growth window', () => {
    const vet = generateBasketballPlayer({ position: 'C', targetOverall: 78, age: 30 });
    // PDC effect is 1.0 for age >= 25, so coaching cannot prop up a decliner.
    expect(resolveBasketballPDCEffect(99, 30)).toBe(1.0);
    const coached = developBasketballPlayer(vet, 2027, { rngSeed: 'v', developmentMultiplier: resolveBasketballPDCEffect(99, 30) });
    const uncoached = developBasketballPlayer(vet, 2027, { rngSeed: 'v' });
    expect(coached.ratings.overall).toBe(uncoached.ratings.overall);
  });
});
