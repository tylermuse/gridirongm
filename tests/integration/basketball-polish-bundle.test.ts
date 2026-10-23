/**
 * Hoops polish bundle: advanced-stat formulas (hand-checked), power-ranking
 * breakdown sanity, God Mode full editor + create player, FA suitor intel.
 */

import { describe, it, expect } from 'vitest';
import { computeOverall, emptyBasketballStats, type BasketballPlayer, type BasketballStats, type BasketballTeam } from '@bs/sport-basketball';
import type { PlayerId, TeamId } from '@bs/core/adapter';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simThroughDay } from '@/../apps/bs-basketball/src/lib/sim/simRange';
import {
  tsPct, efgPct, gameScore, usgPct, perLite, teamRatings, plusMinusPerGame, possessions, leagueGameScorePerMinute,
} from '@/../apps/bs-basketball/src/lib/stats/advanced';
import { buildAdvancedContext } from '@/../apps/bs-basketball/src/lib/stats/advancedLeague';
import { powerBreakdown, rankByGroup, weightedDepth, REPLACEMENT_OVR, GROUP_LABEL, type GroupKey } from '@/../apps/bs-basketball/src/lib/rankings/powerBreakdown';
import { setGodMode, editPlayer, createPlayer } from '@/../apps/bs-basketball/src/lib/godMode/godMode';
import { getInjuries } from '@/../apps/bs-basketball/src/lib/injuries';
import { aiSuitors, bestCompetingOffer, freeAgentInfo } from '@/../apps/bs-basketball/src/lib/freeAgency';
import {
  faIntelReport, fuzzRange, revealFaIntel, intelRemaining, isIntelRevealed, INTEL_REPORTS_PER_WINDOW,
} from '@/../apps/bs-basketball/src/lib/freeAgency/intel';
import { saveLeague, loadLeague } from '@/../apps/bs-basketball/src/lib/persistence/db';

function line(p: Partial<BasketballStats>): BasketballStats {
  return { ...emptyBasketballStats(), ...p };
}

// One hand-checked game line.
const P = line({
  gamesPlayed: 1, minutes: 36, points: 25, fieldGoalsMade: 9, fieldGoalsAttempted: 18,
  threePointsMade: 3, threePointsAttempted: 7, freeThrowsMade: 4, freeThrowsAttempted: 5,
  offensiveRebounds: 2, defensiveRebounds: 6, totalRebounds: 8, assists: 5, steals: 1,
  blocks: 1, turnovers: 3, personalFouls: 2, plusMinus: 7,
});
const TEAM = line({ gamesPlayed: 1, minutes: 240, points: 110, fieldGoalsAttempted: 88, freeThrowsAttempted: 25, offensiveRebounds: 10, turnovers: 14 });
const OPP = line({ gamesPlayed: 1, minutes: 240, points: 100, fieldGoalsAttempted: 85, freeThrowsAttempted: 20, offensiveRebounds: 12, turnovers: 15 });

describe('advanced stat formulas (hand-computed)', () => {
  it('TS% = 25 / (2·(18 + 0.44·5)) = 25/40.4', () => {
    expect(tsPct(P)).toBeCloseTo(25 / 40.4, 6);
    expect(tsPct(P)).toBeCloseTo(0.6188, 4);
  });
  it('eFG% = (9 + 0.5·3) / 18 = 0.5833', () => {
    expect(efgPct(P)).toBeCloseTo(10.5 / 18, 6);
  });
  it('+/- per game', () => {
    expect(plusMinusPerGame(P)).toBe(7);
    expect(plusMinusPerGame(line({ gamesPlayed: 4, plusMinus: -10 }))).toBe(-2.5);
  });
  it('Game Score = 20.2', () => {
    // 25 + 3.6 − 12.6 − 0.4 + 1.4 + 1.8 + 1 + 3.5 + 0.7 − 0.8 − 3
    expect(gameScore(P)).toBeCloseTo(20.2, 6);
  });
  it('USG% = 100·23.2·48 / (36·113) ≈ 27.37', () => {
    // player use = 18 + 2.2 + 3 = 23.2; team use = 88 + 11 + 14 = 113
    expect(usgPct(P, TEAM)).toBeCloseTo((100 * 23.2 * 48) / (36 * 113), 6);
    expect(usgPct(P, TEAM)).toBeCloseTo(27.37, 2);
  });
  it('PER-lite anchors league average at 15', () => {
    // A league of only this player → he is exactly average.
    expect(perLite(P, leagueGameScorePerMinute([P]))).toBeCloseTo(15, 6);
    // League at 0.5 GmSc/min: 15 · (20.2/36) / 0.5 = 16.833
    expect(perLite(P, 0.5)).toBeCloseTo(16.8333, 3);
  });
  it('team ORtg / DRtg / Net / Pace', () => {
    expect(possessions(TEAM)).toBeCloseTo(103, 6);   // 88 + 11 − 10 + 14
    expect(possessions(OPP)).toBeCloseTo(96.8, 6);   // 85 + 8.8 − 12 + 15
    const r = teamRatings(TEAM, OPP, 1);
    expect(r.possessions).toBeCloseTo(99.9, 6);
    expect(r.ortg).toBeCloseTo(11000 / 99.9, 6);
    expect(r.drtg).toBeCloseTo(10000 / 99.9, 6);
    expect(r.net).toBeCloseTo(1000 / 99.9, 6);
    expect(r.pace).toBeCloseTo(99.9, 6); // 48 · 99.9 / (240/5)
  });
  it('zero denominators never produce NaN', () => {
    const z = emptyBasketballStats();
    for (const v of [tsPct(z), efgPct(z), usgPct(z, z), perLite(z, 0), plusMinusPerGame(z)]) expect(v).toBe(0);
    const r = teamRatings(z, z, 0);
    expect([r.ortg, r.drtg, r.net, r.pace].every(Number.isFinite)).toBe(true);
  });
});

describe('advanced stats on a simmed league', () => {
  const league = simThroughDay(createNewBasketballLeague({ rngSeed: 'polish-adv' }), 20).league;
  const ctx = buildAdvancedContext(league);

  it('minutes-weighted league PER averages ~15 and rates are sane', () => {
    let wPer = 0, min = 0;
    for (const [pid, s] of ctx.playerStats) {
      const a = ctx.forPlayer(pid, s);
      wPer += a.per * s.minutes; min += s.minutes;
      if (s.fieldGoalsAttempted >= 20) {
        expect(a.ts).toBeGreaterThan(0.2);
        expect(a.ts).toBeLessThan(1);
        expect(a.efg).toBeLessThan(1.1);
      }
    }
    expect(wPer / min).toBeCloseTo(15, 3);
  });

  it('team usage sums to ~100% and ratings are plausible', () => {
    for (const t of league.teams as BasketballTeam[]) {
      const agg = ctx.teamStats.get(t.id)!;
      if (agg.gp === 0) continue;
      let usgMinSum = 0;
      for (const pid of t.playerIds) {
        const s = ctx.playerStats.get(pid);
        if (!s || s.minutes === 0) continue;
        usgMinSum += ctx.forPlayer(pid, s).usg * s.minutes;
      }
      // Σ USG_i · MIN_i / (TmMIN/5) = 100 by construction (exact unless traded).
      expect(usgMinSum / (agg.off.minutes / 5)).toBeCloseTo(100, 0);
      const r = ctx.teamRatings.get(t.id)!;
      expect(r.ortg).toBeGreaterThan(80);
      expect(r.ortg).toBeLessThan(140);
      expect(r.pace).toBeGreaterThan(80);
      expect(r.pace).toBeLessThan(120);
    }
    // League net ratings net out to ~0.
    const nets = [...ctx.teamRatings.values()].map(r => r.net);
    expect(Math.abs(nets.reduce((a, b) => a + b, 0) / nets.length)).toBeLessThan(1);
  });
});

describe('power-rank breakdown', () => {
  it('weightedDepth pads thin groups with replacement level', () => {
    expect(weightedDepth([80, 70], [1, 0.5])).toBeCloseTo((80 + 35) / 1.5, 6);
    expect(weightedDepth([80], [1, 0.5])).toBeCloseTo((80 + 0.5 * REPLACEMENT_OVR) / 1.5, 6);
  });

  it('ranks are a 1..N permutation per group, ordered by value', () => {
    const league = simThroughDay(createNewBasketballLeague({ rngSeed: 'polish-pr' }), 15).league;
    const bd = powerBreakdown(league);
    const n = league.teams.length;
    expect(bd.size).toBe(n);
    for (const k of Object.keys(GROUP_LABEL) as GroupKey[]) {
      const ranks = [...bd.values()].map(b => b.ranks[k]).sort((a, b) => a - b);
      expect(ranks).toEqual(Array.from({ length: n }, (_, i) => i + 1));
      const ordered = rankByGroup(bd, k);
      for (let i = 1; i < ordered.length; i++) {
        if (k === 'drtg') expect(ordered[i].values[k]).toBeGreaterThanOrEqual(ordered[i - 1].values[k]);
        else expect(ordered[i].values[k]).toBeLessThanOrEqual(ordered[i - 1].values[k]);
      }
    }
    for (const b of bd.values()) {
      for (const k of ['backcourt', 'wings', 'frontcourt', 'bench'] as const) {
        expect(b.values[k]).toBeGreaterThanOrEqual(40);
        expect(b.values[k]).toBeLessThanOrEqual(99);
      }
      // net = ortg − drtg
      expect(b.values.net).toBeCloseTo(b.values.ortg - b.values.drtg, 6);
    }
  });

  it('a God-Mode-boosted guard lifts his team’s backcourt', () => {
    let league = setGodMode(createNewBasketballLeague({ rngSeed: 'polish-pr2' }), true);
    const team = league.teams[3] as BasketballTeam;
    const guard = team.playerIds.map(id => league.players[id] as BasketballPlayer).find(p => p.sportData.position === 'PG')!;
    const before = powerBreakdown(league).get(team.id)!.values.backcourt;
    league = editPlayer(league, guard.id, { setOverall: 99 });
    const after = powerBreakdown(league).get(team.id)!.values.backcourt;
    expect(after).toBeGreaterThan(before);
  });
});

describe('god mode full editor', () => {
  it('edits every rating, recomputes OVR via computeOverall, and changes position/contract/injury/mood', () => {
    let league = setGodMode(createNewBasketballLeague({ rngSeed: 'polish-god' }), true);
    const id = league.teams[0].playerIds[0];
    const p0 = league.players[id] as BasketballPlayer;

    league = editPlayer(league, id, {
      ratings: { threePoint: 99, passing: 99, handles: 99, height: 90 },
      position: 'C',
      contract: { salaryPerYear: 12_345_678, years: 3 },
      injury: { days: 20 },
      tradeRequest: 'requested',
      age: 30,
    });
    const p = league.players[id] as BasketballPlayer;
    expect(p.ratings.threePoint).toBe(99);
    expect(p.ratings.passing).toBe(99);
    expect(p.ratings.height).toBe(90);
    expect(p.sportData.position).toBe('C');
    expect(p.ratings.overall).toBe(computeOverall(p.ratings, 'C'));
    expect(p.ratings.overall).not.toBeNaN();
    expect(p.development.potential).toBeGreaterThanOrEqual(p.ratings.overall);
    expect(p.age).toBe(30);
    expect(p.contract!.years).toHaveLength(3);
    expect(p.contract!.years[0].season).toBe(league.currentSeason);
    expect(p.contract!.years.every(y => y.baseSalary === 12_345_678)).toBe(true);
    const inj = getInjuries(league)[id];
    expect(inj.returnDay).toBe(league.currentTick + 20);
    expect(inj.severity).toBe('major');
    expect(p.sportData.tradeRequest?.stage).toBe('requested');
    expect(p0.sportData.position).not.toBe(undefined);

    // Clear injury + trade request; clamp out-of-range ratings.
    league = editPlayer(league, id, { injury: null, tradeRequest: null, ratings: { block: 250, steal: -4 } });
    const q = league.players[id] as BasketballPlayer;
    expect(getInjuries(league)[id]).toBeUndefined();
    expect(q.sportData.tradeRequest).toBeUndefined();
    expect(q.ratings.block).toBe(99);
    expect(q.ratings.steal).toBe(0);
    expect(q.ratings.overall).toBe(computeOverall(q.ratings, 'C'));
    expect((league.sportData as { godModeEverUsed?: boolean }).godModeEverUsed).toBe(true);
  });

  it('is a no-op when God Mode is off', () => {
    const league = createNewBasketballLeague({ rngSeed: 'polish-god-off' });
    const id = league.teams[0].playerIds[0];
    expect(editPlayer(league, id, { ratings: { threePoint: 99 }, position: 'C' })).toBe(league);
    expect(createPlayer(league, { position: 'PG', age: 22, targetOverall: 80 }).playerId).toBeNull();
  });

  it('creates players to a team or free agency at the requested OVR', () => {
    let league = setGodMode(createNewBasketballLeague({ rngSeed: 'polish-create' }), true);
    const team = league.teams[2];
    const r1 = createPlayer(league, { position: 'PF', age: 23, targetOverall: 82, teamId: team.id, firstName: 'Test', lastName: 'Big' });
    league = r1.league;
    const made = league.players[r1.playerId! as PlayerId] as BasketballPlayer;
    expect(made.firstName).toBe('Test');
    expect(made.sportData.position).toBe('PF');
    expect(made.age).toBe(23);
    expect(Math.abs(made.ratings.overall - 82)).toBeLessThanOrEqual(1);
    expect(made.ratings.overall).toBe(computeOverall(made.ratings, 'PF'));
    expect(made.rosterSlot?.teamId).toBe(team.id);
    expect(league.teams[2].playerIds).toContain(made.id);
    expect(made.contract?.years.length).toBe(1);

    const r2 = createPlayer(league, { position: 'SG', age: 30, targetOverall: 65 });
    league = r2.league;
    expect(league.freeAgentIds).toContain(r2.playerId as PlayerId);
    expect((league.players[r2.playerId! as PlayerId] as BasketballPlayer).rosterSlot).toBeNull();
    expect(r2.playerId).not.toBe(r1.playerId);
  });

  it('edits + created players persist through save/load', async () => {
    let league = setGodMode(createNewBasketballLeague({ rngSeed: 'polish-persist' }), true);
    const id = league.teams[0].playerIds[1];
    league = editPlayer(league, id, { ratings: { midRange: 97 }, position: 'SF', contract: { salaryPerYear: 5_000_000, years: 2 } });
    const created = createPlayer(league, { position: 'C', age: 21, targetOverall: 77 });
    league = created.league;
    await saveLeague(league);
    const loaded = await loadLeague(league.id);
    expect(loaded).toBeTruthy();
    const p = loaded!.players[id] as BasketballPlayer;
    expect(p.ratings.midRange).toBe(97);
    expect(p.sportData.position).toBe('SF');
    expect(p.ratings.overall).toBe(computeOverall(p.ratings, 'SF'));
    expect(p.contract!.years[0].baseSalary).toBe(5_000_000);
    expect(loaded!.players[created.playerId! as PlayerId]).toBeTruthy();
    expect(loaded!.freeAgentIds).toContain(created.playerId as PlayerId);
  });
});

describe('FA suitor intel', () => {
  /** A league with a strong player dropped into the pool + open AI spots. */
  function marketLeague() {
    const base = createNewBasketballLeague({ rngSeed: 'polish-fa' });
    const user = base.teams[0] as BasketballTeam;
    const from = base.teams[1] as BasketballTeam;
    const star = [...from.playerIds].sort((a, b) =>
      (base.players[b] as BasketballPlayer).ratings.overall - (base.players[a] as BasketballPlayer).ratings.overall)[0];
    // Open roster spots on several AI teams so the market is live.
    const dropped: PlayerId[] = [star];
    const teams = base.teams.map((t, i) => {
      if (i < 2 || i > 8) return t.id === from.id ? { ...t, playerIds: t.playerIds.filter(x => x !== star) } : t;
      const drop = t.playerIds.slice(-2);
      dropped.push(...drop);
      return { ...t, playerIds: t.playerIds.filter(x => !drop.includes(x)) };
    });
    const players = { ...base.players } as Record<string, BasketballPlayer>;
    for (const pid of dropped) players[pid] = { ...players[pid], rosterSlot: null, contract: null };
    return { league: { ...base, teams, players, freeAgentIds: [...base.freeAgentIds, ...dropped], userTeamId: user.id as TeamId }, star };
  }

  it('fuzzRange is deterministic and always brackets the true value', () => {
    for (let i = 0; i < 200; i++) {
      const v = 1_000_000 + i * 731_337;
      const a = fuzzRange(v, `s${i}`);
      expect(a).toEqual(fuzzRange(v, `s${i}`));
      expect(a.low).toBeLessThanOrEqual(v);
      expect(a.high).toBeGreaterThanOrEqual(v);
      expect(a.high - a.low).toBeGreaterThan(v * 0.1); // never collapses to the exact number
    }
  });

  it('suitors match actual AI interest; front-runner = bestCompetingOffer; deterministic', () => {
    const { league, star } = marketLeague();
    const report = faIntelReport(league, star)!;
    expect(report).toBeTruthy();
    const info = freeAgentInfo(league, star)!;
    const actual = aiSuitors(league, info).map(s => s.teamId).sort();
    expect(report.suitors.map(s => s.teamId).sort()).toEqual(actual);
    expect(report.suitors.length).toBeGreaterThan(0);
    expect(report.suitors.every(s => s.teamId !== league.userTeamId)).toBe(true);

    const best = bestCompetingOffer(league, info)!;
    const front = report.suitors.filter(s => s.frontRunner);
    expect(front).toHaveLength(1);
    expect(front[0].teamId).toBe(best.teamId);
    // Real AI bid (market × years) sits inside every fuzzed range.
    for (const s of report.suitors) {
      expect(s.offerLow).toBeLessThanOrEqual(best.total);
      expect(s.offerHigh).toBeGreaterThanOrEqual(best.total);
    }
    // Priorities are sorted and weighted 0..1.
    for (let i = 1; i < report.priorities.length; i++) expect(report.priorities[i].weight).toBeLessThanOrEqual(report.priorities[i - 1].weight);
    expect(report.priorities.every(p => p.weight >= 0 && p.weight <= 1)).toBe(true);

    expect(faIntelReport(league, star)).toEqual(report);
  });

  it('bestCompetingOffer refactor keeps the Bird-rights team on top', () => {
    const { league, star } = marketLeague();
    const sd = league.sportData as Record<string, unknown>;
    const bird = { ...league, sportData: { ...sd, freeAgentLastTeam: { [star]: league.teams[1].id } } };
    const p = bird.players[star] as BasketballPlayer;
    const withBird = { ...bird, players: { ...bird.players, [star]: { ...p, sportData: { ...p.sportData, birdRights: 'full' as const } } } };
    const info = freeAgentInfo(withBird, star)!;
    expect(bestCompetingOffer(withBird, info)?.teamId).toBe(league.teams[1].id);
    const rep = faIntelReport(withBird, star)!;
    expect(rep.suitors.find(s => s.frontRunner)?.teamId).toBe(league.teams[1].id);
    expect(rep.priorities.some(pr => pr.key === 'loyalty')).toBe(true);
  });

  it('limited intel reports per window, idempotent per player', () => {
    const { league } = marketLeague();
    let l = league;
    expect(intelRemaining(l)).toBe(INTEL_REPORTS_PER_WINDOW);
    const ids = l.freeAgentIds.slice(0, INTEL_REPORTS_PER_WINDOW + 2);
    l = revealFaIntel(l, ids[0]);
    expect(revealFaIntel(l, ids[0])).toBe(l); // same player twice = free
    for (const id of ids.slice(1)) l = revealFaIntel(l, id);
    expect(intelRemaining(l)).toBe(0);
    expect(isIntelRevealed(l, ids[0])).toBe(true);
    expect(isIntelRevealed(l, ids[ids.length - 1])).toBe(false);
    // New season → fresh budget.
    expect(intelRemaining({ ...l, currentSeason: l.currentSeason + 1 })).toBe(INTEL_REPORTS_PER_WINDOW);
    // Non-free-agents can't be scouted.
    expect(revealFaIntel(league, league.teams[0].playerIds[0])).toBe(league);
  });
});
