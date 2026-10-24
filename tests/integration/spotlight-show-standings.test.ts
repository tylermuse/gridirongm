import { describe, it, expect } from 'vitest';
import { conferenceRace, divisionTable } from '@/lib/spotlight/showStandings';
import type { Team } from '@/types';

const divs = ['North', 'South', 'East', 'West'] as const;
// 16 NC teams: team i has 16-i wins.
const teams = Array.from({ length: 16 }, (_, i) => ({
  id: `t${i}`, abbreviation: `T${i}`, city: 'City', name: `N${i}`, conference: 'NC', division: divs[i % 4],
  record: { wins: 16 - i, losses: i, ties: 0, pointsFor: 300, pointsAgainst: 300 },
})) as unknown as Team[];

describe('standings', () => {
  it('seeds division leaders 1–4 and wild cards 5–7, with games back of the last spot', () => {
    const b = conferenceRace(teams[10], teams);
    expect(b.rows.slice(0, 4).every(r => r.seed && r.seed <= 7)).toBe(true);
    const me = b.rows.find(r => r.isUser)!;
    expect(me.seed).toBeNull();
    expect(me.gb).toBe(4); // 6-10 vs the 7th seed at 10-6
    expect(b.rows.length).toBeLessThanOrEqual(8);
    expect(b.cutAfter).toBeGreaterThan(0);
  });

  it('a team in the race sees seeds 1–8', () => {
    const b = conferenceRace(teams[5], teams);
    expect(b.rows.map(r => r.seed)).toEqual([1, 2, 3, 4, 5, 6, 7, null]);
  });

  it('division table: leader first, games back', () => {
    const d = divisionTable(teams[9], teams);
    expect(d.rows.map(r => r.teamId)).toEqual(['t1', 't5', 't9', 't13']);
    expect(d.rows[2]).toMatchObject({ isUser: true, gb: 8 });
  });
});
