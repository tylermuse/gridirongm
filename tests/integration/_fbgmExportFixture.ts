/**
 * A Football GM league export in the exact shape of a real one captured from
 * play.football-gm.com on Nov 12 2026 (see fbgm-upload-import.test.ts for the
 * details that matter). 32 fictional teams, 52-man rosters, 20 free agents,
 * 12 draft prospects. Each team's user-set QB depth starts QB1 over the
 * higher-rated QB0.
 */
export const SEASON = 2026;
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

export function buildExport() {
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

