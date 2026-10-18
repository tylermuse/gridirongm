/**
 * Hoops coaching: contracts, firing → dead money, extensions, the AI offseason
 * carousel, and the player-development coach's effect on progression.
 */

import { describe, it, expect } from 'vitest';
import type { BaseCoach, TeamId } from '@bs/core/adapter';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import { initializePlayoffs, simPlayoffDay, getBracket, isRegularSeasonComplete } from '@/../apps/bs-basketball/src/lib/playoffs';
import { enterOffseason, advanceToNextSeason } from '@/../apps/bs-basketball/src/lib/season';
import { migrateSave, CURRENT_SAVE_VERSION } from '@/../apps/bs-basketball/src/lib/persistence/migrations';
import { getTransactions } from '@/../apps/bs-basketball/src/lib/transactions';
import { teamFinances } from '@/../apps/bs-basketball/src/lib/finances/finances';
import { withCommissionerSettings } from '@/../apps/bs-basketball/src/lib/rules/leagueRules';
import {
  getHeadCoach,
  getDevCoach,
  devCoachMultiplier,
  coachData,
} from '@/../apps/bs-basketball/src/lib/coaching/coaches';
import {
  fireCoach,
  firePreview,
  extendCoach,
  evaluateCoachExtension,
  coachMarketSalary,
  teamCoachDeadMoney,
  coachContractSeason,
  contractEnd,
} from '@/../apps/bs-basketball/src/lib/coaching/contracts';
import { ensureCoachingStaff } from '@/../apps/bs-basketball/src/lib/coaching/carousel';

type League = ReturnType<typeof createNewBasketballLeague>;

function playSeason(l: League): League {
  let g = 0;
  while (!isRegularSeasonComplete(l) && g < 500) {
    const r = simNextDay(l);
    if (!r) break;
    l = r.league as League;
    g++;
  }
  let cur = initializePlayoffs(l) as League;
  g = 0;
  while (!getBracket(cur)!.complete && g < 200) {
    const r = simPlayoffDay(cur);
    if (!r) break;
    cur = r.league as League;
    g++;
  }
  return cur;
}

function staffOf(l: League, teamId: string, role: string): BaseCoach[] {
  const team = l.teams.find(t => t.id === teamId)!;
  return team.coachIds.map(id => (l.coaches as Record<string, BaseCoach>)[id]).filter(c => c?.role === role);
}

function expectFullStaff(l: League) {
  for (const t of l.teams) {
    const hcs = staffOf(l, t.id, 'HC');
    expect(hcs, `${t.abbreviation} HC count`).toHaveLength(1);
    expect(hcs[0].teamId).toBe(t.id);
    expect(hcs[0].contract, `${t.abbreviation} HC contract`).not.toBeNull();
    expect(staffOf(l, t.id, 'PDC'), `${t.abbreviation} PDC count`).toHaveLength(1);
  }
}

describe('coach contracts', () => {
  it('every team has a contracted HC + dev coach after league creation', () => {
    const league = createNewBasketballLeague({ rngSeed: 'coach-contracts' });
    expectFullStaff(league);
    for (const t of league.teams) {
      const hc = getHeadCoach(league, t.id)!;
      const yrs = hc.contract!.years;
      expect(yrs.length).toBeGreaterThanOrEqual(1);
      expect(yrs[0].season).toBe(league.currentSeason);
      expect(yrs[0].baseSalary).toBeGreaterThanOrEqual(4_000_000);
      expect(yrs[0].baseSalary).toBeLessThanOrEqual(12_000_000);
      const pdc = getDevCoach(league, t.id)!;
      expect(pdc.ratings.development).toBeGreaterThanOrEqual(40);
      expect(pdc.ratings.development).toBeLessThanOrEqual(90);
      expect(pdc.contract!.years[0].baseSalary).toBeLessThan(yrs[0].baseSalary);
    }
  });

  it('an old-shape save (contract: null, no dev coach) migrates deterministically', () => {
    const fresh = createNewBasketballLeague({ rngSeed: 'coach-legacy' });
    // Rebuild the v1 shape: one HC per team, no contract, no dev coach.
    const coaches: Record<string, BaseCoach> = {};
    const teams = fresh.teams.map(t => {
      const hc = getHeadCoach(fresh, t.id)!;
      coaches[hc.id] = { ...hc, contract: null, sportData: { scheme: coachData(hc).scheme } };
      return { ...t, coachIds: [hc.id] };
    });
    const legacy = { ...fresh, coaches, teams, saveVersion: 1 } as League;
    expect(getDevCoach(legacy, legacy.teams[0].id)).toBeNull();

    const { state, migrated } = migrateSave(legacy);
    expect(migrated).toBe(true);
    expect(state.saveVersion).toBe(CURRENT_SAVE_VERSION);
    expectFullStaff(state as League);
    // Same head coaches survive (only gained a contract).
    for (const t of legacy.teams) expect(getHeadCoach(state, t.id)!.id).toBe(t.coachIds[0]);
    // Deterministic: a second migration of the same save gives identical staff.
    const again = migrateSave(legacy).state;
    expect(JSON.stringify(again.coaches)).toBe(JSON.stringify(state.coaches));
    // Idempotent on a current save.
    expect(ensureCoachingStaff(state)).toBe(state);
  });

  it('firing creates dead money equal to the remaining salary and keeps one HC', () => {
    const league = createNewBasketballLeague({ rngSeed: 'coach-fire' });
    const team = league.teams[3];
    const hc = getHeadCoach(league, team.id)!;
    const season = coachContractSeason(league);
    const owed = hc.contract!.years.filter(y => y.season >= season).reduce((s, y) => s + y.baseSalary, 0);
    expect(firePreview(hc, season).total).toBe(owed);

    const { league: after, deadMoney, fired } = fireCoach(league, team.id, 'HC');
    expect(fired!.id).toBe(hc.id);
    expect(deadMoney).toBe(owed);
    const t2 = after.teams.find(t => t.id === team.id) as BasketballTeam;
    // Total dead money across seasons = remaining salary; this season's slice shows in finances.
    const allDead = hc.contract!.years.filter(y => y.season >= season)
      .reduce((s, y) => s + teamCoachDeadMoney(t2, y.season), 0);
    expect(allDead).toBe(owed);
    const fin = teamFinances(after, t2);
    expect(fin.expenses.coachDeadMoney).toBe(hc.contract!.years.find(y => y.season === season)!.baseSalary);
    // Coach money is NOT player-cap money.
    expect(fin.expenses.deadCap).toBe(teamFinances(league, team as BasketballTeam).expenses.deadCap);
    // Still exactly one head coach (an interim), and the fired coach is a free agent.
    expectFullStaff(after as League);
    expect(getHeadCoach(after, team.id)!.id).not.toBe(hc.id);
    expect(coachData(getHeadCoach(after, team.id)!).interim).toBe(true);
    expect((after.coaches as Record<string, BaseCoach>)[hc.id].teamId).toBeNull();
    // Replacing the interim costs nothing (non-guaranteed deal).
    const interim = getHeadCoach(after, team.id)!;
    expect(firePreview(interim, season).total).toBe(0);
  });
});

describe('coach extensions', () => {
  function withRecord(l: League, teamId: string, wins: number, losses: number): League {
    return { ...l, teams: l.teams.map(t => (t.id === teamId ? { ...t, record: { ...t.record, wins, losses } } : t)) } as League;
  }

  it('a winning team gets a discount and extends years after the current deal', () => {
    const base = createNewBasketballLeague({ rngSeed: 'coach-extend' });
    const team = base.teams[0];
    const l = withRecord(base, team.id, 55, 27);
    const hc = getHeadCoach(l, team.id)!;
    const endBefore = contractEnd(hc)!;
    const res = evaluateCoachExtension(l, team.id, 'HC', 3)!;
    expect(res.accepted).toBe(true);
    expect(res.terms.startSeason).toBe(endBefore + 1);
    expect(res.terms.salary).toBeLessThanOrEqual(coachMarketSalary(hc, endBefore + 1));
    const { league: after } = extendCoach(l, team.id, 'HC', 3);
    const ext = getHeadCoach(after, team.id)!;
    expect(contractEnd(ext)).toBe(endBefore + 3);
    expect(ext.contract!.modifications.at(-1)?.type).toBe('extension');
  });

  it('an elite coach refuses a long deal from a losing team; a losing team pays a premium', () => {
    const base = createNewBasketballLeague({ rngSeed: 'coach-extend-2' });
    const team = base.teams[1];
    const hcId = getHeadCoach(base, team.id)!.id;
    const elite = { ...base.coaches[hcId as keyof typeof base.coaches], age: 50, ratings: { offense: 88, defense: 88, development: 88, morale: 88 } } as BaseCoach;
    const l = withRecord({ ...base, coaches: { ...base.coaches, [hcId]: elite } } as League, team.id, 20, 62);
    const no = evaluateCoachExtension(l, team.id, 'HC', 4)!;
    expect(no.accepted).toBe(false);
    expect(extendCoach(l, team.id, 'HC', 4).league).toBe(l); // no change on refusal
    const one = evaluateCoachExtension(l, team.id, 'HC', 1)!;
    expect(one.accepted).toBe(true);
    expect(one.terms.salary).toBeGreaterThan(coachMarketSalary(elite, one.terms.startSeason));
  });
});

describe('AI coaching carousel', () => {
  it('over 2 simulated offseasons makes changes, logs them, and every team keeps exactly one HC', () => {
    let league = createNewBasketballLeague({ rngSeed: 'coach-carousel' });
    const userTeamId = league.teams[0].id as TeamId;
    league = { ...league, userTeamId } as League;
    const userHcId = getHeadCoach(league, userTeamId)!.id;
    const startHcs = new Map(league.teams.map(t => [t.id, getHeadCoach(league, t.id)!.id]));

    let changes = 0;
    for (let s = 0; s < 2; s++) {
      const before = new Map(league.teams.map(t => [t.id, getHeadCoach(league, t.id)!.id]));
      league = playSeason(league);
      const off = enterOffseason(league) as League;
      expectFullStaff(off);
      for (const t of off.teams) if (getHeadCoach(off, t.id)!.id !== before.get(t.id)) changes++;
      // Every AI coach covers the upcoming season; résumé line stamped.
      for (const t of off.teams) {
        const hc = getHeadCoach(off, t.id)!;
        if (t.id !== userTeamId) expect(hc.contract!.years.some(y => y.season === off.currentSeason + 1)).toBe(true);
      }
      league = advanceToNextSeason(league) as League;
      expectFullStaff(league);
    }
    expect(changes).toBeGreaterThanOrEqual(1);
    // The user's coach is never touched by the AI carousel.
    if (getHeadCoach(league, userTeamId)!.id !== userHcId) {
      throw new Error('carousel replaced the user team head coach');
    }
    // News: every hire/fire is in the transactions feed.
    const coachingTx = getTransactions(league).filter(t => t.kind === 'coaching');
    expect(coachingTx.some(t => /hires/.test(t.summary))).toBe(true);
    // Résumés: each starting AI head coach who is still employed has 2 seasons logged.
    const survivors = league.teams.filter(t => getHeadCoach(league, t.id)!.id === startHcs.get(t.id));
    for (const t of survivors) expect((coachData(getHeadCoach(league, t.id)!).seasons ?? []).length).toBe(2);
  }, 240_000);

  it('the carousel is deterministic for the same save', () => {
    const base = createNewBasketballLeague({ rngSeed: 'coach-carousel-det' });
    // Force bad records so fires happen.
    const bad = { ...base, teams: base.teams.map((t, i) => ({ ...t, record: { ...t.record, wins: i % 3 === 0 ? 15 : 45, losses: i % 3 === 0 ? 67 : 37 } })) } as League;
    const a = enterOffseason(bad);
    const b = enterOffseason(bad);
    const ids = (l: typeof a) => l.teams.map(t => getHeadCoach(l, t.id)!.id);
    expect(ids(a)).toEqual(ids(b));
    expect(ids(a)).not.toEqual(ids(bad));
  });
});

describe('player-development coach', () => {
  it('multiplier is neutral at 65, ±15% at the extremes, and only for <25s', () => {
    expect(devCoachMultiplier(65, 21)).toBe(1);
    expect(devCoachMultiplier(90, 21)).toBeCloseTo(1.15);
    expect(devCoachMultiplier(40, 21)).toBeCloseTo(0.85);
    expect(devCoachMultiplier(90, 27)).toBe(1);
    expect(devCoachMultiplier(null, 21)).toBe(1);
  });

  function withDevRating(l: League, teamId: string, rating: number): League {
    const pdc = getDevCoach(l, teamId)!;
    return { ...l, coaches: { ...l.coaches, [pdc.id]: { ...pdc, ratings: { ...pdc.ratings, development: rating } } } } as League;
  }

  function youngGrowth(before: League, after: League, teamId: string): number {
    const team = before.teams.find(t => t.id === teamId)!;
    let sum = 0;
    for (const id of team.playerIds) {
      const p0 = before.players[id] as BasketballPlayer;
      const p1 = after.players[id] as BasketballPlayer | undefined;
      if (!p1 || p0.age >= 25) continue;
      sum += p1.ratings.overall - p0.ratings.overall;
    }
    return sum;
  }

  it('an elite dev coach measurably out-develops a neutral one (same seed), and stacks with League Rules', () => {
    const base = createNewBasketballLeague({ rngSeed: 'coach-dev-effect' });
    // Pick the team with the most under-25 players.
    const team = [...base.teams].sort((a, b) =>
      b.playerIds.filter(id => (base.players[id] as BasketballPlayer).age < 25).length
      - a.playerIds.filter(id => (base.players[id] as BasketballPlayer).age < 25).length)[0];
    const neutral = withDevRating(base, team.id, 65);
    const elite = withDevRating(base, team.id, 90);
    const poor = withDevRating(base, team.id, 40);
    const gN = youngGrowth(neutral, enterOffseason(neutral) as League, team.id);
    const gE = youngGrowth(elite, enterOffseason(elite) as League, team.id);
    const gP = youngGrowth(poor, enterOffseason(poor) as League, team.id);
    expect(gE).toBeGreaterThan(gN);
    expect(gP).toBeLessThan(gN);

    // League Rules progression multiplier multiplies with the coach effect.
    const fastN = withCommissionerSettings(neutral, { progressionMult: 2 }) as League;
    const fastE = withCommissionerSettings(elite, { progressionMult: 2 }) as League;
    const fN = youngGrowth(fastN, enterOffseason(fastN) as League, team.id);
    const fE = youngGrowth(fastE, enterOffseason(fastE) as League, team.id);
    expect(fN).toBeGreaterThan(gN);
    expect(fE).toBeGreaterThan(fN);
    // Frozen progression erases the coach's upside entirely (multiplicative).
    const frozenN = withCommissionerSettings(neutral, { progressionMult: 0 }) as League;
    const frozenE = withCommissionerSettings(elite, { progressionMult: 0 }) as League;
    expect(youngGrowth(frozenE, enterOffseason(frozenE) as League, team.id))
      .toBe(youngGrowth(frozenN, enterOffseason(frozenN) as League, team.id));
  });
});
