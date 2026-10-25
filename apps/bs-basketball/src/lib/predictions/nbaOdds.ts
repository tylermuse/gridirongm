/**
 * NBA season simulator → play-in / playoff / title odds for /predictions.
 *
 * The Hoops port of BS Football's src/lib/predictions/nflOdds.ts. Runs at build
 * time: the /predictions page calls getNbaOdds() while Next prerenders it, so
 * every production deploy ships fresh odds, and a weekly Vercel Cron
 * (/api/cron/rebuild-predictions) fires a deploy hook so the page refreshes
 * even in weeks when nothing else ships.
 *
 * Inputs
 *  - Real results + remaining schedule: ESPN's public NBA scoreboard, fetched
 *    a month at a time (October through April).
 *  - Team strength: every team is run through the actual BS Hoops game engine
 *    against every other team, using the 2026-27 roster file the game ships
 *    (the same one /rosters/2026 reads). Each team's average engine margin is
 *    its rating. Injured players sit until their injury runs out — they're
 *    phased back in by the share of the team's minutes they'd play. The engine
 *    rating is then blended with the team's real point differential: early on
 *    the ratings dominate; as games pile up, results do.
 *
 * Engine cost: ~0.8ms per game, ~3,500 games → 2-3s per build, once per build
 * worker (the result is memoised). The 10,000-season Monte Carlo on top of the
 * ratings is a few hundred ms.
 *
 * If ESPN or the roster file is unavailable, the committed snapshot in
 * src/lib/data/predictions/nba-latest.json is used so builds never fail.
 * Refresh it with `npx tsx apps/bs-basketball/scripts/predictions.ts`.
 *
 * Tiebreakers are simplified (win %, then head-to-head, then conference record,
 * then a coin flip) and documented on the page. Imports are relative (no `@/`)
 * so the snapshot script can run this file under plain tsx.
 */
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { basketballAdapter, type BasketballPlayer, type BasketballTeam } from '@bs/sport-basketball';
import { convertBbgmLeague, type BbgmLeagueFile } from '../data/leagueImport';
import { resolveLineup } from '../lineup';
import snapshot from '../data/predictions/nba-latest.json';

export interface NbaTeamOdds {
  abbrev: string;
  slug: string;
  city: string;
  name: string;
  color: string;
  conference: 'East' | 'West';
  division: string;
  record: string;
  /** Rating in points per game vs. a league-average team (engine prior blended with results). */
  rating: number;
  projectedWins: number;
  /** % chance of a top-6 finish (straight into the playoffs). */
  top6: number;
  /** % chance of finishing 7th-10th (into the play-in tournament). */
  playIn: number;
  /** % chance of reaching the first round, directly or through the play-in. */
  playoffs: number;
  /** % chance of the conference's #1 seed. */
  topSeed: number;
  /** % chance of winning the conference (reaching the Finals). */
  conferenceTitle: number;
  champion: number;
  /** Change in playoff % since the odds a week ago (percentage points). */
  playoffsChange: number | null;
  championChange: number | null;
}

export interface NbaOdds {
  season: string;
  completedGames: number;
  remainingGames: number;
  sims: number;
  /** ISO timestamp of the latest completed game counted (or the build time pre-season). */
  resultsThrough: string;
  generatedAt: string;
  teams: NbaTeamOdds[];
}

const ROSTER_FILE = 'public/rosters/BBGM_NBA_Roster_2026_Updated.json';
const SEASON_LABEL = '2026-27';
const START_YEAR = 2026;
const GAMES_PER_TEAM = 82;
export const DEFAULT_SIMS = 10000;

// Model constants
const HOME_COURT = 2.5;       // points; the modern NBA home edge is ~2-3 (the engine doesn't model one)
const LOGISTIC_SCALE = 7.0;   // logistic ≈ normal with a ~12-point game-to-game SD
const RESULTS_WEIGHT_K = 15;  // games played at which results and ratings get equal weight
const RATING_SD = 3.5;        // preseason uncertainty in a team's true strength (points); shrinks as games are played
const ENGINE_REPS = 3;        // home + away games per matchup per rep in the engine round-robin
/** Rotation minutes by depth slot (sums to 240), used to phase injured players back in. */
const MINUTES = [34, 34, 32, 30, 28, 24, 20, 16, 12, 10];

// ─── ESPN schedule + results ────────────────────────────────────────────
interface Game {
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
    season: { type: number };
    competitions: Array<{
      neutralSite?: boolean;
      type?: { abbreviation?: string };
      status: { type: { completed: boolean } };
      competitors: Array<{ homeAway: string; score?: string; team: { abbreviation: string } }>;
    }>;
  }>;
};

/** ESPN abbreviations that differ from the roster file's. */
const ESPN_ABBREV: Record<string, string> = { GS: 'GSW', NY: 'NYK', SA: 'SAS', NO: 'NOP', UTAH: 'UTA', WSH: 'WAS' };

/** GET JSON with node:https (not Next's patched fetch, so nothing is cached between builds). */
function getJson<T>(url: string, timeoutMs = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'user-agent': 'bs-hoops-predictions/1.0', accept: 'application/json' } }, res => {
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

async function fetchSeason(): Promise<Game[]> {
  // ESPN's scoreboard rejects long date ranges but accepts whole months.
  const months = ['10', '11', '12', '01', '02', '03', '04'].map(m => `${Number(m) >= 10 ? START_YEAR : START_YEAR + 1}${m}`);
  const boards = await Promise.all(months.map(m =>
    getJson<EspnScoreboard>(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${m}&seasontype=2&limit=1000`)));
  const games: Game[] = [];
  for (const data of boards) {
    for (const ev of data.events) {
      const c = ev.competitions[0];
      // Regular season only; the NBA Cup final ('CC') doesn't count in the standings.
      if (ev.season.type !== 2 || c.type?.abbreviation === 'CC') continue;
      const home = c.competitors.find(x => x.homeAway === 'home')!;
      const away = c.competitors.find(x => x.homeAway === 'away')!;
      const ab = (x: typeof home) => ESPN_ABBREV[x.team.abbreviation] ?? x.team.abbreviation;
      // Cup knockout games are listed as TBD until the group stage ends — those
      // slots are simulated separately (see `extra` in simulate()).
      if (ab(home) === 'TBD' || ab(away) === 'TBD') continue;
      games.push({
        date: ev.date,
        home: ab(home),
        away: ab(away),
        neutral: !!c.neutralSite,
        done: c.status.type.completed,
        homePts: Number(home.score ?? 0),
        awayPts: Number(away.score ?? 0),
      });
    }
  }
  // 30 teams × 80+ known games / 2 ≈ 1,200; anything far off means ESPN changed shape.
  if (games.length < 1100) throw new Error(`ESPN returned only ${games.length} regular-season games`);
  return games.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Team strength from the roster file + the game engine ───────────────
interface TeamInfo { abbrev: string; city: string; name: string; color: string; conf: 'East' | 'West'; div: string }

interface TeamStrength {
  /** Engine margin vs. the league with every rotation player healthy. */
  full: number;
  /** Rating lost per rotation player still out, with the team game number he returns. */
  injuries: Array<{ returnsAfter: number; cost: number }>;
}

type Snap = { team: BasketballTeam; availablePlayers: BasketballPlayer[]; lineup: ReturnType<typeof resolveLineup>; coach: undefined };

function loadStrengths(): { info: Map<string, TeamInfo>; strength: Map<string, TeamStrength> } {
  const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), ROSTER_FILE), 'utf8')) as BbgmLeagueFile & {
    players: Array<{ injury?: { gamesRemaining?: number } }>;
  };
  const league = convertBbgmLeague(raw);
  const teams = league.teams as BasketballTeam[];
  const gamesOut = (p: BasketballPlayer) => {
    const idx = Number(String(p.id).replace('player-', ''));
    return p.injury ? Math.max(0, raw.players[idx]?.injury?.gamesRemaining ?? 0) : 0;
  };

  const info = new Map<string, TeamInfo>();
  const fullSnaps: Snap[] = [];
  const nowSnaps: Array<Snap | null> = [];
  const injuredRotation: Array<Array<{ out: number; minutes: number }>> = [];
  for (const t of teams) {
    info.set(t.abbreviation, {
      abbrev: t.abbreviation, city: t.city, name: t.name, color: t.primaryColor,
      conf: t.sportData.conference === 'Western' ? 'West' : 'East', div: t.sportData.division,
    });
    const roster = t.playerIds.map(id => league.players[id] as BasketballPlayer).filter(Boolean);
    const healthy = roster.map(p => (p.injury ? { ...p, injury: null } : p));
    const available = roster.filter(p => gamesOut(p) === 0);
    fullSnaps.push({ team: t, availablePlayers: healthy, lineup: resolveLineup(t, healthy), coach: undefined });
    // Rotation = top 10 by OVR at full strength; only injuries there move the rating.
    const rotation = [...roster].sort((a, b) => b.ratings.overall - a.ratings.overall).slice(0, MINUTES.length);
    const hurt = rotation.map((p, i) => ({ out: gamesOut(p), minutes: MINUTES[i] })).filter(x => x.out > 0);
    injuredRotation.push(hurt);
    nowSnaps.push(hurt.length ? { team: t, availablePlayers: available, lineup: resolveLineup(t, available), coach: undefined } : null);
  }

  const play = (home: Snap, away: Snap, seed: string) => {
    const r = basketballAdapter.simEngine.simGame(home as never, away as never, {
      season: START_YEAR, tick: 0, competitionId: 'primary', isPlayoff: false, homeAdvantage: 0, rngSeed: seed,
    } as never);
    return (r.finalScore?.home ?? 0) - (r.finalScore?.away ?? 0);
  };

  // Full-strength round-robin: every ordered pair, ENGINE_REPS times. Balanced,
  // so each team's mean margin is its rating vs. a league-average opponent.
  const T = teams.length;
  const full = new Float64Array(T);
  const perTeam = 2 * (T - 1) * ENGINE_REPS;
  const margin = (rep: number, h: number, a: number) => (rep * T + h) * T + a;
  const fullMargins = new Float64Array(ENGINE_REPS * T * T);
  for (let rep = 0; rep < ENGINE_REPS; rep++) {
    for (let h = 0; h < T; h++) for (let a = 0; a < T; a++) {
      if (h === a) continue;
      const m = play(fullSnaps[h], fullSnaps[a], `odds-${rep}-${h}-${a}`);
      fullMargins[margin(rep, h, a)] = m;
      full[h] += m / perTeam; full[a] -= m / perTeam;
    }
  }

  // Short-handed version vs. the same full-strength field with the same seeds
  // (common random numbers keep the healthy-vs-hurt gap from being pure noise).
  const strength = new Map<string, TeamStrength>();
  for (let i = 0; i < T; i++) {
    const hurt = injuredRotation[i];
    const now = nowSnaps[i];
    let gap = 0;
    if (now) {
      let diff = 0;
      for (let rep = 0; rep < ENGINE_REPS; rep++) for (let o = 0; o < T; o++) {
        if (o === i) continue;
        diff += fullMargins[margin(rep, i, o)] - play(now, fullSnaps[o], `odds-${rep}-${i}-${o}`);
        diff += play(fullSnaps[o], now, `odds-${rep}-${o}-${i}`) - fullMargins[margin(rep, o, i)];
      }
      gap = Math.max(0, diff / perTeam);
    }
    const totalMin = hurt.reduce((s, x) => s + x.minutes, 0);
    strength.set(teams[i].abbreviation, {
      full: full[i],
      injuries: hurt.map(x => ({ returnsAfter: x.out, cost: totalMin ? (gap * x.minutes) / totalMin : 0 })),
    });
  }
  return { info, strength };
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
  /** Completed games dated before this ISO time count as results; everything else is simulated. */
  resultsBefore: string;
  info: Map<string, TeamInfo>;
  strength: Map<string, TeamStrength>;
  sims: number;
  seed: number;
}

function simulate({ games, resultsBefore, info, strength, sims, seed }: SimInput) {
  const teams = [...info.keys()].sort();
  const idx = new Map(teams.map((t, i) => [t, i]));
  for (const g of games) {
    if (!idx.has(g.home) || !idx.has(g.away)) throw new Error(`Unknown team in ESPN data: ${g.home} / ${g.away}`);
  }
  const T = teams.length;
  const conf = teams.map(t => info.get(t)!.conf);

  // Base records from completed games (W, L, conf W/L, points for/against).
  const base = teams.map(() => ({ w: 0, l: 0, cw: 0, cl: 0, pf: 0, pa: 0 }));
  const baseH2H: number[][] = teams.map(() => teams.map(() => 0)); // wins of row over col
  const gameNo = new Array<number>(T).fill(0); // each team's schedule position
  const remaining: Array<{ h: number; a: number; hn: number; an: number; neutral: boolean; sameConf: boolean; margin: number }> = [];
  for (const g of games) {
    const h = idx.get(g.home)!, a = idx.get(g.away)!;
    const hn = ++gameNo[h], an = ++gameNo[a];
    const sameConf = conf[h] === conf[a];
    if (g.done && g.date < resultsBefore) {
      const rh = base[h], ra = base[a];
      rh.pf += g.homePts; rh.pa += g.awayPts; ra.pf += g.awayPts; ra.pa += g.homePts;
      const [win, lose] = g.homePts > g.awayPts ? [h, a] : [a, h];
      base[win].w++; base[lose].l++;
      baseH2H[win][lose]++;
      if (sameConf) { base[win].cw++; base[lose].cl++; }
    } else {
      remaining.push({ h, a, hn, an, neutral: g.neutral, sameConf, margin: NaN });
    }
  }
  // NBA Cup knockout slots (TBD on the schedule) → neutral games vs. a league-average opponent.
  const extra = teams.map((_, i) => Math.max(0, GAMES_PER_TEAM - gameNo[i]));

  // Rating at a given team game number: engine strength minus rotation players
  // still out, regressed toward the team's real point differential per game.
  const gp = base.map(b => b.w + b.l);
  const rating = (i: number, n: number): number => {
    const s = strength.get(teams[i])!;
    const prior = s.full - s.injuries.reduce((sum, x) => sum + (n <= x.returnsAfter ? x.cost : 0), 0);
    const pdPerGame = gp[i] ? (base[i].pf - base[i].pa) / gp[i] : 0;
    const wt = gp[i] / (gp[i] + RESULTS_WEIGHT_K);
    return (1 - wt) * prior + wt * pdPerGame;
  };
  const winProb = (margin: number) => 1 / (1 + Math.exp(-margin / LOGISTIC_SCALE));
  for (const g of remaining) g.margin = rating(g.h, g.hn) - rating(g.a, g.an) + (g.neutral ? 0 : HOME_COURT);
  const extraMargin = teams.map((_, i) => rating(i, GAMES_PER_TEAM));
  // Each simulated season draws one "true strength" error per team, so the
  // odds reflect that we don't know exactly how good anyone is — less so as
  // real games pile up.
  const ratingSd = gp.map(g => RATING_SD * Math.sqrt(RESULTS_WEIGHT_K / (g + RESULTS_WEIGHT_K)));
  const err = new Float64Array(teams.length);

  // Playoff games use end-of-season ratings (most injuries healed). Series are
  // best-of-seven, 2-2-1-1-1, home court to the better seed / record.
  const endRating = teams.map((_, i) => rating(i, GAMES_PER_TEAM + 1));
  const homeP = (home: number, away: number) => winProb(endRating[home] + err[home] - endRating[away] - err[away] + HOME_COURT);

  const rand = mulberry32(seed);
  const tally = teams.map(() => ({ wins: 0, top6: 0, playIn: 0, playoffs: 0, seed1: 0, conference: 0, champion: 0 }));
  const w = new Float64Array(T), l = new Float64Array(T), cw = new Float64Array(T), cl = new Float64Array(T);
  const coin = new Float64Array(T);
  const pct = (wi: number, lo: number) => (wi + lo === 0 ? 0 : wi / (wi + lo));

  for (let s = 0; s < sims; s++) {
    for (let i = 0; i < T; i++) {
      const b = base[i];
      w[i] = b.w; l[i] = b.l; cw[i] = b.cw; cl[i] = b.cl;
      coin[i] = rand();
      // Box-Muller normal draw for this season's strength error.
      err[i] = ratingSd[i] * Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
      const pExtra = winProb(extraMargin[i] + err[i]);
      for (let k = 0; k < extra[i]; k++) { if (rand() < pExtra) w[i]++; else l[i]++; }
    }
    const h2h = baseH2H.map(r => [...r]);
    for (const g of remaining) {
      const homeWins = rand() < winProb(g.margin + err[g.h] - err[g.a]);
      const win = homeWins ? g.h : g.a, lose = homeWins ? g.a : g.h;
      w[win]++; l[lose]++; h2h[win][lose]++;
      if (g.sameConf) { cw[win]++; cl[lose]++; }
    }

    const better = (a: number, b: number) => {
      const d = pct(w[b], l[b]) - pct(w[a], l[a]);
      if (d !== 0) return d;
      const hh = h2h[b][a] - h2h[a][b];
      if (hh !== 0) return hh;
      const cc = pct(cw[b], cl[b]) - pct(cw[a], cl[a]);
      if (cc !== 0) return cc;
      return coin[b] - coin[a];
    };
    const game = (home: number, away: number) => (rand() < homeP(home, away) ? home : away);
    /** Best-of-seven; `hi` has home court. */
    const series = (hi: number, lo: number) => {
      let a = 0, b = 0;
      for (let g = 0; a < 4 && b < 4; g++) {
        const hiHome = g === 0 || g === 1 || g === 4 || g === 6;
        const winner = hiHome ? game(hi, lo) : game(lo, hi);
        if (winner === hi) a++; else b++;
      }
      return a === 4 ? hi : lo;
    };

    const champs: number[] = [];
    for (const c of ['East', 'West'] as const) {
      const standings = teams.map((_, i) => i).filter(i => conf[i] === c).sort(better);
      standings.slice(0, 6).forEach(i => { tally[i].top6++; });
      standings.slice(6, 10).forEach(i => { tally[i].playIn++; });
      tally[standings[0]].seed1++;
      // Play-in: 7v8 winner is the 7 seed; the loser hosts the 9v10 winner for the 8 seed.
      const [s7, s8, s9, s10] = standings.slice(6, 10);
      const w78 = game(s7, s8), l78 = w78 === s7 ? s8 : s7;
      const w910 = game(s9, s10);
      const eighth = game(l78, w910);
      const seeds = [...standings.slice(0, 6), w78, eighth];
      seeds.forEach(i => { tally[i].playoffs++; });
      // Bracket: 1v8, 4v5, 3v6, 2v7; no reseeding. Lower seed index = home court.
      const adv = (x: number, y: number) => {
        const [hi, lo] = x < y ? [x, y] : [y, x];
        return series(seeds[hi], seeds[lo]) === seeds[hi] ? hi : lo;
      };
      const confWinner = seeds[adv(adv(adv(0, 7), adv(3, 4)), adv(adv(2, 5), adv(1, 6)))];
      tally[confWinner].conference++;
      champs.push(confWinner);
    }
    const [e, wst] = champs;
    const finalsHome = better(e, wst) <= 0 ? e : wst;
    const champ = series(finalsHome, finalsHome === e ? wst : e);
    tally[champ].champion++;
    for (let i = 0; i < T; i++) tally[i].wins += w[i];
  }

  const r1 = (x: number) => Math.round(x * 1000) / 10; // fraction → % with 1 decimal
  return {
    remainingGames: remaining.length + extra.reduce((a, b) => a + b, 0) / 2,
    teams: teams.map((t, i) => {
      const b = base[i];
      const ti = info.get(t)!;
      return {
        abbrev: t,
        slug: t.toLowerCase(),
        city: ti.city,
        name: ti.name,
        color: ti.color,
        conference: ti.conf,
        division: ti.div,
        record: `${b.w}-${b.l}`,
        rating: Math.round(rating(i, gp[i] + 1) * 10) / 10,
        projectedWins: Math.round((tally[i].wins / sims) * 10) / 10,
        top6: r1(tally[i].top6 / sims),
        playIn: r1(tally[i].playIn / sims),
        playoffs: r1(tally[i].playoffs / sims),
        topSeed: r1(tally[i].seed1 / sims),
        conferenceTitle: r1(tally[i].conference / sims),
        champion: r1(tally[i].champion / sims),
      };
    }),
  };
}

/** Run the full model: odds with every result so far, plus the change since
 *  the odds a week earlier (re-simulated without the last seven days of results). */
export async function computeNbaOdds(sims = DEFAULT_SIMS): Promise<NbaOdds> {
  const games = await fetchSeason();
  const { info, strength } = loadStrengths();
  if (info.size !== 30) throw new Error(`Roster file has ${info.size} teams, expected 30`);
  const played = games.filter(g => g.done);
  const resultsThrough = played.reduce((m, g) => (g.date > m ? g.date : m), '');
  const now = simulate({ games, resultsBefore: '9999', info, strength, sims, seed: played.length + 1 });
  const weekAgo = resultsThrough ? new Date(Date.parse(resultsThrough) - 7 * 864e5).toISOString() : '';
  const prev = weekAgo && played.some(g => g.date < weekAgo)
    ? simulate({ games, resultsBefore: weekAgo, info, strength, sims, seed: played.length })
    : null;
  const prevBy = new Map((prev?.teams ?? []).map(t => [t.abbrev, t]));
  const round1 = (x: number) => Math.round(x * 10) / 10;
  return {
    season: SEASON_LABEL,
    completedGames: played.length,
    remainingGames: now.remainingGames,
    sims,
    resultsThrough: resultsThrough || new Date().toISOString(),
    generatedAt: new Date().toISOString(),
    teams: now.teams.map(t => {
      const p = prevBy.get(t.abbrev);
      return {
        ...t,
        playoffsChange: p ? round1(t.playoffs - p.playoffs) : null,
        championChange: p ? round1(t.champion - p.champion) : null,
      };
    }),
  };
}

let cached: Promise<NbaOdds> | null = null;

/** Odds for the page. Computed once per build worker; falls back to the
 *  committed snapshot if ESPN or the roster file can't be read. */
export function getNbaOdds(): Promise<NbaOdds> {
  cached ??= computeNbaOdds().catch(err => {
    console.warn(`[predictions] live simulation failed, using committed snapshot (${snapshot.generatedAt}):`, err instanceof Error ? err.message : err);
    return snapshot as NbaOdds;
  });
  return cached;
}
