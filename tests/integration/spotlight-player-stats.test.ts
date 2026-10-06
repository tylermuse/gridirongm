import { describe, it, expect } from 'vitest';
import { computePlayerStatLine, playerStatsMentioned } from '@/lib/spotlight/playerStats';
import type { Player, PlayerStats } from '@/types';

const zero = {
  gamesPlayed: 0, passAttempts: 0, passCompletions: 0, passYards: 0, passTDs: 0, interceptions: 0,
  rushAttempts: 0, rushYards: 0, rushTDs: 0, fumbles: 0, targets: 0, receptions: 0, receivingYards: 0, receivingTDs: 0,
  tackles: 0, tacklesForLoss: 0, sacks: 0, defensiveINTs: 0, passDeflections: 0, forcedFumbles: 0, sacksAllowed: 0, passBlocks: 0,
  fieldGoalAttempts: 0, fieldGoalsMade: 0, extraPointAttempts: 0, extraPointsMade: 0, puntAttempts: 0, puntYards: 0, puntsInside20: 0,
  touchbacks: 0, kickReturns: 0, kickReturnYards: 0, kickReturnTDs: 0, puntReturns: 0, puntReturnYards: 0, puntReturnTDs: 0, snaps: 0,
} satisfies PlayerStats;
const qb = (id: string, s: Partial<PlayerStats>) => ({ id, firstName: id, lastName: id, position: 'QB', teamId: 't', stats: { ...zero, gamesPlayed: 10, ...s } }) as unknown as Player;

const a = qb('a', { passAttempts: 300, passCompletions: 200, passYards: 2500, passTDs: 20, interceptions: 5 });
const b = qb('b', { passAttempts: 320, passCompletions: 190, passYards: 2900, passTDs: 15, interceptions: 12 });
const backup = qb('c', { passAttempts: 10, passCompletions: 9, passYards: 120, passTDs: 2, interceptions: 0 });
const all = [a, b, backup];

describe('computePlayerStatLine', () => {
  it('ranks a QB among QBs on QB stats', () => {
    const line = computePlayerStatLine(a, all)!;
    expect(line.map(t => t.key)).toEqual(['passYds', 'cmp', 'passTd', 'int', 'rating']);
    expect(line.find(t => t.key === 'passYds')).toMatchObject({ value: '2,500', rank: 2, of: 3 });
    expect(line.find(t => t.key === 'passTd')).toMatchObject({ rank: 1 });
    // Fewer INTs is better.
    expect(line.find(t => t.key === 'int')).toMatchObject({ rank: 1 });
  });

  it('ranks rate stats only among players with real volume', () => {
    // The 9-of-10 backup would be #1 in completion % if he counted.
    expect(computePlayerStatLine(a, all)!.find(t => t.key === 'cmp')).toMatchObject({ value: '66.7%', rank: 1, of: 2 });
  });

  it('is null before a player has played', () => {
    expect(computePlayerStatLine(qb('d', { gamesPlayed: 0 }), all)).toBeNull();
  });

  it('highlights the tile a line talks about', () => {
    const line = computePlayerStatLine(a, all)!;
    expect(playerStatsMentioned("Callahan's completion rate is above average.", line)).toEqual(['cmp']);
  });
});

describe('defensive backs', () => {
  const cb = (id: string, gp: number, s: Partial<PlayerStats>) => ({ id, firstName: id, lastName: id, position: 'CB', teamId: 't', stats: { ...zero, gamesPlayed: gp, ...s } }) as unknown as Player;
  const me = cb('me', 16, { tackles: 40, defensiveINTs: 3, passDeflections: 11 });
  const others = [cb('o1', 17, { tackles: 60, defensiveINTs: 5, passDeflections: 15, sacks: 1 }), cb('o2', 15, { tackles: 30, defensiveINTs: 1 }), cb('backup', 2, { tackles: 3 })];
  it('a corner is shown on picks and breakups, ranked among corners who played; none of a stat is unranked', () => {
    const line = computePlayerStatLine(me, [me, ...others])!;
    expect(line.map(t => t.key)).toEqual(['defInt', 'pd', 'tackles', 'ff']);
    expect(line[0]).toMatchObject({ value: '3', rank: 2, of: 3 }); // the 2-game backup isn't in the pool
    expect(line[3]).toMatchObject({ value: '0', rank: 0, note: 'None' });
  });
});
