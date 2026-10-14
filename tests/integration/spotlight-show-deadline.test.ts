import { describe, it, expect } from 'vitest';
import { computeTradeNeeds } from '@/lib/spotlight/tradeNeeds';
import { gameTopicsForMoment, type GameTopic } from '@/lib/spotlight/showGame';
import { momentNote } from '@/lib/spotlight/showMoment';
import type { Player, Team } from '@/types';

const team = (id: string, wins: number, losses: number) =>
  ({ id, city: id.toUpperCase(), name: 'Club', abbreviation: id.toUpperCase(), salaryCap: 300, totalPayroll: 280, record: { wins, losses, pointsFor: 0, pointsAgainst: 0 } }) as unknown as Team;
let n = 0;
const pl = (teamId: string, position: string, ovr: number, age = 27, salary = 10, yearsLeft = 2) =>
  ({ id: `p${n++}`, teamId, position, firstName: 'P', lastName: `${position}${n}`, age, retired: false, injury: null, ratings: { overall: ovr }, contract: { salary, yearsLeft } }) as unknown as Player;

// "us" is a contender with a bad WR room and a great QB; "bad" is out of it
// and has a good receiver; "good" is a contender whose receivers aren't for sale.
const us = team('us', 8, 3), bad = team('bad', 2, 9), good = team('good', 9, 2);
const players = [
  pl('us', 'QB', 90), pl('us', 'WR', 60), pl('us', 'WR', 62), pl('us', 'WR', 58), pl('us', 'CB', 80), pl('us', 'CB', 80), pl('us', 'CB', 80),
  pl('bad', 'QB', 70), pl('bad', 'WR', 85, 29, 15, 1), pl('bad', 'WR', 70), pl('bad', 'WR', 70), pl('bad', 'CB', 70), pl('bad', 'CB', 70), pl('bad', 'CB', 70),
  pl('good', 'QB', 75), pl('good', 'WR', 90), pl('good', 'WR', 88), pl('good', 'WR', 86), pl('good', 'CB', 75), pl('good', 'CB', 75), pl('good', 'CB', 75),
];

describe('trade deadline needs', () => {
  const r = computeTradeNeeds(us, [us, bad, good], players);

  it('calls a winning team a buyer and finds its worst-ranked starting group', () => {
    expect(r.stance).toBe('buyer');
    expect(r.capSpace).toBe(20);
    expect(r.needs[0]).toMatchObject({ pos: 'WR', rank: 3, of: 3 });
    expect(r.needs[0].weakest.ovr).toBe(58);
    expect(r.strengths.map(s => s.pos)).toContain('QB');
  });

  it('only suggests upgrades from teams that are out of it, with contract context', () => {
    const t = r.needs[0].targets;
    expect(t.length).toBeGreaterThan(0);
    expect(t.every(x => x.team.startsWith('BAD'))).toBe(true);
    expect(t[0]).toMatchObject({ ovr: 85, rental: true, fitsCap: true, teamRecord: '2-9' });
  });

  it('lists sell candidates only for sellers', () => {
    expect(r.sellCandidates).toEqual([]);
    const s = computeTradeNeeds(bad, [us, bad, good], players);
    expect(s.stance).toBe('seller');
    expect(s.sellCandidates.map(x => x.ovr)).toEqual([85]);
  });
});

describe('deadline episode shape', () => {
  const game: GameTopic[] = [
    { headline: 'Week 12: US 24, BAD 10', icon: '🏆', depth: 'deep', exchanges: [
      { speakerId: 'stats', text: 'Week 12: won 24-10 at home.' },
      { speakerId: 'hottake', text: 'Scoring by quarter — Q1: US 7, BAD 0.' },
      { speakerId: 'stats', text: 'Every score, in order (mark a line about one of these with its number): #1 ...' },
    ], gameFlow: { plays: [] } as never },
    { headline: 'Who won it', icon: '⭐', depth: 'deep', exchanges: [{ speakerId: 'stats', text: 'US — QB line' }] },
  ];

  it('shrinks the last game to one quick topic at the deadline', () => {
    const t = gameTopicsForMoment(game, 'tradeDeadline');
    expect(t).toHaveLength(1);
    expect(t[0].depth).toBeUndefined();
    expect(t[0].gameFlow).toBeUndefined();
    const notes = t[0].exchanges.map(e => e.text).join('\n');
    expect(notes).toContain('won 24-10');
    expect(notes).not.toMatch(/Every score|Scoring by quarter/);
  });

  it('leaves other weeks alone', () => {
    expect(gameTopicsForMoment(game, 'weekly')).toBe(game);
  });

  it('tells the writer the deadline episode is about needs and targets', () => {
    expect(momentNote({ phase: 'regular', narrative: 'tradeDeadline' }, '8-3')).toMatch(/needs and who to go get/);
  });
});
