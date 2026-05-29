/**
 * NBA cap rules tests — foundation layer.
 *
 * Covers: cap calculation, contract legality, team payroll math.
 * Dead cap + market salary + Bird rights tested in follow-up commits.
 */

import { describe, it, expect } from 'vitest';
import {
  basketballSalaryCap,
  basketballTaxThreshold,
  basketballFirstApron,
  basketballSecondApron,
  isLegalBasketballContract,
  basketballTeamPayroll,
  basketballTeamCapStatus,
  isLegalBasketballRoster,
  basketballContractRemainingGuaranteed,
  BASE_CAP_2026,
  MAX_CONTRACT_YEARS,
  MAX_YEARLY_RAISE,
  LEAGUE_MINIMUM_SALARY,
  generateBasketballPlayer,
} from '@bs/sport-basketball';
import type { BaseContract, ContractYear, PlayerId, TeamId, RosterSlotRef } from '@bs/core/adapter';
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
}): BaseContract {
  const years: ContractYear[] = [];
  let salary = opts.startSalary;
  const guaranteed = opts.allGuaranteed ?? true;
  for (let i = 0; i < opts.years; i++) {
    years.push({
      season: opts.startSeason + i,
      baseSalary: Math.round(salary),
      proratedBonus: 0,
      guaranteed,
    });
    salary *= (1 + (opts.raisePct ?? 0));
  }
  return {
    years,
    signedSeason: opts.startSeason,
    guaranteedAtSigning: guaranteed ? years.reduce((s, y) => s + y.baseSalary, 0) : 0,
    modifications: [],
    sportData: {},
  };
}

function attachContract(
  player: BasketballPlayer,
  contract: BaseContract,
  teamId = 'team-test' as TeamId,
): BasketballPlayer {
  return {
    ...player,
    contract,
    rosterSlot: { teamId, bucket: 'active' } satisfies RosterSlotRef,
  };
}

// ---------------------------------------------------------------------------
// Cap calculation
// ---------------------------------------------------------------------------

describe('salary cap calculation', () => {
  it('2026-27 cap matches the anchor value', () => {
    expect(basketballSalaryCap(2026)).toBe(BASE_CAP_2026);
  });

  it('cap rises ~7% per year', () => {
    const cap2026 = basketballSalaryCap(2026);
    const cap2027 = basketballSalaryCap(2027);
    const rise = (cap2027 - cap2026) / cap2026;
    expect(rise).toBeGreaterThan(0.06);
    expect(rise).toBeLessThan(0.08);
  });

  it('tax threshold > cap', () => {
    const cap = basketballSalaryCap(2026);
    const tax = basketballTaxThreshold(2026);
    expect(tax).toBeGreaterThan(cap);
  });

  it('aprons stack above tax threshold', () => {
    const cap = basketballSalaryCap(2026);
    const tax = basketballTaxThreshold(2026);
    const apron1 = basketballFirstApron(2026);
    const apron2 = basketballSecondApron(2026);
    expect(tax).toBeGreaterThan(cap);
    expect(apron1).toBeGreaterThan(tax);
    expect(apron2).toBeGreaterThan(apron1);
  });

  it('past-anchor seasons (pre-2026) produce smaller caps', () => {
    const cap2025 = basketballSalaryCap(2025);
    const cap2026 = basketballSalaryCap(2026);
    expect(cap2025).toBeLessThan(cap2026);
  });
});

// ---------------------------------------------------------------------------
// Contract legality
// ---------------------------------------------------------------------------

describe('contract legality', () => {
  it('accepts a vanilla 3-year deal at $15M with 5% raises', () => {
    const player = generateBasketballPlayer({ age: 26, targetOverall: 78 });
    const contract = makeContract({
      startSeason: 2026,
      years: 3,
      startSalary: 15_000_000,
      raisePct: 0.05,
    });
    const result = isLegalBasketballContract(contract, player, 2026);
    expect(result.legal).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('rejects 0-year contract', () => {
    const player = generateBasketballPlayer({ age: 26, targetOverall: 78 });
    const contract = makeContract({ startSeason: 2026, years: 0, startSalary: 5_000_000 });
    const result = isLegalBasketballContract(contract, player, 2026);
    expect(result.legal).toBe(false);
  });

  it(`rejects contract longer than ${MAX_CONTRACT_YEARS} years`, () => {
    const player = generateBasketballPlayer({ age: 26, targetOverall: 78 });
    const contract = makeContract({
      startSeason: 2026,
      years: MAX_CONTRACT_YEARS + 1,
      startSalary: 5_000_000,
    });
    const result = isLegalBasketballContract(contract, player, 2026);
    expect(result.legal).toBe(false);
    expect(result.violations.some(v => v.includes('max length'))).toBe(true);
  });

  it('rejects below-minimum salary', () => {
    const player = generateBasketballPlayer({ age: 26, targetOverall: 70 });
    const contract = makeContract({
      startSeason: 2026,
      years: 1,
      startSalary: LEAGUE_MINIMUM_SALARY - 100_000,
    });
    const result = isLegalBasketballContract(contract, player, 2026);
    expect(result.legal).toBe(false);
    expect(result.violations.some(v => v.includes('minimum'))).toBe(true);
  });

  it('enforces 25% cap on 0-6 year players (rookie max)', () => {
    const player = generateBasketballPlayer({ age: 22, targetOverall: 95 });
    // Override yearsInLeague to 3 (post-rookie scale, pre-7-year tier)
    player.sportData.yearsInLeague = 3;
    const cap = basketballSalaryCap(2026);
    const overMax = cap * 0.30; // 30% — too high for a 3-year player
    const contract = makeContract({
      startSeason: 2026,
      years: 4,
      startSalary: overMax,
      raisePct: 0,
    });
    const result = isLegalBasketballContract(contract, player, 2026);
    expect(result.legal).toBe(false);
    expect(result.violations.some(v => v.includes('25% of cap'))).toBe(true);
  });

  it('allows 30% cap for 7-9 year players', () => {
    const player = generateBasketballPlayer({ age: 30, targetOverall: 92 });
    player.sportData.yearsInLeague = 8;
    const cap = basketballSalaryCap(2026);
    const at30Pct = cap * 0.30;
    const contract = makeContract({
      startSeason: 2026,
      years: 3,
      startSalary: at30Pct,
      raisePct: 0,
    });
    const result = isLegalBasketballContract(contract, player, 2026);
    expect(result.legal).toBe(true);
  });

  it('allows 35% cap for 10+ year players (supermax)', () => {
    const player = generateBasketballPlayer({ age: 34, targetOverall: 95 });
    player.sportData.yearsInLeague = 12;
    const cap = basketballSalaryCap(2026);
    const at35Pct = cap * 0.35;
    const contract = makeContract({
      startSeason: 2026,
      years: 4,
      startSalary: at35Pct,
      raisePct: 0.05,
    });
    const result = isLegalBasketballContract(contract, player, 2026);
    expect(result.legal).toBe(true);
  });

  it(`rejects raises over ${(MAX_YEARLY_RAISE * 100).toFixed(0)}% per year`, () => {
    const player = generateBasketballPlayer({ age: 26, targetOverall: 78 });
    const contract = makeContract({
      startSeason: 2026,
      years: 4,
      startSalary: 10_000_000,
      raisePct: 0.15, // 15% raise — too high
    });
    const result = isLegalBasketballContract(contract, player, 2026);
    expect(result.legal).toBe(false);
    expect(result.violations.some(v => v.includes('raise'))).toBe(true);
  });

  it('flags pay-cut years as warnings (legal but unusual)', () => {
    const player = generateBasketballPlayer({ age: 26, targetOverall: 78 });
    const contract = makeContract({
      startSeason: 2026,
      years: 3,
      startSalary: 15_000_000,
      raisePct: -0.20, // 20% cut per year — unusual but legal
    });
    const result = isLegalBasketballContract(contract, player, 2026);
    // Pay cuts pass cap rules but should produce warnings
    expect(result.legal).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('rejects contracts with out-of-order season years', () => {
    const player = generateBasketballPlayer({ age: 26, targetOverall: 78 });
    const contract: BaseContract = {
      years: [
        { season: 2026, baseSalary: 10_000_000, proratedBonus: 0, guaranteed: true },
        { season: 2028, baseSalary: 10_000_000, proratedBonus: 0, guaranteed: true }, // skipped 2027
      ],
      signedSeason: 2026,
      guaranteedAtSigning: 20_000_000,
      modifications: [],
      sportData: {},
    };
    const result = isLegalBasketballContract(contract, player, 2026);
    expect(result.legal).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Team payroll
// ---------------------------------------------------------------------------

describe('team payroll math', () => {
  it('sums all rostered players for the season', () => {
    const players: BasketballPlayer[] = [];
    for (let i = 0; i < 5; i++) {
      const p = generateBasketballPlayer({ age: 26, targetOverall: 78 });
      players.push(attachContract(p, makeContract({
        startSeason: 2026,
        years: 2,
        startSalary: 10_000_000,
      })));
    }
    const payroll = basketballTeamPayroll(players, 2026);
    expect(payroll).toBe(5 * 10_000_000);
  });

  it('excludes two-way contracts from cap', () => {
    const cap = generateBasketballPlayer({ age: 26, targetOverall: 78 });
    const cappedPlayer = attachContract(cap, makeContract({
      startSeason: 2026,
      years: 1,
      startSalary: 5_000_000,
    }));
    const twoWay = generateBasketballPlayer({ age: 22, targetOverall: 65 });
    twoWay.sportData.isTwoWay = true;
    const twoWayWithContract = attachContract(twoWay, makeContract({
      startSeason: 2026,
      years: 1,
      startSalary: 559_782, // real two-way figure
    }));
    const payroll = basketballTeamPayroll([cappedPlayer, twoWayWithContract], 2026);
    expect(payroll).toBe(5_000_000);
  });

  it('ignores contracts that don\'t cover the requested season', () => {
    const player = generateBasketballPlayer({ age: 26, targetOverall: 78 });
    const expired = attachContract(player, makeContract({
      startSeason: 2024,
      years: 1,
      startSalary: 5_000_000,
    }));
    const payroll = basketballTeamPayroll([expired], 2026);
    expect(payroll).toBe(0);
  });

  it('reports cap status correctly for under/over tax teams', () => {
    const cap = basketballSalaryCap(2026);
    const tax = basketballTaxThreshold(2026);

    // Team under the cap
    const underPlayers = Array.from({ length: 3 }, () =>
      attachContract(
        generateBasketballPlayer({ age: 26, targetOverall: 75 }),
        makeContract({ startSeason: 2026, years: 1, startSalary: 10_000_000 }),
      ),
    );
    const underStatus = basketballTeamCapStatus(underPlayers, 2026);
    expect(underStatus.payroll).toBeLessThan(cap);
    expect(underStatus.capRoom).toBeGreaterThan(0);
    expect(underStatus.isOverCap).toBe(false);
    expect(underStatus.isOverTax).toBe(false);
    expect(underStatus.taxBill).toBe(0);

    // Team well over the tax — payroll = tax + $10M
    const overPlayers = [
      attachContract(
        generateBasketballPlayer({ age: 30, targetOverall: 92 }),
        makeContract({ startSeason: 2026, years: 1, startSalary: tax + 10_000_000 }),
      ),
    ];
    const overStatus = basketballTeamCapStatus(overPlayers, 2026);
    expect(overStatus.isOverTax).toBe(true);
    expect(overStatus.taxBill).toBeGreaterThan(0);
    // Tax on $10M over should be: $5M @ $1.50 + $5M @ $1.75 = $7.5M + $8.75M = $16.25M
    expect(overStatus.taxBill).toBeGreaterThan(15_000_000);
    expect(overStatus.taxBill).toBeLessThan(18_000_000);
  });
});

// ---------------------------------------------------------------------------
// Roster validation
// ---------------------------------------------------------------------------

describe('roster validation', () => {
  it('legal team produces no violations', () => {
    const players = Array.from({ length: 12 }, () =>
      attachContract(
        generateBasketballPlayer({ age: 26, targetOverall: 75 }),
        makeContract({ startSeason: 2026, years: 1, startSalary: 8_000_000 }),
      ),
    );
    const result = isLegalBasketballRoster(players, 2026);
    expect(result.legal).toBe(true);
  });

  it('over-second-apron team gets warnings but no violations (v1)', () => {
    const apron2 = basketballSecondApron(2026);
    const big = attachContract(
      generateBasketballPlayer({ age: 30, targetOverall: 95 }),
      makeContract({ startSeason: 2026, years: 1, startSalary: apron2 + 5_000_000 }),
    );
    const result = isLegalBasketballRoster([big], 2026);
    expect(result.legal).toBe(true); // v1: warnings only
    expect(result.warnings.some(w => w.includes('second apron'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Remaining-guaranteed helper
// ---------------------------------------------------------------------------

describe('remaining guaranteed money', () => {
  it('sums guaranteed years from the given season forward', () => {
    const contract = makeContract({
      startSeason: 2026,
      years: 4,
      startSalary: 10_000_000,
      raisePct: 0,
      allGuaranteed: true,
    });
    expect(basketballContractRemainingGuaranteed(contract, 2026)).toBe(40_000_000);
    expect(basketballContractRemainingGuaranteed(contract, 2027)).toBe(30_000_000);
    expect(basketballContractRemainingGuaranteed(contract, 2029)).toBe(10_000_000);
    expect(basketballContractRemainingGuaranteed(contract, 2030)).toBe(0);
  });

  it('excludes non-guaranteed years', () => {
    const contract: BaseContract = {
      years: [
        { season: 2026, baseSalary: 10_000_000, proratedBonus: 0, guaranteed: true },
        { season: 2027, baseSalary: 10_000_000, proratedBonus: 0, guaranteed: true },
        { season: 2028, baseSalary: 10_000_000, proratedBonus: 0, guaranteed: false }, // option
        { season: 2029, baseSalary: 10_000_000, proratedBonus: 0, guaranteed: false }, // option
      ],
      signedSeason: 2026,
      guaranteedAtSigning: 20_000_000,
      modifications: [],
      sportData: {},
    };
    expect(basketballContractRemainingGuaranteed(contract, 2026)).toBe(20_000_000);
  });
});
