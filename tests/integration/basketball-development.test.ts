/**
 * Basketball development system tests.
 *
 * Multi-season aging produces realistic career arcs:
 *   - Young players (19-22) generally gain OVR over a few seasons
 *   - Peak players (25-28) stay roughly flat
 *   - Old players (35+) generally lose OVR
 *   - Retirement triggers correctly
 *   - Deterministic on seed
 */

import { describe, it, expect } from 'vitest';
import {
  developBasketballPlayer,
  shouldBasketballPlayerRetire,
  tickBasketballPlayer,
  generateBasketballPlayer,
} from '@bs/sport-basketball';
import type { BasketballPlayer } from '@bs/sport-basketball/types';

function ageOverNSeasons(player: BasketballPlayer, seasons: number, baseSeed: string): BasketballPlayer[] {
  const arr: BasketballPlayer[] = [player];
  let cur = player;
  for (let i = 0; i < seasons; i++) {
    cur = developBasketballPlayer(cur, 2026 + i, { rngSeed: `${baseSeed}-${i}` });
    arr.push(cur);
  }
  return arr;
}

describe('basketball development — aging curve', () => {
  it('young players (19-22) tend to gain OVR over 3 seasons (population test)', () => {
    let totalGain = 0;
    const trials = 50;
    for (let i = 0; i < trials; i++) {
      const rookie = generateBasketballPlayer({
        age: 19,
        targetOverall: 70,
        idOverride: `rookie-${i}`,
      });
      const aged = ageOverNSeasons(rookie, 3, `young-${i}`);
      totalGain += aged[3].ratings.overall - rookie.ratings.overall;
    }
    const avgGain = totalGain / trials;
    expect(avgGain).toBeGreaterThan(3);
    expect(avgGain).toBeLessThan(15);
  });

  it('peak players (25-28) stay roughly flat over 3 seasons', () => {
    let totalChange = 0;
    const trials = 50;
    for (let i = 0; i < trials; i++) {
      const peakPlayer = generateBasketballPlayer({
        age: 26,
        targetOverall: 80,
        idOverride: `peak-${i}`,
      });
      const aged = ageOverNSeasons(peakPlayer, 3, `peak-${i}`);
      totalChange += aged[3].ratings.overall - peakPlayer.ratings.overall;
    }
    const avgChange = totalChange / trials;
    expect(Math.abs(avgChange)).toBeLessThan(5);
  });

  it('old players (35+) tend to lose OVR over 3 seasons', () => {
    let totalLoss = 0;
    const trials = 50;
    for (let i = 0; i < trials; i++) {
      const vet = generateBasketballPlayer({
        age: 35,
        targetOverall: 75,
        idOverride: `vet-${i}`,
      });
      const aged = ageOverNSeasons(vet, 3, `vet-${i}`);
      totalLoss += vet.ratings.overall - aged[3].ratings.overall;
    }
    const avgLoss = totalLoss / trials;
    expect(avgLoss).toBeGreaterThan(3);
    expect(avgLoss).toBeLessThan(20);
  });

  it('athletic ratings decline faster than skill ratings for old players', () => {
    let speedDeclineTotal = 0;
    let threeDeclineTotal = 0;
    const trials = 100;
    for (let i = 0; i < trials; i++) {
      const vet = generateBasketballPlayer({
        age: 33,
        targetOverall: 78,
        idOverride: `decay-${i}`,
      });
      const aged = ageOverNSeasons(vet, 4, `decay-${i}`);
      speedDeclineTotal += vet.ratings.speed - aged[4].ratings.speed;
      threeDeclineTotal += vet.ratings.threePoint - aged[4].ratings.threePoint;
    }
    const avgSpeedDecline = speedDeclineTotal / trials;
    const avgThreeDecline = threeDeclineTotal / trials;
    expect(avgSpeedDecline).toBeGreaterThan(avgThreeDecline);
  });

  it('age field increments by exactly 1 per season', () => {
    const player = generateBasketballPlayer({ age: 25, targetOverall: 75 });
    const aged = developBasketballPlayer(player, 2026);
    expect(aged.age).toBe(26);
  });

  it('yearsInLeague increments by exactly 1 per season', () => {
    const player = generateBasketballPlayer({ age: 22, targetOverall: 72 });
    const aged = developBasketballPlayer(player, 2026);
    expect(aged.sportData.yearsInLeague).toBe(player.sportData.yearsInLeague + 1);
  });

  it('deterministic for the same seed', () => {
    const player = generateBasketballPlayer({ age: 27, targetOverall: 80, idOverride: 'fixed' });
    const a = developBasketballPlayer(player, 2026, { rngSeed: 'seed-x' });
    const b = developBasketballPlayer(player, 2026, { rngSeed: 'seed-x' });
    expect(a.ratings.overall).toBe(b.ratings.overall);
    expect(a.ratings.speed).toBe(b.ratings.speed);
    expect(a.ratings.threePoint).toBe(b.ratings.threePoint);
  });

  it('different seeds produce different outcomes', () => {
    const player = generateBasketballPlayer({ age: 27, targetOverall: 80, idOverride: 'fixed' });
    const seeds = ['a', 'b', 'c', 'd', 'e'];
    const outcomes = new Set(seeds.map(s => developBasketballPlayer(player, 2026, { rngSeed: s }).ratings.overall));
    expect(outcomes.size).toBeGreaterThan(1);
  });

  it('ratings never go below 25 or above 99', () => {
    const vet = generateBasketballPlayer({ age: 35, targetOverall: 75 });
    let cur = vet;
    for (let i = 0; i < 10; i++) {
      cur = developBasketballPlayer(cur, 2026 + i, { rngSeed: `clamp-${i}` });
    }
    const ratingKeys = ['speed', 'strength', 'vertical', 'threePoint', 'midRange', 'finishing',
      'freeThrow', 'postScoring', 'handles', 'passing', 'perimeterDefense', 'interiorDefense',
      'rebounding', 'steal', 'block', 'basketballIQ', 'intangibles'] as const;
    for (const k of ratingKeys) {
      expect(cur.ratings[k]).toBeGreaterThanOrEqual(25);
      expect(cur.ratings[k]).toBeLessThanOrEqual(99);
    }
  });
});

describe('basketball retirement', () => {
  it('does not retire prime-age players (25-30)', () => {
    for (const age of [25, 27, 30]) {
      const p = generateBasketballPlayer({ age, targetOverall: 80 });
      expect(shouldBasketballPlayerRetire(p)).toBe(false);
    }
  });

  it('always retires players age 40+', () => {
    const ancient = generateBasketballPlayer({ age: 40, targetOverall: 60 });
    expect(shouldBasketballPlayerRetire(ancient)).toBe(true);
  });

  it('retires sub-60-OVR players age 35+', () => {
    const declinedVet = generateBasketballPlayer({ age: 36, targetOverall: 55 });
    expect(shouldBasketballPlayerRetire(declinedVet)).toBe(true);
  });

  it('retires sub-55-OVR players age 33+', () => {
    const washed = generateBasketballPlayer({ age: 34, targetOverall: 50 });
    expect(shouldBasketballPlayerRetire(washed)).toBe(true);
  });

  it('does NOT auto-retire elite stars (90+ OVR) even at age 38', () => {
    const oldStar = generateBasketballPlayer({ age: 38, targetOverall: 90 });
    let retireCount = 0;
    for (let i = 0; i < 50; i++) {
      if (shouldBasketballPlayerRetire(oldStar, { rngSeed: `star-retire-${i}` })) retireCount++;
    }
    expect(retireCount).toBeLessThan(50);
  });
});

describe('basketball tickPlayer (mid-season)', () => {
  it('is a no-op in v1 (returns same player)', () => {
    const p = generateBasketballPlayer({ age: 25, targetOverall: 75 });
    const ticked = tickBasketballPlayer(p, 7);
    expect(ticked).toBe(p);
  });
});
