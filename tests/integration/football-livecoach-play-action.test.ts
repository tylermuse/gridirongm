/**
 * Live Coach "Play Action" call (requested in player feedback, 2026-11-19).
 *
 * A pass off a run fake. On its own it sits between a Short Pass and a Deep Shot (more yards and more risk than the
 * short throw, less of both than the bomb). Its edge is the read: it beats the Stacked Box the defense shows when the
 * user keeps running, and the Blitz and Soft Zone have it covered. Calling it every down gets it sniffed out.
 */

import { describe, it, expect } from 'vitest';
import { createLiveCoachEngine, type LiveEngineState, type LiveCoachOptions } from '@/lib/engine/liveCoachEngine';
import { LOOK_TABLE, NEUTRAL_WEIGHTS, lookWeights, type DefensiveLook, type LookPlay } from '@/lib/engine/defensiveLooks';
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

const isTurnover = (evs: PlayEvent[]) => evs.some(e => e.type === 'interception' || /^Fumble!/.test(e.description));

interface Tally { plays: number; yards: number; comps: number; ints: number; sacks: number }
const tally = (): Tally => ({ plays: 0, yards: 0, comps: 0, ints: 0, sacks: 0 });
function add(t: Tally, evs: PlayEvent[]) {
  t.plays++;
  t.yards += evs[0]?.yardsGained ?? 0;
  if (evs[0]?.type === 'pass_complete') t.comps++;
  if (evs[0]?.type === 'interception') t.ints++;
  if (evs[0]?.type === 'sack') t.sacks++;
}
const ypp = (t: Tally) => t.yards / t.plays;
/** Snaps of one call with looks off: the play's own numbers. */
function baseline(call: LookPlay, n: number): Tally {
  const t = tally();
  for (let i = 0; i < n; i++) add(t, engine({}, { defensiveLooks: false }).runOnePlay(call));
  return t;
}

describe('the call', () => {
  it('is its own play: the line names it, tells the fake, and is tagged with the look it ran into', () => {
    for (let i = 0; i < 200; i++) {
      const eng = engine();
      const look = eng.getState().defLook!;
      const evs = eng.runOnePlay('play_action');
      expect(evs[0].description.startsWith('🎭 Play Action — ')).toBe(true);
      expect(['pass_complete', 'pass_incomplete', 'sack', 'interception']).toContain(evs[0].type);
      if (evs[0].type === 'pass_complete' || evs[0].type === 'pass_incomplete') expect(evs[0].description).toMatch(/fake/);
      expect(evs[0].defLook).toBe(look);
      expect(evs[0].lookEdge).toBe(LOOK_TABLE.play_action[look].edge);
    }
  });

  it('goes in the box score as a pass', () => {
    let attempts = 0, rushes = 0;
    for (let i = 0; i < 100; i++) {
      const eng = engine({}, { defensiveLooks: false });
      eng.runOnePlay('play_action');
      const qb = eng.getPlayerStats()['H-QB'] ?? {};
      attempts += qb.passAttempts ?? 0;
      rushes += Object.values(eng.getPlayerStats()).reduce((s, p) => s + (p.rushAttempts ?? 0), 0);
    }
    expect(attempts).toBeGreaterThan(80);   // every snap that isn't a sack is a pass attempt
    expect(rushes).toBe(0);                 // the fake is not a carry
  });

  it('can be the two-point play', () => {
    for (let i = 0; i < 30; i++) {
      const eng = engine({ fieldPos: 97, down: 1, yardsToGo: 3, awaitingTwoPointCall: true });
      const evs = eng.runOnePlay('play_action');
      expect(evs[0].description.startsWith('2-PT — 🎭 Play Action — ')).toBe(true);
      expect(evs.some(e => e.type === 'extra_point' && /Two-point conversion (is GOOD|FAILS)/.test(e.description))).toBe(true);
    }
  });
});

describe('on its own it sits between a Short Pass and a Deep Shot (Monte Carlo)', () => {
  const N = 20000;
  it('more yards and more picks than a short pass, fewer of both than a deep shot', () => {
    const short = baseline('pass_short', N), pa = baseline('play_action', N), deep = baseline('pass_deep', N);
    const line = (name: string, t: Tally) => `${name}: ${ypp(t).toFixed(2)} yds/play, comp ${(t.comps / t.plays * 100).toFixed(1)}%, INT ${(t.ints / t.plays * 100).toFixed(2)}%, sack ${(t.sacks / t.plays * 100).toFixed(1)}%`;
    console.log([line('short', short), line('play action', pa), line('deep', deep)].join('\n'));
    expect(ypp(pa)).toBeGreaterThan(ypp(short) * 1.08);
    expect(ypp(pa)).toBeLessThan(ypp(deep) * 0.95);
    expect(pa.ints).toBeGreaterThan(short.ints);
    expect(pa.ints).toBeLessThan(deep.ints);
    expect(pa.comps).toBeLessThan(short.comps);
    expect(pa.comps).toBeGreaterThan(deep.comps);
    expect(pa.sacks).toBeGreaterThan(short.sacks);   // the QB turns his back to sell the fake
    expect(pa.sacks).toBeLessThan(deep.sacks);
  });
});

describe('the read', () => {
  it('beats the Stacked Box; the Blitz and the Soft Zone have it covered', () => {
    expect(LOOK_TABLE.play_action.stacked_box.edge).toBe(1);
    expect(LOOK_TABLE.play_action.blitz.edge).toBe(-1);
    expect(LOOK_TABLE.play_action.soft_zone.edge).toBe(-1);
  });

  it('on the field: a fake into a Stacked Box gains clearly more than one into a Soft Zone or a Blitz', () => {
    const by: Partial<Record<DefensiveLook, Tally>> = {};
    let turnovers = 0, n = 0;
    for (let i = 0; i < 40000; i++) {
      const eng = engine();
      const look = eng.getState().defLook!;
      const evs = eng.runOnePlay('play_action');
      add(by[look] ??= tally(), evs);
      n++; if (isTurnover(evs)) turnovers++;
    }
    const base = baseline('play_action', 20000);
    console.log(Object.entries(by).map(([l, t]) => `${l}: ${ypp(t!).toFixed(2)}`).join(', '), `| no look ${ypp(base).toFixed(2)}`);
    expect(ypp(by.stacked_box!)).toBeGreaterThan(ypp(base) * 1.1);
    expect(ypp(by.soft_zone!)).toBeLessThan(ypp(base) * 0.97);
    expect(by.blitz!.sacks / by.blitz!.plays).toBeGreaterThan(base.sacks / base.plays * 1.2);
    // ignoring the look entirely is still the same play on average
    const all = Object.values(by).reduce((s, t) => ({ ...s, plays: s.plays + t!.plays, yards: s.yards + t!.yards }), tally());
    expect(ypp(all) / ypp(base)).toBeGreaterThan(0.95);
    expect(ypp(all) / ypp(base)).toBeLessThan(1.05);
    expect(turnovers / n).toBeLessThan(0.06);
  });

  const base = { down: 1, yardsToGo: 10, fieldPos: 30, quarter: 1, timeSecs: 600, offenseLead: 0 };
  it('running sets the fake up: keep running and the defense loads the box the fake beats', () => {
    const runs: LookPlay[] = Array(8).fill('run');
    expect(lookWeights({ ...base, recentCalls: runs }).stacked_box).toBeGreaterThan(NEUTRAL_WEIGHTS.stacked_box * 1.6);
  });

  it('calling it every down gets it sniffed out: the defense sits back in a Soft Zone', () => {
    const fakes: LookPlay[] = Array(8).fill('play_action');
    expect(lookWeights({ ...base, recentCalls: fakes }).soft_zone).toBeGreaterThan(NEUTRAL_WEIGHTS.soft_zone * 1.5);
    // one fake in a mixed game is not a tendency
    const mixed: LookPlay[] = ['run', 'pass_short', 'run', 'pass_deep', 'run', 'pass_short', 'screen', 'run'];
    const withOneFake: LookPlay[] = [...mixed.slice(0, 7), 'play_action'];
    const sz = (calls: LookPlay[]) => lookWeights({ ...base, recentCalls: calls }).soft_zone;
    expect(sz(withOneFake)).toBeLessThan(sz(mixed) * 1.15);
  });
});
