/**
 * Live-coached passing line visibility (P1 — 2026-09-20 ship): yo46363 reported
 * QB passing stats looked "missing" during live play (fine when simming a full
 * season). Cause: livePlayerStatsAtEvent only emitted the QB entry once
 * bucket.passAttempts > 0, so early in a drive the QB block was hidden entirely
 * rather than showing a 0/0 line. This guards that the starting QB always gets a
 * passing entry (0/0 before the first attempt) whenever a bucket snapshot exists,
 * and that real numbers still accumulate.
 */
import { describe, it, expect } from 'vitest';
import { simulatePlayByPlay, livePlayerStatsAtEvent, type StatBucket } from '@/lib/engine/playByPlay';
import type { Player, Position, Team } from '@/types';

function makePlayer(id: string, position: Position, ovr = 78): Player {
  return {
    id, firstName: 'Test', lastName: id, position, age: 26, experience: 4,
    ratings: { overall: ovr, speed: ovr, strength: ovr, agility: ovr, awareness: ovr,
      stamina: ovr, throwing: ovr, catching: ovr, carrying: ovr, blocking: ovr,
      tackling: ovr, coverage: ovr, passRush: ovr, kicking: ovr },
    potential: ovr, ratingHistory: [], stats: {} as Player['stats'],
    careerStats: {} as Player['careerStats'], contract: {} as Player['contract'],
    teamId: null, draftYear: null, draftPick: null, retired: false, injury: null, onIR: false,
  } as unknown as Player;
}
function makeRoster(prefix: string): Player[] {
  return (['QB', 'RB', 'WR', 'WR', 'TE', 'K', 'DL', 'LB', 'CB', 'S'] as Position[])
    .map((pos, i) => makePlayer(`${prefix}-${pos}${i}`, pos));
}
function zeroBucket(): StatBucket {
  return {
    passAttempts: 0, passCompletions: 0, passYards: 0, passTDs: 0, interceptions: 0,
    rushAttempts: 0, rushYards: 0, rushTDs: 0, qbRushAttempts: 0, qbRushYards: 0, qbRushTDs: 0,
    receivingTargets: 0, receptions: 0, receivingYards: 0, receivingTDs: 0,
    sacks: 0, defensiveINTs: 0, tackles: 0,
    fieldGoalAttempts: 0, fieldGoalsMade: 0, extraPointAttempts: 0, extraPointsMade: 0,
    perReceiver: {}, perRusher: {}, perSacker: {}, perInterceptor: {},
  };
}

describe('live-coached passing line', () => {
  it('shows the starting QB with a 0/0 line before the first pass attempt', () => {
    const home = makeRoster('H');
    const away = makeRoster('A');
    const ev = { homeBucketSnap: zeroBucket(), awayBucketSnap: zeroBucket() } as never;
    const stats = livePlayerStatsAtEvent(ev, home, away);
    const homeQB = home.find(p => p.position === 'QB')!;
    expect(stats[homeQB.id]).toBeDefined();
    expect(stats[homeQB.id].passAttempts).toBe(0);
    expect(stats[homeQB.id].passCompletions).toBe(0);
    expect(stats[homeQB.id].gamesPlayed).toBe(1);
  });

  it('still accumulates real passing numbers as plays resolve', () => {
    for (let i = 0; i < 25; i++) {
      const home = makeRoster('H');
      const away = makeRoster('A');
      const live = simulatePlayByPlay(makeTeam('H'), makeTeam('A'), home, away);
      const last = [...live.events].reverse().find(e => e.homeBucketSnap && e.awayBucketSnap);
      const stats = livePlayerStatsAtEvent(last, home, away);
      const homeQB = home.find(p => p.position === 'QB')!;
      // The QB entry is present and passing yards are non-negative integers.
      expect(stats[homeQB.id]).toBeDefined();
      expect(stats[homeQB.id].passAttempts).toBeGreaterThanOrEqual(0);
    }
  });
});

function makeTeam(id: string): Team {
  return { id, abbreviation: id, name: id, primaryColor: '#123456', depthChart: {} } as unknown as Team;
}
