/**
 * Pregame Show — Marcus Cole + Tony Blaze break down a matchup before tip-off.
 * The Hoops port of BS Football's lib/engine/pregameShow.
 *
 * Two tiers share one fact sheet:
 *  - Free: `generateTemplatedPregame` fills canned banter from the facts.
 *    Deterministic (seeded by game id) so reopening shows the same show.
 *  - Premium: the client POSTs the same `PregameFacts` to /api/pregame, which
 *    has an LLM write the show. On any failure the client falls back to the
 *    template, so the show always renders. Premium can also hear it voiced
 *    (/api/pregame-audio).
 *
 * The live viewer opens on a game the sim has ALREADY played, so the facts are
 * built only from games before this one — the show never leaks tonight's
 * result through the records or season averages.
 *
 * `buildPregameFacts` is the only place that reads the league — the facts are
 * compact and JSON-safe so they double as the LLM prompt + cache key.
 * Pure + client/server-safe.
 */

import type { BaseGameResult } from '@bs/core/adapter';
import type { BasketballPlayer, BasketballStats, BasketballTeam } from '@bs/sport-basketball';

type GameResult = BaseGameResult<BasketballStats>;

export type PregameSpeakerId = 'stats' | 'hottake';
export interface PregameExchange { speakerId: PregameSpeakerId; text: string }

/* ─── Types ─── */

export interface PregamePlayerFact {
  name: string;
  position: string;
  ovr: number;
  games: number;
  /** Season averages line in broadcast prose, or null before any games. */
  statLine: string | null;
  /** League rank in scoring (1 = best) when top 15, else null. */
  scoringRank: number | null;
  /** Raw per-game + efficiency numbers (for the LLM and template comparisons). */
  season: Record<string, number>;
}

export interface PregameTeamFacts {
  id: string;
  city: string;
  name: string;
  abbr: string;
  /** Regular-season record before this game. */
  record: string;
  wins: number;
  losses: number;
  /** Positive = win streak, negative = losing streak (regular season). */
  streak: number;
  gamesPlayed: number;
  ppg: number;
  papg: number;
  /** League ranks (1 = best); null before any games are played. */
  ranks: { ppg: number; papg: number; diff: number } | null;
  /** Mean OVR of the top eight in the rotation. */
  rotationOvr: number;
  /** Top scorers (top OVR before any games), best first, up to 3. */
  stars: PregamePlayerFact[];
  /** Injured rotation-quality players ("Name (POS)"). */
  injuries: string[];
}

export interface PregameFacts {
  gameId: string;
  season: number;
  isPlayoff: boolean;
  /** Playoff round + series state ("Round 1, Game 3 — series tied 1-1"), or null. */
  playoffContext: string | null;
  leagueSize: number;
  home: PregameTeamFacts;
  away: PregameTeamFacts;
  /** Home rotation OVR minus away, plus home court. */
  homeEdge: number;
}

export interface PregameShow {
  headline: string;
  exchanges: PregameExchange[];
  /** Each analyst's pick (team abbreviation) + predicted score line. */
  picks: { stats: { abbr: string; score: string }; hottake: { abbr: string; score: string } };
  source: 'template' | 'ai';
}

/* ─── Fact sheet ─── */

const HOME_COURT_OVR = 1.5;
const RANK_CUTOFF = 15;

interface GameMeta { isPlayoff?: boolean; dayOfSeason?: number; seriesId?: string; gameInSeries?: number; roundName?: string; round?: number }
const meta = (g: GameResult) => (g.sportData ?? {}) as GameMeta;
const one = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const pct = (m: number, a: number) => (a > 0 ? Math.round((m / a) * 1000) / 10 : 0);

interface Totals { gp: number; pts: number; reb: number; ast: number; stl: number; blk: number; fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number }
const emptyTotals = (): Totals => ({ gp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 });

/** Regular-season games played before `game` (by day; playoff games count
 *  every regular-season game). */
function priorRegularSeason(games: GameResult[], game: GameResult): GameResult[] {
  const m = meta(game);
  const day = m.dayOfSeason ?? Infinity;
  return games.filter(g =>
    g.id !== game.id && g.season === game.season && g.status === 'played' && !!g.finalScore
    && !meta(g).isPlayoff && (m.isPlayoff || (meta(g).dayOfSeason ?? -1) < day));
}

function playerTotals(prior: GameResult[]): Map<string, Totals> {
  const out = new Map<string, Totals>();
  for (const g of prior) {
    for (const [pid, s] of Object.entries(g.boxScores)) {
      if (!s || !(s.minutes ?? 0)) continue;
      const t = out.get(pid) ?? emptyTotals();
      t.gp += 1;
      t.pts += s.points ?? 0; t.reb += s.totalRebounds ?? 0; t.ast += s.assists ?? 0;
      t.stl += s.steals ?? 0; t.blk += s.blocks ?? 0;
      t.fgm += s.fieldGoalsMade ?? 0; t.fga += s.fieldGoalsAttempted ?? 0;
      t.tpm += s.threePointsMade ?? 0; t.tpa += s.threePointsAttempted ?? 0;
      t.ftm += s.freeThrowsMade ?? 0; t.fta += s.freeThrowsAttempted ?? 0;
      out.set(pid, t);
    }
  }
  return out;
}

/** Season scoring average per player from games before `game` (the halftime
 *  notes use it to spot stars who've gone quiet). */
export function priorScoringAverages(game: GameResult, games: GameResult[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const [pid, t] of playerTotals(priorRegularSeason(games, game))) if (t.gp >= 3) out.set(pid, t.pts / t.gp);
  return out;
}

interface TeamRecord { wins: number; losses: number; pf: number; pa: number; results: ('W' | 'L')[] }

function teamRecords(prior: GameResult[]): Map<string, TeamRecord> {
  const out = new Map<string, TeamRecord>();
  const rec = (id: string) => { let r = out.get(id); if (!r) { r = { wins: 0, losses: 0, pf: 0, pa: 0, results: [] }; out.set(id, r); } return r; };
  const ordered = [...prior].sort((a, b) => (meta(a).dayOfSeason ?? 0) - (meta(b).dayOfSeason ?? 0));
  for (const g of ordered) {
    const { home, away } = g.finalScore!;
    const h = rec(g.homeTeamId), a = rec(g.awayTeamId);
    h.pf += home; h.pa += away; a.pf += away; a.pa += home;
    if (home > away) { h.wins++; a.losses++; h.results.push('W'); a.results.push('L'); }
    else { a.wins++; h.losses++; a.results.push('W'); h.results.push('L'); }
  }
  return out;
}

function streakOf(results: ('W' | 'L')[]): number {
  if (!results.length) return 0;
  const last = results[results.length - 1];
  let n = 0;
  for (let i = results.length - 1; i >= 0 && results[i] === last; i--) n++;
  return last === 'W' ? n : -n;
}

function playerFact(p: BasketballPlayer, t: Totals | undefined, scoringRank: Map<string, number>): PregamePlayerFact {
  const name = `${p.firstName} ${p.lastName}`;
  const position = p.sportData?.position ?? '';
  const ovr = Math.round(p.ratings?.overall ?? 0);
  if (!t || t.gp === 0) return { name, position, ovr, games: 0, statLine: null, scoringRank: null, season: {} };
  const g = t.gp;
  const ppg = t.pts / g, rpg = t.reb / g, apg = t.ast / g;
  const fgPct = pct(t.fgm, t.fga), tpPct = pct(t.tpm, t.tpa);
  let statLine = `${one(ppg)} points, ${one(rpg)} rebounds and ${one(apg)} assists a game on ${one(fgPct)}% shooting`;
  if (t.tpa / g >= 3) statLine += `, ${one(tpPct)}% from three`;
  if (t.blk / g >= 1.5) statLine += `, with ${one(t.blk / g)} blocks`;
  else if (t.stl / g >= 1.5) statLine += `, with ${one(t.stl / g)} steals`;
  const rank = scoringRank.get(p.id) ?? null;
  return {
    name, position, ovr, games: g, statLine,
    scoringRank: rank && rank <= RANK_CUTOFF ? rank : null,
    season: {
      games: g, ppg: +one(ppg), rpg: +one(rpg), apg: +one(apg), spg: +one(t.stl / g), bpg: +one(t.blk / g),
      fgPct, threePct: tpPct, threesPerGame: +one(t.tpm / g), ftPct: pct(t.ftm, t.fta),
    },
  };
}

/** Rank (1 = best) of `value` among `all` (higher is better unless asc). */
function rankOf(value: number, all: number[], asc = false): number {
  return 1 + all.filter(v => (asc ? v < value : v > value)).length;
}

export function buildPregameFacts(args: {
  game: GameResult;
  games: GameResult[];
  teams: BasketballTeam[];
  players: Record<string, BasketballPlayer>;
}): PregameFacts | null {
  const { game, games, teams, players } = args;
  const homeTeam = teams.find(t => t.id === game.homeTeamId);
  const awayTeam = teams.find(t => t.id === game.awayTeamId);
  if (!homeTeam || !awayTeam) return null;

  const prior = priorRegularSeason(games, game);
  const totals = playerTotals(prior);
  const records = teamRecords(prior);

  // League scoring ranks (min a few games so a one-game wonder doesn't top it).
  const minGp = Math.max(1, Math.min(5, Math.floor(Math.max(0, ...[...totals.values()].map(t => t.gp)) / 3)));
  const scoringRank = new Map<string, number>();
  [...totals.entries()].filter(([, t]) => t.gp >= minGp).sort((a, b) => b[1].pts / b[1].gp - a[1].pts / a[1].gp)
    .forEach(([pid], i) => scoringRank.set(pid, i + 1));

  const perGame = teams.map(t => {
    const r = records.get(t.id);
    const gp = r ? r.wins + r.losses : 0;
    return { id: t.id, gp, ppg: gp ? r!.pf / gp : 0, papg: gp ? r!.pa / gp : 0 };
  });
  const withGames = perGame.filter(x => x.gp > 0);

  const teamFacts = (team: BasketballTeam): PregameTeamFacts => {
    const r = records.get(team.id) ?? { wins: 0, losses: 0, pf: 0, pa: 0, results: [] };
    const gp = r.wins + r.losses;
    const ppg = gp ? r.pf / gp : 0, papg = gp ? r.pa / gp : 0;
    const roster = team.playerIds.map(id => players[id]).filter((p): p is BasketballPlayer => !!p);
    const byOvr = [...roster].sort((a, b) => (b.ratings?.overall ?? 0) - (a.ratings?.overall ?? 0));
    const top8 = byOvr.slice(0, 8);
    const rotationOvr = top8.length ? Math.round((top8.reduce((s, p) => s + (p.ratings?.overall ?? 0), 0) / top8.length) * 10) / 10 : 0;
    const healthy = roster.filter(p => !p.injury);
    const scorers = healthy
      .filter(p => (totals.get(p.id)?.gp ?? 0) > 0)
      .sort((a, b) => totals.get(b.id)!.pts / totals.get(b.id)!.gp - totals.get(a.id)!.pts / totals.get(a.id)!.gp);
    const starsSrc = scorers.length >= 2 ? scorers : healthy.sort((a, b) => (b.ratings?.overall ?? 0) - (a.ratings?.overall ?? 0));
    const rotationCut = top8[top8.length - 1]?.ratings?.overall ?? 0;
    return {
      id: team.id, city: team.city, name: team.name, abbr: team.abbreviation,
      record: `${r.wins}-${r.losses}`, wins: r.wins, losses: r.losses,
      streak: streakOf(r.results), gamesPlayed: gp,
      ppg: +one(ppg), papg: +one(papg),
      ranks: gp > 0 && withGames.length > 1 ? {
        ppg: rankOf(ppg, withGames.map(x => x.ppg)),
        papg: rankOf(papg, withGames.map(x => x.papg), true),
        diff: rankOf(ppg - papg, withGames.map(x => x.ppg - x.papg)),
      } : null,
      rotationOvr,
      stars: starsSrc.slice(0, 3).map(p => playerFact(p, totals.get(p.id), scoringRank)),
      injuries: roster
        .filter(p => p.injury && (p.ratings?.overall ?? 0) >= rotationCut)
        .slice(0, 3)
        .map(p => `${p.firstName} ${p.lastName} (${p.sportData?.position ?? ''})`),
    };
  };

  const home = teamFacts(homeTeam);
  const away = teamFacts(awayTeam);

  let playoffContext: string | null = null;
  const m = meta(game);
  if (m.isPlayoff) {
    const prev = games.filter(g => g.status === 'played' && g.finalScore && meta(g).seriesId && meta(g).seriesId === m.seriesId && (meta(g).gameInSeries ?? 0) < (m.gameInSeries ?? 0));
    const winsOf = (id: string) => prev.filter(g => (g.finalScore!.home > g.finalScore!.away ? g.homeTeamId : g.awayTeamId) === id).length;
    const hw = winsOf(home.id), aw = winsOf(away.id);
    const state = hw === aw ? (hw === 0 ? 'series opener' : `series tied ${hw}-${aw}`)
      : `${hw > aw ? home.city : away.city} leads the series ${Math.max(hw, aw)}-${Math.min(hw, aw)}`;
    playoffContext = `${m.roundName ?? 'Playoffs'}, Game ${m.gameInSeries ?? prev.length + 1} — ${state}`;
  }

  return {
    gameId: game.id,
    season: game.season,
    isPlayoff: !!m.isPlayoff,
    playoffContext,
    leagueSize: teams.length,
    home,
    away,
    homeEdge: Math.round((home.rotationOvr - away.rotationOvr + HOME_COURT_OVR) * 10) / 10,
  };
}

/* ─── Templated show (free tier) ─── */

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h | 0;
}

function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** Predicted score for the side expected to win by `margin` points. */
function predictScore(winner: PregameTeamFacts, loser: PregameTeamFacts, margin: number, rng: () => number): string {
  const base = winner.gamesPlayed > 0 && loser.gamesPlayed > 0 ? Math.round((winner.ppg + loser.papg) / 2) : 108 + Math.floor(rng() * 8);
  const w = Math.max(base, 92) + Math.floor(rng() * 5);
  const l = Math.max(80, w - Math.max(1, Math.round(margin)));
  return `${winner.abbr} ${w}, ${loser.abbr} ${l}`;
}

export function generateTemplatedPregame(f: PregameFacts): PregameShow {
  const rng = seededRandom(hashSeed(f.gameId));
  const { home, away } = f;
  const ex: PregameExchange[] = [];
  const say = (speakerId: PregameSpeakerId, text: string) => ex.push({ speakerId, text });

  const fav = f.homeEdge >= 0 ? home : away;
  const dog = fav === home ? away : home;
  const edge = Math.abs(f.homeEdge);
  const noGames = home.gamesPlayed === 0 && away.gamesPlayed === 0;

  // 1) Open
  if (f.isPlayoff) {
    say('stats', `Welcome in. ${f.playoffContext ?? 'Playoff basketball'}. ${away.city} at ${home.city}, and every possession matters now.`);
    say('hottake', pick([
      `This is the time of year that separates the dogs from the pretenders, Marcus! Nobody remembers the regular season.`,
      `Playoff basketball, baby! The whistle gets tighter, the legs get heavier, and STARS get made.`,
    ], rng));
  } else {
    say('stats', pick([
      `Welcome in, everybody. ${away.city} (${away.record}) visits ${home.city} (${home.record}) tonight, and there's a lot to get through.`,
      `Good to be with you. The ${away.name} (${away.record}) are in ${home.city} to take on the ${home.name} (${home.record}).`,
      `${away.city} comes in ${away.record}, ${home.city} sits at ${home.record}, and the numbers tell an interesting story.`,
    ], rng));
    if (Math.abs(home.streak) >= 3 || Math.abs(away.streak) >= 3) {
      const hot = Math.abs(home.streak) >= Math.abs(away.streak) ? home : away;
      say('hottake', hot.streak > 0
        ? `${hot.city} has won ${hot.streak} STRAIGHT! You can feel it, Marcus — that locker room thinks it can't lose.`
        : `${hot.city} has dropped ${-hot.streak} in a row. Somebody's gotta stand up in that building, or this season gets away from them.`);
    } else if (noGames) {
      say('hottake', `Clean slate, Marcus! Oh-and-oh, everybody's a contender, and I've been waiting ALL summer for this.`);
    } else {
      say('hottake', pick([
        `I've had this one circled all week. Somebody's sending a message tonight.`,
        `Forget the records — this one's about who brings it. And I've got a FEELING.`,
      ], rng));
    }
  }

  // 2) The stars — a line for each side's best player, then Tony's verdict.
  const intro = (p: PregamePlayerFact, city: string) => p.statLine
    ? `${city}'s ${p.name} is putting up ${p.statLine} through ${p.games} game${p.games === 1 ? '' : 's'}.${p.scoringRank ? ` That's ${p.scoringRank === 1 ? 'tops' : ordinal(p.scoringRank)} in the league in scoring.` : ''}`
    : `${city}'s ${p.name} hasn't played a game yet this season — he comes in rated ${p.ovr}.`;
  const hs = home.stars[0], as = away.stars[0];
  if (hs && as) {
    say('stats', `Start with the headliners. ${intro(as, away.city)}`);
    say('stats', `And on the other side, ${intro(hs, home.city)}`);
    if (hs.statLine && as.statLine) {
      const better = (hs.season.ppg ?? 0) >= (as.season.ppg ?? 0) ? hs : as;
      const worse = better === hs ? as : hs;
      const gap = (better.season.ppg ?? 0) - (worse.season.ppg ?? 0);
      if (gap < 3) {
        say('hottake', `${one(as.season.ppg)} against ${one(hs.season.ppg)}? That's a DEAD HEAT. I want to see these two guard each other in the fourth.`);
      } else if ((worse.season.fgPct ?? 0) > (better.season.fgPct ?? 0) + 4) {
        say('hottake', `Sure, ${better.name} scores more — but ${worse.name} is shooting ${one(worse.season.fgPct)}%! Efficiency wins in the playoffs, Marcus, and I'll die on that hill.`);
      } else {
        say('hottake', pick([
          `${better.name} is in a different ZIP code right now. ${one(better.season.ppg)} a night! Who on that roster is stopping him?`,
          `Give me ${better.name} with the ball and the game on the line. That's a bucket-getter, period.`,
        ], rng));
      }
    } else {
      const better = hs.ovr >= as.ovr ? hs : as;
      say('hottake', `No box scores yet, so I'm going on gut — and my gut says ${better.name}. Best player on the floor tonight.`);
    }
  }

  // 3) Offense vs defense from the league ranks.
  if (home.ranks && away.ranks) {
    const n = f.leagueSize;
    type Clash = { off: PregameTeamFacts; def: PregameTeamFacts; offRank: number; defRank: number };
    const clashes: Clash[] = [
      { off: home, def: away, offRank: home.ranks.ppg, defRank: away.ranks.papg },
      { off: away, def: home, offRank: away.ranks.ppg, defRank: home.ranks.papg },
    ];
    const c = clashes.sort((a, b) => Math.abs(b.offRank - b.defRank) - Math.abs(a.offRank - a.defRank))[0];
    if (c.offRank <= n / 3 && c.defRank > (2 * n) / 3) {
      say('stats', `Here's the matchup I keep coming back to: ${c.off.city} scores ${one(c.off.ppg)} a game, ${ordinal(c.offRank)} in the league, and ${c.def.city} gives up ${one(c.def.papg)} — ${ordinal(c.defRank)}. That's a real mismatch.`);
      say('hottake', `That's a TRACK MEET waiting to happen, and ${c.def.city} can't keep up! If they don't get stops early, this is over by the third.`);
    } else if (c.offRank > (2 * n) / 3 && c.defRank <= n / 3) {
      say('stats', `${c.off.city}'s offense is just ${ordinal(c.offRank)} in scoring, and it's running into a ${c.def.city} defense that's ${ordinal(c.defRank)} in points allowed. Buckets could be hard to come by.`);
      say('hottake', `${c.def.city} is gonna turn this into a rock fight, and I'm HERE for it. Grit and loose balls, baby.`);
    } else {
      say('stats', `Here's how they stack up. ${home.city} is ${ordinal(home.ranks.ppg)} in scoring and ${ordinal(home.ranks.papg)} on defense; ${away.city} is ${ordinal(away.ranks.ppg)} and ${ordinal(away.ranks.papg)}.`);
      say('hottake', `Numbers are numbers, Marcus. Games like this come down to one guy making one shot.`);
    }
  } else {
    say('stats', `No stats to lean on yet, so I'm looking at the roster — ${fav.city}'s top eight grades out about ${Math.max(1, Math.round(edge))} point${Math.round(edge) === 1 ? '' : 's'} better, home court included.`);
  }

  // 4) X-factor (a second option), then injuries.
  const xTeam = rng() < 0.5 ? dog : fav;
  const x = xTeam.stars[1];
  if (x) {
    if (ex[ex.length - 1]?.speakerId === 'hottake') say('stats', pick([`Alright Tony, who's your X-factor?`, `Give me one name, Tony. Who swings this one?`], rng));
    say('hottake', x.statLine
      ? `My X-factor? ${x.name}. ${x.statLine.replace(/^./, ch => ch.toUpperCase())}. Everybody's keyed on the star — he's the one who BEATS you.`
      : `My X-factor is ${x.name}. Nobody's talking about him yet. They will be after tonight.`);
  }
  const hurt = [...home.injuries.map(s => ({ s, t: home })), ...away.injuries.map(s => ({ s, t: away }))];
  if (hurt.length) {
    const h = hurt[0];
    say('stats', `One note on the injury report: ${h.t.city} is without ${h.s}. That shortens the rotation more than people think.`);
  }

  // 5) Picks — Marcus goes with the numbers, Tony sometimes rides the underdog.
  const statsScore = predictScore(fav, dog, Math.max(3, edge * 1.5), rng);
  const tonyUpset = edge < 3 ? rng() < 0.5 : rng() < 0.2;
  const tonyPick = tonyUpset ? dog : fav;
  const tonyOpp = tonyPick === fav ? dog : fav;
  const tonyScore = predictScore(tonyPick, tonyOpp, tonyUpset ? 2 + rng() * 5 : Math.max(8, edge * 2), rng);
  say('stats', edge < 2
    ? `This is close to a coin flip, but I'll take ${fav.city}. ${statsScore}.`
    : `The numbers point to ${fav.city}. I've got it ${statsScore}.`);
  say('hottake', tonyUpset
    ? `Not me! I'm calling the UPSET. ${tonyPick.city} walks out of there with a win — ${tonyScore}. Write it down!`
    : `For once I agree with the nerd. ${tonyPick.city}, and it won't be close — ${tonyScore}!`);

  return {
    headline: f.isPlayoff && f.playoffContext ? `${away.city} at ${home.city} — ${f.playoffContext.split(' — ')[0]}` : `${away.city} at ${home.city}`,
    exchanges: ex,
    picks: {
      stats: { abbr: fav.abbr, score: statsScore },
      hottake: { abbr: tonyPick.abbr, score: tonyScore },
    },
    source: 'template',
  };
}

/* ─── AI response validation (shared by route + client) ─── */

/** Coerce an untrusted LLM payload into a PregameShow, or null if unusable. */
export function parseAiPregame(raw: unknown, f: PregameFacts): PregameShow | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.exchanges)) return null;
  const exchanges: PregameExchange[] = o.exchanges
    .filter((e): e is { speakerId: PregameSpeakerId; text: string } =>
      !!e && typeof e === 'object'
      && ((e as { speakerId?: unknown }).speakerId === 'stats' || (e as { speakerId?: unknown }).speakerId === 'hottake')
      && typeof (e as { text?: unknown }).text === 'string' && (e as { text: string }).text.trim().length > 0)
    .slice(0, 16)
    .map(e => ({ speakerId: e.speakerId, text: e.text.trim().slice(0, 800) }));
  if (exchanges.length < 4) return null;

  const valid = new Set([f.home.abbr, f.away.abbr]);
  const picksIn = (o.picks ?? {}) as Record<string, { abbr?: unknown; score?: unknown } | undefined>;
  const fallback = generateTemplatedPregame(f).picks;
  const pickOf = (k: PregameSpeakerId) => {
    const p = picksIn[k];
    return p && typeof p.abbr === 'string' && valid.has(p.abbr) && typeof p.score === 'string'
      ? { abbr: p.abbr, score: p.score.slice(0, 40) }
      : fallback[k];
  };

  return {
    headline: typeof o.headline === 'string' && o.headline.trim() ? o.headline.trim().slice(0, 120) : `${f.away.city} at ${f.home.city}`,
    exchanges,
    picks: { stats: pickOf('stats'), hottake: pickOf('hottake') },
    source: 'ai',
  };
}

/** The show as host lines for the audio route (Marcus = stats, Tony = takes). */
export function pregameAudioLines(show: PregameShow): { speaker: 'marcus' | 'tony'; text: string }[] {
  return show.exchanges.map(e => ({ speaker: e.speakerId === 'stats' ? 'marcus' : 'tony', text: e.text }));
}
