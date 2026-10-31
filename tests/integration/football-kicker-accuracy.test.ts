/**
 * Kicker FG accuracy calibration against NFL benchmarks.
 * Attempt mix mirrors the season sim's observed distance distribution
 * (~25% <30, 35% 30-39, 30% 40-49, 10% 50-55).
 */
import { fieldGoalMakeProbability } from '@/lib/engine/simulate';

const MIX: [number, number][] = [];
for (let d = 20; d < 30; d++) MIX.push([d, 0.025]);
for (let d = 30; d < 40; d++) MIX.push([d, 0.035]);
for (let d = 40; d < 50; d++) MIX.push([d, 0.03]);
for (let d = 50; d <= 55; d++) MIX.push([d, 0.1 / 6]);

const overall = (k: number) => MIX.reduce((s, [d, w]) => s + w * fieldGoalMakeProbability(d, k), 0);
const bucket = (lo: number, hi: number, k: number) => {
  let s = 0;
  for (let d = lo; d <= hi; d++) s += fieldGoalMakeProbability(d, k);
  return s / (hi - lo + 1);
};

describe('fieldGoalMakeProbability', () => {
  it('league-average kicker matches NFL distance curve', () => {
    expect(bucket(20, 29, 75)).toBeGreaterThan(0.97);
    expect(bucket(30, 39, 75)).toBeCloseTo(0.92, 1);
    expect(bucket(40, 49, 75)).toBeCloseTo(0.78, 1);
    expect(bucket(50, 55, 75)).toBeCloseTo(0.60, 1);
  });

  it('rating tiers land in NFL ranges', () => {
    expect(overall(65)).toBeGreaterThan(0.74);
    expect(overall(65)).toBeLessThan(0.79);
    expect(overall(75)).toBeGreaterThan(0.83);
    expect(overall(75)).toBeLessThan(0.87);
    expect(overall(85)).toBeGreaterThan(0.91);
    expect(overall(92)).toBeLessThan(0.96);
  });

  it('poor kicker misses the majority of long FGs (spec acceptance)', () => {
    // A 45-rated kicker should make well under half of 50-55y attempts.
    expect(bucket(50, 55, 45)).toBeLessThan(0.50);
    // ...while an average kicker still drains short ones.
    expect(bucket(18, 34, 75)).toBeGreaterThan(0.90);
  });

  it('is monotonic, bounded, and collapses past ~60y with no floor', () => {
    for (let d = 18; d < 74; d++) expect(fieldGoalMakeProbability(d + 1, 75)).toBeLessThanOrEqual(fieldGoalMakeProbability(d, 75));
    expect(fieldGoalMakeProbability(45, 85)).toBeGreaterThan(fieldGoalMakeProbability(45, 65));
    expect(fieldGoalMakeProbability(18, 99)).toBeLessThanOrEqual(0.995);
    // The old de-facto 35% long-range base and the hard 0.05 floor are gone:
    // 65+ yard kicks are near-impossible and 80-yarders cannot be made at all.
    expect(fieldGoalMakeProbability(65, 75)).toBeLessThan(0.20);
    expect(fieldGoalMakeProbability(70, 20)).toBeLessThan(0.03);
    expect(fieldGoalMakeProbability(80, 99)).toBe(0);
  });
});

describe('FBGM import kicking rating', () => {
  it('K uses kick ratings only, P uses punt ratings only', async () => {
    const { readFileSync } = await import('node:fs');
    const { convertFbgmLeague } = await import('@/lib/data/leagueImport');
    const file = JSON.parse(readFileSync('public/rosters/FBGM_NFL_Roster_2026_Updated.json', 'utf8'));
    const { players } = convertFbgmLeague(file);
    const aubrey = players.find(p => p.position === 'K' && p.lastName === 'Aubrey');
    expect(aubrey?.ratings.kicking).toBeGreaterThanOrEqual(95); // kpw 98 / kac 98
    const ks = players.filter(p => p.position === 'K' && p.teamId);
    const avgK = ks.reduce((s, p) => s + p.ratings.kicking, 0) / ks.length;
    expect(avgK).toBeGreaterThan(65);
    const ps = players.filter(p => p.position === 'P' && p.teamId);
    expect(ps.reduce((s, p) => s + p.ratings.kicking, 0) / ps.length).toBeGreaterThan(55);
  });
});
