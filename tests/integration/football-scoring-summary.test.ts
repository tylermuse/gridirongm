/**
 * Box Score scoring summary (P2 — 2026-09-18 ship): users saw unusual point
 * totals with no per-play breakdown (idontknow01754: "how is a FG + safety =
 * 5 points?"), so odd totals looked like a bug. deriveScoringPlaysFromEvents
 * previously diffed the score only on the scoring event itself, but the engine
 * snapshots a scoring play's score BEFORE applying its points, so it recorded
 * nothing for live-played games. This guards that every scoring play is now
 * captured and the itemized points reconcile to the final score.
 */
import { describe, it, expect } from 'vitest';
import { simulatePlayByPlay, deriveScoringPlaysFromEvents } from '@/lib/engine/playByPlay';
import { scoringPlayTypeLabel } from '@/lib/scoringSummary';
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
function makeTeam(id: string): Team {
  return { id, abbreviation: id, name: id, primaryColor: '#123456', depthChart: {} } as unknown as Team;
}

describe('box score scoring summary', () => {
  it('derived scoring plays reconcile to the final score for live-played games', () => {
    for (let i = 0; i < 150; i++) {
      const live = simulatePlayByPlay(makeTeam('H'), makeTeam('A'), makeRoster('H'), makeRoster('A'));
      const plays = deriveScoringPlaysFromEvents(live.events, 'H', 'A');
      const homePts = plays.filter(p => p.teamId === 'H').reduce((a, p) => a + p.points, 0);
      const awayPts = plays.filter(p => p.teamId === 'A').reduce((a, p) => a + p.points, 0);
      expect(homePts).toBe(live.homeScore);
      expect(awayPts).toBe(live.awayScore);
      // Every non-zero game must produce at least one itemized scoring play.
      if (live.homeScore + live.awayScore > 0) expect(plays.length).toBeGreaterThan(0);
    }
  });

  it('labels scoring plays with a readable play type', () => {
    expect(scoringPlayTypeLabel({ points: 3, description: 'J. Doe 42-yard field goal' })).toBe('FG');
    expect(scoringPlayTypeLabel({ points: 6, description: 'J. Doe 12 yd rush' })).toBe('TD');
    expect(scoringPlayTypeLabel({ points: 7, description: 'J. Doe 12 yd rush (XP good)' })).toBe('TD');
    expect(scoringPlayTypeLabel({ points: 8, description: 'TD then two-point conversion is GOOD!' })).toBe('2PT');
    expect(scoringPlayTypeLabel({ points: 2, description: 'Safety! Tackled in the end zone.' })).toBe('SAF');
    expect(scoringPlayTypeLabel({ points: 1, description: 'Extra point good' })).toBe('XP');
  });
});
