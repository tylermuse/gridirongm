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

  it('team stat talk keeps the team line; nothing measurable still shows the team numbers (never a bare quote)', () => {
    expect(focusForLine('The offense ranks 7th in points per game.', ctx)).toMatchObject({ kind: 'team', mentioned: ['ppg'] });
    expect(focusForLine("They can't just stand pat! It's time to make a move!", ctx)).toEqual({ kind: 'team', mentioned: [] });
  });

  it('playoff-race talk shows the standings', () => {
    expect(focusForLine('Three and a half back. Doable.', ctx)).toEqual({ kind: 'standings', scope: 'conference' });
    expect(focusForLine('They can still win the division.', ctx)).toEqual({ kind: 'standings', scope: 'division' });
    expect(focusForLine('No room to drop another one.', { ...ctx, topic: { headline: 'Playoff Picture' } })).toEqual({ kind: 'standings', scope: 'conference' });
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

describe('focusForLine in a game breakdown', () => {
  const line = [{ key: 'passYds', label: 'Pass YDS', value: '287', rank: 0, of: 0, note: 'This game' }];
  const box = [{ key: 'to', label: 'Turnovers', value: '2', rank: 0, of: 0, note: 'NYG 3' }];
  const topic = { playerIds: ['starter'], gameLines: { starter: line }, gameTeam: box, gameLabel: 'Championship · DAL vs NYG' };
  const gctx = { ...ctx, topic, earlier: ['starterson was dealing.'] };

  it('a player shows his line from that game, not his season', () => {
    const f = focusForLine('starterson was dealing all night.', gctx);
    expect(f.kind === 'player' && f.tiles).toEqual(line);
  });

  it('a player with no line from the game shows no season numbers', () => {
    const f = focusForLine('Even backupson got a series.', gctx);
    expect(f.kind === 'player' && f.tiles).toBeNull();
  });

  it('a line about the game (no player) is the box score — no carried-over player', () => {
    const f = focusForLine('They turned it over three times, Dallas twice.', gctx);
    expect(f).toEqual({ kind: 'team', mentioned: ['to'] });
  });
});

describe('kicker', () => {
  it('"held them to field goals" is not about the kicker', () => {
    const k = pl('k', 'dal', 'K', { fieldGoalAttempts: 30, fieldGoalsMade: 27 });
    const f = focusForLine('The defense held them to two field goals.', { ...ctx, players: [...players, k] });
    expect(f.kind === 'player' && f.player.id === 'k').toBe(false);
    expect(focusForLine('The kicker was perfect.', { ...ctx, players: [...players, k] })).toMatchObject({ kind: 'player' });
  });
});

describe('carry-over', () => {
  it('"his completion rate" stays on the player being discussed', () => {
    const f = focusForLine("His completion rate is above league average.", { ...ctx, earlier: ['Bench starterson. I said what I said.'] });
    expect(f.kind === 'player' && f.player.id).toBe('starter');
  });
  it('a line with nothing measurable keeps the topic’s last numbers up', () => {
    const f = focusForLine('Predictable. That is the nice word for it.', { ...ctx, earlier: ['The offensive line keeps giving up sacks.'] });
    expect(f.kind).toBe('unit');
  });
});
