/**
 * Uploading a league exported from Football GM (Tools → Export League).
 *
 * The fixture below mirrors a real export captured from play.football-gm.com
 * on Nov 12 2026 (a fresh default 32-team league, file version 75):
 *   - conferences are named "American Conference" / "National Conference"
 *   - players carry a `contracts` history ({ type, start, amounts[], payments })
 *     and NO legacy `contract` object
 *   - every team's `depth` lists the whole 53-man roster under each key
 *     (QB … S, K, P, KR, PR), in the user's depth order
 *   - team logos are paths relative to play.football-gm.com
 *   - draft prospects sit at tid -2, free agents at -1
 *   - the default download is gzipped (.json.gz)
 * Each of those broke or degraded the old importer for an uploaded league.
 */
import { gzipSync } from 'node:zlib';
import { describe, it, expect, vi } from 'vitest';
import {
  convertFbgmLeague,
  fbgmContract,
  mapConference,
  readUploadedLeagueFile,
  LeagueFileUploadError,
} from '@/lib/data/leagueImport';
import { useGameStore } from '@/lib/engine/store';

const SEASON = 2026;
const DIVS = ['East', 'North', 'South', 'West'];
const CITIES = [
  'Boston', 'Minneapolis', 'San Francisco', 'Charlotte', 'Los Angeles', 'Milwaukee', 'Phoenix', 'New Orleans',
  'Atlanta', 'Tampa', 'Seattle', 'Detroit', 'Dallas', 'Chicago', 'Philadelphia', 'Washington',
  'New York', 'Denver', 'Miami', 'Houston', 'Portland', 'Kansas City', 'St. Louis', 'Baltimore',
  'Pittsburgh', 'Cleveland', 'Cincinnati', 'Indianapolis', 'Nashville', 'Jacksonville', 'Buffalo', 'Las Vegas',
];
// A 52-man roster shaped like FBGM's defaults.
const ROSTER: Array<[string, number]> = [
  ['QB', 3], ['RB', 4], ['WR', 6], ['TE', 3], ['OL', 9], ['DL', 9], ['LB', 7], ['CB', 5], ['S', 4], ['K', 1], ['P', 1],
];
const RATING_KEYS = ['hgt', 'stre', 'spd', 'endu', 'thv', 'thp', 'tha', 'bsc', 'elu', 'rtr', 'hnd', 'rbk', 'pbk', 'pcv', 'tck', 'prs', 'rns', 'kpw', 'kac', 'ppw', 'pac'];

type RawPlayer = Record<string, unknown> & { pid: number; tid: number; ratings: Array<Record<string, unknown>> };

function rating(pos: string, ovr: number): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  RATING_KEYS.forEach((k, i) => { r[k] = 30 + ((ovr + i * 7) % 50); });
  return { ...r, ovr, pos, pot: Math.min(100, ovr + 8), season: SEASON, skills: [], fuzz: 0 };
}

function buildExport() {
  let pid = 0;
  const players: RawPlayer[] = [];
  const teams = CITIES.map((region, tid) => {
    const cid = tid < 16 ? 0 : 1;
    const roster: RawPlayer[] = [];
    for (const [pos, n] of ROSTER) {
      for (let i = 0; i < n; i++) {
        const ovr = 70 - i * 6 + (tid % 5);
        roster.push({
          pid: pid++, tid, firstName: `${pos}${i}`, lastName: `T${tid}`,
          born: { year: SEASON - 24 - i, loc: 'Texas, USA' },
          draft: { round: 2, pick: 10, tid, year: SEASON - 2 - i, originalTid: tid, pot: 70, ovr: 60, skills: [] },
          contracts: [
            { type: 'rookie', start: SEASON - 3, amounts: [750, 750, 750], payments: [] },
            { type: 'regular', start: SEASON, amounts: [4000 + i * 1000, 4500 + i * 1000, 5000], payments: [] },
          ],
          injury: { type: 'Healthy', gamesRemaining: 0 },
          jerseyNumber: String(10 + roster.length),
          ratings: [rating(pos, ovr)],
          stats: [],
        });
      }
    }
    players.push(...roster);
    // FBGM depth: whole roster under every key. For QB, the user has made the
    // second-best QB (QB1) the starter over the higher-rated QB0.
    const order = roster.map(p => p.pid);
    const qbs = roster.filter(p => p.ratings[0].pos === 'QB').map(p => p.pid);
    const qbDepth = [qbs[1], qbs[0], ...order.filter(id => id !== qbs[0] && id !== qbs[1])];
    const depth: Record<string, number[]> = {};
    for (const key of ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P', 'KR', 'PR']) {
      depth[key] = key === 'QB' ? qbDepth : order;
    }
    return {
      tid, cid, did: cid * 4 + (tid % 4), region, name: `Club ${tid}`, abbrev: `T${String(tid).padStart(2, '0')}`,
      imgURL: `/img/logos-primary/T${tid}.svg`, imgURLSmall: `/img/logos-secondary/T${tid}.svg`,
      colors: ['#ffffff', '#e70000', '#003188'], depth, pop: 5, seasons: [], stats: [],
    };
  });
  for (let i = 0; i < 20; i++) {
    players.push({
      pid: pid++, tid: -1, firstName: 'Free', lastName: `Agent${i}`, born: { year: SEASON - 28 },
      draft: { round: 0, pick: 0, tid: -1, year: SEASON - 6, originalTid: -1 },
      contracts: [{ type: 'regular', start: SEASON - 2, amounts: [600, 600], payments: [] }],
      injury: { type: 'Healthy', gamesRemaining: 0 }, ratings: [rating(['WR', 'LB', 'OL', 'CB'][i % 4], 45)], stats: [],
    });
  }
  for (let i = 0; i < 12; i++) {
    players.push({
      pid: pid++, tid: -2, firstName: 'Draft', lastName: `Prospect${i}`, born: { year: SEASON - 21 },
      draft: { round: 0, pick: 0, tid: -1, year: SEASON, originalTid: -1 },
      contracts: [{ type: 'rookie', start: SEASON, amounts: [500], payments: [] }],
      injury: { type: 'Healthy', gamesRemaining: 0 }, ratings: [rating(['QB', 'DL', 'RB'][i % 3], 50)], stats: [],
    });
  }
  return {
    version: 75,
    meta: { phaseText: '2026 preseason', name: 'League 1' },
    startingSeason: SEASON,
    gameAttributes: {
      season: SEASON, phase: 0, numGames: 17, salaryCap: 200000, minContract: 500, maxContract: 30000,
      confs: [{ cid: 0, name: 'American Conference' }, { cid: 1, name: 'National Conference' }],
      divs: [0, 1].flatMap(cid => DIVS.map((name, i) => ({ did: cid * 4 + i, cid, name }))),
    },
    teams, players,
    draftPicks: teams.flatMap(t => [1, 2, 3, 4, 5, 6, 7].map(round => ({ tid: t.tid, originalTid: t.tid, round, pick: 0, season: SEASON }))),
    events: [], trade: [],
  };
}

const EXPORT = buildExport();
const upload = (league: object) => ({ ...league, bsSource: 'upload' as const });

describe('mapConference', () => {
  it('maps FBGM, NFL and custom conference names', () => {
    expect(mapConference('American Conference', 0)).toBe('AC');
    expect(mapConference('National Conference', 1)).toBe('NC');
    expect(mapConference('AFC', 0)).toBe('AC');
    expect(mapConference('NFC', 1)).toBe('NC');
    expect(mapConference('Eastern', 0)).toBe('AC');
    expect(mapConference('Western', 1)).toBe('NC');
  });
});

describe('fbgmContract', () => {
  it('reads the current deal from the contracts history', () => {
    const c = fbgmContract({ contracts: EXPORT.players[0].contracts as never }, SEASON);
    expect(c).toEqual({ amount: 4000, exp: SEASON + 3 });
  });
  it('picks the right year of a multi-year deal', () => {
    expect(fbgmContract({ contracts: [{ start: 2025, amounts: [1000, 2000, 3000] }] }, 2026)).toEqual({ amount: 2000, exp: 2028 });
  });
  it('keeps the legacy contract object as-is', () => {
    expect(fbgmContract({ contract: { amount: 9000, exp: 2029 } }, 2026)).toEqual({ amount: 9000, exp: 2029 });
  });
});

describe('convertFbgmLeague on a real-shaped Football GM export', () => {
  const converted = convertFbgmLeague(upload(EXPORT) as never);

  it('splits teams into both conferences', () => {
    const ac = converted.teams.filter(t => t.conference === 'AC').length;
    const nc = converted.teams.filter(t => t.conference === 'NC').length;
    expect([ac, nc]).toEqual([16, 16]);
  });

  it('carries the league’s own contracts, scaled from the FBGM cap ($200M) to ours ($300M)', () => {
    const qb = converted.players.find(p => p.id === 'player-0')!;
    expect(qb.contract.salary).toBe(6); // $4.0M of a $200M cap → $6.0M of $300M
    expect(qb.contract.yearsLeft).toBe(3);
    const rostered = converted.players.filter(p => p.teamId);
    expect(rostered.every(p => p.contract.salary >= 6)).toBe(true);
  });

  it('never re-prices uploaded contracts and floors them at our league minimum', () => {
    const cheap = structuredClone(EXPORT);
    for (const p of cheap.players.filter(x => x.tid === 0)) {
      p.contracts = [{ type: 'regular', start: SEASON, amounts: [300, 300], payments: [] }] as never;
    }
    const c = convertFbgmLeague(upload(cheap) as never);
    const team0 = c.players.filter(p => p.teamId === 'team-0');
    expect(team0.every(p => p.contract.salary === 0.8)).toBe(true); // 0.75 floor, rounded to $0.1M
  });

  it('drops logo paths that only resolve on play.football-gm.com', () => {
    expect(converted.teams.every(t => t.logoUrl === undefined)).toBe(true);
  });

  it('keeps every rostered player, free agent and draft prospect', () => {
    expect(converted.players.filter(p => p.teamId).length).toBe(EXPORT.players.filter(p => p.tid >= 0).length);
    expect(converted.freeAgentIds.length).toBe(20);
    expect(converted.players.filter(p => p.draftYear === SEASON && !p.teamId && p.experience === 0).length).toBeGreaterThanOrEqual(12);
  });

  it('honors the uploaded depth chart (user-picked QB1 starts)', () => {
    for (const team of converted.teams) {
      const [starter, backup] = team.depthChart.QB.map(id => converted.players.find(p => p.id === id)!);
      expect(starter.firstName, team.abbreviation).toBe('QB1');
      expect(backup.firstName).toBe('QB0');
    }
  });

  it('keeps the ratings sort for files that were not uploaded (curated roster files)', () => {
    const curated = convertFbgmLeague(EXPORT as never);
    const starter = curated.players.find(p => p.id === curated.teams[0].depthChart.QB[0])!;
    expect(starter.firstName).toBe('QB0');
  });
});

describe('readUploadedLeagueFile', () => {
  it('reads the gzipped export Football GM downloads by default', async () => {
    const gz = new Blob([gzipSync(Buffer.from(JSON.stringify(EXPORT)))]);
    const result = await readUploadedLeagueFile(gz);
    expect(result.kind).toBe('fbgm');
    if (result.kind !== 'fbgm') return;
    expect(result.league.teams).toHaveLength(32);
    expect(result.url.startsWith('blob:')).toBe(true);
  });

  it('reads a plain .json export', async () => {
    const result = await readUploadedLeagueFile(new Blob([JSON.stringify(EXPORT)]));
    expect(result.kind).toBe('fbgm');
  });

  it('routes a BS Football save backup to the save loader', async () => {
    const result = await readUploadedLeagueFile(new Blob([JSON.stringify({ state: {}, version: 40 })]));
    expect(result.kind).toBe('native');
  });

  it('rejects files that are not leagues with a readable message', async () => {
    await expect(readUploadedLeagueFile(new Blob(['not json']))).rejects.toBeInstanceOf(LeagueFileUploadError);
    await expect(readUploadedLeagueFile(new Blob([JSON.stringify({ players: [] })]))).rejects.toBeInstanceOf(LeagueFileUploadError);
  });
});

describe('end to end: upload a Football GM league, start it, play games', () => {
  it('starts in the regular season and sims a week of real games', async () => {
    const result = await readUploadedLeagueFile(new Blob([gzipSync(Buffer.from(JSON.stringify(EXPORT)))]));
    if (result.kind !== 'fbgm') throw new Error('expected an FBGM league');
    // newLeague re-reads the league from the upload's blob: URL.
    const blobJson = await (await fetch(result.url).catch(() => null))?.text?.().catch(() => null);
    const tagged = blobJson ? JSON.parse(blobJson) : upload(EXPORT);
    expect(tagged.bsSource).toBe('upload');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => tagged })));

    await useGameStore.getState().newLeague('T00', result.url, 'regular');
    let s = useGameStore.getState();
    expect(s.phase).toBe('regular');
    expect(s.teams).toHaveLength(32);
    const userTeam = s.teams.find(t => t.id === s.userTeamId)!;
    expect(userTeam.abbreviation).toBe('T00');
    expect(s.players.find(p => p.id === userTeam.depthChart.QB[0])!.firstName).toBe('QB1');

    useGameStore.getState().simWeek();
    s = useGameStore.getState();
    const played = s.schedule.filter(g => g.played);
    expect(played.length).toBeGreaterThanOrEqual(14);
    expect(played.every(g => (g.homeScore ?? 0) + (g.awayScore ?? 0) > 0)).toBe(true);
    vi.unstubAllGlobals();
  });
});
