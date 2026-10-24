/**
 * Live Coach OVERTIME end-of-game rules (P1).
 *
 * Guards crypticer.'s bug (reported #general 2026-10-19, Commish-approved
 * Oct-21 spec): in OT, after the user threw an interception the game kept
 * going even after the opponent scored, because the INT path switched
 * possession WITHOUT marking the throwing team's possession as run — so
 * otPossessionsCompleted never reached the 2 the OT-end check requires.
 *
 * The fix must satisfy ALL of:
 *  - an OT interception counts the throwing team's completed possession;
 *  - the game ends as soon as the SECOND team to possess takes a decisive
 *    lead and its scoring possession completes (no phantom extra possession
 *    for the team that just lost);
 *  - the scoring team still gets its extra-point / two-point try before the
 *    game can end (the game must NOT end the instant a TD makes the score
 *    unequal — the PAT can tie or win);
 *  - the FIRST team's OT touchdown never ends the game — the opponent always
 *    gets its possession.
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

/** Base OT state; override per scenario. */
function otState(over: Partial<LiveEngineState>): LiveEngineState {
  return {
    quarter: 5, timeSecs: 400, possession: 'home', fieldPos: 25,
    down: 1, yardsToGo: 10, homeScore: 0, awayScore: 0, isGameOver: false,
    twoMinWarningQ2Fired: false, twoMinWarningQ4Fired: false, overtime: true,
    awaitingXpChoice: false, awaitingKickoffChoice: false,
    homeTimeouts: 3, awayTimeouts: 3,
    otPossessionsCompleted: 0, otPlayRunThisPossession: false,
    ...over,
  } as LiveEngineState;
}

function engineIn(state: LiveEngineState, userSide: 'home' | 'away') {
  return createLiveCoachEngine(
    makeTeam('home', 'HOM'), makeTeam('away', 'AWY'),
    makeRoster('H'), makeRoster('A'), state, userSide,
  );
}

/** Math.random mock: a scripted prefix, then a constant tail. */
function mockRandom(seq: number[], tail = 0.5) {
  let i = 0;
  vi.spyOn(Math, 'random').mockImplementation(() => (i < seq.length ? seq[i++] : tail));
}

afterEach(() => vi.restoreAllMocks());

describe('live coach overtime end rules', () => {
  it('an OT interception counts the throwing team’s possession (Part 1 of the fix)', () => {
    // pass_deep call order: [pickReceiver, sack?, INT?, pickInterceptor, returnPos]
    // 0.5 picks a receiver, 0.5 >= sackChance(0.10) = no sack, 0.001 < intChance(0.06) = INT.
    mockRandom([0.5, 0.5, 0.001]);
    const engine = engineIn(
      otState({ possession: 'home', fieldPos: 50, homeScore: 20, awayScore: 20 }),
      'home',
    );
    const evs = engine.runOnePlay('pass_deep');
    const st = engine.getState();
    expect(evs.some(e => /INTERCEPTED/i.test(e.description))).toBe(true);
    expect(st.otPossessionsCompleted).toBe(1); // the INT possession is now counted
    expect(st.possession).toBe('away');         // ball flipped to the opponent
    expect(engine.isFinished()).toBe(false);    // still tied — game continues
  });

  it('ends OT when the second team scores a decisive TD — no phantom extra possession for the loser', () => {
    mockRandom([]); // constant 0.5 -> completion + TD + good XP
    // Opponent (away, CPU) has the ball after the user already used possession #1.
    const engine = engineIn(
      otState({
        possession: 'away', fieldPos: 99, down: 1, yardsToGo: 1,
        homeScore: 20, awayScore: 20, otPossessionsCompleted: 1, otPlayRunThisPossession: true,
      }),
      'home',
    );
    const evs = engine.runOnePlay('pass_short');
    const st = engine.getState();
    expect(evs.some(e => /TOUCHDOWN/i.test(e.description))).toBe(true);
    expect(engine.isFinished()).toBe(true);     // game over right after the scoring possession
    expect(st.awayScore).toBe(27);              // TD + extra point both applied
    expect(st.homeScore).toBe(20);
    expect(st.awaitingKickoffChoice).toBe(false); // the user (loser) gets nothing back
  });

  it('does NOT end the game the instant a second-team TD makes the score unequal — the PAT must happen first', () => {
    // Regression guard for the rejected Oct-21 patch, which ended OT in
    // handleTouchdown right after addScore(6), denying the tying/winning PAT.
    mockRandom([]); // constant 0.5 -> user TD
    // User (away) is down 27-20 and scores a TD to pull to 27-26 pre-PAT.
    const engine = engineIn(
      otState({
        possession: 'away', fieldPos: 99, down: 1, yardsToGo: 1,
        homeScore: 27, awayScore: 20, otPossessionsCompleted: 1, otPlayRunThisPossession: true,
      }),
      'away',
    );
    const st0 = engine.runOnePlay('pass_short') && engine.getState();
    expect(st0.awayScore).toBe(26);            // TD only (no PAT yet)
    expect(engine.isFinished()).toBe(false);   // game must NOT be over
    expect(st0.awaitingXpChoice).toBe(true);   // engine pauses for the XP/2PT choice
  });

  it('a FIRST-team OT touchdown never ends the game — the opponent still gets a possession', () => {
    mockRandom([]); // constant 0.5
    const engine = engineIn(
      otState({
        possession: 'home', fieldPos: 99, down: 1, yardsToGo: 1,
        homeScore: 20, awayScore: 20, otPossessionsCompleted: 0, otPlayRunThisPossession: true,
      }),
      'home',
    );
    engine.runOnePlay('pass_short');            // home scores first OT TD
    expect(engine.getState().awaitingXpChoice).toBe(true);
    expect(engine.isFinished()).toBe(false);
    engine.runOnePlay('extra_point');           // kick the PAT -> kickoff -> opponent ball
    const st = engine.getState();
    expect(engine.isFinished()).toBe(false);    // opponent must get their shot
    expect(st.possession).toBe('away');
    expect(st.otPossessionsCompleted).toBe(1);
    expect(st.homeScore).toBe(27);
  });
});
