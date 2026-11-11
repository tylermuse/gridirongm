/**
 * Live Coach: calling the defense (defensiveLooks.ts, "Calling the defense").
 *
 * With defense calling on, the CPU offense shows a set before each of its scrimmage snaps, the user answers with one
 * of the five looks, and the CPU's play is resolved against it. Three things must hold:
 *
 *  1. Opt-in. With defense calling off (the default) nothing changes: no set is shown and CPU snaps are untouched.
 *  2. The set is an honest read. It leans toward the play the CPU runs, and showing it never changes what the CPU calls.
 *  3. Balance. Calling looks without reading the set allows what the defense allowed before. Reading it right holds
 *     the offense down by a real but bounded amount, and reading it wrong gives yards away.
 */

import { describe, it, expect } from 'vitest';
import { createLiveCoachEngine, type LiveEngineState, type LiveCoachOptions } from '@/lib/engine/liveCoachEngine';
import {
  DEFENSIVE_LOOKS, LOOK_TABLE, NEUTRAL_WEIGHTS, OFFENSIVE_SETS, SET_GIVEN_PLAY, SET_INFO, LOOK_CALL_INFO, pickOffensiveSet,
  type CpuPlay, type DefensiveLook, type OffensiveSet,
} from '@/lib/engine/defensiveLooks';
import type { PlayEvent } from '@/lib/engine/playByPlay';
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

/** The user is the home team; the CPU (away) has the ball unless a test says otherwise. */
function snapState(over: Partial<LiveEngineState> = {}): LiveEngineState {
  return {
    quarter: 1, timeSecs: 600, possession: 'away', fieldPos: 30,
    down: 1, yardsToGo: 10, homeScore: 0, awayScore: 0, isGameOver: false,
    twoMinWarningQ2Fired: false, twoMinWarningQ4Fired: false, overtime: false,
    awaitingXpChoice: false, awaitingKickoffChoice: false,
    homeTimeouts: 3, awayTimeouts: 3,
    ...over,
  } as LiveEngineState;
}
function engine(over: Partial<LiveEngineState> = {}, opts: LiveCoachOptions = { callDefense: true }) {
  return createLiveCoachEngine(team('home', 'HOM'), team('away', 'AWY'), HOME, AWAY, snapState(over), 'home', false, opts);
}

/** What kind of play the snap event was. */
function playOf(e: PlayEvent | undefined): 'run' | 'pass' | 'other' {
  if (!e) return 'other';
  if (/sacked|pass|Pass|throws|incomplete|INTERCEPT|picked/i.test(e.description) || ['pass_complete', 'pass_incomplete', 'sack', 'interception'].includes(e.type)) return 'pass';
  return e.type === 'run' ? 'run' : 'other';
}
const isTurnover = (ev: PlayEvent[]) => ev.some(e => e.type === 'interception' || /^Fumble!/.test(e.description));

function neutralLook(): DefensiveLook {
  let r = Math.random();
  for (const k of DEFENSIVE_LOOKS) { r -= NEUTRAL_WEIGHTS[k]; if (r < 0) return k; }
  return 'soft_zone';
}
/** The call a user who trusts the set makes, and the one that walks into it. */
const READ: Record<OffensiveSet, DefensiveLook> = { heavy: 'stacked_box', balanced: 'soft_zone', spread: 'man_press', max_protect: 'two_high' };
const MISREAD: Record<OffensiveSet, DefensiveLook> = { heavy: 'two_high', balanced: 'blitz', spread: 'soft_zone', max_protect: 'stacked_box' };

describe('the tables', () => {
  it('each play shows every set with a chance that sums to 1', () => {
    for (const play of ['run', 'pass_short', 'pass_deep'] as CpuPlay[]) {
      const total = OFFENSIVE_SETS.reduce((s, k) => s + SET_GIVEN_PLAY[play][k], 0);
      expect(total).toBeCloseTo(1, 9);
      for (const k of OFFENSIVE_SETS) expect(SET_GIVEN_PLAY[play][k]).toBeGreaterThan(0);
    }
  });

  it('pickOffensiveSet follows the weights', () => {
    expect(pickOffensiveSet('run', () => 0)).toBe('heavy');
    expect(pickOffensiveSet('run', () => 0.5)).toBe('balanced');
    expect(pickOffensiveSet('pass_short', () => 0.5)).toBe('spread');
    expect(pickOffensiveSet('pass_deep', () => 0.99)).toBe('max_protect');
  });

  it('every set and every look has its menu copy', () => {
    for (const k of OFFENSIVE_SETS) expect(SET_INFO[k].read.length).toBeGreaterThan(10);
    for (const k of DEFENSIVE_LOOKS) expect(LOOK_CALL_INFO[k].stops.length).toBeGreaterThan(5);
  });

  it('the captions on the look buttons agree with the table', () => {
    // what each look is said to stop is covered (-1 for the offense), and its stated risk is a play that beats it (+1)
    expect(LOOK_TABLE.pass_deep.blitz.edge).toBe(-1); expect(LOOK_TABLE.pass_short.blitz.edge).toBe(1);
    expect(LOOK_TABLE.run.stacked_box.edge).toBe(-1); expect(LOOK_TABLE.pass_deep.stacked_box.edge).toBe(1);
    expect(LOOK_TABLE.pass_deep.two_high.edge).toBe(-1); expect(LOOK_TABLE.run.two_high.edge).toBe(1);
    expect(LOOK_TABLE.pass_short.man_press.edge).toBe(-1); expect(LOOK_TABLE.pass_deep.man_press.edge).toBe(1);
    expect(LOOK_TABLE.pass_deep.soft_zone.edge).toBe(-1); expect(LOOK_TABLE.pass_short.soft_zone.edge).toBe(1);
  });
});

describe('engine: when a set is shown', () => {
  it('is off by default: no set, and CPU snaps carry no defensive call', () => {
    for (let i = 0; i < 50; i++) {
      const eng = engine({}, {});
      expect(eng.getState().offSet).toBeNull();
      const ev = eng.runOnePlay();
      expect(ev.every(e => e.userDefCall === undefined && e.offSet === undefined)).toBe(true);
    }
  });

  it('shows a set only when the CPU is about to run a scrimmage play', () => {
    expect(OFFENSIVE_SETS).toContain(engine().getState().offSet);
    expect(engine({ possession: 'home' }).getState().offSet).toBeNull();
    // 4th and 10 at its own 30: the CPU punts
    expect(engine({ down: 4, yardsToGo: 10, fieldPos: 30 }).getState().offSet).toBeNull();
    // 4th and 8 at the opponent's 20: the CPU kicks
    expect(engine({ down: 4, yardsToGo: 8, fieldPos: 80 }).getState().offSet).toBeNull();
    // 4th and 1: the CPU goes for it
    expect(OFFENSIVE_SETS).toContain(engine({ down: 4, yardsToGo: 1, fieldPos: 50 }).getState().offSet);
    // the half runs out before the next snap
    expect(engine({ quarter: 2, timeSecs: 20, pendingRunoff: 30, fieldPos: 30 }).getState().offSet).toBeNull();
  });

  it('can be switched on and off mid-game', () => {
    const eng = engine({}, {});
    expect(eng.getState().offSet).toBeNull();
    eng.setCallDefense(true);
    expect(OFFENSIVE_SETS).toContain(eng.getState().offSet);
    eng.setCallDefense(false);
    expect(eng.getState().offSet).toBeNull();
  });

  it('a called snap is tagged with the call, how it fared, and the set that was shown', () => {
    for (let i = 0; i < 100; i++) {
      const eng = engine();
      const set = eng.getState().offSet!;
      const ev = eng.runOnePlay(undefined, 'stacked_box');
      expect(ev[0].userDefCall).toBe('stacked_box');
      expect(ev[0].offSet).toBe(set);
      // Stacked Box stops the run and is beaten deep
      const kind = playOf(ev[0]);
      if (kind === 'run') expect(ev[0].userDefEdge).toBe(1);
      else expect([0, -1]).toContain(ev[0].userDefEdge);
      expect(ev[0].defLook).toBeUndefined(); // that field is the CPU's look on the user's own snaps
    }
  });

  it('a CPU snap the user did not call is played as before', () => {
    for (let i = 0; i < 50; i++) {
      const ev = engine().runOnePlay();
      expect(ev.every(e => e.userDefCall === undefined)).toBe(true);
    }
  });

  it('a defensive call is ignored on the user’s own snap', () => {
    const ev = engine({ possession: 'home' }).runOnePlay('run', 'blitz');
    expect(ev.every(e => e.userDefCall === undefined)).toBe(true);
  });

  it('a defensive timeout does not change the set or the play behind it', () => {
    for (let i = 0; i < 50; i++) {
      const eng = engine({ pendingRunoff: 30 });
      const set = eng.getState().offSet;
      eng.callTimeoutFor('home', 5);
      expect(eng.getState().offSet).toBe(set);
    }
  });

  it('a set appears after the user’s punt puts the CPU on offense', () => {
    const eng = engine({ possession: 'home', down: 4, yardsToGo: 10 });
    eng.runOnePlay('punt');
    expect(eng.getState().possession).toBe('away');
    expect(OFFENSIVE_SETS).toContain(eng.getState().offSet);
  });

  it('a whole game can be played calling every defensive snap', () => {
    const eng = engine({ possession: 'home' });
    let called = 0, safety = 0;
    while (!eng.isFinished() && safety++ < 600) {
      const s = eng.getState();
      if (s.possession !== 'home' && s.offSet) { called++; eng.runOnePlay(undefined, neutralLook()); }
      else eng.runOnePlay();
    }
    expect(eng.isFinished()).toBe(true);
    expect(called).toBeGreaterThan(20);
  });
});

describe('the set is an honest read', () => {
  const N = 20000;

  it('the play behind each set matches what the set suggests', () => {
    const seen: Record<OffensiveSet, { run: number; pass: number }> = {
      heavy: { run: 0, pass: 0 }, balanced: { run: 0, pass: 0 }, spread: { run: 0, pass: 0 }, max_protect: { run: 0, pass: 0 },
    };
    for (let i = 0; i < N; i++) {
      const eng = engine();
      const set = eng.getState().offSet!;
      const kind = playOf(eng.runOnePlay(undefined, 'soft_zone')[0]);
      if (kind !== 'other') seen[set][kind]++;
    }
    const runShare = (s: OffensiveSet) => seen[s].run / (seen[s].run + seen[s].pass);
    console.log(`run share by set: heavy ${(runShare('heavy') * 100).toFixed(0)}%, balanced ${(runShare('balanced') * 100).toFixed(0)}%, spread ${(runShare('spread') * 100).toFixed(0)}%, max protect ${(runShare('max_protect') * 100).toFixed(0)}%`);
    expect(runShare('heavy')).toBeGreaterThan(0.70);
    expect(runShare('balanced')).toBeGreaterThan(0.33);
    expect(runShare('balanced')).toBeLessThan(0.57);
    expect(runShare('spread')).toBeLessThan(0.27);
    expect(runShare('max_protect')).toBeLessThan(0.27);
  });

  it('showing a set does not change what the CPU calls', () => {
    let runsOn = 0, playsOn = 0, runsOff = 0, playsOff = 0;
    for (let i = 0; i < N; i++) {
      const a = playOf(engine().runOnePlay(undefined, 'soft_zone')[0]);
      if (a !== 'other') { playsOn++; if (a === 'run') runsOn++; }
      const b = playOf(engine({}, {}).runOnePlay()[0]);
      if (b !== 'other') { playsOff++; if (b === 'run') runsOff++; }
    }
    expect(Math.abs(runsOn / playsOn - runsOff / playsOff)).toBeLessThan(0.025);
  });
});

describe('balance (Monte Carlo)', () => {
  // 80,000 snaps a side puts the yards-per-play ratio within about ±0.007, so the bounds below sit 5 of those away
  const N = 80000;
  interface Tally { plays: number; yards: number; turnovers: number }
  const ypp = (t: Tally) => t.yards / t.plays;
  const toRate = (t: Tally) => t.turnovers / t.plays;
  /** CPU offense with the user calling `pick(set)` on every snap, next to the same offense with nobody calling. */
  function compare(pick: (set: OffensiveSet) => DefensiveLook): { called: Tally; uncalled: Tally } {
    const called: Tally = { plays: 0, yards: 0, turnovers: 0 }, uncalled: Tally = { plays: 0, yards: 0, turnovers: 0 };
    for (let i = 0; i < N; i++) {
      const eng = engine();
      const ev = eng.runOnePlay(undefined, pick(eng.getState().offSet!));
      called.plays++; called.yards += ev[0]?.yardsGained ?? 0; if (isTurnover(ev)) called.turnovers++;
      const base = engine({}, {}).runOnePlay();
      uncalled.plays++; uncalled.yards += base[0]?.yardsGained ?? 0; if (isTurnover(base)) uncalled.turnovers++;
    }
    return { called, uncalled };
  }
  const line = (label: string, c: Tally, u: Tally) =>
    console.log(`${label} ${ypp(c).toFixed(2)} vs ${ypp(u).toFixed(2)} yds/play allowed (x${(ypp(c) / ypp(u)).toFixed(3)}), takeaways ${(toRate(c) * 100).toFixed(2)}% vs ${(toRate(u) * 100).toFixed(2)}%`);

  it('calling looks without reading the set allows what the defense allowed before', () => {
    const { called, uncalled } = compare(() => neutralLook());
    line('ignore the set:', called, uncalled);
    const ratio = ypp(called) / ypp(uncalled);
    expect(ratio).toBeGreaterThan(0.95);
    expect(ratio).toBeLessThan(1.05);
    expect(Math.abs(toRate(called) - toRate(uncalled))).toBeLessThan(0.006);
  });

  it('reading the set right holds the offense down by a real but bounded amount', () => {
    const { called, uncalled } = compare(set => READ[set]);
    line('read the set:  ', called, uncalled);
    const ratio = ypp(called) / ypp(uncalled);
    expect(ratio).toBeLessThan(0.97);
    expect(ratio).toBeGreaterThan(0.85);
  });

  it('reading it wrong gives yards away', () => {
    const { called, uncalled } = compare(set => MISREAD[set]);
    line('misread it:    ', called, uncalled);
    const ratio = ypp(called) / ypp(uncalled);
    expect(ratio).toBeGreaterThan(1.02);
    expect(ratio).toBeLessThan(1.15);
  });
});
