/**
 * League Rules (commissioner settings on sportData.commissionerSettings).
 *
 * - Defaults: a league with no settings, `{}`, or every rule explicitly at its
 *   default produces identical sims / cap numbers / rollovers.
 * - Every wired rule has an observable effect.
 * - Out-of-range values clamp.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import { simThroughDay, tradeWindowClosed } from '@/../apps/bs-basketball/src/lib/sim/simRange';
import { getInjuries, rollGameInjuries } from '@/../apps/bs-basketball/src/lib/injuries';
import { enterOffseason } from '@/../apps/bs-basketball/src/lib/season';
import { refreshTradeRumors, getActiveRumors } from '@/../apps/bs-basketball/src/lib/trade';
import { getTradeProposals } from '@/../apps/bs-basketball/src/lib/trade/proposals';
import { freeAgentPool, resolveUserOffer, getMaxRoster, bestCompetingOffer } from '@/../apps/bs-basketball/src/lib/freeAgency';
import { nextAction } from '@/../apps/bs-basketball/src/lib/ui/nextAction';
import {
  getLeagueRules,
  applyCapRules,
  withCommissionerSettings,
  resetCommissionerSettings,
  DEFAULT_LEAGUE_RULES,
  type CommissionerSettings,
} from '@/../apps/bs-basketball/src/lib/rules/leagueRules';
import {
  basketballSalaryCap,
  basketballTaxThreshold,
  basketballFirstApron,
  basketballSecondApron,
  basketballTeamCapStatus,
  basketballMaxSalary,
  minimumSalary,
  setCapRulesConfig,
  shouldBasketballPlayerRetire,
  type BasketballPlayer,
} from '@bs/sport-basketball';
import type { PlayerId, TeamId } from '@bs/core/adapter';

type League = ReturnType<typeof createNewBasketballLeague>;

afterEach(() => setCapRulesConfig({}));

function withRules(league: League, cs: CommissionerSettings): League {
  return { ...league, sportData: { ...(league.sportData as object), commissionerSettings: cs } } as League;
}

function simDays(league: League, n: number): League {
  let l = league;
  for (let i = 0; i < n; i++) {
    const r = simNextDay(l);
    if (!r) break;
    l = r.league;
  }
  return l;
}

const ALL_DEFAULTS: CommissionerSettings = {
  capGrowthPct: DEFAULT_LEAGUE_RULES.capGrowthPct,
  taxLinePct: DEFAULT_LEAGUE_RULES.taxLinePct,
  firstApronPct: DEFAULT_LEAGUE_RULES.firstApronPct,
  secondApronPct: DEFAULT_LEAGUE_RULES.secondApronPct,
  taxRateMult: 1,
  maxContractPct: 35,
  minSalaryMult: 1,
  tradeDeadlineDay: 115,
  injuryRateMult: 1,
  injuryDurationMult: 1,
  progressionMult: 1,
  regressionMult: 1,
  retirementAgeOffset: 0,
  maxRoster: 15,
};

/** Strip volatile fields so two runs can be compared structurally. */
function fingerprint(l: League) {
  return {
    tick: l.currentTick,
    scores: l.games.filter(g => g.status === 'played').map(g => [g.id, g.finalScore]),
    injuries: getInjuries(l),
    records: l.teams.map(t => [t.id, t.record.wins, t.record.losses]),
  };
}

describe('league rules — defaults are identical to stock', () => {
  it('resolves an empty / missing settings object to the defaults', () => {
    const league = createNewBasketballLeague({ rngSeed: 'rules-defaults' });
    expect(getLeagueRules(league)).toEqual(DEFAULT_LEAGUE_RULES);
    expect(getLeagueRules(withRules(league, {}))).toEqual(DEFAULT_LEAGUE_RULES);
    expect(getLeagueRules(withRules(league, ALL_DEFAULTS))).toEqual(DEFAULT_LEAGUE_RULES);
    expect(getLeagueRules(null)).toEqual(DEFAULT_LEAGUE_RULES);
  });

  it('same seeded league sims identically with no / empty / explicit-default rules', () => {
    const base = createNewBasketballLeague({ rngSeed: 'rules-identical' });
    const a = fingerprint(simDays(base, 30));
    const b = fingerprint(simDays(withRules(base, {}), 30));
    const c = fingerprint(simDays(withRules(base, ALL_DEFAULTS), 30));
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('cap numbers match the stock curve under default rules', () => {
    const base = createNewBasketballLeague({ rngSeed: 'rules-cap-default' });
    setCapRulesConfig({});
    const stock = [2026, 2027, 2030].map(s => [
      basketballSalaryCap(s), basketballTaxThreshold(s), basketballFirstApron(s), basketballSecondApron(s),
      basketballMaxSalary(10, s), minimumSalary(0), minimumSalary(10),
    ]);
    const roster0 = base.teams[0].playerIds.map(id => base.players[id] as BasketballPlayer);
    const statusStock = basketballTeamCapStatus(roster0, 2026, 30_000_000);
    applyCapRules(withRules(base, ALL_DEFAULTS));
    const ruled = [2026, 2027, 2030].map(s => [
      basketballSalaryCap(s), basketballTaxThreshold(s), basketballFirstApron(s), basketballSecondApron(s),
      basketballMaxSalary(10, s), minimumSalary(0), minimumSalary(10),
    ]);
    expect(ruled).toEqual(stock);
    expect(basketballTeamCapStatus(roster0, 2026, 30_000_000)).toEqual(statusStock);
    expect(stock[0][0]).toBe(165_000_000);
  });

  it('offseason development + retirements are identical under default rules', () => {
    const base = createNewBasketballLeague({ rngSeed: 'rules-dev-default' });
    const a = enterOffseason(base);
    const b = enterOffseason(withRules(base, ALL_DEFAULTS));
    // Existing players only — the generated draft class gets fresh random ids.
    const ids = Object.keys(base.players) as PlayerId[];
    const ovr = (l: League) => ids.map(id => [id, l.players[id]?.age, l.players[id]?.ratings.overall]);
    expect(ovr(b)).toEqual(ovr(a));
  });
});

describe('league rules — each setting has an effect', () => {
  it('trade deadline moves the trade window, rumors, AI offers, and the sim-to-deadline action', () => {
    const base = createNewBasketballLeague({ rngSeed: 'rules-deadline' });
    const at60 = simThroughDay(base, 60).league;
    expect(at60.currentTick).toBeGreaterThan(50);
    // Stock deadline (115): window open on ~day 60.
    expect(tradeWindowClosed(at60).closed).toBe(false);
    // Deadline 40: closed, and the reason names the custom day.
    const early = withRules(at60, { tradeDeadlineDay: 40 });
    const w = tradeWindowClosed(early);
    expect(w.closed).toBe(true);
    expect(w.reason).toContain('Day 40');
    // Rumor mill shuts down after the (custom) deadline.
    expect(getActiveRumors(refreshTradeRumors(early))).toHaveLength(0);
    // No sim-to-deadline once it has passed.
    expect((nextAction(early).secondary ?? []).some(s => s.key === 'simDeadline')).toBe(false);
    expect((nextAction(at60).secondary ?? []).some(s => s.key === 'simDeadline')).toBe(true);

    // AI offers: sim days 1-70 for a user team. Stock (115) keeps offers coming
    // after day 40; a Day-40 deadline stops new offers on day 41 and clears the inbox.
    const user = { ...base, userTeamId: base.teams[0].id } as League;
    const stockRun = simThroughDay(user, 70).league;
    const earlyRun = simThroughDay(withRules(user, { tradeDeadlineDay: 40 }), 70).league;
    const created = (l: League) => getTradeProposals(l).map(p => p.createdDay);
    expect(created(stockRun).some(d => d > 40)).toBe(true);
    expect(created(earlyRun).length).toBeGreaterThan(0);
    expect(created(earlyRun).every(d => d <= 40)).toBe(true);
    expect(getTradeProposals(earlyRun).filter(p => p.status === 'pending')).toHaveLength(0);
    // A late deadline keeps the window open past the stock day.
    const past = simThroughDay(stockRun, 125).league;
    expect(tradeWindowClosed(past).closed).toBe(true);
    expect(tradeWindowClosed(withRules(past, { tradeDeadlineDay: 165 })).closed).toBe(false);
  });

  it('injury frequency 0 → no new injuries; 3 → more than default', () => {
    const base = createNewBasketballLeague({ rngSeed: 'rules-injury' });
    const count = (l: League) => Object.keys(getInjuries(l)).length;
    // Count distinct injuries by tracking every id ever injured.
    const run = (cs: CommissionerSettings) => {
      let l = withRules(base, cs);
      const seen = new Set<string>();
      for (let i = 0; i < 40; i++) {
        const r = simNextDay(l);
        if (!r) break;
        l = r.league;
        for (const [id, inj] of Object.entries(getInjuries(l))) seen.add(`${id}-${inj.occurredDay}`);
      }
      return { seen: seen.size, final: count(l) };
    };
    const off = run({ injuryRateMult: 0 });
    const stock = run({});
    const high = run({ injuryRateMult: 3 });
    expect(off.seen).toBe(0);
    expect(stock.seen).toBeGreaterThan(0);
    expect(high.seen).toBeGreaterThan(stock.seen);
  });

  it('injury duration multiplier lengthens / shortens time missed', () => {
    const base = createNewBasketballLeague({ rngSeed: 'rules-injury-dur' });
    const played = simDays(base, 3).games.filter(g => g.status === 'played');
    // Force injuries (rate ×80) so we have a sample, then compare durations.
    const gather = (durationMult: number) => {
      let inj = {};
      for (const g of played) inj = rollGameInjuries(inj, g as never, 10, base.currentSeason, {}, { rateMult: 80, durationMult });
      return Object.values(inj as Record<string, { returnDay: number; severity: string }>)
        .filter(x => x.severity !== 'season_ending')
        .reduce((s, x) => s + (x.returnDay - 10), 0);
    };
    const normal = gather(1);
    expect(normal).toBeGreaterThan(0);
    expect(gather(2)).toBeGreaterThan(normal * 1.7);
    expect(gather(0.5)).toBeLessThan(normal * 0.65);
  });

  it('progression / regression multipliers change rating deltas at rollover', () => {
    const base = createNewBasketballLeague({ rngSeed: 'rules-prog' });
    const deltas = (cs: CommissionerSettings) => {
      const after = enterOffseason(withRules(base, cs));
      let young = 0; let old = 0;
      for (const p of Object.values(base.players) as BasketballPlayer[]) {
        const q = after.players[p.id] as BasketballPlayer | undefined;
        if (!q) continue;
        const d = q.ratings.overall - p.ratings.overall;
        if (p.age <= 22) young += d;
        if (p.age >= 31) old += d;
      }
      return { young, old };
    };
    const stock = deltas({});
    const fastGrow = deltas({ progressionMult: 2 });
    const noGrow = deltas({ progressionMult: 0 });
    const fastAge = deltas({ regressionMult: 2 });
    const noAge = deltas({ regressionMult: 0 });
    expect(stock.young).toBeGreaterThan(0);
    expect(fastGrow.young).toBeGreaterThan(stock.young);
    expect(noGrow.young).toBeLessThan(stock.young);
    expect(stock.old).toBeLessThan(0);
    expect(fastAge.old).toBeLessThan(stock.old);
    expect(noAge.old).toBeGreaterThan(stock.old);
  });

  it('retirement-age offset shifts who retires', () => {
    const league = createNewBasketballLeague({ rngSeed: 'rules-retire' });
    const p = Object.values(league.players)[0] as BasketballPlayer;
    const vet = { ...p, age: 40, ratings: { ...p.ratings, overall: 85 } } as BasketballPlayer;
    expect(shouldBasketballPlayerRetire(vet)).toBe(true);
    expect(shouldBasketballPlayerRetire(vet, { retirementAgeOffset: 2 })).toBe(false);
    const mid = { ...p, age: 36, ratings: { ...p.ratings, overall: 58 } } as BasketballPlayer;
    expect(shouldBasketballPlayerRetire(mid, { retirementAgeOffset: 0 })).toBe(true);
    expect(shouldBasketballPlayerRetire(mid, { retirementAgeOffset: 5 })).toBe(false);
    const young = { ...p, age: 32, ratings: { ...p.ratings, overall: 58 } } as BasketballPlayer;
    expect(shouldBasketballPlayerRetire(young)).toBe(false);
    expect(shouldBasketballPlayerRetire(young, { retirementAgeOffset: -5 })).toBe(true);

    // Through the rollover: earlier retirement → more retirees.
    const retired = (cs: CommissionerSettings) => {
      const after = enterOffseason(withRules(league, cs));
      return Object.keys(league.players).filter(id => !after.players[id as PlayerId]).length;
    };
    expect(retired({ retirementAgeOffset: -5 })).toBeGreaterThan(retired({}));
    expect(retired({ retirementAgeOffset: 5 })).toBeLessThanOrEqual(retired({}));
  });

  it('cap growth only changes FUTURE seasons\' cap (anchored at the current one)', () => {
    const league = createNewBasketballLeague({ rngSeed: 'rules-capgrowth' });
    const s = league.currentSeason;
    const stockNow = basketballSalaryCap(s);
    const stockNext = basketballSalaryCap(s + 1);
    const ruled = withCommissionerSettings(league, { capGrowthPct: 12 });
    expect(basketballSalaryCap(s)).toBe(stockNow);           // this season locked in
    expect(basketballSalaryCap(s + 1)).toBe(Math.round(stockNow * 1.12 / 100_000) * 100_000);
    expect(basketballSalaryCap(s + 1)).toBeGreaterThan(stockNext);
    const zero = withCommissionerSettings(ruled, { capGrowthPct: 0 });
    expect(basketballSalaryCap(s + 3)).toBe(stockNow);       // flat from the anchor
    // Back to default on an un-diverged curve → anchor dropped, stock curve again.
    const back = withCommissionerSettings(zero, { capGrowthPct: undefined });
    expect(basketballSalaryCap(s + 1)).toBe(stockNext);
    expect(getLeagueRules(back).capGrowthAnchor).toBeNull();
  });

  it('flat salary cap, tax line, aprons, tax rate, max contract, min salary', () => {
    const league = createNewBasketballLeague({ rngSeed: 'rules-capmisc' });
    const s = league.currentSeason;
    applyCapRules(withRules(league, { salaryCap: 200_000_000 }));
    expect(basketballSalaryCap(s)).toBe(200_000_000);
    expect(basketballSalaryCap(s + 4)).toBe(200_000_000);

    applyCapRules(withRules(league, { taxLinePct: 10, firstApronPct: 15, secondApronPct: 20 }));
    const cap = basketballSalaryCap(s);
    expect(basketballTaxThreshold(s)).toBe(Math.round(cap * 1.10 / 100_000) * 100_000);
    expect(basketballFirstApron(s)).toBe(Math.round(cap * 1.15 / 100_000) * 100_000);
    expect(basketballSecondApron(s)).toBe(Math.round(cap * 1.20 / 100_000) * 100_000);

    // Tax rate: pad a team's payroll to ~$15M over the line and compare bills.
    const roster = league.teams[0].playerIds.map(id => league.players[id] as BasketballPlayer);
    const bill = (cs: CommissionerSettings) => {
      applyCapRules(withRules(league, cs));
      const base0 = basketballTeamCapStatus(roster, s).payroll;
      const pad = basketballTaxThreshold(s) + 15_000_000 - base0;
      return basketballTeamCapStatus(roster, s, pad).taxBill;
    };
    const stockBill = bill({});
    expect(stockBill).toBeGreaterThan(0);
    expect(bill({ taxRateMult: 2 })).toBeCloseTo(stockBill * 2, -2);
    expect(bill({ taxRateMult: 0 })).toBe(0);

    setCapRulesConfig({});
    const stockMax = basketballMaxSalary(10, s);
    const stockMin = minimumSalary(0);
    applyCapRules(withRules(league, { maxContractPct: 30, minSalaryMult: 2 }));
    expect(basketballMaxSalary(10, s)).toBeCloseTo(stockMax * 30 / 35, 0);
    expect(minimumSalary(0)).toBe(stockMin * 2);
  });

  it('max roster changes the free-agent signing gate', () => {
    const base = createNewBasketballLeague({ rngSeed: 'rules-roster' });
    const userId = base.teams[0].id as TeamId;
    // Make an UNCONTESTED free agent: a clone of the league's weakest player added
    // straight to the pool. Every AI roster stays full, and he's no upgrade over
    // anyone's worst player, so no AI team bids.
    const weakest = (Object.values(base.players) as BasketballPlayer[])
      .filter(p => p.rosterSlot)
      .sort((a, b) => a.ratings.overall - b.ratings.overall)[0];
    const faId = 'rules-test-fa' as PlayerId;
    const fa = { ...weakest, id: faId, rosterSlot: null, contract: null } as BasketballPlayer;
    const league = {
      ...base,
      userTeamId: userId,
      players: { ...base.players, [faId]: fa },
      freeAgentIds: [...base.freeAgentIds, faId],
    } as League;
    expect(league.teams[0].playerIds.length).toBe(15);
    expect(bestCompetingOffer(league, freeAgentPool(league).find(f => f.player.id === faId)!)).toBeNull();
    const info = freeAgentPool(league).find(f => f.player.id === faId)!;
    expect(info).toBeTruthy();
    // Above market (he takes it) but within the minimum-exception ceiling (always
    // cap-legal), so the roster gate is the only thing that can block it.
    const salary = Math.min(minimumSalary(10), Math.max(info.marketSalary * 1.5, minimumSalary(info.player.sportData.yearsInLeague) * 1.2));
    const offer = { years: Math.max(1, info.desiredYears), salaryPerYear: Math.round(salary / 100_000) * 100_000 };

    const blocked = resolveUserOffer(league, faId, offer);
    expect(blocked.outcome).toBe('rejected');
    expect(blocked.message).toContain('15/15');

    // Max 16: the same offer is no longer roster-blocked.
    const ok = resolveUserOffer(withRules(league, { maxRoster: 16 }), faId, offer);
    expect(ok.message ?? '').not.toContain('roster is full');
    expect(ok.outcome).toBe("signed");
    expect(ok.signedTeamId).toBe(userId);
    expect(ok.league.teams[0].playerIds.length).toBe(16);

    // Max 13: a 15-man roster is over the limit; message carries the custom count.
    const r13 = resolveUserOffer(withRules(league, { maxRoster: 13 }), faId, offer);
    expect(r13.outcome).toBe('rejected');
    expect(r13.message).toContain('13/13');

    // Start-of-season AI trim follows the max.
    expect(getMaxRoster(withRules(league, { maxRoster: 17 }))).toBe(17);
  });
});

describe('league rules — clamping + persistence helpers', () => {
  it('clamps out-of-range and garbage values', () => {
    const league = createNewBasketballLeague({ rngSeed: 'rules-clamp' });
    const r = getLeagueRules(withRules(league, {
      tradeDeadlineDay: 999,
      injuryRateMult: -4,
      injuryDurationMult: 0,
      progressionMult: 50,
      regressionMult: Number.NaN,
      retirementAgeOffset: 40,
      maxRoster: 30,
      capGrowthPct: 99,
      maxContractPct: 5,
      salaryCap: 1,
      taxLinePct: 40,
      firstApronPct: 10,   // below the tax line → lifted to it
      secondApronPct: 5,   // below first apron → lifted to it
    } as CommissionerSettings));
    expect(r.tradeDeadlineDay).toBe(165);
    expect(r.injuryRateMult).toBe(0);
    expect(r.injuryDurationMult).toBe(0.25);
    expect(r.progressionMult).toBe(2.5);
    expect(r.regressionMult).toBe(1);
    expect(r.retirementAgeOffset).toBe(5);
    expect(r.maxRoster).toBe(17);
    expect(r.capGrowthPct).toBe(15);
    expect(r.maxContractPct).toBe(20);
    expect(r.salaryCap).toBe(80_000_000);
    expect(r.firstApronPct).toBe(40);
    expect(r.secondApronPct).toBe(40);
    const low = getLeagueRules(withRules(league, { maxRoster: 2, tradeDeadlineDay: 1 }));
    expect(low.maxRoster).toBe(13);
    expect(low.tradeDeadlineDay).toBe(20);
  });

  it('withCommissionerSettings removes keys set to undefined; reset clears all', () => {
    const league = createNewBasketballLeague({ rngSeed: 'rules-merge' });
    const a = withCommissionerSettings(league, { maxRoster: 16, injuryRateMult: 2 });
    expect(getLeagueRules(a).maxRoster).toBe(16);
    const b = withCommissionerSettings(a, { maxRoster: undefined });
    const cs = (b.sportData as { commissionerSettings: CommissionerSettings }).commissionerSettings;
    expect('maxRoster' in cs).toBe(false);
    expect(cs.injuryRateMult).toBe(2);
    const c = resetCommissionerSettings(b);
    expect(getLeagueRules(c)).toEqual(DEFAULT_LEAGUE_RULES);
  });
});
