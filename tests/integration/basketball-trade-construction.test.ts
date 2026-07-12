/**
 * Trade construction + fit (trade-engine overhaul, Phase 2 §D/§E).
 *
 * Locks in the "looks like a real NBA trade" behaviors:
 *   - Positional need/surplus is read off a roster starter-independently.
 *   - Acceptance pays OVER value for a piece that fills a hole and balks at a
 *     redundant one (positional fit).
 *   - Contention window gates who trades for whom: a rebuilder won't pay for an
 *     aging win-now vet that a contender happily accepts.
 */

import { describe, it, expect } from 'vitest';
import {
  generateBasketballPlayer,
  basketballTradeValue,
  positionalNeed,
  isPositionalSurplus,
  positionalFitShift,
  evaluateBasketballTrade,
  type BasketballPlayer,
  type BasketballPosition,
  type BasketballTradeContext,
  type BasketballTradeProposal,
} from '@bs/sport-basketball';
import type { BaseContract, TeamId } from '@bs/core/adapter';

const SEASON = 2026;

function contract(annual: number, years: number): BaseContract {
  const yrs = [];
  for (let i = 0; i < years; i++) yrs.push({ season: SEASON + i, baseSalary: annual, proratedBonus: 0, guaranteed: true });
  return { years: yrs, signedSeason: SEASON, guaranteedAtSigning: annual * years, modifications: [], sportData: null };
}

function mk(
  ovr: number,
  pos: BasketballPosition,
  age = 26,
  salary = 12_000_000,
  years = 3,
): BasketballPlayer {
  const p = generateBasketballPlayer({ targetOverall: ovr, age, position: pos, rngSeed: `c-${ovr}-${pos}-${age}` });
  return { ...p, ratings: { ...p.ratings, overall: ovr }, sportData: { ...p.sportData, position: pos }, contract: contract(salary, years) };
}

/** A roster deep at PG, solid on the wings, and empty at C. */
function lopsidedRoster(): BasketballPlayer[] {
  return [
    mk(78, 'PG'), mk(75, 'PG'), mk(72, 'PG'), // deep at PG → surplus
    mk(76, 'SG'), mk(73, 'SG'),
    mk(77, 'SF'), mk(74, 'SF'),
    mk(75, 'PF'), mk(72, 'PF'),
    // no center at all → gaping hole
    mk(64, 'SG'), mk(63, 'PF'), mk(62, 'SF'),
  ];
}

describe('positional need / surplus (§D.1)', () => {
  const roster = lopsidedRoster();
  it('reads a hole at C and a strong/deep PG spot', () => {
    expect(positionalNeed(roster, 'C')).toBeGreaterThan(0.8);
    expect(positionalNeed(roster, 'PG')).toBeLessThan(0.2);
    expect(isPositionalSurplus(roster, 'PG')).toBe(true);
    expect(isPositionalSurplus(roster, 'C')).toBe(false);
  });

  it('fit shift is positive for filling a hole, negative for piling on a strength', () => {
    const centerIn = positionalFitShift(roster, [mk(76, 'C')], [mk(74, 'PF')], SEASON);
    const guardIn = positionalFitShift(roster, [mk(76, 'PG')], [mk(74, 'PF')], SEASON);
    expect(centerIn).toBeGreaterThan(0); // acquiring a needed C → more willing
    expect(guardIn).toBeLessThan(centerIn); // a fourth PG is redundant
  });
});

describe('acceptance pays over value for fit (§E.1)', () => {
  function evalDeal(incoming: BasketballPlayer, disposition: BasketballTradeContext['disposition']): boolean {
    // Partner B (the lopsided roster) sends a good PF and receives `incoming`,
    // which is worth clearly LESS — a real value loss B will only stomach if the
    // incoming piece fills its hole (§E: pay OVER value for fit). Both teams sit
    // under the cap so salary matching is moot.
    const bReceives = incoming;
    const bSends = mk(80, 'PF', 27, 26_000_000); // more valuable than incoming
    const filler = Array.from({ length: 12 }, () => mk(64, 'SG', 25, 2_000_000));
    const bRoster = [...lopsidedRoster(), bSends];
    const aRoster = [...filler, bReceives];
    const proposal: BasketballTradeProposal = {
      season: SEASON,
      sides: [
        { teamId: 'A' as TeamId, playersSent: [bReceives.id], picksSent: [] },
        { teamId: 'B' as TeamId, playersSent: [bSends.id], picksSent: [] },
      ],
    };
    const ctx: BasketballTradeContext = {
      teamRosters: new Map<TeamId, BasketballPlayer[]>([
        ['A' as TeamId, aRoster],
        ['B' as TeamId, bRoster],
      ]),
      disposition,
    };
    const res = evaluateBasketballTrade(proposal, ctx);
    return res.perTeam.find(t => t.teamId === 'B')!.willAccept;
  }

  it('B accepts a value loss for a center that fills its hole, but not a redundant guard', () => {
    // A 76 C (fills B's hole) vs a 76 PG (B is already deep) at near-equal value.
    const center = mk(76, 'C', 27, 16_000_000);
    const guard = mk(76, 'PG', 27, 16_000_000);
    // Sanity: the two are close in raw value so the difference is fit, not value.
    expect(Math.abs(basketballTradeValue(center, { season: SEASON }) - basketballTradeValue(guard, { season: SEASON }))).toBeLessThan(300);
    expect(evalDeal(center, undefined)).toBe(true);
    expect(evalDeal(guard, undefined)).toBe(false);
  });
});

describe('contention window gates who trades (§E.1)', () => {
  it('a rebuilder rejects an aging vet that a contender accepts, at the same value', () => {
    // Partner B sends a 24-yo, receives an aging vet of SIMILAR trade value (the
    // vet is higher-OVR to offset the age discount). Salaries are EQUAL so no
    // cap-absorption bonus muddies it — only the contention window decides.
    const youngOut = mk(78, 'SF', 24, 14_000_000);
    const agingVet = mk(83, 'SF', 33, 14_000_000);
    expect(Math.abs(basketballTradeValue(youngOut, { season: SEASON }) - basketballTradeValue(agingVet, { season: SEASON }))).toBeLessThan(300);
    const filler = () => Array.from({ length: 12 }, () => mk(64, 'SG', 25, 2_000_000));
    const proposal: BasketballTradeProposal = {
      season: SEASON,
      sides: [
        { teamId: 'A' as TeamId, playersSent: [agingVet.id], picksSent: [] },
        { teamId: 'B' as TeamId, playersSent: [youngOut.id], picksSent: [] },
      ],
    };
    const ctxFor = (bDisp: 'Rebuilding' | 'Win Now'): BasketballTradeContext => ({
      teamRosters: new Map<TeamId, BasketballPlayer[]>([
        ['A' as TeamId, [...filler(), agingVet]],
        ['B' as TeamId, [...filler(), youngOut]],
      ]),
      disposition: id => (id === 'B' ? bDisp : 'Win Now'),
    });
    const rebuildAccepts = evaluateBasketballTrade(proposal, ctxFor('Rebuilding')).perTeam.find(t => t.teamId === 'B')!.willAccept;
    const winNowAccepts = evaluateBasketballTrade(proposal, ctxFor('Win Now')).perTeam.find(t => t.teamId === 'B')!.willAccept;
    expect(winNowAccepts).toBe(true);
    expect(rebuildAccepts).toBe(false);
  });
});
