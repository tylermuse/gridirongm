import { describe, it, expect } from 'vitest';
import { focusForLine, computeUnitLine } from '@/lib/spotlight/showFocus';
import type { Player, PlayerStats, Team } from '@/types';

const zero = {
  gamesPlayed: 10, passAttempts: 0, passCompletions: 0, passYards: 0, passTDs: 0, interceptions: 0,
  rushAttempts: 0, rushYards: 0, rushTDs: 0, fumbles: 0, targets: 0, receptions: 0, receivingYards: 0, receivingTDs: 0,
  tackles: 0, tacklesForLoss: 0, sacks: 0, defensiveINTs: 0, passDeflections: 0, forcedFumbles: 0, sacksAllowed: 0, passBlocks: 0,
  fieldGoalAttempts: 0, fieldGoalsMade: 0, extraPointAttempts: 0, extraPointsMade: 0, puntAttempts: 0, puntYards: 0, puntsInside20: 0,
  touchbacks: 0, kickReturns: 0, kickReturnYards: 0, kickReturnTDs: 0, puntReturns: 0, puntReturnYards: 0, puntReturnTDs: 0, snaps: 500,
} satisfies PlayerStats;
const team = (id: string) => ({ id, abbreviation: id.toUpperCase(), record: { wins: 5, losses: 5, ties: 0, pointsFor: 200, pointsAgainst: 220 } }) as unknown as Team;
const pl = (id: string, teamId: string, position: string, s: Partial<PlayerStats>) =>
  ({ id, firstName: id, lastName: `${id}son`, position, teamId, stats: { ...zero, ...s } }) as unknown as Player;

const dal = team('dal'), nyg = team('nyg');
const players = [
  pl('starter', 'dal', 'QB', { passAttempts: 350, passCompletions: 230, passYards: 2600 }),
  pl('backup', 'dal', 'QB', { passAttempts: 20, passCompletions: 12, passYards: 150 }),
  pl('lt', 'dal', 'OL', { sacksAllowed: 9 }),
  pl('rg', 'dal', 'OL', { sacksAllowed: 6 }),
  pl('nyqb', 'nyg', 'QB', { passAttempts: 300, passCompletions: 190, passYards: 2200 }),
  pl('nyol', 'nyg', 'OL', { sacksAllowed: 4 }),
];
const ctx = { team: dal, teams: [dal, nyg], players, earlier: [] as string[] };

describe('focusForLine', () => {
  it('"the quarterback" means the team’s starter, with his QB stats', () => {
    const f = focusForLine('The quarterback has to be better.', ctx);
    expect(f.kind).toBe('player');
    if (f.kind === 'player') {
      expect(f.player.id).toBe('starter');
      expect(f.tiles!.map(t => t.key)).toContain('cmp');
    }
  });

  it('offensive-line talk shows the line’s numbers, sacks allowed first', () => {
    const f = focusForLine('The offensive line is a problem. They keep giving up sacks.', ctx);
    expect(f.kind).toBe('unit');
    if (f.kind === 'unit') {
      expect(f.tiles[0]).toMatchObject({ key: 'sacksAllowed', value: '15', rank: 2, of: 2 });
      expect(f.mentioned).toContain('sacksAllowed');
    }
  });

  it('team stat talk keeps the team line; nothing measurable → no stats', () => {
    expect(focusForLine('The offense ranks 7th in points per game.', ctx)).toMatchObject({ kind: 'team', mentioned: ['ppg'] });
    expect(focusForLine("They can't just stand pat! It's time to make a move!", ctx)).toEqual({ kind: 'none' });
  });

  it('stays on a player for the rest of his topic, or follows the headline', () => {
    expect(focusForLine('I said what I said.', { ...ctx, earlier: ['Bench the quarterback.'] })).toMatchObject({ kind: 'player' });
    expect(focusForLine('This is getting ugly.', { ...ctx, topic: { headline: 'QB Watch' } })).toMatchObject({ kind: 'player' });
  });
});

describe('computeUnitLine', () => {
  it('ranks a unit against every team (lower is better for sacks allowed)', () => {
    expect(computeUnitLine('oline', nyg, [dal, nyg], players)![0]).toMatchObject({ value: '4', rank: 1 });
  });
});
