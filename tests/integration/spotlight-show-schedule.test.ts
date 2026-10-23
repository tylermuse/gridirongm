import { describe, it, expect } from 'vitest';
import { upcomingSchedule } from '@/lib/spotlight/showStandings';
import type { Team } from '@/types';

const t = (id: string, w: number, l: number) => ({ id, abbreviation: id.toUpperCase(), city: id.toUpperCase(), name: 'Club', record: { wins: w, losses: l, ties: 0 } }) as unknown as Team;
const dal = t('dal', 3, 5), phi = t('phi', 6, 2), nyg = t('nyg', 2, 6), was = t('was', 5, 3), sf = t('sf', 7, 1);
const g = (week: number, home: string, away: string, played = false, hs = 0, as = 0) => ({ id: `w${week}`, week, season: 2026, homeTeamId: home, awayTeamId: away, homeScore: hs, awayScore: as, played });
const schedule = [g(7, 'dal', 'nyg', true, 24, 10), g(8, 'phi', 'dal', true, 27, 17), g(9, 'was', 'dal'), g(10, 'dal', 'sf'), g(11, 'phi', 'dal'), g(12, 'nyg', 'dal'), g(13, 'dal', 'was')];

describe('the road ahead', () => {
  const b = upcomingSchedule(dal, [dal, phi, nyg, was, sf], schedule, 2026)!;
  it('shows the last result and the next four, with home/away and records', () => {
    expect(b.rows.map(r => `${r.week} ${r.home ? 'vs' : '@'} ${r.abbreviation} ${r.record}${r.result ? ` ${r.result.won ? 'W' : 'L'}` : ''}`)).toEqual([
      '8 @ PHI 6-2 L', '9 @ WAS 5-3', '10 vs SF 7-1', '11 @ PHI 6-2', '12 @ NYG 2-6',
    ]);
    expect(b.title).toBe('The road ahead · 3 of the next 4 away');
  });
  it('is null once the season is played out', () => {
    expect(upcomingSchedule(dal, [dal, nyg], [g(7, 'dal', 'nyg', true)], 2026)).toBeNull();
  });
});
