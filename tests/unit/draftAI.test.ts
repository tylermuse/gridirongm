import { describe, it, expect } from 'vitest';
import { POSITIONS, type Position } from '@/types';
import {
  rankProspects, scoreProspect, teamContextFromRoster, chooseDraftPick, mockFollowChance,
  type DraftAIProspect, type DraftAITeamContext,
} from '@/lib/engine/draftAI';

const half = () => 0.5; // neutral noise
const fullRoster = (): DraftAITeamContext => {
  const countByPosition = { QB: 2, RB: 3, WR: 5, TE: 2, OL: 8, DL: 7, LB: 6, CB: 5, S: 4, K: 1, P: 1 } as Record<Position, number>;
  return { countByPosition, bestQbOvr: 85, hasDevQB: false };
};
const p = (id: string, position: Position, overall: number, potential = overall + 10): DraftAIProspect =>
  ({ id, position, overall, potential });

describe('draftAI', () => {
  it('calls rng exactly once per prospect (keeps the game\'s random sequence)', () => {
    let calls = 0;
    rankProspects([p('a', 'WR', 60), p('b', 'QB', 60), p('c', 'K', 60)], fullRoster(), () => { calls++; return 0.5; });
    expect(calls).toBe(3);
  });

  it('values QB over RB at equal ratings', () => {
    const r = rankProspects([p('rb', 'RB', 65), p('qb', 'QB', 65)], fullRoster(), half);
    expect(r[0].playerId).toBe('qb');
  });

  it('a team with no QB takes one', () => {
    const team = fullRoster(); team.countByPosition.QB = 0; team.bestQbOvr = 0;
    const r = rankProspects([p('wr', 'WR', 75), p('qb', 'QB', 62)], team, half);
    expect(r[0].playerId).toBe('qb');
  });

  it('a team with a dev QB does not chase another', () => {
    const team = fullRoster(); team.countByPosition.QB = 1; team.bestQbOvr = 55; team.hasDevQB = true;
    const withDev = scoreProspect(p('qb', 'QB', 60, 82), team, half);
    team.hasDevQB = false;
    const withoutDev = scoreProspect(p('qb', 'QB', 60, 82), team, half);
    expect(withoutDev - withDev).toBe(180);
  });

  it('nearly eliminates positions already at the roster max', () => {
    const team = fullRoster(); team.countByPosition.WR = 6;
    const r = rankProspects([p('wr', 'WR', 80), p('s', 'S', 60)], team, half);
    expect(r[0].playerId).toBe('s');
  });

  it('builds team context from a roster', () => {
    const ctx = teamContextFromRoster([
      { position: 'QB', overall: 70, experience: 5, potential: 72 },
      { position: 'QB', overall: 58, experience: 0, potential: 84 },
      { position: 'WR', overall: 80 },
    ], POSITIONS);
    expect(ctx.countByPosition.QB).toBe(2);
    expect(ctx.countByPosition.WR).toBe(1);
    expect(ctx.bestQbOvr).toBe(70);
    expect(ctx.hasDevQB).toBe(true);
  });

  it('pick 1 always follows the mock; later picks follow with mockFollowChance', () => {
    const avail = [p('bpa', 'QB', 80), p('mock', 'WR', 70)];
    expect(chooseDraftPick({ overallPick: 1, available: avail, team: fullRoster(), mockPlayerId: 'mock', rng: () => 0.99 })).toBe('mock');
    expect(chooseDraftPick({ overallPick: 15, available: avail, team: fullRoster(), mockPlayerId: 'mock', rng: () => 0.49 })).toBe('mock');
    expect(chooseDraftPick({ overallPick: 15, available: avail, team: fullRoster(), mockPlayerId: 'mock', rng: () => 0.51 })).toBe('bpa');
    expect(mockFollowChance(2)).toBe(0.75);
    expect(mockFollowChance(32)).toBe(0.40);
  });
});
