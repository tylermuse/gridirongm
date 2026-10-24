import { describe, it, expect } from 'vitest';
import { computeShowStatLine, statsMentioned, ordinal, rankTone } from '@/lib/spotlight/teamStats';

const team = (id: string, w: number, l: number, pf: number, pa: number) =>
  ({ id, record: { wins: w, losses: l, ties: 0, pointsFor: pf, pointsAgainst: pa, streak: 0 } }) as any;
const player = (teamId: string, passYards: number, rushYards: number) => ({ teamId, stats: { passYards, rushYards } }) as any;

describe('computeShowStatLine', () => {
  const teams = [team('a', 2, 0, 60, 20), team('b', 1, 1, 40, 40), team('c', 0, 2, 20, 60)];
  const players = [player('a', 500, 100), player('b', 300, 300), player('c', 100, 50)];

  it('returns per-game values and league ranks (Opp PPG: lower is better)', () => {
    const line = computeShowStatLine(teams[1], teams, players)!;
    expect(line.record).toBe('1-1');
    const by = Object.fromEntries(line.stats.map(s => [s.key, s]));
    expect(by.ppg).toMatchObject({ value: '20.0', rank: 2, of: 3 });
    expect(by.pag).toMatchObject({ value: '20.0', rank: 2 });
    expect(by.pass).toMatchObject({ value: '150', rank: 2 });
    expect(by.rush).toMatchObject({ value: '150', rank: 1 });
    expect(computeShowStatLine(teams[2], teams, players)!.stats.find(s => s.key === 'pag')!.rank).toBe(3);
  });

  it('returns null before any games', () => {
    expect(computeShowStatLine(team('z', 0, 0, 0, 0), teams, players)).toBeNull();
  });
});

describe('statsMentioned', () => {
  it('orders stats by where they appear in the line', () => {
    expect(statsMentioned('29th in offense?! 27th in defense?!')).toEqual(['ppg', 'pag']);
    expect(statsMentioned('The 51 rushing yards per game is concerning')).toEqual(['rush']);
    expect(statsMentioned('They are 29th in total offense')).toEqual(['yds']);
    expect(statsMentioned('Their passing attack carries them')).toEqual(['pass']);
    expect(statsMentioned('Great locker room vibes')).toEqual([]);
  });
});

describe('formatting', () => {
  it('ordinals and rank tone', () => {
    expect([1, 2, 3, 11, 22, 32].map(ordinal)).toEqual(['1st', '2nd', '3rd', '11th', '22nd', '32nd']);
    expect([rankTone(3, 32), rankTone(16, 32), rankTone(30, 32)]).toEqual(['good', 'mid', 'bad']);
  });
});
