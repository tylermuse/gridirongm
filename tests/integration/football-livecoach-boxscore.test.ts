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
