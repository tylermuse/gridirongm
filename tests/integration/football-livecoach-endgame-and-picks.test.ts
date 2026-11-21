/**
 * Live Coach: late-game kicking sense and interception returns (Tyler 11/9).
 *
 *  - The CPU, down 6 with 0:02 left, kicked a 53-yard field goal. A kick that can't tie or win at the end of the game
 *    is never taken: the offense throws for the end zone instead. A kick that DOES tie or win still goes up.
 *  - The 3D sim made up its own interception return and could run it into the end zone ("Pick six!") while the engine
 *    only spotted the ball. Interception events now carry the engine's return spot and the sim is told to end there.
 *    (11/15: the engine now rolls the catch spot and the return itself and can score a pick-six — see
 *    football-return-spots.test.ts. The sim still only pictures one the engine scored.)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createLiveCoachEngine, type LiveEngineState } from '@/lib/engine/liveCoachEngine';
import { toSimResult } from '@/lib/engine/liveSim3d';
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
    makePlayer(`${prefix}-CB`, 'CB'),
  ];
}
function makeTeam(id: string, abbr: string): Team {
  return { id, abbreviation: abbr, depthChart: {} } as Team;
}
function lateState(over: Partial<LiveEngineState>): LiveEngineState {
  return {
    quarter: 4, timeSecs: 2, possession: 'away', fieldPos: 64,
    down: 1, yardsToGo: 10, homeScore: 30, awayScore: 24, isGameOver: false,
    twoMinWarningQ2Fired: true, twoMinWarningQ4Fired: true, overtime: false,
    awaitingXpChoice: false, awaitingKickoffChoice: false,
    homeTimeouts: 0, awayTimeouts: 0,
    ...over,
  } as LiveEngineState;
}
/** The user is the home team; the away team is the CPU. */
function engineIn(state: LiveEngineState) {
  return createLiveCoachEngine(makeTeam('home', 'HOM'), makeTeam('away', 'AWY'), makeRoster('H'), makeRoster('A'), state, 'home');
}
const isKick = (t: string) => t === 'field_goal_good' || t === 'field_goal_miss';

afterEach(() => { vi.restoreAllMocks(); });

describe('CPU end-of-game field goals', () => {
  it('down 6 with 0:02 left at the 36 (a 53-yarder): throws for the end zone, never kicks', () => {
    for (let i = 0; i < 200; i++) {
      const events = engineIn(lateState({})).runOnePlay();
      expect(events.some(e => isKick(e.type))).toBe(false);
      const snap = events.find(e => ['pass_complete', 'pass_incomplete', 'interception', 'sack'].includes(e.type));
      expect(snap, `expected a pass play, got: ${events.map(e => e.type).join(', ')}`).toBeTruthy();
    }
  });

  it('down 4 on 4th down inside two minutes: goes for it instead of kicking or punting', () => {
    for (let i = 0; i < 200; i++) {
      const events = engineIn(lateState({ timeSecs: 70, down: 4, yardsToGo: 8, homeScore: 28, awayScore: 24 })).runOnePlay();
      expect(events.some(e => isKick(e.type) || e.type === 'punt')).toBe(false);
    }
  });

  it('down 3 (or tied) with 0:02 left in range: still kicks', () => {
    for (const awayScore of [27, 30]) {
      const events = engineIn(lateState({ awayScore })).runOnePlay();
      expect(events.some(e => isKick(e.type))).toBe(true);
    }
  });

  it('end of the first half, trailing by 6 in range: still takes the points', () => {
    const events = engineIn(lateState({ quarter: 2, twoMinWarningQ4Fired: false })).runOnePlay();
    expect(events.some(e => isKick(e.type))).toBe(true);
  });
});

describe('interception returns', () => {
  it('the event carries the spot the engine gave the defense, and the sim pictures a pick-six only when the engine scored one', () => {
    // deep shots are picked ~6% of the time: keep snapping fresh drives until one is
    let seen = 0;
    for (let i = 0; i < 6000 && seen < 40; i++) {
      const engine = engineIn(lateState({ quarter: 2, timeSecs: 600, possession: 'home', fieldPos: 20 + (i % 60), homeScore: 7, awayScore: 7 }));
      const events = engine.runOnePlay('pass_deep');
      const pick = events.find(e => e.type === 'interception');
      if (!pick) continue;
      seen++;
      const after = engine.getState();
      expect(after.homeScore).toBe(7);
      if (pick.isScoring) {
        // the engine ran it back (returns.ts): 7 for the defense, a kickoff, and the sim is told it scored
        expect(pick.returnTo).toBe(100);
        expect(after.awayScore).toBe(14);
        expect(events.some(e => e.type === 'kickoff')).toBe(true);
        expect(toSimResult(pick)).toMatchObject({ kind: 'int', td: true });
        continue;
      }
      expect(after.possession).toBe('away');
      expect(pick.returnTo).toBe(after.fieldPos);
      expect(after.awayScore).toBe(7);
      // …and the 3D sim is told to end the return there, so it can't picture a pick-six the game didn't score
      const sim = toSimResult(pick)!;
      expect(sim.td).toBeUndefined();
      // (a pick downed in the end zone has no return to run: the sim stays at the catch and the ball comes out to the 20)
      const touchback = pick.returnFrom === 0 && pick.returnYards === 0;
      expect(sim).toMatchObject({ kind: 'int', endAt: touchback ? 1 : after.fieldPos });
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('an older saved event without a return spot still maps to a plain interception', () => {
    const res = toSimResult({
      id: 1, type: 'interception', description: 'INTERCEPTED! A picks off B.', quarter: 1, timeStr: '10:00', possession: 'home',
      fieldPos: 40, down: 1, yardsToGo: 10, yardsGained: 0, homeScore: 0, awayScore: 0, isScoring: false,
    });
    expect(res).toEqual({ kind: 'int', depth: 'short' });
  });
});

describe('play action on a two-point try', () => {
  it('is thrown as a play action, never swapped for a coin-flip run or plain pass (the menu offers it there too)', () => {
    for (let i = 0; i < 60; i++) {
      const engine = engineIn(lateState({ quarter: 2, timeSecs: 600, possession: 'home', fieldPos: 97, down: 1, yardsToGo: 3, homeScore: 13, awayScore: 7, awaitingTwoPointCall: true }));
      const snap = engine.runOnePlay('play_action').find(e => ['pass_complete', 'pass_incomplete', 'interception', 'sack', 'run'].includes(e.type));
      expect(snap, 'the try is a snap').toBeTruthy();
      expect(snap!.type).not.toBe('run');
      expect(snap!.description).toMatch(/^2-PT — 🎭 Play Action — /);
      // …and the 3D sim pictures the fake handoff before the throw
      expect(toSimResult(snap!)?.style).toBe('play_action');
    }
  });
});
