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

    // The file lists every club's 53 + practice squad + IR (69-87 players).
    // The user's team opens already seated the way the real club is — real IR
    // on IR, real practice squad on the PS — instead of a 75-man roster to cut.
    const userTeam = s.teams.find(t => t.id === s.userTeamId)!;
    const byId = new Map(s.players.map(p => [p.id, p]));
    const ps = userTeam.practiceSquad ?? [];
    const ir = userTeam.injuredReserve ?? [];
    expect(userTeam.roster.length).toBeLessThanOrEqual(53);
    expect(userTeam.roster.length).toBeGreaterThanOrEqual(50);
    expect(ps.length).toBeGreaterThan(8);
    expect(ps.length).toBeLessThanOrEqual(16);
    const fileStatus = new Map((raw.players as Array<{ pid: number; tid: number; bsRosterStatus?: string }>)
      .map(p => [`player-${p.pid}`, p.bsRosterStatus]));
    const realIr = s.players.filter(p => p.teamId === userTeam.id && fileStatus.get(p.id) === 'ir' && p.injury);
    expect(realIr.length).toBeGreaterThan(0);
    for (const p of realIr) {
      expect(ir, `${p.firstName} ${p.lastName}`).toContain(p.id);
      expect(p.onIR).toBe(true);
    }
    for (const id of ps.filter(pid => fileStatus.get(pid) !== 'ps')) {
      // Anyone seated on the PS beyond the real practice squad is a legal demotion.
      expect(byId.get(id)!.ratings.overall).toBeLessThanOrEqual(80);
    }
    const offRoster = new Set([...ps, ...ir]);
    expect(userTeam.roster.some(id => offRoster.has(id))).toBe(false);
    expect(Object.values(userTeam.depthChart).flat().some(id => offRoster.has(id))).toBe(false);
    for (const id of offRoster) expect(byId.get(id)!.teamId).toBe(userTeam.id);
    const activePayroll = userTeam.roster.reduce((sum, id) => sum + byId.get(id)!.contract.salary, 0);
    expect(userTeam.totalPayroll).toBeCloseTo(activePayroll, 0);
    // Every AI team is at the limit too.
    for (const t of s.teams) expect(t.roster.length, t.abbreviation).toBeLessThanOrEqual(53);

    // The 53-man gate still guards the league's first sim even though it
    // opens past Week 1: push the roster over and the sim is refused.
    vi.stubGlobal('alert', vi.fn());
    const extras = s.freeAgents.slice(0, 54 - userTeam.roster.length);
    useGameStore.setState({
      teams: s.teams.map(t => (t.id === userTeam.id ? { ...t, roster: [...t.roster, ...extras] } : t)),
      players: s.players.map(p => (extras.includes(p.id) ? { ...p, teamId: userTeam.id } : p)),
      freeAgents: s.freeAgents.filter(id => !extras.includes(id)),
    });
    useGameStore.getState().simWeek();
    expect(useGameStore.getState().week).toBe(raw.bsRealSeason.currentWeek);
    // "Trim to 53" gets back under the limit without the user picking cuts.
    const trimmed = useGameStore.getState().autoSettleUserRoster();
    expect(trimmed).not.toBeNull();
    expect(useGameStore.getState().teams.find(t => t.id === userTeam.id)!.roster).toHaveLength(53);

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
