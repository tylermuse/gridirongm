/**
 * Out of bounds stops the clock (Tyler 11/22: "When players run out of bounds, the clock doesn't stop").
 *
 * The 3D sim used to run some long runs and sideline catches out of bounds on its own while neither engine knew, so the
 * clock ran off as if he had been tackled in bounds. Now the engines decide it (outOfBounds.ts), stamp `outOfBounds` on
 * the event, run the clock by the NFL rule, and the sim pictures only what the engine decided:
 *  - last 2:00 of the first half, last 5:00 of the second half (and of an OT period): stopped until the next snap
 *  - any other time: stopped while the ball is spotted, then running again
 */
import { describe, it, expect } from 'vitest';
import {
  OOB_PLAY_SECS, oobRunoffSecs, oobStopsClockUntilSnap, rollCatchOutOfBounds, rollRunOutOfBounds,
} from '@/lib/engine/outOfBounds';
import { createLiveCoachEngine, type LiveEngineState } from '@/lib/engine/liveCoachEngine';
import { simulatePlayByPlay, type PlayEvent } from '@/lib/engine/playByPlay';
import { toSimPlay, toSimResult } from '@/lib/engine/liveSim3d';
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
  return (['QB', 'RB', 'WR', 'WR', 'WR', 'TE', 'K', 'P', 'DL', 'DL', 'LB', 'LB', 'CB', 'CB', 'S', 'S'] as Position[])
    .map((pos, i) => makePlayer(`${prefix}-${pos}${i}`, pos));
}
function makeTeam(id: string): Team {
  return { id, abbreviation: id, name: id, primaryColor: '#123456', depthChart: {} } as unknown as Team;
}
const secs = (t: string) => { const [m, s] = t.split(':'); return parseInt(m, 10) * 60 + parseInt(s, 10); };

describe('the NFL out-of-bounds clock rule', () => {
  it('stays stopped until the snap only in the last 2:00 of the first half and the last 5:00 of the second half / OT', () => {
    expect(oobStopsClockUntilSnap(1, 30)).toBe(false);
    expect(oobStopsClockUntilSnap(2, 121)).toBe(false);
    expect(oobStopsClockUntilSnap(2, 120)).toBe(true);
    expect(oobStopsClockUntilSnap(3, 30)).toBe(false);
    expect(oobStopsClockUntilSnap(4, 301)).toBe(false);
    expect(oobStopsClockUntilSnap(4, 300)).toBe(true);
    expect(oobStopsClockUntilSnap(5, 301)).toBe(false);   // Live Coach OT is quarter 5
    expect(oobStopsClockUntilSnap(5, 300)).toBe(true);
    expect(oobStopsClockUntilSnap(4, 300, true)).toBe(true);   // the full sim keeps quarter 4 in OT
  });
  it('outside those windows the clock only stops while the ball is spotted', () => {
    expect(oobRunoffSecs(30, 1, 600)).toBe(23);
    expect(oobRunoffSecs(23, 3, 600)).toBe(16);
    expect(oobRunoffSecs(30, 4, 200)).toBe(0);
    expect(oobRunoffSecs(30, 2, 90)).toBe(0);
    expect(oobRunoffSecs(5, 1, 600)).toBe(0);
  });
});

describe('which plays can end out of bounds (what the 3D sim can picture)', () => {
  const q1 = { quarter: 1, timeSecs: 600, scoreDiff: 0 };
  const always = () => 0;
  it('a back needs 10+ yards, a QB 15+', () => {
    expect(rollRunOutOfBounds(9, false, q1, always)).toBe(false);
    expect(rollRunOutOfBounds(10, false, q1, always)).toBe(true);
    expect(rollRunOutOfBounds(14, true, q1, always)).toBe(false);
    expect(rollRunOutOfBounds(15, true, q1, always)).toBe(true);
  });
  it('a short catch with room to run after it; never a deep ball or a screen', () => {
    expect(rollCatchOutOfBounds(5, 'short', q1, always)).toBe(false);
    expect(rollCatchOutOfBounds(6, 'short', q1, always)).toBe(true);
    expect(rollCatchOutOfBounds(19, 'short', q1, always)).toBe(true);
    expect(rollCatchOutOfBounds(20, 'short', q1, always)).toBe(false);
    expect(rollCatchOutOfBounds(16, 'play_action', q1, always)).toBe(false);
    expect(rollCatchOutOfBounds(12, 'deep', q1, always)).toBe(false);
    expect(rollCatchOutOfBounds(12, 'screen', q1, always)).toBe(false);
  });
  it('late, an offense that needs the clock stopped heads for the sideline and one with the lead stays in bounds', () => {
    const half = () => 0.5;
    expect(rollRunOutOfBounds(12, false, q1, half)).toBe(false);
    expect(rollRunOutOfBounds(12, false, { quarter: 4, timeSecs: 200, scoreDiff: -3 }, half)).toBe(true);
    expect(rollRunOutOfBounds(12, false, { quarter: 2, timeSecs: 60, scoreDiff: 7 }, half)).toBe(true);
    expect(rollRunOutOfBounds(12, false, { quarter: 4, timeSecs: 200, scoreDiff: 3 }, () => 0.1)).toBe(false);
  });
});

function liveState(over: Partial<LiveEngineState>): LiveEngineState {
  return {
    quarter: 1, timeSecs: 600, possession: 'home', fieldPos: 30,
    down: 1, yardsToGo: 10, homeScore: 0, awayScore: 0, isGameOver: false,
    twoMinWarningQ2Fired: true, twoMinWarningQ4Fired: true, overtime: false,
    awaitingXpChoice: false, awaitingKickoffChoice: false,
    homeTimeouts: 3, awayTimeouts: 3, pendingRunoff: 0,
    ...over,
  } as LiveEngineState;
}

/** Short passes called by the user (home) from `over`: the completion that didn't score or fumble, and the clock after it. */
function shortCompletions(over: Partial<LiveEngineState>, n = 400) {
  const out: { ev: PlayEvent; timeSecs: number; runoff: number }[] = [];
  for (let i = 0; i < n; i++) {
    const engine = createLiveCoachEngine(makeTeam('HOM'), makeTeam('AWY'), makeRoster('H'), makeRoster('A'), liveState(over), 'home');
    const evs = engine.runOnePlay('pass_short');
    const ev = evs.find(e => e.type === 'pass_complete');
    if (!ev || ev.isScoring || evs.some(e => e.type === 'fumble') || /fumble/i.test(ev.description)) continue;
    const st = engine.getState();
    out.push({ ev, timeSecs: st.timeSecs, runoff: st.pendingRunoff ?? 0 });
  }
  return out;
}

describe('Live Coach', () => {
  it('trailing with 4:00 left: a catch that goes out of bounds stops the clock until the snap', () => {
    const plays = shortCompletions({ quarter: 4, timeSecs: 240, homeScore: 17, awayScore: 21 });
    const oob = plays.filter(p => p.ev.outOfBounds);
    expect(oob.length).toBeGreaterThan(20);
    for (const p of oob) {
      expect(p.runoff).toBe(0);
      expect(p.timeSecs).toBe(240 - 5);
      expect(p.ev.description).toMatch(/out of bounds/i);
      expect(p.ev.description).toMatch(/The clock stops\./);
      expect(p.ev.defNote).toMatch(/out of bounds/i);   // the man who shoved him out is named and credited
    }
    for (const p of plays.filter(p => !p.ev.outOfBounds)) expect(p.runoff).toBe(23);
  });

  it('in the first quarter it only stops while the ball is spotted, then runs', () => {
    const plays = shortCompletions({ quarter: 1, timeSecs: 600 });
    const oob = plays.filter(p => p.ev.outOfBounds);
    expect(oob.length).toBeGreaterThan(5);
    for (const p of oob) {
      expect(p.runoff).toBe(16);
      expect(p.ev.description).not.toMatch(/clock/i);
    }
    for (const p of plays.filter(p => !p.ev.outOfBounds)) expect(p.runoff).toBe(23);
  });

  it('a deep shot and a screen never end out of bounds', () => {
    for (const call of ['pass_deep', 'screen'] as const) {
      for (let i = 0; i < 200; i++) {
        const engine = createLiveCoachEngine(makeTeam('HOM'), makeTeam('AWY'), makeRoster('H'), makeRoster('A'),
          liveState({ quarter: 4, timeSecs: 240, homeScore: 17, awayScore: 21 }), 'home');
        expect(engine.runOnePlay(call).some(e => e.outOfBounds)).toBe(false);
      }
    }
  });
});

describe('full game sim', () => {
  it('a run or catch out of bounds stops the clock: until the snap late in each half, briefly otherwise', () => {
    let lateStops = 0, early = 0;
    for (let g = 0; g < 40; g++) {
      const { events } = simulatePlayByPlay(makeTeam('H'), makeTeam('A'), makeRoster('H'), makeRoster('A'));
      events.forEach((e, i) => {
        if (!e.outOfBounds) return;
        expect(['run', 'pass_complete']).toContain(e.type);
        expect(e.isScoring).toBe(false);
        expect(e.description).toMatch(/out of bounds/i);
        const next = events[i + 1];
        if (!next || next.quarter !== e.quarter || secs(next.timeStr) === 0 || next.type === 'overtime') return;
        const used = secs(e.timeStr) - secs(next.timeStr);
        if (oobStopsClockUntilSnap(e.quarter, secs(e.timeStr) - OOB_PLAY_SECS)) {
          expect(used).toBe(OOB_PLAY_SECS);   // the play itself, and nothing between plays
          lateStops++;
        } else {
          expect(used).toBeGreaterThanOrEqual(18);   // the in-bounds runoff (25-37 s) less the ~7 s the ball is spotted
          expect(used).toBeLessThanOrEqual(30);
          early++;
        }
      });
    }
    expect(early).toBeGreaterThan(20);
    expect(lateStops).toBeGreaterThan(5);
  });
});

describe('the 3D sim pictures the engine\'s call', () => {
  const ev = (p: Partial<PlayEvent>): PlayEvent => ({
    id: 3, type: 'pass_complete', description: 'J. Hurts completes to D. Smith for 9 yards.', quarter: 4, timeStr: '03:10',
    possession: 'home', fieldPos: 40, down: 2, yardsToGo: 6, yardsGained: 9, homeScore: 17, awayScore: 21, isScoring: false, ...p,
  });
  it('an out-of-bounds run or catch is sent as one', () => {
    expect(toSimResult(ev({ outOfBounds: true }))).toMatchObject({ kind: 'complete', depth: 'short', yards: 9, oob: true });
    expect(toSimResult(ev({ type: 'run', yardsGained: 14, outOfBounds: true }))).toMatchObject({ kind: 'run', yards: 14, oob: true });
  });
  it('every other run and catch is sent as in bounds, so the sim never runs him out on its own', () => {
    expect(toSimPlay(ev({}))!.res.oob).toBe(false);
    expect(toSimPlay(ev({ type: 'run', yardsGained: 14 }))!.res.oob).toBe(false);
    expect(toSimPlay(ev({ type: 'pass_incomplete', yardsGained: 0 }))!.res.oob).toBeUndefined();
  });
});
