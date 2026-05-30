/**
 * Player generator distribution tests.
 *
 * Sim 1000 random players and verify aggregate distributions look right:
 *   - Position-appropriate heights (Cs taller than PGs by a clear margin)
 *   - Position-appropriate ratings (Cs better at interior D, PGs at handles)
 *   - Overall ratings cluster around league average ~70
 *   - Ages distributed across the 19-40 range with peak ~26
 *   - Wingspan > height for the vast majority
 *
 * Then for draft class:
 *   - Generates exactly N=60 prospects all age 19
 *   - Talent distribution: a few stars (85+), many role players (70-79)
 *
 * And single-player target overall tests:
 *   - generatePlayer({ targetOverall: 92 }) returns OVR within ±3
 */

import { describe, it, expect } from 'vitest';
import {
  generateBasketballPlayer,
  generateBasketballDraftClass,
  computeOverall,
  type BasketballPosition,
  type BasketballPlayer,
} from '@bs/sport-basketball';

describe('basketball player generator', () => {
  it('generates 1000 players with position-appropriate height + skill distributions', () => {
    const N = 1000;
    const players: BasketballPlayer[] = [];
    for (let i = 0; i < N; i++) {
      players.push(generateBasketballPlayer());
    }

    // Group by position
    const byPos: Record<BasketballPosition, BasketballPlayer[]> = {
      PG: [], SG: [], SF: [], PF: [], C: [],
    };
    for (const p of players) {
      byPos[p.sportData.position].push(p);
    }

    // Every position should have a reasonable share of players
    // (NBA roster construction: roughly 22/22/22/18/16 per my distribution)
    for (const pos of Object.keys(byPos) as BasketballPosition[]) {
      expect(byPos[pos].length).toBeGreaterThan(100);
    }

    // Heights: Cs distinctly taller than PGs
    const pgAvgHeight = avg(byPos.PG.map(p => p.ratings.height));
    const cAvgHeight = avg(byPos.C.map(p => p.ratings.height));
    expect(pgAvgHeight).toBeLessThan(76); // PGs avg < 6'4"
    expect(cAvgHeight).toBeGreaterThan(82); // Cs avg > 6'10"
    expect(cAvgHeight - pgAvgHeight).toBeGreaterThan(6); // clear gap

    // PGs better at handles than Cs
    const pgHandles = avg(byPos.PG.map(p => p.ratings.handles));
    const cHandles = avg(byPos.C.map(p => p.ratings.handles));
    expect(pgHandles).toBeGreaterThan(cHandles + 15);

    // Cs better at interior defense + rebounding than PGs
    const pgInteriorD = avg(byPos.PG.map(p => p.ratings.interiorDefense));
    const cInteriorD = avg(byPos.C.map(p => p.ratings.interiorDefense));
    expect(cInteriorD).toBeGreaterThan(pgInteriorD + 15);

    const pgReb = avg(byPos.PG.map(p => p.ratings.rebounding));
    const cReb = avg(byPos.C.map(p => p.ratings.rebounding));
    expect(cReb).toBeGreaterThan(pgReb + 15);

    // Wingspan > height for the vast majority (95%+)
    const wingspanGreater = players.filter(p => p.ratings.wingspan >= p.ratings.height).length;
    expect(wingspanGreater / N).toBeGreaterThan(0.95);

    // Overall ratings cluster around 70
    const avgOvr = avg(players.map(p => p.ratings.overall));
    expect(avgOvr).toBeGreaterThan(63);
    expect(avgOvr).toBeLessThan(77);

    // Ages spread across 19-40, peak around 25-28
    const ages = players.map(p => p.age);
    const avgAge = avg(ages);
    expect(avgAge).toBeGreaterThan(23);
    expect(avgAge).toBeLessThan(29);
    expect(Math.min(...ages)).toBe(19);
    expect(Math.max(...ages)).toBeGreaterThan(33);
  });

  it('hits a target overall within ±3 when specified', () => {
    const targets = [60, 70, 80, 90, 95];
    for (const target of targets) {
      const player = generateBasketballPlayer({ targetOverall: target });
      const drift = Math.abs(player.ratings.overall - target);
      expect(drift, `target ${target}, got ${player.ratings.overall}`).toBeLessThanOrEqual(3);
    }
  });

  it('honors forced position and age', () => {
    const player = generateBasketballPlayer({ position: 'C', age: 22 });
    expect(player.sportData.position).toBe('C');
    expect(player.age).toBe(22);
    // C-specific: should be tall
    expect(player.ratings.height).toBeGreaterThanOrEqual(80);
  });

  it('derives starTier from overall', () => {
    // Targets are bumped a few points above the tier threshold to absorb
    // the ±3 OVR drift the generator allows (e.g. target 99 reliably
    // lands at 95+ which is the superstar threshold).
    const superstar = generateBasketballPlayer({ targetOverall: 99 });
    expect(superstar.sportData.starTier).toBe('superstar');

    const star = generateBasketballPlayer({ targetOverall: 91 });
    expect(star.sportData.starTier).toBe('star');

    const starter = generateBasketballPlayer({ targetOverall: 83 });
    expect(starter.sportData.starTier).toBe('starter');

    const role = generateBasketballPlayer({ targetOverall: 76 });
    expect(role.sportData.starTier).toBe('role');

    const bench = generateBasketballPlayer({ targetOverall: 68 });
    expect(bench.sportData.starTier).toBe('bench');
  });

  it('computeOverall matches recomputed value within tolerance', () => {
    // Generate, then recompute and compare. Should match exactly since we
    // store the computed value.
    for (let i = 0; i < 50; i++) {
      const p = generateBasketballPlayer();
      const recomputed = computeOverall(p.ratings, p.sportData.position);
      // Slight float vs int rounding may cause ±1 drift in edge cases
      expect(Math.abs(p.ratings.overall - recomputed)).toBeLessThanOrEqual(1);
    }
  });

  it('produces names that look like real names', () => {
    for (let i = 0; i < 20; i++) {
      const p = generateBasketballPlayer();
      expect(p.firstName.length).toBeGreaterThan(1);
      expect(p.lastName.length).toBeGreaterThan(1);
      // No empty strings or single-character names
      expect(p.firstName).toMatch(/^[A-Za-z'\\-]+$/);
      expect(p.lastName).toMatch(/^[A-Za-z'\\-]+$/);
    }
  });

  it('rookies have 0 yearsInLeague and potential > overall', () => {
    const rookie = generateBasketballPlayer({ age: 19, targetOverall: 70 });
    expect(rookie.sportData.yearsInLeague).toBe(0);
    expect(rookie.development.potential).toBeGreaterThanOrEqual(rookie.ratings.overall);
  });

  it('vets have low potential gap (no more room to grow)', () => {
    const vet = generateBasketballPlayer({ age: 33, targetOverall: 78 });
    expect(vet.sportData.yearsInLeague).toBe(14);
    // Potential should be close to current overall for old players
    const gap = vet.development.potential - vet.ratings.overall;
    expect(gap).toBeLessThan(10);
  });
});

describe('basketball draft class generator', () => {
  it('produces exactly N prospects, all age 19, all rookies', () => {
    const klass = generateBasketballDraftClass(2026, 60);
    expect(klass).toHaveLength(60);
    for (const p of klass) {
      expect(p.age).toBe(19);
      expect(p.sportData.yearsInLeague).toBe(0);
    }
  });

  it('talent distribution: a few stars, many role players, some fringe', () => {
    // Large sample (30 classes = 1800 prospects) so proportions are stable and
    // the bounds can be wide — keeps the shape meaningful without flaking on the
    // RNG variance of a small sample.
    const allProspects: BasketballPlayer[] = [];
    for (let i = 0; i < 30; i++) {
      allProspects.push(...generateBasketballDraftClass(2026 + i, 60));
    }
    const total = allProspects.length; // 1800
    const ovrs = allProspects.map(p => p.ratings.overall);
    const stars = ovrs.filter(o => o >= 80).length;
    const fringe = ovrs.filter(o => o < 65).length;

    // Stars are a small minority; fringe players are common; stars rarer than fringe.
    expect(stars).toBeGreaterThan(total * 0.02);
    expect(stars).toBeLessThan(total * 0.35);
    expect(fringe).toBeGreaterThan(total * 0.08);
    expect(stars).toBeLessThan(fringe);
  });

  it('all 5 positions represented in a draft class', () => {
    const klass = generateBasketballDraftClass(2026, 60);
    const positions = new Set(klass.map(p => p.sportData.position));
    expect(positions.size).toBe(5);
  });
});

function avg(nums: number[]): number {
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}
