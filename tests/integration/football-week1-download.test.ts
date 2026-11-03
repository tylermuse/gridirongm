import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

/**
 * The rosters-page "Download: Week 1 Start" file (built by
 * scripts/build_vanilla_fbgm.py from the mid-season main roster) must be a
 * clean season opener: nothing played, the full real schedule, and none of
 * the BS-only blocks. Guards the weekly refresh, which regenerates it.
 */
describe('FBGM Week 1 start download', () => {
  const week1 = JSON.parse(readFileSync('public/rosters/FBGM_NFL_Roster_2026_Week1.json', 'utf8'));
  const main = JSON.parse(readFileSync('public/rosters/FBGM_NFL_Roster_2026_Updated.json', 'utf8'));

  it('starts the 2026 regular season with every team 0-0', () => {
    expect(week1.gameAttributes.phase).toBe(1);
    expect(week1.gameAttributes.season).toBe(2026);
    expect(week1.games).toEqual([]);
    for (const t of week1.teams) {
      const s = t.seasons.find((x: { season: number }) => x.season === 2026);
      expect(s, t.abbrev).toBeDefined();
      expect([s.won, s.lost, s.tied, s.wonHome, s.lostAway, s.wonDiv, s.lostConf, s.gpHome], t.abbrev).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    }
  });

  it('carries the full real 272-game schedule, 17 per team, one game per team per week', () => {
    expect(week1.schedule).toHaveLength(272);
    const perTeam = new Map<number, number>();
    const seen = new Set<string>();
    for (const g of week1.schedule) {
      expect(g.day).toBeGreaterThanOrEqual(1);
      expect(g.day).toBeLessThanOrEqual(18);
      for (const tid of [g.homeTid, g.awayTid]) {
        perTeam.set(tid, (perTeam.get(tid) ?? 0) + 1);
        const key = `${g.day}:${tid}`;
        expect(seen.has(key), key).toBe(false);
        seen.add(key);
      }
    }
    expect(perTeam.size).toBe(32);
    expect(new Set(perTeam.values())).toEqual(new Set([17]));
  });

  it('has no 2026 regular-season stat rows but keeps this week’s rosters, injuries and ratings', () => {
    const rows2026 = week1.players.flatMap((p: { stats?: { season: number; playoffs: boolean }[] }) =>
      (p.stats ?? []).filter((s) => s.season === 2026 && !s.playoffs),
    );
    expect(rows2026).toHaveLength(0);
    // Same players on the same teams as the main file, same injuries, same current ratings.
    const byPid = new Map<number, { tid: number; injury?: { gamesRemaining: number }; ratings: { ovr: number }[] }>(
      main.players.map((p: { pid: number }) => [p.pid, p]),
    );
    expect(week1.players).toHaveLength(main.players.length);
    let injured = 0;
    for (const p of week1.players) {
      const m = byPid.get(p.pid)!;
      expect(p.tid, String(p.pid)).toBe(m.tid);
      expect(p.injury?.gamesRemaining ?? 0).toBe(m.injury?.gamesRemaining ?? 0);
      if (p.tid >= 0 && (p.injury?.gamesRemaining ?? 0) > 0) injured++;
      if (p.tid >= 0) expect(p.ratings.at(-1).ovr).toBe(m.ratings.at(-1)!.ovr);
    }
    expect(injured).toBeGreaterThan(0);
  });

  it('is year-shifted and stripped of BS-only blocks like the Current download', () => {
    const vanilla = JSON.parse(readFileSync('public/rosters/FBGM_NFL_Roster_2026_Vanilla.json', 'utf8'));
    expect(week1.bsRealSeason).toBeUndefined();
    expect(week1.bsCoaches).toBeUndefined();
    const years = (d: { players: { tid: number; draft: { year: number } }[] }) =>
      [...new Set(d.players.filter((p) => p.tid === -2).map((p) => p.draft.year))].sort();
    expect(years(week1)).toEqual(years(vanilla));
    expect(week1.meta.week1).toMatch(/Week 1 start/);
  });
});
