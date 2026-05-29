/**
 * Bird rights + available cap actions tests.
 *
 * Final cap-rules test file. Covers tier resolution + max salary
 * computation + action availability under various team cap states.
 */

import { describe, it, expect } from 'vitest';
import {
  basketballResolveBirdRights,
  basketballBirdRightsMaxSalary,
  basketballAvailableCapActions,
  basketballSalaryCap,
  basketballTaxThreshold,
  basketballFirstApron,
  basketballSecondApron,
  generateBasketballPlayer,
} from '@bs/sport-basketball';
import type { BaseContract, ContractYear, TeamId, RosterSlotRef } from '@bs/core/adapter';
import type { BasketballPlayer } from '@bs/sport-basketball/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeContract(opts: { startSeason: number; years: number; startSalary: number; raisePct?: number }): BaseContract {
  const years: ContractYear[] = [];
  let salary = opts.startSalary;
  for (let i = 0; i < opts.years; i++) {
    years.push({
      season: opts.startSeason + i,
      baseSalary: Math.round(salary),
      proratedBonus: 0,
      guaranteed: true,
    });
    salary *= (1 + (opts.raisePct ?? 0));
  }
  return {
    years,
    signedSeason: opts.startSeason,
    guaranteedAtSigning: years.reduce((s, y) => s + y.baseSalary, 0),
    modifications: [],
    sportData: {},
  };
}

function attachContract(
  player: BasketballPlayer,
  contract: BaseContract,
  teamId: string,
  birdRights: 'full' | 'early' | 'none' = 'none',
): BasketballPlayer {
  return {
    ...player,
    contract,
    rosterSlot: { teamId: teamId as TeamId, bucket: 'active' } satisfies RosterSlotRef,
    sportData: { ...player.sportData, birdRights },
  };
}

// ---------------------------------------------------------------------------
// Bird rights resolution
// ---------------------------------------------------------------------------

describe('Bird rights resolution', () => {
  it('returns the player\'s stored tier when team matches current roster team', () => {
    const player = attachContract(
      generateBasketballPlayer({ age: 28, targetOverall: 88 }),
      makeContract({ startSeason: 2026, years: 3, startSalary: 20_000_000 }),
      'team-a',
      'full',
    );
    expect(basketballResolveBirdRights(player, 'team-a' as TeamId)).toBe('full');
  });

  it('returns "none" when team does NOT match current roster team', () => {
    const player = attachContract(
      generateBasketballPlayer({ age: 28, targetOverall: 88 }),
      makeContract({ startSeason: 2026, years: 3, startSalary: 20_000_000 }),
      'team-a',
      'full',
    );
    expect(basketballResolveBirdRights(player, 'team-b' as TeamId)).toBe('none');
  });

  it('returns "none" for unrostered free agents', () => {
    const fa = generateBasketballPlayer({ age: 28, targetOverall: 75 });
    // No rosterSlot
    expect(basketballResolveBirdRights(fa, 'any-team' as TeamId)).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// Max salary via Bird rights
// ---------------------------------------------------------------------------

describe('Bird rights max salary', () => {
  it('full Bird allows max contract (up to 25/30/35% of cap)', () => {
    const player = attachContract(
      generateBasketballPlayer({ age: 26, targetOverall: 92 }),
      makeContract({ startSeason: 2026, years: 3, startSalary: 20_000_000 }),
      'team-a',
      'full',
    );
    // Override yearsInLeague to 5 (post-rookie, pre-7-year tier → 25% cap)
    player.sportData.yearsInLeague = 5;
    const cap = basketballSalaryCap(2026);
    const result = basketballBirdRightsMaxSalary(player, 'team-a' as TeamId, 2026);
    expect(result).not.toBeNull();
    expect(result!.tier).toBe('full');
    expect(result!.maxStartingSalary).toBeCloseTo(cap * 0.25, -3);
    expect(result!.maxLengthYears).toBe(5);
  });

  it('early Bird limits to 175% of prior salary OR ~10% of cap', () => {
    const player = attachContract(
      generateBasketballPlayer({ age: 24, targetOverall: 78 }),
      makeContract({ startSeason: 2026, years: 2, startSalary: 5_000_000 }),
      'team-a',
      'early',
    );
    player.sportData.yearsInLeague = 4;
    // 175% of $5M = $8.75M, vs 10% of cap = $14M → 10% wins
    const result = basketballBirdRightsMaxSalary(player, 'team-a' as TeamId, 2027);
    expect(result).not.toBeNull();
    expect(result!.tier).toBe('early');
    const cap = basketballSalaryCap(2027);
    // Cap is the league avg floor in this case ($14M area)
    expect(result!.maxStartingSalary).toBeGreaterThan(13_000_000);
    expect(result!.maxStartingSalary).toBeLessThan(16_000_000);
  });

  it('returns null when player has no Bird rights with the team', () => {
    const player = attachContract(
      generateBasketballPlayer({ age: 26, targetOverall: 80 }),
      makeContract({ startSeason: 2026, years: 1, startSalary: 8_000_000 }),
      'team-a',
      'none',
    );
    expect(basketballBirdRightsMaxSalary(player, 'team-a' as TeamId, 2026)).toBeNull();
  });

  it('returns null when team is different from current team', () => {
    const player = attachContract(
      generateBasketballPlayer({ age: 26, targetOverall: 88 }),
      makeContract({ startSeason: 2026, years: 3, startSalary: 20_000_000 }),
      'team-a',
      'full',
    );
    expect(basketballBirdRightsMaxSalary(player, 'team-b' as TeamId, 2026)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Available cap actions
// ---------------------------------------------------------------------------

describe('available cap actions', () => {
  it('under-cap team gets sign-with-cap-room + room exception', () => {
    const teamId = 'team-room';
    const players = [
      attachContract(
        generateBasketballPlayer({ age: 25, targetOverall: 75 }),
        makeContract({ startSeason: 2026, years: 1, startSalary: 5_000_000 }),
        teamId,
      ),
    ];
    const actions = basketballAvailableCapActions(teamId as TeamId, players, 2026);
    expect(actions.some(a => a.id === 'sign_with_cap_room')).toBe(true);
    expect(actions.some(a => a.id === 'use_room_exception')).toBe(true);
    // Room teams don't get MLE
    expect(actions.some(a => a.id.startsWith('use_mle'))).toBe(false);
  });

  it('over-cap-under-tax team gets non-tax MLE + BAE', () => {
    const cap = basketballSalaryCap(2026);
    const teamId = 'team-overcap';
    const players = [
      attachContract(
        generateBasketballPlayer({ age: 28, targetOverall: 85 }),
        makeContract({ startSeason: 2026, years: 1, startSalary: cap + 5_000_000 }),
        teamId,
      ),
    ];
    const actions = basketballAvailableCapActions(teamId as TeamId, players, 2026);
    expect(actions.some(a => a.id === 'use_mle_nontax' && a.available)).toBe(true);
    expect(actions.some(a => a.id === 'use_bae' && a.available)).toBe(true);
    expect(actions.some(a => a.id === 'sign_with_cap_room')).toBe(false);
  });

  it('over-tax-under-first-apron team gets tax MLE', () => {
    const tax = basketballTaxThreshold(2026);
    const teamId = 'team-tax';
    const players = [
      attachContract(
        generateBasketballPlayer({ age: 28, targetOverall: 92 }),
        makeContract({ startSeason: 2026, years: 1, startSalary: tax + 3_000_000 }),
        teamId,
      ),
    ];
    const actions = basketballAvailableCapActions(teamId as TeamId, players, 2026);
    expect(actions.some(a => a.id === 'use_mle_taxpayer' && a.available)).toBe(true);
  });

  it('first-apron team blocks BAE', () => {
    const apron = basketballFirstApron(2026);
    const teamId = 'team-apron';
    const players = [
      attachContract(
        generateBasketballPlayer({ age: 30, targetOverall: 95 }),
        makeContract({ startSeason: 2026, years: 1, startSalary: apron + 2_000_000 }),
        teamId,
      ),
    ];
    const actions = basketballAvailableCapActions(teamId as TeamId, players, 2026);
    const bae = actions.find(a => a.id === 'use_bae');
    expect(bae).toBeDefined();
    expect(bae!.available).toBe(false);
    expect(bae!.blockedReason).toContain('first apron');
  });

  it('second-apron team blocks MLE entirely', () => {
    const apron2 = basketballSecondApron(2026);
    const teamId = 'team-second-apron';
    const players = [
      attachContract(
        generateBasketballPlayer({ age: 30, targetOverall: 95 }),
        makeContract({ startSeason: 2026, years: 1, startSalary: apron2 + 5_000_000 }),
        teamId,
      ),
    ];
    const actions = basketballAvailableCapActions(teamId as TeamId, players, 2026);
    const mle = actions.find(a => a.id === 'use_mle');
    expect(mle).toBeDefined();
    expect(mle!.available).toBe(false);
    expect(mle!.blockedReason).toContain('second apron');
  });

  it('always offers veteran minimum signing', () => {
    const teamId = 'team-min';
    const actions = basketballAvailableCapActions(teamId as TeamId, [], 2026);
    expect(actions.some(a => a.id === 'sign_minimum' && a.available)).toBe(true);
  });

  it('offers waive-and-stretch when team has releasable contracts', () => {
    const teamId = 'team-stretch';
    const players = [
      attachContract(
        generateBasketballPlayer({ age: 32, targetOverall: 70 }),
        makeContract({ startSeason: 2026, years: 2, startSalary: 10_000_000 }),
        teamId,
      ),
    ];
    const actions = basketballAvailableCapActions(teamId as TeamId, players, 2026);
    expect(actions.some(a => a.id === 'stretch_release' && a.available)).toBe(true);
  });

  it('does NOT offer stretch when team has no releasable contracts', () => {
    const teamId = 'team-empty';
    const actions = basketballAvailableCapActions(teamId as TeamId, [], 2026);
    expect(actions.some(a => a.id === 'stretch_release')).toBe(false);
  });
});
