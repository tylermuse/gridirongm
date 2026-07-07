/**
 * Trade-value calibration (trade-engine overhaul, Phase 1).
 *
 * Encodes the behavioral targets from the overhaul spec §4 as assertions, so the
 * value model stays anchored to how real NBA trades clear:
 *   - Overpaid contracts are NET-NEGATIVE assets (teams attach picks to dump).
 *   - Cheap-and-good young players carry a large surplus premium.
 *   - A productive old vet can't out-value a same-OVR young player (future
 *     seasons are what the market buys).
 *   - Cap space / salary relief is a tradeable asset that makes a
 *     bad-contract-for-picks dump make sense to both sides.
 *
 * These are behavioral (relative) checks, not exact PTS pins — the absolute
 * scale is arbitrary; the ORDERING and SIGN are what matter.
 */

import { describe, it, expect } from 'vitest';
import {
  generateBasketballPlayer,
  basketballTradeValue,
  basketballMarketSalary,
  basketballPickTradeValue,
  evaluateBasketballTrade,
  type BasketballPlayer,
  type BasketballPosition,
  type BasketballTradeProposal,
} from '@bs/sport-basketball';
import type { BaseContract, BaseDraftPick, TeamId } from '@bs/core/adapter';

const SEASON = 2026;

function contract(annual: number, years: number): BaseContract {
  const yrs = [];
  for (let i = 0; i < years; i++) yrs.push({ season: SEASON + i, baseSalary: annual, proratedBonus: 0, guaranteed: true });
  return { years: yrs, signedSeason: SEASON, guaranteedAtSigning: annual * years, modifications: [], sportData: null };
}

/** A player with EXACTLY the given value-relevant inputs. basketballTradeValue
 *  reads only overall/age/position/potential/contract/seasonLog, so we pin those
 *  after generation — this keeps the calibration fully deterministic regardless
 *  of the shared RNG state (other test files advance Math.random before us). */
function mk(
  ovr: number,
  age: number,
  salary: number,
  years: number,
  box?: { ppg: number; rpg: number; apg: number },
  opts: { position?: BasketballPosition; potential?: number } = {},
): BasketballPlayer {
  const position = opts.position ?? 'SF';
  const p = generateBasketballPlayer({ targetOverall: ovr, age, position, rngSeed: `cal-${ovr}-${age}-${position}` });
  const withContract: BasketballPlayer = {
    ...p,
    ratings: { ...p.ratings, overall: ovr },
    development: { ...p.development, potential: opts.potential ?? ovr },
    contract: contract(salary, years),
  };
  if (box) {
    withContract.sportData = {
      ...withContract.sportData,
      seasonLog: [{ season: SEASON - 1, age: age - 1, overall: ovr, gamesPlayed: 70, ...box }],
    };
  }
  return withContract;
}

const val = (p: BasketballPlayer) => basketballTradeValue(p, { season: SEASON });

function fillRoster(payrollTarget: number, count = 14): BasketballPlayer[] {
  const per = Math.round(payrollTarget / count);
  return Array.from({ length: count }, () => mk(68, 25, per, 3));
}

function makePick(round: number, season = SEASON + 1, teamId = 'team-x'): BaseDraftPick {
  return { season, round, originalTeamId: teamId as TeamId, currentTeamId: teamId as TeamId };
}

describe('trade value — negative contracts (§A.1)', () => {
  it('a clearly-overpaid non-star is a NET-NEGATIVE asset', () => {
    // ~$20M over market: a Randle-type dump candidate.
    const overpaid = mk(76, 31, 35_000_000, 3, { ppg: 14, rpg: 7, apg: 3 });
    const market = basketballMarketSalary(overpaid, { season: SEASON });
    expect(overpaid.contract!.years[0].baseSalary).toBeGreaterThan(market); // is overpaid
    expect(val(overpaid)).toBeLessThan(0);
  });

  it('a modest bad contract (Carter-type) is negative and needs only a small sweetener', () => {
    const carter = mk(70, 24, 14_000_000, 2, { ppg: 8, rpg: 3, apg: 2 });
    const v = val(carter);
    expect(v).toBeLessThan(0);
    // A late 2nd/1st (≈ pick #35) should be enough to offset it to roughly even.
    expect(v + basketballPickTradeValue(35)).toBeGreaterThan(0);
  });

  it('a star on a MODEST overpay is dinged, not erased', () => {
    // 90 OVR market is ~$52M; $55M is a real (if modest) overpay.
    const star = mk(90, 30, 55_000_000, 3, { ppg: 26, rpg: 8, apg: 4 });
    const market = basketballMarketSalary(star, { season: SEASON });
    expect(star.contract!.years[0].baseSalary).toBeGreaterThan(market); // is overpaid
    expect(val(star)).toBeGreaterThan(basketballPickTradeValue(10)); // still a premium asset
  });

  it('the same player is worth far more on a cheap deal than an overpaid one', () => {
    const cheap = mk(82, 27, 8_000_000, 4, { ppg: 20, rpg: 4, apg: 3 });
    const pricey = mk(82, 27, 40_000_000, 4, { ppg: 20, rpg: 4, apg: 3 });
    expect(val(cheap)).toBeGreaterThan(val(pricey) + 1000);
  });
});

describe('trade value — rookie-scale surplus premium (§A.2)', () => {
  it('a cheap-and-good young player gets a large surplus premium', () => {
    const cheapYoung = mk(80, 22, 5_000_000, 3, { ppg: 18, rpg: 5, apg: 4 });
    const market = basketballMarketSalary(cheapYoung, { season: SEASON });
    // Massively underpaid vs market → premium.
    expect(cheapYoung.contract!.years[0].baseSalary).toBeLessThan(market * 0.5);
    // Worth more than a same-OVR, same-age player paid at market (the premium is real).
    const atMarket = mk(80, 22, Math.round(market), 3, { ppg: 18, rpg: 5, apg: 4 });
    expect(val(cheapYoung)).toBeGreaterThan(val(atMarket) * 1.2);
  });
});

describe('trade value — future seasons bought, vet floor capped (§A.3)', () => {
  it('a same-OVR young player out-values a productive old vet', () => {
    const young = mk(82, 23, 12_000_000, 4, { ppg: 20, rpg: 5, apg: 4 });
    const old = mk(82, 34, 12_000_000, 2, { ppg: 20, rpg: 5, apg: 4 });
    expect(val(young)).toBeGreaterThan(val(old));
  });

  it('but a producing vet still beats a washed one of equal age/OVR/pay', () => {
    const producer = mk(80, 33, 15_000_000, 2, { ppg: 21, rpg: 6, apg: 5 });
    const washed = mk(80, 33, 15_000_000, 2, { ppg: 5, rpg: 2, apg: 1 });
    expect(val(producer)).toBeGreaterThan(val(washed));
  });
});

describe('trade value — cap space makes a dump work for both sides (§C)', () => {
  it('a bad contract + pick clears with a cap-room rebuilder but not a capped contender', () => {
    const badContract = mk(74, 30, 30_000_000, 2, { ppg: 10, rpg: 4, apg: 2 });
    expect(val(badContract)).toBeLessThan(0); // is a liability

    // Sender (capped contender) attaches a 1st to dump the bad contract.
    const senderFiller = mk(66, 28, 2_000_000, 1);
    const senderRoster = [...fillRoster(150_000_000), badContract, senderFiller];

    // Two candidate receivers: a cap-room rebuilder vs a capped team.
    const roomTeam = [...fillRoster(70_000_000)]; // ~$70M room
    const cappedTeam = [...fillRoster(150_000_000)];

    const proposal = (receiverId: string): BasketballTradeProposal => ({
      season: SEASON,
      sides: [
        { teamId: 'SND' as TeamId, playersSent: [badContract.id], picksSent: [makePick(1)] },
        { teamId: receiverId as TeamId, playersSent: [], picksSent: [] },
      ],
    });

    const withRoom = evaluateBasketballTrade(proposal('RCV'), {
      teamRosters: new Map<TeamId, BasketballPlayer[]>([
        ['SND' as TeamId, senderRoster],
        ['RCV' as TeamId, roomTeam],
      ]),
      disposition: id => (id === 'RCV' ? 'Rebuilding' : 'Win Now'),
    });
    const withoutRoom = evaluateBasketballTrade(proposal('RCV'), {
      teamRosters: new Map<TeamId, BasketballPlayer[]>([
        ['SND' as TeamId, senderRoster],
        ['RCV' as TeamId, cappedTeam],
      ]),
      disposition: id => (id === 'RCV' ? 'Win Now' : 'Win Now'),
    });

    const roomRcv = withRoom.perTeam.find(t => t.teamId === 'RCV')!;
    const cappedRcv = withoutRoom.perTeam.find(t => t.teamId === 'RCV')!;
    // The cap-room rebuilder nets MORE value from the same package than a capped
    // win-now team — cap space is the asset that makes the dump work.
    expect(roomRcv.netValue).toBeGreaterThan(cappedRcv.netValue);
    expect(roomRcv.willAccept).toBe(true);
  });
});
