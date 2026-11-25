/**
 * Playoff machine: re-simulates the rest of the NFL season in the browser with
 * some games' winners fixed by the user.
 *
 * Pure (no node imports) so the /predictions/playoff-machine client component
 * can run it. It mirrors the season model in nflOdds.ts — same standings
 * maths, same simplified tiebreakers, same playoff format — and starts from
 * the per-game win probabilities that model computed at build time. The one
 * difference: playoff games use each team's current rating (`rating`) rather
 * than its end-of-season, injuries-healed rating, so with no picks the odds
 * here land within a few points of /predictions rather than exactly on them.
 */

export interface MachineTeam {
  abbrev: string;
  city: string;
  name: string;
  conference: 'AFC' | 'NFC' | string;
  division: string;
  /** Points better than an average team (nflOdds `rating`). */
  rating: number;
}

export interface MachineGame {
  week: number;
  date: string;
  home: string;
  away: string;
  neutral: boolean;
  done: boolean;
  homePts: number;
  awayPts: number;
  /** Model's chance the home team wins; null once played. */
  homeWinProb: number | null;
}

/** Abbrev of the picked winner, keyed by gameKey(). */
export type Picks = Record<string, string>;

export interface MachineTeamResult {
  abbrev: string;
  playoffs: number;
  division: number;
  topSeed: number;
  conference: number;
  champion: number;
  projectedWins: number;
  /** Share of sims finishing as seed 1..7 (index 0 = #1 seed). */
  seeds: number[];
}

export interface MachineResult {
  sims: number;
  teams: MachineTeamResult[];
}

const HOME_FIELD = 2.0;
const LOGISTIC_SCALE = 5.5;

/** A team plays once a week, so week + the two teams identifies a game. */
export function gameKey(g: Pick<MachineGame, 'week' | 'home' | 'away'>): string {
  return `${g.week}:${g.away}@${g.home}`;
}

// ─── Share links: ?p=13BUF.13DET.14KC (week + picked winner) ────────────
export function encodePicks(games: MachineGame[], picks: Picks): string {
  return games
    .filter((g) => !g.done && picks[gameKey(g)])
    .map((g) => `${g.week}${picks[gameKey(g)]}`)
    .join('.');
}

export function decodePicks(games: MachineGame[], encoded: string | null | undefined): Picks {
  const picks: Picks = {};
  if (!encoded) return picks;
  for (const token of encoded.split('.')) {
    const m = /^(\d{1,2})([A-Z]{2,3})$/.exec(token.trim().toUpperCase());
    if (!m) continue;
    const week = Number(m[1]);
    const winner = m[2];
    const g = games.find((x) => !x.done && x.week === week && (x.home === winner || x.away === winner));
    if (g) picks[gameKey(g)] = winner;
  }
  return picks;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Simulate the rest of the season `sims` times with `picks` locked in.
 * Uses a fixed seed so two runs differ only because of the picks (the same
 * random draws decide every unpicked game), which keeps "change vs. no picks"
 * from jittering.
 */
export function runPlayoffMachine(
  teamsIn: MachineTeam[],
  games: MachineGame[],
  picks: Picks,
  sims = 2000,
  seed = 20260,
): MachineResult {
  const teams = [...teamsIn].sort((a, b) => a.abbrev.localeCompare(b.abbrev));
  const T = teams.length;
  const idx = new Map(teams.map((t, i) => [t.abbrev, i]));
  const conf = teams.map((t) => t.conference);
  const div = teams.map((t) => t.division);
  const rating = teams.map((t) => t.rating);

  const base = teams.map(() => ({ w: 0, l: 0, t: 0, dw: 0, dl: 0, cw: 0, cl: 0 }));
  const baseH2H: number[][] = teams.map(() => teams.map(() => 0));
  // p = home win prob, or 1 / 0 for a locked pick.
  const remaining: Array<{ h: number; a: number; p: number; sameDiv: boolean; sameConf: boolean }> = [];
  for (const g of games) {
    const h = idx.get(g.home);
    const a = idx.get(g.away);
    if (h === undefined || a === undefined) continue;
    const sameDiv = div[h] === div[a];
    const sameConf = conf[h] === conf[a];
    if (g.done) {
      if (g.homePts === g.awayPts) { base[h].t++; base[a].t++; continue; }
      const [win, lose] = g.homePts > g.awayPts ? [h, a] : [a, h];
      base[win].w++; base[lose].l++;
      baseH2H[win][lose]++;
      if (sameDiv) { base[win].dw++; base[lose].dl++; }
      if (sameConf) { base[win].cw++; base[lose].cl++; }
      continue;
    }
    const pick = picks[gameKey(g)];
    const p = pick === g.home ? 1 : pick === g.away ? 0 : g.homeWinProb ?? 0.5;
    remaining.push({ h, a, p, sameDiv, sameConf });
  }

  const wpCache = new Map<number, number>();
  const playoffHomeWP = (home: number, away: number, neutral: boolean) => {
    const key = (home * T + away) * 2 + (neutral ? 1 : 0);
    let p = wpCache.get(key);
    if (p === undefined) {
      const margin = rating[home] - rating[away] + (neutral ? 0 : HOME_FIELD);
      p = 1 / (1 + Math.exp(-margin / LOGISTIC_SCALE));
      wpCache.set(key, p);
    }
    return p;
  };

  const rand = mulberry32(seed);
  const tally = teams.map(() => ({ wins: 0, playoffs: 0, division: 0, seed1: 0, conference: 0, champion: 0, seeds: [0, 0, 0, 0, 0, 0, 0] }));
  const w = new Float64Array(T), l = new Float64Array(T), tt = new Float64Array(T);
  const dw = new Float64Array(T), dl = new Float64Array(T), cw = new Float64Array(T), cl = new Float64Array(T);
  const coin = new Float64Array(T);
  const pct = (wi: number, lo: number, ti = 0) => (wi + lo + ti === 0 ? 0 : (wi + 0.5 * ti) / (wi + lo + ti));
  const confMembers = ['AFC', 'NFC'].map((c) => teams.map((_, i) => i).filter((i) => conf[i] === c));

  for (let s = 0; s < sims; s++) {
    for (let i = 0; i < T; i++) {
      const b = base[i];
      w[i] = b.w; l[i] = b.l; tt[i] = b.t; dw[i] = b.dw; dl[i] = b.dl; cw[i] = b.cw; cl[i] = b.cl;
      coin[i] = rand();
    }
    const h2h = baseH2H.map((r) => [...r]);
    for (const g of remaining) {
      // Always draw, so a pick in one game doesn't shift the draws for the rest.
      const r = rand();
      const homeWins = r < g.p;
      const win = homeWins ? g.h : g.a;
      const lose = homeWins ? g.a : g.h;
      w[win]++; l[lose]++; h2h[win][lose]++;
      if (g.sameDiv) { dw[win]++; dl[lose]++; }
      if (g.sameConf) { cw[win]++; cl[lose]++; }
    }

    const better = (a: number, b: number) => {
      const d = pct(w[b], l[b], tt[b]) - pct(w[a], l[a], tt[a]);
      if (d !== 0) return d;
      const hh = h2h[b][a] - h2h[a][b];
      if (hh !== 0) return hh;
      if (div[a] === div[b]) {
        const dd = pct(dw[b], dl[b]) - pct(dw[a], dl[a]);
        if (dd !== 0) return dd;
      }
      const cc = pct(cw[b], cl[b]) - pct(cw[a], cl[a]);
      if (cc !== 0) return cc;
      return coin[b] - coin[a];
    };

    const seedsByConf: number[][] = [];
    for (const members of confMembers) {
      if (members.length < 7) continue;
      const divs = [...new Set(members.map((i) => div[i]))];
      const winners = divs.map((d) => members.filter((i) => div[i] === d).sort(better)[0]).sort(better);
      const wild = members.filter((i) => !winners.includes(i)).sort(better).slice(0, 3);
      const seeds = [...winners, ...wild];
      seeds.forEach((i, k) => { tally[i].playoffs++; tally[i].seeds[k]++; });
      winners.forEach((i) => { tally[i].division++; });
      tally[seeds[0]].seed1++;
      seedsByConf.push(seeds);
    }

    if (seedsByConf.length === 2) {
      const playGame = (homeSeed: number, awaySeed: number, seeds: number[]) =>
        (rand() < playoffHomeWP(seeds[homeSeed], seeds[awaySeed], false) ? homeSeed : awaySeed);
      const champs: number[] = [];
      for (const seeds of seedsByConf) {
        let alive = [0, playGame(1, 6, seeds), playGame(2, 5, seeds), playGame(3, 4, seeds)].sort((a, b) => a - b);
        const d1 = playGame(alive[0], alive[3], seeds);
        const d2 = playGame(alive[1], alive[2], seeds);
        alive = [d1, d2].sort((a, b) => a - b);
        const confWinner = seeds[playGame(alive[0], alive[1], seeds)];
        tally[confWinner].conference++;
        champs.push(confWinner);
      }
      const sb = rand() < playoffHomeWP(champs[0], champs[1], true) ? champs[0] : champs[1];
      tally[sb].champion++;
    }
    for (let i = 0; i < T; i++) tally[i].wins += w[i];
  }

  const r1 = (x: number) => Math.round((x / sims) * 1000) / 10;
  return {
    sims,
    teams: teams.map((t, i) => ({
      abbrev: t.abbrev,
      playoffs: r1(tally[i].playoffs),
      division: r1(tally[i].division),
      topSeed: r1(tally[i].seed1),
      conference: r1(tally[i].conference),
      champion: r1(tally[i].champion),
      projectedWins: Math.round((tally[i].wins / sims) * 10) / 10,
      seeds: tally[i].seeds.map(r1),
    })),
  };
}

/** Current W-L(-T) after played games plus locked picks (unpicked games ignored). */
export function recordWithPicks(abbrev: string, games: MachineGame[], picks: Picks): { w: number; l: number; t: number; picked: number } {
  let w = 0, l = 0, t = 0, picked = 0;
  for (const g of games) {
    if (g.home !== abbrev && g.away !== abbrev) continue;
    if (g.done) {
      const us = g.home === abbrev ? g.homePts : g.awayPts;
      const them = g.home === abbrev ? g.awayPts : g.homePts;
      if (us > them) w++; else if (us < them) l++; else t++;
      continue;
    }
    const pick = picks[gameKey(g)];
    if (!pick) continue;
    picked++;
    if (pick === abbrev) w++; else l++;
  }
  return { w, l, t, picked };
}
