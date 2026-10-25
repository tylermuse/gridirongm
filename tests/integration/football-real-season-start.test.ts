/**
 * NFL 2026 roster "start at the current real week": the roster file carries
 * the real completed games (bsRealSeason) + the real remaining slate
 * (schedule), and a regular-season import must pick up there — real records,
 * real season stats, the real remaining opponents — instead of a generated
 * 0-0 Week 1. Runs against the shipped roster file.
 *
 * Heavy (33MB file + a full remaining-season sim). Run on its own:
 *   NODE_OPTIONS=--max-old-space-size=12000 npx vitest run tests/integration/football-real-season-start.test.ts --pool=forks
 */
import { readFileSync } from 'node:fs';
import { vi } from 'vitest';
import { convertFbgmLeague } from '@/lib/data/leagueImport';
import { useGameStore } from '@/lib/engine/store';

const ROSTER_URL = '/rosters/FBGM_NFL_Roster_2026_Updated.json';
const raw = JSON.parse(readFileSync(`public${ROSTER_URL}`, 'utf8'));

type FbgmSeasonRow = { season: number; won: number; lost: number; tied: number };
type FbgmStatRow = { season: number; playoffs?: boolean; pssYds?: number; rusYds?: number; recYds?: number; gp?: number };

function stubRosterFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    if (!path.startsWith('/rosters/')) return { ok: true, status: 200, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(`public${path}`, 'utf8')) };
  }));
}

describe('NFL 2026 real-season start', () => {
  it('converts the real completed games and remaining slate into one 272-game season', () => {
    const { realSeason, teams } = convertFbgmLeague(raw);
    expect(realSeason).toBeDefined();
    const schedule = realSeason!.schedule;
    expect(schedule).toHaveLength(272);
    expect(schedule.filter(g => g.played)).toHaveLength(raw.bsRealSeason.games.length);
    expect(realSeason!.currentWeek).toBe(Math.min(...raw.schedule.map((g: { day: number }) => g.day)));

    for (const team of teams) {
      const games = schedule.filter(g => g.homeTeamId === team.id || g.awayTeamId === team.id);
      expect(games, team.abbreviation).toHaveLength(17);
      const weeks = games.map(g => g.week);
      expect(new Set(weeks).size, `${team.abbreviation} plays twice in a week`).toBe(17);
    }
    // Everything already played is before anything still to play, except
    // within the current week (games finished before the rest of the week).
    const lastPlayedWeek = Math.max(...schedule.filter(g => g.played).map(g => g.week));
    expect(lastPlayedWeek).toBeLessThanOrEqual(realSeason!.currentWeek);
  });

  it('a regular-season start picks up at the real week with real records and stats, then finishes the season', async () => {
    stubRosterFetch();
    await useGameStore.getState().newLeague('BUF', ROSTER_URL, 'regular');
    let s = useGameStore.getState();

    expect(s.phase).toBe('regular');
    expect(s.week).toBe(raw.bsRealSeason.currentWeek);
    expect(s.schedule).toHaveLength(272);

    for (const ft of raw.teams as Array<{ abbrev: string; seasons: FbgmSeasonRow[] }>) {
      const real = ft.seasons.find(x => x.season === 2026)!;
      const team = s.teams.find(t => t.abbreviation === ft.abbrev)!;
      expect(`${team.record.wins}-${team.record.losses}-${team.record.ties}`, ft.abbrev)
        .toBe(`${real.won}-${real.lost}-${real.tied}`);
      const pf = s.schedule.filter(g => g.played).reduce((sum, g) =>
        sum + (g.homeTeamId === team.id ? g.homeScore : g.awayTeamId === team.id ? g.awayScore : 0), 0);
      expect(team.record.pointsFor).toBe(pf);
    }

    // Season stats equal the real 2026 totals in the file's FBGM stats rows.
    const leaders = (raw.players as Array<{ pid: number; stats: FbgmStatRow[] }>)
      .map(p => ({ pid: p.pid, rows: p.stats.filter(r => r.season === 2026 && !r.playoffs) }))
      .filter(p => p.rows.length > 0);
    const sum = (rows: FbgmStatRow[], k: keyof FbgmStatRow) => rows.reduce((t, r) => t + Number(r[k] ?? 0), 0);
    const topPasser = [...leaders].sort((a, b) => sum(b.rows, 'pssYds') - sum(a.rows, 'pssYds'))[0];
    const topRusher = [...leaders].sort((a, b) => sum(b.rows, 'rusYds') - sum(a.rows, 'rusYds'))[0];
    const passer = s.players.find(p => p.id === `player-${topPasser.pid}`)!;
    const rusher = s.players.find(p => p.id === `player-${topRusher.pid}`)!;
    expect(passer.stats.passYards).toBe(sum(topPasser.rows, 'pssYds'));
    expect(passer.stats.gamesPlayed).toBe(sum(topPasser.rows, 'gp'));
    expect(rusher.stats.rushYards).toBe(sum(topRusher.rows, 'rusYds'));
    expect(rusher.careerStats.rushYards).toBe(rusher.stats.rushYards);

    // The 53-man gate still guards the league's first sim even though it
    // opens past Week 1.
    vi.stubGlobal('alert', vi.fn());
    const userTeam = s.teams.find(t => t.id === s.userTeamId)!;
    if (userTeam.roster.length > 53) {
      useGameStore.getState().simWeek();
      expect(useGameStore.getState().week).toBe(raw.bsRealSeason.currentWeek);
      useGameStore.getState().autoCutToRosterLimit(userTeam.id);
    }

    // Sim the rest of the real slate: every team ends at 17 games.
    for (let guard = 0; guard < 25 && useGameStore.getState().phase === 'regular'; guard++) {
      useGameStore.getState().simWeek();
    }
    s = useGameStore.getState();
    expect(s.phase).toBe('playoffs');
    for (const t of s.teams) {
      expect(t.record.wins + t.record.losses + t.record.ties, t.abbreviation).toBe(17);
    }
  }, 600_000);

  it('an offseason start ignores the real season', async () => {
    stubRosterFetch();
    await useGameStore.getState().newLeague('BUF', ROSTER_URL, 'offseason');
    const s = useGameStore.getState();
    expect(s.week).toBe(1);
    expect(s.schedule.every(g => !g.played)).toBe(true);
    expect(s.teams.every(t => t.record.wins + t.record.losses === 0 || t.record.wins + t.record.losses === 17)).toBe(true);
    expect(s.players.every(p => p.stats.passYards === 0 && p.stats.rushYards === 0)).toBe(true);
  }, 120_000);
});
