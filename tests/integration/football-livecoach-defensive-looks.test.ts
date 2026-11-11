/**
 * Live Coach defensive looks (defensiveLooks.ts).
 *
 * Before each snap the user calls, the defense shows a look and the call is resolved against it. Two things must hold:
 *
 *  1. Balance. A coach who ignores the look gets the same play, on average, as before looks existed. A coach who reads
 *     it right gains a real but bounded edge, and one who reads it wrong pays for it.
 *  2. Scope. Looks only touch snaps the user called. CPU snaps and auto-simmed snaps play out exactly as before.
 */

import { describe, it, expect } from 'vitest';
import { createLiveCoachEngine, type LiveEngineState, type LiveCoachOptions } from '@/lib/engine/liveCoachEngine';
import {
  DEFENSIVE_LOOKS, LOOK_PLAYS, LOOK_TABLE, NEUTRAL_WEIGHTS, lookWeights, pickDefensiveLook,
  type DefensiveLook, type LookPlay,
} from '@/lib/engine/defensiveLooks';
import type { Player, Position, Team } from '@/types';

function makePlayer(id: string, position: Position, ovr = 78): Player {
  return {
    id, firstName: 'Test', lastName: id, position, age: 26, experience: 4,
    ratings: {
      overall: ovr, speed: ovr, strength: ovr, agility: ovr, awareness: ovr,
      stamina: ovr, throwing: ovr, catching: ovr, carrying: ovr, blocking: ovr,
      tackling: ovr, coverage: ovr, passRush: ovr, kicking: ovr,
    },
    potential: ovr, ratingHistory: [], stats: {} as Player['stats'],
    careerStats: {} as Player['careerStats'], contract: {} as Player['contract'],
    teamId: null, draftYear: null, draftPick: null, retired: false, injury: null, onIR: false,
  } as unknown as Player;
}
function makeRoster(prefix: string): Player[] {
  return [
    makePlayer(`${prefix}-QB`, 'QB'), makePlayer(`${prefix}-RB`, 'RB'),
    makePlayer(`${prefix}-WR1`, 'WR'), makePlayer(`${prefix}-WR2`, 'WR'),
    makePlayer(`${prefix}-TE`, 'TE'), makePlayer(`${prefix}-K`, 'K'),
    makePlayer(`${prefix}-DL`, 'DL'), makePlayer(`${prefix}-LB`, 'LB'),
    makePlayer(`${prefix}-CB`, 'CB'), makePlayer(`${prefix}-S`, 'S'),
  ];
}
const HOME = makeRoster('H'), AWAY = makeRoster('A');
const team = (id: string, abbr: string) => ({ id, abbreviation: abbr, depthChart: {} }) as Team;

function snapState(over: Partial<LiveEngineState> = {}): LiveEngineState {
  return {
    quarter: 1, timeSecs: 600, possession: 'home', fieldPos: 30,
    down: 1, yardsToGo: 10, homeScore: 0, awayScore: 0, isGameOver: false,
    twoMinWarningQ2Fired: false, twoMinWarningQ4Fired: false, overtime: false,
    awaitingXpChoice: false, awaitingKickoffChoice: false,
    homeTimeouts: 3, awayTimeouts: 3,
    ...over,
  } as LiveEngineState;
}
/** The user is the home team. */
function engine(over: Partial<LiveEngineState> = {}, opts: LiveCoachOptions = {}) {
  return createLiveCoachEngine(team('home', 'HOM'), team('away', 'AWY'), HOME, AWAY, snapState(over), 'home', false, opts);
}

const BEST: Record<DefensiveLook, LookPlay> = {
  blitz: 'screen', stacked_box: 'pass_deep', two_high: 'run', man_press: 'qb_run', soft_zone: 'pass_short',
};
const WORST: Record<DefensiveLook, LookPlay> = {
  blitz: 'pass_deep', stacked_box: 'run', two_high: 'pass_deep', man_press: 'pass_short', soft_zone: 'pass_deep',
};
/** Roughly what users call today (latest 8,000 Live Coach calls, 2026-11-10). */
const USER_MIX: [LookPlay, number][] = [['run', 0.33], ['pass_short', 0.32], ['pass_deep', 0.20], ['qb_run', 0.08], ['screen', 0.07]];
function mixCall(): LookPlay {
  let r = Math.random();
  for (const [play, w] of USER_MIX) { r -= w; if (r < 0) return play; }
  return 'run';
}

interface Tally { plays: number; yards: number; turnovers: number }
function snap(call: LookPlay, looks: boolean, pick?: (look: DefensiveLook) => LookPlay): { yards: number; turnover: boolean } {
  const eng = engine({}, { defensiveLooks: looks });
  const look = eng.getState().defLook;
  const events = eng.runOnePlay(pick && look ? pick(look) : call);
  return {
    yards: events[0]?.yardsGained ?? 0,
    turnover: events.some(e => e.type === 'interception' || /^Fumble!/.test(e.description)),
  };
}
/** Same calls with and without looks: `pick` chooses the call from the look, and the no-looks arm replays that call. */
function compare(n: number, pick: (look: DefensiveLook) => LookPlay): { withLooks: Tally; without: Tally } {
  const withLooks: Tally = { plays: 0, yards: 0, turnovers: 0 }, without: Tally = { plays: 0, yards: 0, turnovers: 0 };
  for (let i = 0; i < n; i++) {
    const eng = engine({}, { defensiveLooks: true });
    const call = pick(eng.getState().defLook!);
    const ev = eng.runOnePlay(call);
    withLooks.plays++; withLooks.yards += ev[0]?.yardsGained ?? 0;
    if (ev.some(e => e.type === 'interception' || /^Fumble!/.test(e.description))) withLooks.turnovers++;
    const base = snap(call, false);
    without.plays++; without.yards += base.yards; if (base.turnover) without.turnovers++;
  }
  return { withLooks, without };
}
const ypp = (t: Tally) => t.yards / t.plays;
const toRate = (t: Tally) => t.turnovers / t.plays;

describe('look tables are zero-sum against the neutral mix', () => {
  for (const play of LOOK_PLAYS) {
    it(`${play}: ignoring the look averages out to the old play`, () => {
      const avg = (f: (l: DefensiveLook) => number) => DEFENSIVE_LOOKS.reduce((s, l) => s + NEUTRAL_WEIGHTS[l] * f(l), 0);
      expect(Math.abs(avg(l => LOOK_TABLE[play][l].yards))).toBeLessThan(0.15);
      expect(Math.abs(avg(l => LOOK_TABLE[play][l].comp))).toBeLessThan(0.01);
      expect(avg(l => LOOK_TABLE[play][l].sackMult)).toBeGreaterThan(0.93);
      expect(avg(l => LOOK_TABLE[play][l].sackMult)).toBeLessThan(1.07);
      expect(avg(l => LOOK_TABLE[play][l].intMult)).toBeGreaterThan(0.93);
      expect(avg(l => LOOK_TABLE[play][l].intMult)).toBeLessThan(1.07);
    });
  }

  it('every look has a call that beats it and a call it has covered', () => {
    for (const look of DEFENSIVE_LOOKS) {
      expect(LOOK_PLAYS.some(p => LOOK_TABLE[p][look].edge === 1), `${look} has no answer`).toBe(true);
      expect(LOOK_PLAYS.some(p => LOOK_TABLE[p][look].edge === -1), `${look} stops nothing`).toBe(true);
      expect(LOOK_TABLE[BEST[look]][look].edge).toBe(1);
      expect(LOOK_TABLE[WORST[look]][look].edge).toBe(-1);
    }
  });
});

describe('which look the defense shows', () => {
  const base = { down: 1, yardsToGo: 10, fieldPos: 30, quarter: 1, timeSecs: 600, offenseLead: 0 };

  it('weights always sum to 1 and a neutral 1st-and-10 is the neutral mix', () => {
    const w = lookWeights(base);
    expect(DEFENSIVE_LOOKS.reduce((s, l) => s + w[l], 0)).toBeCloseTo(1, 6);
    for (const l of DEFENSIVE_LOOKS) expect(w[l]).toBeCloseTo(NEUTRAL_WEIGHTS[l], 6);
  });

  it('the coordinator’s scheme tilts the mix', () => {
    expect(lookWeights({ ...base, scheme: 'blitz_34' }).blitz).toBeGreaterThan(NEUTRAL_WEIGHTS.blitz * 1.5);
    expect(lookWeights({ ...base, scheme: 'tampa_2' }).two_high).toBeGreaterThan(NEUTRAL_WEIGHTS.two_high * 1.5);
    expect(lookWeights({ ...base, scheme: 'man_press' }).man_press).toBeGreaterThan(NEUTRAL_WEIGHTS.man_press * 1.4);
  });

  it('short yardage loads the box; 3rd and long brings pressure and depth', () => {
    expect(lookWeights({ ...base, down: 3, yardsToGo: 1 }).stacked_box).toBeGreaterThan(0.35);
    const long = lookWeights({ ...base, down: 3, yardsToGo: 9 });
    expect(long.stacked_box).toBeLessThan(0.08);
    expect(long.blitz).toBeGreaterThan(NEUTRAL_WEIGHTS.blitz);
  });

  it('the defense adjusts to what the user keeps calling', () => {
    const runs: LookPlay[] = Array(8).fill('run'), bombs: LookPlay[] = Array(8).fill('pass_deep');
    expect(lookWeights({ ...base, recentCalls: runs }).stacked_box).toBeGreaterThan(NEUTRAL_WEIGHTS.stacked_box * 1.6);
    expect(lookWeights({ ...base, recentCalls: bombs }).two_high).toBeGreaterThan(NEUTRAL_WEIGHTS.two_high * 1.6);
    // three calls is not a tendency yet
    expect(lookWeights({ ...base, recentCalls: runs.slice(0, 3) }).stacked_box).toBeCloseTo(NEUTRAL_WEIGHTS.stacked_box, 6);
  });

  it('pickDefensiveLook follows the weights', () => {
    expect(pickDefensiveLook(base, () => 0)).toBe('blitz');
    expect(pickDefensiveLook(base, () => 0.999999)).toBe('soft_zone');
  });
});

describe('engine: when a look is shown and when it counts', () => {
  it('shows a look only when the user is about to call a scrimmage play', () => {
    expect(DEFENSIVE_LOOKS).toContain(engine().getState().defLook);
    expect(engine({ possession: 'away' }).getState().defLook).toBeNull();
    expect(engine({ awaitingKickoffChoice: true }).getState().defLook).toBeNull();
    expect(engine({ awaitingXpChoice: true }).getState().defLook).toBeNull();
    expect(engine({}, { defensiveLooks: false }).getState().defLook).toBeNull();
  });

  it('a called snap is tagged with the look it ran into; an auto-simmed one is not', () => {
    for (let i = 0; i < 50; i++) {
      const eng = engine();
      const look = eng.getState().defLook!;
      const ev = eng.runOnePlay('run');
      expect(ev[0].defLook).toBe(look);
      expect(ev[0].lookEdge).toBe(LOOK_TABLE.run[look].edge);
      const auto = engine().runOnePlay();
      expect(auto.every(e => e.defLook === undefined)).toBe(true);
    }
  });

  it('a timeout does not change what the defense is showing', () => {
    for (let i = 0; i < 50; i++) {
      const eng = engine({ pendingRunoff: 30 });
      const look = eng.getState().defLook;
      eng.runOnePlay('timeout');
      expect(eng.getState().defLook).toBe(look);
    }
  });

  it('the look clears once the ball goes over to the CPU', () => {
    const eng = engine({ down: 4, yardsToGo: 10 });
    eng.runOnePlay('punt');
    expect(eng.getState().possession).toBe('away');
    expect(eng.getState().defLook).toBeNull();
  });
});

describe('balance (Monte Carlo)', () => {
  const N = 40000;

  it('a coach who ignores the look gets the same offense as before', () => {
    const { withLooks, without } = compare(N, () => mixCall());
    const ratio = ypp(withLooks) / ypp(without);
    console.log(`ignore look: ${ypp(withLooks).toFixed(2)} vs ${ypp(without).toFixed(2)} yds/play (x${ratio.toFixed(3)}), turnovers ${(toRate(withLooks) * 100).toFixed(2)}% vs ${(toRate(without) * 100).toFixed(2)}%`);
    expect(ratio).toBeGreaterThan(0.95);
    expect(ratio).toBeLessThan(1.05);
    expect(Math.abs(toRate(withLooks) - toRate(without))).toBeLessThan(0.006);
  });

  it('reading the look right is worth a real but bounded edge', () => {
    const { withLooks, without } = compare(N, look => BEST[look]);
    const ratio = ypp(withLooks) / ypp(without);
    console.log(`best read:   ${ypp(withLooks).toFixed(2)} vs ${ypp(without).toFixed(2)} yds/play (x${ratio.toFixed(3)}), turnovers ${(toRate(withLooks) * 100).toFixed(2)}% vs ${(toRate(without) * 100).toFixed(2)}%`);
    expect(ratio).toBeGreaterThan(1.10);
    expect(ratio).toBeLessThan(1.27);
    expect(toRate(withLooks)).toBeLessThanOrEqual(toRate(without) + 0.003);
  });

  it('reading it wrong costs yards and the ball', () => {
    const { withLooks, without } = compare(N, look => WORST[look]);
    const ratio = ypp(withLooks) / ypp(without);
    console.log(`worst read:  ${ypp(withLooks).toFixed(2)} vs ${ypp(without).toFixed(2)} yds/play (x${ratio.toFixed(3)}), turnovers ${(toRate(withLooks) * 100).toFixed(2)}% vs ${(toRate(without) * 100).toFixed(2)}%`);
    expect(ratio).toBeLessThan(0.95);
    expect(ratio).toBeGreaterThan(0.80);
    expect(toRate(withLooks)).toBeGreaterThan(toRate(without));
  });
});
