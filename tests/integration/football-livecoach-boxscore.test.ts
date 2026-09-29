/**
 * Live Coach box score (P1): a game driven entirely by the live-coach engine
 * must accumulate per-player stats. Regression guard for jslusser1945_25790's
 * 8/13 report (Commish-confirmed 8/15): live-coached games recorded an empty
 * box score because liveCoachEngine events carried no bucket snapshots and
 * buildFinalGameResult discarded every post-pivot play. The engine now
 * accumulates its own PlayerStats and exposes them via getPlayerStats().
 */

import { describe, it, expect } from 'vitest';
import { createLiveCoachEngine, type LiveEngineState } from '@/lib/engine/liveCoachEngine';
import type { Player, Position, Team } from '@/types';

function makePlayer(id: string, position: Position, ovr = 78): Player {
  return {
    id,
    firstName: 'Test',
    lastName: id,
    position,
    age: 26,
    experience: 4,
    ratings: {
      overall: ovr, speed: ovr, strength: ovr, agility: ovr, awareness: ovr,
      stamina: ovr, throwing: ovr, catching: ovr, carrying: ovr, blocking: ovr,
      tackling: ovr, coverage: ovr, passRush: ovr, kicking: ovr,
    },
    potential: ovr,
    ratingHistory: [],
    stats: {} as Player['stats'],
    careerStats: {} as Player['careerStats'],
    contract: {} as Player['contract'],
    teamId: null,
    draftYear: null,
    draftPick: null,
    retired: false,
    injury: null,
    onIR: false,
  } as unknown as Player;
}

function makeRoster(prefix: string): Player[] {
  return [
    makePlayer(`${prefix}-QB`, 'QB'),
    makePlayer(`${prefix}-RB`, 'RB'),
    makePlayer(`${prefix}-WR1`, 'WR'),
    makePlayer(`${prefix}-WR2`, 'WR'),
    makePlayer(`${prefix}-TE`, 'TE'),
    makePlayer(`${prefix}-K`, 'K'),
    makePlayer(`${prefix}-DL`, 'DL'),
    makePlayer(`${prefix}-LB`, 'LB'),
    makePlayer(`${prefix}-CB`, 'CB'),
  ];
}

function makeTeam(id: string, abbr: string): Team {
  return { id, abbreviation: abbr, depthChart: {} } as Team;
}

function freshState(): LiveEngineState {
  return {
    quarter: 1, timeSecs: 900, possession: 'home', fieldPos: 25,
    down: 1, yardsToGo: 10, homeScore: 0, awayScore: 0, isGameOver: false,
    twoMinWarningQ2Fired: false, twoMinWarningQ4Fired: false, overtime: false,
    awaitingXpChoice: false, awaitingKickoffChoice: false,
    homeTimeouts: 3, awayTimeouts: 3,
  };
}

function sum(stats: Record<string, Partial<Record<string, number>>>, field: string): number {
  return Object.values(stats).reduce((s, p) => s + (p[field] ?? 0), 0);
}

describe('live coach engine accumulates a box score', () => {
  it('a full live-coached game records non-empty player stats', () => {
    const home = makeTeam('home', 'HOM');
    const away = makeTeam('away', 'AWY');
    const engine = createLiveCoachEngine(
      home, away, makeRoster('H'), makeRoster('A'), freshState(), 'home',
    );

    let safety = 0;
    while (!engine.isFinished() && safety < 5000) {
      engine.runOnePlay(); // no user call -> engine auto-drives every play
      safety++;
    }
    expect(engine.isFinished()).toBe(true);

    const stats = engine.getPlayerStats() as Record<string, Partial<Record<string, number>>>;
    expect(Object.keys(stats).length).toBeGreaterThan(0);
    expect(sum(stats, 'passAttempts') + sum(stats, 'rushAttempts')).toBeGreaterThan(0);
    expect(sum(stats, 'passYards') + sum(stats, 'rushYards')).toBeGreaterThan(0);
  });
});

describe('defensive timeouts (callTimeoutFor)', () => {
  it('charges the named team, not the offense, and stops the clock', () => {
    const engine = createLiveCoachEngine(
      makeTeam('home', 'HOM'), makeTeam('away', 'AWY'), makeRoster('H'), makeRoster('A'),
      { ...freshState(), possession: 'away', pendingRunoff: 30 }, 'home',
    );
    // User (home) is on defense while the away team has the ball.
    const evs = engine.callTimeoutFor('home');
    expect(evs).toHaveLength(1);
    expect(evs[0].description).toContain('HOM');
    const st = engine.getState();
    expect(st.homeTimeouts).toBe(2);
    expect(st.awayTimeouts).toBe(3);
    expect(st.pendingRunoff).toBe(0);
    expect(st.timeSecs).toBe(900); // a timeout never burns clock
  });

  it('freezes the clock where it was shown: keeps elapsed runoff, cancels the rest', () => {
    const engine = createLiveCoachEngine(
      makeTeam('home', 'HOM'), makeTeam('away', 'AWY'), makeRoster('H'), makeRoster('A'),
      { ...freshState(), possession: 'away', timeSecs: 300, pendingRunoff: 30 }, 'home',
    );
    // 12s of the 30s runoff had already ticked off the scorebug (5:00 -> 4:48).
    const evs = engine.callTimeoutFor('home', 12);
    expect(evs[0].timeStr).toBe('4:48');
    const st = engine.getState();
    expect(st.timeSecs).toBe(288);
    expect(st.pendingRunoff).toBe(0);
    // Elapsed can never exceed the runoff actually owed.
    const e2 = createLiveCoachEngine(
      makeTeam('home', 'HOM'), makeTeam('away', 'AWY'), makeRoster('H'), makeRoster('A'),
      { ...freshState(), possession: 'away', timeSecs: 300, pendingRunoff: 5 }, 'home',
    );
    e2.callTimeoutFor('home', 40);
    expect(e2.getState().timeSecs).toBe(295);
  });

  it('does nothing when the team is out of timeouts', () => {
    const engine = createLiveCoachEngine(
      makeTeam('home', 'HOM'), makeTeam('away', 'AWY'), makeRoster('H'), makeRoster('A'),
      { ...freshState(), possession: 'away', homeTimeouts: 0, pendingRunoff: 30 }, 'home',
    );
    expect(engine.callTimeoutFor('home')).toHaveLength(0);
    expect(engine.getState().pendingRunoff).toBe(30);
  });
});
