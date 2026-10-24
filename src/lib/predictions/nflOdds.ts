/**
 * NFL season simulator → playoff / Super Bowl odds for /predictions.
 *
 * Runs at build time: the /predictions page and the sitemap call getNflOdds()
 * while Next prerenders them, so every production deploy ships fresh odds.
 * A weekly Vercel Cron (/api/cron/rebuild-predictions) fires a deploy hook
 * every Tuesday morning, after Monday Night Football, so the page refreshes
 * even in weeks when nothing else ships.
 *
 * Inputs
 *  - Real results + remaining schedule: ESPN's public scoreboard (weeks 1-18).
 *  - Team strength: BS Football's player ratings for each team's healthy
 *    starters (current NFL roster file; injured players return as their
 *    injuries run out), blended with the team's real point differential this
 *    season. Early on the ratings dominate; as games pile up, results do.
 *
 * If ESPN or the roster file is unavailable, the committed snapshot in
 * src/lib/data/predictions/nfl-latest.json is used so builds never fail.
 * Refresh that snapshot with `npx tsx scripts/predictions.ts`.
 *
 * Tiebreakers are simplified (win %, then head-to-head, division and
 * conference record, then a coin flip) and documented on the page.
 */
import { readFile } from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import { convertFbgmLeague } from '@/lib/data/leagueImport';
import { teamPower, playerAvailable } from '@/lib/engine/simulate';
import type { Player } from '@/types';
import snapshot from '@/lib/data/predictions/nfl-latest.json';

export type NflOdds = typeof snapshot;
export type NflTeamOdds = NflOdds['teams'][number];

const ROSTER_FILE = 'public/rosters/FBGM_NFL_Roster_2026_Updated.json';
const SEASON = 2026;
const REG_WEEKS = 18;
export const DEFAULT_SIMS = 10000;

// Model constants
const STARTERS: Record<string, number> = { QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, CB: 3, S: 2 };
const ENGINE_POINTS_PER_UNIT = 0.35; // same scale getMatchupWinProbability uses
const HOME_FIELD = 2.0;             // points; modern NFL home edge is ~1.5-2
const LOGISTIC_SCALE = 5.5;         // same curve the game uses for win probability
const RESULTS_WEIGHT_K = 6;         // games played at which results and ratings get equal weight

// ─── ESPN schedule + results ────────────────────────────────────────────
interface Game {
  week: number;
  date: string;
  home: string;
  away: string;
  neutral: boolean;
  done: boolean;
  homePts: number;
  awayPts: number;
}

type EspnScoreboard = {
  events: Array<{
    date: string;
    competitions: Array<{
      neutralSite?: boolean;
      status: { type: { completed: boolean } };
      competitors: Array<{ homeAway: string; score?: string; team: { abbreviation: string } }>;
    }>;
  }>;
};

/** GET JSON with node:https (not Next's patched fetch, so nothing is cached between builds). */
function getJson<T>(url: string, timeoutMs = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'user-agent': 'bs-football-predictions/1.0', accept: 'application/json' } }, res => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c as Buffer));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as T); } catch (e) { reject(e); }
      });
      res.on('error', reject);
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`timeout for ${url}`)));
    req.on('error', reject);
  });
}

async function fetchSeason(): Promise<{ games: Game[]; currentWeek: number }> {
  const weeks = Array.from({ length: REG_WEEKS }, (_, i) => i + 1);
  const boards = await Promise.all(weeks.map(week =>
    getJson<EspnScoreboard>(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${SEASON}&seasontype=2&week=${week}`)));
  const games: Game[] = [];
  boards.forEach((data, i) => {
    for (const ev of data.events) {
      const c = ev.competitions[0];
      const home = c.competitors.find(x => x.homeAway === 'home')!;
      const away = c.competitors.find(x => x.homeAway === 'away')!;
      games.push({
        week: weeks[i],
        date: ev.date,
        home: home.team.abbreviation,
        away: away.team.abbreviation,
        neutral: !!c.neutralSite,
        done: c.status.type.completed,
        homePts: Number(home.score ?? 0),
        awayPts: Number(away.score ?? 0),
      });
    }
  });
  // A full 17-game, 32-team schedule is 272 games; anything far off means ESPN changed shape.
  if (games.length < 250) throw new Error(`ESPN returned only ${games.length} regular-season games`);
  const firstOpen = games.filter(g => !g.done).reduce((m, g) => Math.min(m, g.week), REG_WEEKS + 1);
  return { games, currentWeek: Math.min(firstOpen, REG_WEEKS) };
}

// ─── League + team strength from the roster file ────────────────────────
interface TeamInfo { abbrev: string; city: string; name: string; conf: 'AFC' | 'NFC'; div: string }

async function loadLeague() {
  const raw = JSON.parse(await readFile(path.join(process.cwd(), ROSTER_FILE), 'utf8'));
  const league = convertFbgmLeague(raw);
  const confName = new Map<number, 'AFC' | 'NFC'>((raw.gameAttributes.confs as Array<{ cid: number; name: string }>).map(c => [c.cid, c.name as 'AFC' | 'NFC']));
  const divName = new Map<number, string>((raw.gameAttributes.divs as Array<{ did: number; name: string }>).map(d => [d.did, d.name]));
  const info = new Map<string, TeamInfo>();
  for (const t of raw.teams as Array<{ abbrev: string; region: string; name: string; cid: number; did: number }>) {
    info.set(t.abbrev, { abbrev: t.abbrev, city: t.region, name: t.name, conf: confName.get(t.cid)!, div: divName.get(t.did)! });
  }
  const abbrevById = new Map(league.teams.map(t => [t.id, t.abbreviation]));
  const rosters = new Map<string, Player[]>();
  for (const p of league.players) {
    const ab = p.teamId ? abbrevById.get(p.teamId) : undefined;
    if (!ab) continue;
    (rosters.get(ab) ?? rosters.set(ab, []).get(ab)!).push(p);
  }
  return { info, rosters };
}

/** Roster as of `weeksAhead` weeks from now: injuries count down, and players
 *  whose injury has run out are back in the lineup. */
function rosterAt(roster: Player[], weeksAhead: number): Player[] {
  if (weeksAhead <= 0) return roster;
  return roster.map(p => (p.injury ? { ...p, injury: { ...p.injury, weeksLeft: p.injury.weeksLeft - weeksAhead } } : p));
}

// ─── Seeded RNG (reproducible runs) ─────────────────────────────────────
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

// ─── Simulation ─────────────────────────────────────────────────────────
interface SimInput {
  games: Game[];
  /** Week the odds are "entering" (seeds the RNG). */
  asOfWeek: number;
  /** Played games before this week count as results; everything else is simulated. */
  resultsBeforeWeek: number;
  /** The real current week, so injury timelines stay anchored to today's roster file. */
  currentWeek: number;
  info: Map<string, TeamInfo>;
  rosters: Map<string, Player[]>;
  sims: number;
}

function simulate({ games, asOfWeek, resultsBeforeWeek, currentWeek, info, rosters, sims }: SimInput) {
  const teams = [...info.keys()].sort();
  const idx = new Map(teams.map((t, i) => [t, i]));
  for (const g of games) {
    if (!idx.has(g.home) || !idx.has(g.away)) throw new Error(`Unknown team in ESPN data: ${g.home} / ${g.away}`);
  }
  const T = teams.length;
  const conf = teams.map(t => info.get(t)!.conf);
  const div = teams.map(t => info.get(t)!.div);

  // Engine rating: teamPower over each team's healthy starters (top players by OVR at each position).
  const engineCache = new Map<string, number>();
  const engineTotal = (abbrev: string, weeksAhead: number): number => {
    const key = `${abbrev}|${weeksAhead}`;
    const hit = engineCache.get(key);
    if (hit !== undefined) return hit;
    const roster = rosterAt(rosters.get(abbrev) ?? [], weeksAhead).filter(playerAvailable);
    const starters = Object.entries(STARTERS).flatMap(([pos, n]) =>
      roster.filter(p => p.position === pos).sort((a, b) => b.ratings.overall - a.ratings.overall).slice(0, n));
    const pw = teamPower(starters);
    const total = pw.offense + pw.defense;
    engineCache.set(key, total);
    return total;
  };

  // Base records from completed games (W, L, T, div W/L, conf W/L, points for/against).
  const base = teams.map(() => ({ w: 0, l: 0, t: 0, dw: 0, dl: 0, cw: 0, cl: 0, pf: 0, pa: 0 }));
  const baseH2H: number[][] = teams.map(() => teams.map(() => 0)); // wins of row over col
  const remaining: Array<{ h: number; a: number; p: number; weeksAhead: number; neutral: boolean; sameDiv: boolean; sameConf: boolean }> = [];
  for (const g of games) {
    const h = idx.get(g.home)!, a = idx.get(g.away)!;
    const sameDiv = div[h] === div[a], sameConf = conf[h] === conf[a];
    if (g.done && g.week < resultsBeforeWeek) {
      const rh = base[h], ra = base[a];
      rh.pf += g.homePts; rh.pa += g.awayPts; ra.pf += g.awayPts; ra.pa += g.homePts;
      if (g.homePts === g.awayPts) { rh.t++; ra.t++; continue; }
      const [win, lose] = g.homePts > g.awayPts ? [h, a] : [a, h];
      base[win].w++; base[lose].l++;
      baseH2H[win][lose]++;
      if (sameDiv) { base[win].dw++; base[lose].dl++; }
      if (sameConf) { base[win].cw++; base[lose].cl++; }
    } else {
      remaining.push({ h, a, p: NaN, weeksAhead: Math.max(0, g.week - currentWeek), neutral: g.neutral, sameDiv, sameConf });
    }
  }

  // Blend: rating (points vs league average) = engine prior regressed toward
  // the team's real point differential per game as games accumulate.
  const gp = base.map(b => b.w + b.l + b.t);
  const meanCache = new Map<number, number>();
  const rating = (i: number, weeksAhead: number): number => {
    let m = meanCache.get(weeksAhead);
    if (m === undefined) { m = teams.reduce((s, t) => s + engineTotal(t, weeksAhead), 0) / T; meanCache.set(weeksAhead, m); }
    const prior = (engineTotal(teams[i], weeksAhead) - m) * ENGINE_POINTS_PER_UNIT;
    const pdPerGame = gp[i] ? (base[i].pf - base[i].pa) / gp[i] : 0;
    const wt = gp[i] / (gp[i] + RESULTS_WEIGHT_K);
    return (1 - wt) * prior + wt * pdPerGame;
  };
  const homeWinProb = (h: number, a: number, weeksAhead: number, neutral: boolean) => {
    const margin = rating(h, weeksAhead) - rating(a, weeksAhead) + (neutral ? 0 : HOME_FIELD);
    return 1 / (1 + Math.exp(-margin / LOGISTIC_SCALE));
  };
  for (const g of remaining) g.p = homeWinProb(g.h, g.a, g.weeksAhead, g.neutral);

  // Playoff games use end-of-season rosters (most injuries healed).
  const endWeeks = REG_WEEKS - currentWeek + 1;
  const poCache = new Map<string, number>();
  const playoffHomeWP = (home: number, away: number, neutral = false) => {
    const key = `${home}|${away}|${neutral ? 1 : 0}`;
    let p = poCache.get(key);
    if (p === undefined) { p = homeWinProb(home, away, endWeeks, neutral); poCache.set(key, p); }
    return p;
  };

  const rand = mulberry32(SEASON * 100 + asOfWeek);
  const tally = teams.map(() => ({ wins: 0, playoffs: 0, division: 0, seed1: 0, conference: 0, champion: 0 }));
  const w = new Float64Array(T), l = new Float64Array(T), tt = new Float64Array(T);
  const dw = new Float64Array(T), dl = new Float64Array(T), cw = new Float64Array(T), cl = new Float64Array(T);
  const coin = new Float64Array(T);
  const pct = (wi: number, lo: number, ti = 0) => (wi + lo + ti === 0 ? 0 : (wi + 0.5 * ti) / (wi + lo + ti));

  for (let s = 0; s < sims; s++) {
    for (let i = 0; i < T; i++) {
      const b = base[i];
      w[i] = b.w; l[i] = b.l; tt[i] = b.t; dw[i] = b.dw; dl[i] = b.dl; cw[i] = b.cw; cl[i] = b.cl;
      coin[i] = rand();
    }
    const h2h = baseH2H.map(r => [...r]);
    for (const g of remaining) {
      const homeWins = rand() < g.p;
      const win = homeWins ? g.h : g.a, lose = homeWins ? g.a : g.h;
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
    for (const c of ['AFC', 'NFC'] as const) {
      const members = teams.map((_, i) => i).filter(i => conf[i] === c);
      const divs = [...new Set(members.map(i => div[i]))];
      const winners = divs.map(d => members.filter(i => div[i] === d).sort(better)[0]).sort(better);
      const wild = members.filter(i => !winners.includes(i)).sort(better).slice(0, 3);
      const seeds = [...winners, ...wild];
      seeds.forEach(i => { tally[i].playoffs++; });
      winners.forEach(i => { tally[i].division++; });
      tally[seeds[0]].seed1++;
      seedsByConf.push(seeds);
    }

    // Playoffs: #1 seed has a bye; reseed after the wild-card round.
    const playGame = (homeSeed: number, awaySeed: number, seeds: number[]) =>
      (rand() < playoffHomeWP(seeds[homeSeed], seeds[awaySeed]) ? homeSeed : awaySeed);
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
    const sbWinner = rand() < playoffHomeWP(champs[0], champs[1], true) ? champs[0] : champs[1];
    tally[sbWinner].champion++;
    for (let i = 0; i < T; i++) tally[i].wins += w[i];
  }

  const r1 = (x: number) => Math.round(x * 1000) / 10; // fraction → % with 1 decimal
  return {
    remainingGames: remaining.length,
    teams: teams.map((t, i) => {
      const b = base[i];
      return {
        abbrev: t,
        city: info.get(t)!.city,
        name: info.get(t)!.name,
        conference: conf[i],
        division: div[i],
        record: b.t ? `${b.w}-${b.l}-${b.t}` : `${b.w}-${b.l}`,
        pointDiff: b.pf - b.pa,
        rating: Math.round(rating(i, 0) * 10) / 10,
        projectedWins: Math.round((tally[i].wins / sims) * 10) / 10,
        playoffs: r1(tally[i].playoffs / sims),
        division_title: r1(tally[i].division / sims),
        topSeed: r1(tally[i].seed1 / sims),
        conference_title: r1(tally[i].conference / sims),
        champion: r1(tally[i].champion / sims),
      };
    }),
  };
}

/** Run the full model: odds entering the current week, plus the change since
 *  the odds entering last week (re-simulated without last week's results). */
export async function computeNflOdds(sims = DEFAULT_SIMS): Promise<NflOdds> {
  const [{ games, currentWeek }, { info, rosters }] = await Promise.all([fetchSeason(), loadLeague()]);
  if (info.size !== 32) throw new Error(`Roster file has ${info.size} teams, expected 32`);
  // Now: every played game counts (including a Thursday game already played this week).
  const now = simulate({ games, asOfWeek: currentWeek, resultsBeforeWeek: REG_WEEKS + 1, currentWeek, info, rosters, sims });
  // Last week: only games from before last week count.
  const prev = currentWeek > 1
    ? simulate({ games, asOfWeek: currentWeek - 1, resultsBeforeWeek: currentWeek - 1, currentWeek, info, rosters, sims })
    : null;
  const prevBy = new Map((prev?.teams ?? []).map(t => [t.abbrev, t]));
  const played = games.filter(g => g.done);
  const resultsThrough = played.reduce((m, g) => (g.date > m ? g.date : m), '') || new Date().toISOString();
  const round1 = (x: number) => Math.round(x * 10) / 10;
  return {
    season: SEASON,
    week: currentWeek,
    completedGames: played.length,
    remainingGames: now.remainingGames,
    sims,
    resultsThrough,
    generatedAt: new Date().toISOString(),
    teams: now.teams.map(t => {
      const p = prevBy.get(t.abbrev);
      return {
        ...t,
        playoffsChange: p ? round1(t.playoffs - p.playoffs) : null,
        championChange: p ? round1(t.champion - p.champion) : null,
      };
    }),
  } as NflOdds;
}

let cached: Promise<NflOdds> | null = null;

/** Odds for the page and sitemap. Computed once per build worker; falls back
 *  to the committed snapshot if ESPN or the roster file can't be read. */
export function getNflOdds(): Promise<NflOdds> {
  cached ??= computeNflOdds().catch(err => {
    console.warn(`[predictions] live simulation failed, using committed snapshot (week ${snapshot.week}):`, err instanceof Error ? err.message : err);
    return snapshot;
  });
  return cached;
}
