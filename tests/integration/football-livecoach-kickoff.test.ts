/**
 * Live Coach kickoffs — every kickoff used to be "fielded at the 25" (Tyler
 * 10/27: "every single kickoff is returned to exactly the 25-yard line").
 * The regular kickoff now has a spread of return spots, touchbacks at the 35,
 * and a rare return touchdown, like the full sim's standard-mode kickoff.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createLiveCoachEngine, type LiveEngineState } from '@/lib/engine/liveCoachEngine';
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

/** Home kicks off next: the engine is waiting on the user's (home) kickoff choice. */
function kickoffState(over: Partial<LiveEngineState> = {}): LiveEngineState {
  return {
    quarter: 4, timeSecs: 100, possession: 'home', fieldPos: 25,
    down: 1, yardsToGo: 10, homeScore: 10, awayScore: 14, isGameOver: false,
    twoMinWarningQ2Fired: false, twoMinWarningQ4Fired: true, overtime: false,
    awaitingXpChoice: false, awaitingKickoffChoice: true,
    homeTimeouts: 3, awayTimeouts: 3,
    ...over,
  } as LiveEngineState;
}

function engineIn(state: LiveEngineState) {
  return createLiveCoachEngine(
    makeTeam('home', 'HOM'), makeTeam('away', 'AWY'),
    makeRoster('H'), makeRoster('A'), state, 'home',
  );
}

afterEach(() => vi.restoreAllMocks());

describe('live coach regular kickoff', () => {
  it('is not always the 25: spots vary, with touchbacks at the 35', () => {
    const spots = new Set<number>();
    let touchbacks = 0;
    for (let i = 0; i < 300; i++) {
      const eng = engineIn(kickoffState());
      const evs = eng.runOnePlay('regular_kick' as never);
      const ko = evs.find(e => e.type === 'kickoff')!;
      expect(ko).toBeDefined();
      if (ko.isScoring) continue;   // the rare return TD (covered below)
      const st = eng.getState();
      expect(st.possession).toBe('away');
      expect(st.down).toBe(1);
      if (/touchback/i.test(ko.description)) { touchbacks++; expect(st.fieldPos).toBe(35); }
      else {
        expect(ko.description).toMatch(/returned to the (\d{1,2})/);
        expect(st.fieldPos).toBeGreaterThanOrEqual(18);
        expect(st.fieldPos).toBeLessThanOrEqual(35);
      }
      expect(ko.fieldPos).toBe(st.fieldPos);
      spots.add(st.fieldPos);
    }
    expect(spots.size).toBeGreaterThan(5);
    expect(touchbacks).toBeGreaterThan(30);
    expect(touchbacks).toBeLessThan(150);
  });

  it('a kick return touchdown credits the receiving team and has them kick off', () => {
    // first draw < .005 → return TD; the re-kick then sees the tail (no TD, no touchback, mid return)
    let i = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => (i++ === 0 ? 0.001 : 0.5));
    const eng = engineIn(kickoffState({ timeSecs: 500 }));   // not late: no onside prompt on the re-kick
    const evs = eng.runOnePlay('regular_kick' as never);
    const kos = evs.filter(e => e.type === 'kickoff');
    expect(kos).toHaveLength(2);
    expect(kos[0].isScoring).toBe(true);
    expect(kos[0].description).toMatch(/return TOUCHDOWN/);
    expect(kos[0].possession).toBe('home');            // logged on the kicking team's possession (the 3D sim credits the other side)
    expect(kos[0].homeScore).toBe(10);                 // score on the event is pre-TD; the points land after it's logged
    const st = eng.getState();
    expect(st.awayScore).toBe(21);
    expect(st.homeScore).toBe(10);
    expect(kos[1].possession).toBe('away');            // the scoring team kicks off
    expect(st.possession).toBe('home');
  });
});
