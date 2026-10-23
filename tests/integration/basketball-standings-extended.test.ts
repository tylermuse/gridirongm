/**
 * Extended standings + scoreboard derivations for BS Hoops.
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import {
  computeExtendedStandings,
  defaultScoreboardDay,
  scoreboardForDay,
  streakLabel,
  dayOf,
} from '@/../apps/bs-basketball/src/lib/standings/extendedStandings';

function seasonDays(days: number) {
  let league = createNewBasketballLeague({ rngSeed: 'standings-ext' });
  for (let i = 0; i < days; i++) { const r = simNextDay(league); if (!r) break; league = r.league; }
  return league;
}

describe('extended standings', () => {
  const league = seasonDays(25);
  const ext = computeExtendedStandings(league);
  const played = league.games.filter(g => g.status === 'played' && g.finalScore);

  it('home + away records sum to W/L and match team.record', () => {
    expect(played.length).toBeGreaterThan(50);
    for (const t of league.teams) {
      const s = ext.get(t.id)!;
      expect(s.home.w + s.away.w).toBe(s.wins);
      expect(s.home.l + s.away.l).toBe(s.losses);
      expect(s.wins).toBe(t.record.wins);
      expect(s.losses).toBe(t.record.losses);
    }
    const totalW = [...ext.values()].reduce((a, s) => a + s.wins, 0);
    const totalL = [...ext.values()].reduce((a, s) => a + s.losses, 0);
    expect(totalW).toBe(played.length);
    expect(totalL).toBe(played.length);
  });

  it('conference records are bounded and balance within each conference', () => {
    const byConf = new Map<string, { w: number; l: number }>();
    for (const t of league.teams) {
      const s = ext.get(t.id)!;
      expect(s.conf.w).toBeLessThanOrEqual(s.wins);
      expect(s.conf.l).toBeLessThanOrEqual(s.losses);
      expect(s.div.w).toBeLessThanOrEqual(s.conf.w);
      const conf = (t.sportData as { conference: string }).conference;
      const acc = byConf.get(conf) ?? { w: 0, l: 0 };
      acc.w += s.conf.w; acc.l += s.conf.l;
      byConf.set(conf, acc);
    }
    // Every intra-conference game yields one conf win and one conf loss.
    for (const acc of byConf.values()) expect(acc.w).toBe(acc.l);
  });

  it('streak and last-10 match a manual replay', () => {
    const t = league.teams[3];
    const mine = played
      .filter(g => g.homeTeamId === t.id || g.awayTeamId === t.id)
      .sort((a, b) => dayOf(a) - dayOf(b))
      .map(g => {
        const homeWon = g.finalScore!.home > g.finalScore!.away;
        return (g.homeTeamId === t.id) === homeWon ? 'W' : 'L';
      }) as ('W' | 'L')[];
    const s = ext.get(t.id)!;
    expect(s.streak).toBe(streakLabel(mine));
    expect(s.last10).toEqual(mine.slice(-10));
    expect(s.last10Record.w + s.last10Record.l).toBe(Math.min(10, mine.length));
    expect(streakLabel(['W', 'L', 'L'])).toBe('L2');
    expect(streakLabel(['L', 'W', 'W', 'W'])).toBe('W3');
    expect(streakLabel([])).toBe('—');
  });

  it('PPG math is consistent with summed final scores', () => {
    for (const t of league.teams) {
      const s = ext.get(t.id)!;
      let pf = 0, pa = 0;
      for (const g of played) {
        if (g.homeTeamId === t.id) { pf += g.finalScore!.home; pa += g.finalScore!.away; }
        else if (g.awayTeamId === t.id) { pf += g.finalScore!.away; pa += g.finalScore!.home; }
      }
      expect(s.pointsFor).toBe(pf);
      expect(s.pointsAgainst).toBe(pa);
      expect(s.ppg).toBeCloseTo(pf / s.gp, 6);
      expect(s.diffPerGame).toBeCloseTo((pf - pa) / s.gp, 6);
      expect(s.ppg).toBeGreaterThan(70);
    }
  });

  it('scoreboard defaults to the latest played day and reports winners + top scorers', () => {
    const day = defaultScoreboardDay(league)!;
    const latest = Math.max(...played.map(dayOf));
    expect(day).toBe(latest);
    const board = scoreboardForDay(league, day);
    expect(board.length).toBeGreaterThan(0);
    for (const g of board.filter(b => b.played)) {
      expect(g.winnerId).toBe(g.homeScore! > g.awayScore! ? g.homeTeamId : g.awayTeamId);
      expect(g.topHome).not.toBeNull();
      expect(g.topAway).not.toBeNull();
      expect(g.topHome!.points).toBeGreaterThan(0);
    }
    // A future day shows scheduled games only.
    const future = scoreboardForDay(league, day + 1);
    expect(future.length).toBeGreaterThan(0);
    expect(future.every(g => !g.played && g.homeScore === null)).toBe(true);
  });
});
