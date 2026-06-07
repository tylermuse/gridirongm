/**
 * NBA draft system tests.
 *
 * Validates:
 *   - Lottery odds approximate NBA percentages over many trials
 *   - Reverse-standings ordering correct for non-lottery picks
 *   - AI pick selects ~best available with positional preference
 *   - Pick value monotonically decreases by pick number
 *   - Rookie scale contracts have right shape (4yr R1, 2yr R2,
 *     scaled by pick)
 */

import { describe, it, expect } from 'vitest';
import {
  generateBasketballDraftOrder,
  aiBasketballDraftPick,
  basketballPickValue,
  rookieScaleContract,
  generateBasketballPlayer,
  generateBasketballDraftClass,
  type StandingsEntry,
} from '@bs/sport-basketball';
import type { TeamId } from '@bs/core/adapter';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeStandings(numTeams = 30): StandingsEntry[] {
  // Synthesize 30 teams worst-to-best: team-0 = worst, team-29 = best
  // First 14 don't make playoffs; last 16 do.
  const out: StandingsEntry[] = [];
  for (let i = 0; i < numTeams; i++) {
    // Worst team has 17 wins, best has 60 wins, evenly spread
    const wins = Math.round(17 + (i / (numTeams - 1)) * 43);
    out.push({
      teamId: `team-${i}` as TeamId,
      wins,
      losses: 82 - wins,
      madePlayoffs: i >= numTeams - 16,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('draft order generation', () => {
  it('returns 60 entries for the standard 2-round draft', () => {
    const standings = makeStandings();
    const order = generateBasketballDraftOrder(standings, { rngSeed: 'test-1' });
    expect(order).toHaveLength(60);
  });

  it('returns 30 entries for a 1-round draft', () => {
    const standings = makeStandings();
    const order = generateBasketballDraftOrder(standings, { rngSeed: 'test-2', rounds: 1 });
    expect(order).toHaveLength(30);
  });

  it('every team picks exactly twice in a 2-round draft', () => {
    const standings = makeStandings();
    const order = generateBasketballDraftOrder(standings, { rngSeed: 'test-3' });
    const counts: Record<string, number> = {};
    for (const t of order) counts[t] = (counts[t] ?? 0) + 1;
    for (let i = 0; i < 30; i++) {
      expect(counts[`team-${i}`], `team-${i} pick count`).toBe(2);
    }
  });

  it('picks 15-30 are playoff teams in reverse-standings order', () => {
    const standings = makeStandings();
    const order = generateBasketballDraftOrder(standings, { rngSeed: 'test-4' });
    // Picks 1-14 are lottery (random). Picks 15-30 should be playoff teams
    // in reverse-standings: team-14 (worst playoff team) at pick 15,
    // team-29 (best record) at pick 30.
    for (let i = 0; i < 16; i++) {
      const expectedTeam = `team-${14 + i}`;
      expect(order[14 + i]).toBe(expectedTeam);
    }
  });

  it('round 2 (picks 31-60) is strict reverse-standings of all 30 teams', () => {
    const standings = makeStandings();
    const order = generateBasketballDraftOrder(standings, { rngSeed: 'test-5' });
    for (let i = 0; i < 30; i++) {
      expect(order[30 + i]).toBe(`team-${i}`);
    }
  });

  it('worst team wins #1 pick roughly 14% of the time', () => {
    let wins = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      const standings = makeStandings();
      const order = generateBasketballDraftOrder(standings, { rngSeed: `lottery-${i}` });
      if (order[0] === 'team-0') wins++;
    }
    const rate = wins / trials;
    // NBA flat odds: ~14% for the worst team. Loose tolerance ±5%.
    expect(rate).toBeGreaterThan(0.08);
    expect(rate).toBeLessThan(0.20);
  });

  it('deterministic for the same seed', () => {
    const standings = makeStandings();
    const order1 = generateBasketballDraftOrder(standings, { rngSeed: 'fixed' });
    const order2 = generateBasketballDraftOrder(standings, { rngSeed: 'fixed' });
    expect(order1).toEqual(order2);
  });

  it('throws on non-30-team input', () => {
    const standings = makeStandings(28);
    expect(() => generateBasketballDraftOrder(standings)).toThrow();
  });
});

describe('pick value curve', () => {
  it('is monotonically decreasing', () => {
    for (let i = 1; i < 60; i++) {
      expect(basketballPickValue(i)).toBeGreaterThan(basketballPickValue(i + 1));
    }
  });

  it('matches calibration anchors', () => {
    // #1 = 1000 (calibration anchor)
    expect(basketballPickValue(1)).toBe(1000);
    // #14 (last lottery) ≈ 250
    const pick14 = basketballPickValue(14);
    expect(pick14).toBeGreaterThan(200);
    expect(pick14).toBeLessThan(400);
    // #30 (end R1) ≈ 100
    const pick30 = basketballPickValue(30);
    expect(pick30).toBeGreaterThan(80);
    expect(pick30).toBeLessThan(140);
    // #60 (last pick) ≈ 15
    const pick60 = basketballPickValue(60);
    expect(pick60).toBeGreaterThan(10);
    expect(pick60).toBeLessThan(25);
  });
});

describe('AI draft pick', () => {
  it('picks the highest-overall available prospect (pure BPA on empty roster)', () => {
    const prospects = generateBasketballDraftClass(2026, 30);
    prospects.sort((a, b) => b.ratings.overall - a.ratings.overall);
    const chosenId = aiBasketballDraftPick(
      { teamId: 'team-test' as TeamId, rosterPlayers: [] },
      prospects,
      { rngSeed: 'ai-bpa' },
    );
    // The chosen prospect should be the top guy OR near the top
    // (small RNG noise can flip adjacent prospects)
    const chosen = prospects.find(p => p.id === chosenId)!;
    const topThree = prospects.slice(0, 3);
    expect(topThree.some(p => p.id === chosen.id)).toBe(true);
  });

  it('takes the high-ceiling prospect over a polished-but-capped one (upside BPA)', () => {
    // The Dybantsa case: a consensus #1 with a modest current OVR but elite
    // potential must not fall behind higher-OVR, low-ceiling role players.
    const base = generateBasketballPlayer({ position: 'SF', targetOverall: 73 });
    const ceiling = {
      ...base,
      id: 'ceiling-prospect' as ReturnType<typeof generateBasketballPlayer>['id'],
      ratings: { ...base.ratings, overall: 73 },
      development: { ...base.development, potential: 93 },
      sportData: { ...base.sportData, position: 'SF' as const },
    };
    const capped = {
      ...base,
      id: 'capped-prospect' as ReturnType<typeof generateBasketballPlayer>['id'],
      ratings: { ...base.ratings, overall: 76 },
      development: { ...base.development, potential: 78 },
      sportData: { ...base.sportData, position: 'PG' as const },
    };
    let ceilingWins = 0;
    const trials = 50;
    for (let i = 0; i < trials; i++) {
      const choice = aiBasketballDraftPick(
        { teamId: 'team-test' as TeamId, rosterPlayers: [] },
        [capped, ceiling],
        { rngSeed: `upside-${i}` },
      );
      if (choice === 'ceiling-prospect') ceilingWins++;
    }
    expect(ceilingWins).toBeGreaterThan(trials * 0.9);
  });

  it('weighs positional need on a roster lacking a position', () => {
    // Build a roster with NO centers but at least 2 SGs — drafting AI
    // should bump a C up. (Having only 1 SG would also trigger high need
    // since the threshold is "<=1 player", confounding the test.)
    const roster = [
      generateBasketballPlayer({ position: 'PG', targetOverall: 78 }),
      generateBasketballPlayer({ position: 'PG', targetOverall: 75 }),
      generateBasketballPlayer({ position: 'SG', targetOverall: 78 }),
      generateBasketballPlayer({ position: 'SG', targetOverall: 75 }),
      generateBasketballPlayer({ position: 'SF', targetOverall: 76 }),
      generateBasketballPlayer({ position: 'PF', targetOverall: 80 }),
    ];

    // Two prospects with IDENTICAL ratings (just different positions) — so
    // talent is genuinely equal and only positional need separates them.
    // We do this by generating one prospect and cloning with the position
    // changed. Generator variance otherwise confounds the test.
    const baseProspect = generateBasketballPlayer({ position: 'C', targetOverall: 75 });
    const centerProspect = {
      ...baseProspect,
      id: 'center-prospect' as ReturnType<typeof generateBasketballPlayer>['id'],
      sportData: { ...baseProspect.sportData, position: 'C' as const },
    };
    const guardProspect = {
      ...baseProspect,
      id: 'guard-prospect' as ReturnType<typeof generateBasketballPlayer>['id'],
      sportData: { ...baseProspect.sportData, position: 'SG' as const },
    };
    const prospects = [centerProspect, guardProspect];

    // Run many trials; C should clearly win majority due to positional need
    let cWins = 0;
    const trials = 50;
    for (let i = 0; i < trials; i++) {
      const choice = aiBasketballDraftPick(
        { teamId: 'team-test' as TeamId, rosterPlayers: roster },
        prospects,
        { rngSeed: `need-${i}` },
      );
      if (choice === 'center-prospect') cWins++;
    }
    expect(cWins).toBeGreaterThan(trials * 0.7);
  });

  it('throws on empty prospect list', () => {
    expect(() => aiBasketballDraftPick(
      { teamId: 'team-test' as TeamId, rosterPlayers: [] },
      [],
    )).toThrow();
  });
});

describe('rookie scale contracts', () => {
  it('round 1 (pick 1-30) gives 4 years with first 2 guaranteed', () => {
    const c = rookieScaleContract(1, { signedSeason: 2026 });
    expect(c.years).toHaveLength(4);
    expect(c.years[0].guaranteed).toBe(true);
    expect(c.years[1].guaranteed).toBe(true);
    expect(c.years[2].guaranteed).toBe(false); // team option
    expect(c.years[3].guaranteed).toBe(false);
  });

  it('round 2 (pick 31-60) gives 2 years at league minimum', () => {
    const c = rookieScaleContract(45, { signedSeason: 2026 });
    expect(c.years).toHaveLength(2);
    expect(c.years[0].baseSalary).toBe(c.years[1].baseSalary);
    // Both guaranteed in v1
    expect(c.years[0].guaranteed).toBe(true);
    expect(c.years[1].guaranteed).toBe(true);
  });

  it('pick 1 makes way more than pick 30', () => {
    const pick1 = rookieScaleContract(1, { signedSeason: 2026 });
    const pick30 = rookieScaleContract(30, { signedSeason: 2026 });
    expect(pick1.years[0].baseSalary).toBeGreaterThan(pick30.years[0].baseSalary * 3);
  });

  it('round 1 picks get year-over-year raises', () => {
    const c = rookieScaleContract(10, { signedSeason: 2026 });
    expect(c.years[1].baseSalary).toBeGreaterThan(c.years[0].baseSalary);
    expect(c.years[2].baseSalary).toBeGreaterThan(c.years[1].baseSalary);
    expect(c.years[3].baseSalary).toBeGreaterThan(c.years[2].baseSalary);
  });

  it('year-1 salary scales with the league cap', () => {
    const smallCap = rookieScaleContract(1, { signedSeason: 2026, capForSeason: 100_000_000 });
    const bigCap = rookieScaleContract(1, { signedSeason: 2026, capForSeason: 200_000_000 });
    expect(bigCap.years[0].baseSalary).toBe(smallCap.years[0].baseSalary * 2);
  });

  it('throws on invalid pick number', () => {
    expect(() => rookieScaleContract(0, { signedSeason: 2026 })).toThrow();
    expect(() => rookieScaleContract(61, { signedSeason: 2026 })).toThrow();
  });
});
