/**
 * Pregame Show — Marcus Cole + Tony Blaze break down a matchup before kickoff.
 *
 * Two tiers share one fact sheet:
 *  - Free: `generateTemplatedPregame` fills canned banter from the facts.
 *    Deterministic (seeded by game id) so reopening shows the same show.
 *  - Premium: the client POSTs the same `PregameFacts` to /api/pregame, which
 *    has an LLM write the show. On any failure the client falls back to the
 *    template, so the show always renders.
 *
 * `buildPregameFacts` is the only place that reads rosters/teams — the facts
 * are compact and JSON-safe so they double as the LLM prompt + cache key.
 */

import type { Player, Team, Position } from '@/types';
import type { DebateExchange } from './debate';
import { buildMatchupMetrics, rankForMetric } from './matchupRanks';
import { meanStarterOvr } from './simTelemetry';

/* ─── Types ─── */

export interface PregamePlayerFact {
  name: string;
  position: Position;
  ovr: number;
  /** Season stat line, or null before the player has any production. */
  statLine: string | null;
}

export interface PregameTeamFacts {
  id: string;
  city: string;
  name: string;
  abbr: string;
  record: string;
  wins: number;
  losses: number;
  /** Positive = win streak, negative = losing streak. */
  streak: number;
  gamesPlayed: number;
  ppg: number;
  papg: number;
  /** Mean OVR of the top 22 players (same measure as sim telemetry). */
  starterOvr: number;
  /** League ranks (1 = best); null before any games are played. */
  ranks: { ppg: number; passYpg: number; rushYpg: number; ptsAllowed: number } | null;
  qb: PregamePlayerFact | null;
  /** Top non-QB offensive weapon (RB/WR/TE). */
  weapon: PregamePlayerFact | null;
  /** Top defender. */
  defender: PregamePlayerFact | null;
  /** Injured starters-quality players ("Name (POS)"). */
  injuries: string[];
}

export interface PregameFacts {
  gameId: string;
  season: number;
  week: number;
  isPlayoff: boolean;
  leagueSize: number;
  home: PregameTeamFacts;
  away: PregameTeamFacts;
  /** Home starterOvr minus away starterOvr, plus ~1.5 for home field. */
  homeEdge: number;
}

export interface PregameShow {
  headline: string;
  exchanges: DebateExchange[];
  /** Each analyst's pick (team abbreviation) + predicted score line. */
  picks: { stats: { abbr: string; score: string }; hottake: { abbr: string; score: string } };
  source: 'template' | 'ai';
}

/* ─── Fact sheet ─── */

const HOME_FIELD_OVR = 1.5;
const WEAPON_POS: Position[] = ['RB', 'WR', 'TE'];
const DEF_POS: Position[] = ['DL', 'LB', 'CB', 'S'];

function fullName(p: Player): string {
  return `${p.firstName} ${p.lastName}`;
}

function qbLine(p: Player): string | null {
  const s = p.stats;
  if (!s || !(s.passAttempts > 0)) return null;
  return `${s.passYards} passing yards, ${s.passTDs} TD, ${s.interceptions} INT`;
}

function weaponLine(p: Player): string | null {
  const s = p.stats;
  if (!s) return null;
  if (p.position === 'RB' && s.rushAttempts > 0) return `${s.rushYards} rushing yards, ${s.rushTDs} TD`;
  if (s.receptions > 0) return `${s.receptions} catches, ${s.receivingYards} yards, ${s.receivingTDs} TD`;
  return null;
}

function defenderLine(p: Player): string | null {
  const s = p.stats;
  if (!s) return null;
  const parts: string[] = [];
  if (s.tackles > 0) parts.push(`${s.tackles} tkl`);
  if (s.sacks > 0) parts.push(`${s.sacks} sacks`);
  if (s.defensiveINTs > 0) parts.push(`${s.defensiveINTs} INT`);
  return parts.length ? parts.join(', ') : null;
}

function fact(p: Player | undefined, line: (p: Player) => string | null): PregamePlayerFact | null {
  if (!p) return null;
  return { name: fullName(p), position: p.position, ovr: p.ratings.overall, statLine: line(p) };
}

/** Starter at a position: the depth chart's first healthy player, else best healthy by OVR. */
function starterAt(team: Team, roster: Player[], positions: Position[]): Player | undefined {
  const healthy = roster.filter(p => positions.includes(p.position) && !p.injury);
  for (const pos of positions) {
    const first = team.depthChart?.[pos]?.map(id => healthy.find(p => p.id === id)).find(Boolean);
    if (first) return first;
  }
  return [...healthy].sort((a, b) => b.ratings.overall - a.ratings.overall)[0];
}

function weaponScore(p: Player): number {
  const s = p.stats;
  const yds = (s?.rushYards ?? 0) + (s?.receivingYards ?? 0);
  const tds = (s?.rushTDs ?? 0) + (s?.receivingTDs ?? 0);
  return yds + tds * 60 + p.ratings.overall; // OVR breaks ties before any games
}

function defenderScore(p: Player): number {
  const s = p.stats;
  return (s?.sacks ?? 0) * 25 + (s?.defensiveINTs ?? 0) * 30 + (s?.tackles ?? 0) * 2 + p.ratings.overall;
}

function teamFacts(
  team: Team,
  roster: Player[],
  teams: Team[],
  metrics: ReturnType<typeof buildMatchupMetrics>,
): PregameTeamFacts {
  const r = team.record;
  const gp = r.wins + r.losses + r.ties;
  const healthy = roster.filter(p => !p.injury);
  const m = (key: string) => metrics.find(x => x.key === key)!;
  const ranks = gp > 0 ? {
    ppg: rankForMetric(team, m('ppg'), teams),
    passYpg: rankForMetric(team, m('passypg'), teams),
    rushYpg: rankForMetric(team, m('rushypg'), teams),
    ptsAllowed: rankForMetric(team, m('pa'), teams),
  } : null;

  const weapon = [...healthy.filter(p => WEAPON_POS.includes(p.position))]
    .sort((a, b) => weaponScore(b) - weaponScore(a))[0];
  const defender = [...healthy.filter(p => DEF_POS.includes(p.position))]
    .sort((a, b) => defenderScore(b) - defenderScore(a))[0];

  // Only mention injuries to players good enough that fans would notice.
  const injuries = roster
    .filter(p => p.injury && p.ratings.overall >= 70)
    .sort((a, b) => b.ratings.overall - a.ratings.overall)
    .slice(0, 3)
    .map(p => `${fullName(p)} (${p.position})`);

  return {
    id: team.id,
    city: team.city,
    name: team.name,
    abbr: team.abbreviation,
    record: r.ties > 0 ? `${r.wins}-${r.losses}-${r.ties}` : `${r.wins}-${r.losses}`,
    wins: r.wins,
    losses: r.losses,
    streak: r.streak,
    gamesPlayed: gp,
    ppg: gp > 0 ? Math.round((r.pointsFor / gp) * 10) / 10 : 0,
    papg: gp > 0 ? Math.round((r.pointsAgainst / gp) * 10) / 10 : 0,
    starterOvr: meanStarterOvr(healthy),
    ranks,
    qb: fact(starterAt(team, roster, ['QB']), qbLine),
    weapon: fact(weapon, weaponLine),
    defender: fact(defender, defenderLine),
    injuries,
  };
}

export function buildPregameFacts(args: {
  gameId: string;
  season: number;
  week: number;
  isPlayoff: boolean;
  homeTeam: Team;
  awayTeam: Team;
  homePlayers: Player[];
  awayPlayers: Player[];
  /** Whole league, for ranks. */
  teams: Team[];
  players: Player[];
}): PregameFacts {
  const metrics = buildMatchupMetrics(args.players);
  const home = teamFacts(args.homeTeam, args.homePlayers, args.teams, metrics);
  const away = teamFacts(args.awayTeam, args.awayPlayers, args.teams, metrics);
  return {
    gameId: args.gameId,
    season: args.season,
    week: args.week,
    isPlayoff: args.isPlayoff,
    leagueSize: args.teams.length,
    home,
    away,
    homeEdge: Math.round((home.starterOvr - away.starterOvr + HOME_FIELD_OVR) * 10) / 10,
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
function scoreLine(winner: PregameTeamFacts, loser: PregameTeamFacts, margin: number, rng: () => number): string {
  const base = winner.gamesPlayed > 0 ? Math.round((winner.ppg + loser.papg) / 2) : 20 + Math.floor(rng() * 8);
  const w = Math.max(base, 10) + Math.floor(rng() * 4);
  const l = Math.max(3, w - Math.max(1, Math.round(margin)));
  return `${winner.abbr} ${w}, ${loser.abbr} ${l}`;
}

function roundLabel(week: number): string {
  if (week === 101) return 'Wild Card weekend';
  if (week === 102) return 'the Divisional Round';
  if (week === 103) return 'the Conference Championship';
  if (week === 104) return 'the Championship Game';
  return 'the playoffs';
}

export function generateTemplatedPregame(f: PregameFacts): PregameShow {
  const rng = seededRandom(hashSeed(f.gameId));
  const { home, away } = f;
  const ex: DebateExchange[] = [];
  const say = (speakerId: 'stats' | 'hottake', text: string) => ex.push({ speakerId, text });

  const fav = f.homeEdge >= 0 ? home : away;
  const dog = fav === home ? away : home;
  const edge = Math.abs(f.homeEdge);
  const noGames = home.gamesPlayed === 0 && away.gamesPlayed === 0;

  // 1) Open
  const stage = f.isPlayoff ? roundLabel(f.week) : `Week ${f.week}`;
  say('stats', pick([
    `Welcome in, everybody. ${stage}, and we've got ${away.city} (${away.record}) visiting ${home.city} (${home.record}). Tony, there's a lot to unpack here.`,
    `Good to be with you. It's ${stage} — the ${away.name} (${away.record}) head into ${home.city} to face the ${home.name} (${home.record}).`,
    `${stage} is here. ${away.city} comes in ${away.record}, ${home.city} sits at ${home.record}, and the numbers tell an interesting story.`,
  ], rng));
  if (f.isPlayoff) {
    say('hottake', pick([
      `Win or go HOME, Marcus! Nobody cares about the regular season anymore. This is where legends are MADE.`,
      `Playoff football, baby! Throw the records out the window — it's about who WANTS it more tonight.`,
    ], rng));
  } else if (Math.abs(home.streak) >= 3 || Math.abs(away.streak) >= 3) {
    const hot = Math.abs(home.streak) >= Math.abs(away.streak) ? home : away;
    say('hottake', hot.streak > 0
      ? `${hot.city} has won ${hot.streak} STRAIGHT! You can't teach momentum, Marcus. That locker room believes right now.`
      : `${hot.city} has dropped ${-hot.streak} in a row. Somebody needs to stand up in that building, or this season is SLIPPING away.`);
  } else if (noGames) {
    say('hottake', `Clean slate, Marcus! Zero-and-zero, everybody's a contender, and I've been waiting ALL offseason for this.`);
  } else {
    say('hottake', pick([
      `I've been circling this one on my calendar ALL week. Somebody's making a statement today.`,
      `Forget the records — this one's about who shows up. And I've got a FEELING about it.`,
    ], rng));
  }

  // 2) QB duel
  const hq = home.qb, aq = away.qb;
  if (hq && aq) {
    if (hq.statLine && aq.statLine) {
      say('stats', `Under center: ${aq.name} has ${aq.statLine} on the year. On the other side, ${hq.name} has ${hq.statLine}.`);
    } else {
      say('stats', `The quarterback matchup: ${aq.name}, rated ${aq.ovr}, against ${hq.name} at ${hq.ovr}. On paper, that's ${aq.ovr === hq.ovr ? 'dead even' : `an edge to ${aq.ovr > hq.ovr ? away.city : home.city}`}.`);
    }
    const better = hq.ovr >= aq.ovr ? hq : aq;
    const worse = better === hq ? aq : hq;
    say('hottake', pick([
      `Give me ${better.name} in a big spot every day of the week. ${worse.name} has to play the game of his LIFE to keep up.`,
      `${worse.name} better be ready, because ${better.name} is gonna make him look like a backup today. I said what I said.`,
      `Quarterback play wins in this league, and ${better.name} is the best player on this field. Period.`,
    ], rng));
  }

  // 3) Key matchup: best offense-vs-defense rank clash
  if (home.ranks && away.ranks) {
    const n = f.leagueSize;
    type Clash = { off: PregameTeamFacts; def: PregameTeamFacts; offRank: number; defRank: number; label: string };
    const clashes: Clash[] = [
      { off: home, def: away, offRank: home.ranks.passYpg, defRank: away.ranks.ptsAllowed, label: 'passing attack' },
      { off: home, def: away, offRank: home.ranks.rushYpg, defRank: away.ranks.ptsAllowed, label: 'ground game' },
      { off: away, def: home, offRank: away.ranks.passYpg, defRank: home.ranks.ptsAllowed, label: 'passing attack' },
      { off: away, def: home, offRank: away.ranks.rushYpg, defRank: home.ranks.ptsAllowed, label: 'ground game' },
    ];
    // The most lopsided (strength vs weakness) clash is the story.
    const c = clashes.sort((a, b) => Math.abs(b.offRank - b.defRank) - Math.abs(a.offRank - a.defRank))[0];
    const offStrong = c.offRank <= n / 3;
    const defWeak = c.defRank > (2 * n) / 3;
    if (offStrong && defWeak) {
      say('stats', `Here's the matchup I keep coming back to: ${c.off.city}'s ${c.label} ranks ${ordinal(c.offRank)} in the league, and ${c.def.city} is ${ordinal(c.defRank)} in points allowed. That's a real mismatch.`);
      say('hottake', `That's a DISASTER waiting to happen for ${c.def.city}! If they don't fix it by the second quarter, it's over.`);
    } else if (c.offRank > (2 * n) / 3 && c.defRank <= n / 3) {
      say('stats', `${c.off.city}'s ${c.label} ranks just ${ordinal(c.offRank)}, and they're running into a ${c.def.city} defense that's ${ordinal(c.defRank)} in points allowed. Points could be scarce.`);
      say('hottake', `${c.def.city}'s defense is gonna FEAST. I'd be nervous if I'm calling plays for ${c.off.city}.`);
    } else {
      say('stats', `Statistically this is tight. ${home.city} is ${ordinal(home.ranks.ppg)} in scoring and ${ordinal(home.ranks.ptsAllowed)} in points allowed; ${away.city} is ${ordinal(away.ranks.ppg)} and ${ordinal(away.ranks.ptsAllowed)}.`);
      say('hottake', `Numbers are numbers, Marcus. Tight games come down to one guy making one play.`);
    }
  } else {
    say('stats', `No stats to lean on yet, so I'm looking at roster talent — ${fav.city} grades out about ${Math.max(1, Math.round(edge))} point${Math.round(edge) === 1 ? '' : 's'} better across the starting lineup.`);
  }

  // 4) X-factor + injuries
  const xTeam = rng() < 0.5 ? dog : fav;
  const x = xTeam.weapon ?? xTeam.defender;
  if (x) {
    if (ex[ex.length - 1]?.speakerId === 'hottake') say('stats', pick([`Alright Tony, who's your X-factor?`, `Give me one name, Tony. Who swings this game?`], rng));
    say('hottake', x.statLine
      ? `My X-factor? ${x.name}. ${x.statLine} this year, and he's due for a MONSTER game.`
      : `My X-factor is ${x.name}. ${x.ovr} overall and nobody's talking about him. They will be after today.`);
  }
  const hurt = [...home.injuries.map(s => ({ s, t: home })), ...away.injuries.map(s => ({ s, t: away }))];
  if (hurt.length) {
    const h = hurt[0];
    say('stats', `One note on the injury report: ${h.t.city} is without ${h.s}. That changes the plan more than people think.`);
  } else if (fav.defender) {
    const d = fav.defender;
    say('stats', `Keep an eye on ${d.name} on the ${fav.city} defense${d.statLine ? ` — ${d.statLine} so far` : ''}. He can wreck a game plan.`);
  }

  // 5) Picks — Marcus goes with the numbers, Tony sometimes rides the underdog.
  const statsScore = scoreLine(fav, dog, Math.max(3, edge * 1.5), rng);
  const tonyUpset = edge < 4 ? rng() < 0.5 : rng() < 0.2;
  const tonyPick = tonyUpset ? dog : fav;
  const tonyOpp = tonyPick === fav ? dog : fav;
  const tonyScore = scoreLine(tonyPick, tonyOpp, tonyUpset ? 3 + rng() * 4 : Math.max(7, edge * 2), rng);
  say('stats', edge < 2
    ? `This is close to a coin flip, but I'll take ${fav.city}. ${statsScore}.`
    : `The numbers point to ${fav.city}. I've got it ${statsScore}.`);
  say('hottake', tonyUpset
    ? `Not me! I'm going UPSET. ${tonyPick.city} walks out of there with a win — ${tonyScore}. Write it down!`
    : `For once I agree with the nerd. ${tonyPick.city}, and it won't be close — ${tonyScore}!`);

  const headline = f.isPlayoff
    ? `${away.city} at ${home.city} — ${roundLabel(f.week).replace(/^the /, '').replace(/^./, c => c.toUpperCase())}`
    : `${away.city} at ${home.city}`;

  return {
    headline,
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
  const exchanges: DebateExchange[] = o.exchanges
    .filter((e): e is { speakerId: string; text: string } =>
      !!e && typeof e === 'object'
      && ((e as { speakerId?: unknown }).speakerId === 'stats' || (e as { speakerId?: unknown }).speakerId === 'hottake')
      && typeof (e as { text?: unknown }).text === 'string' && (e as { text: string }).text.trim().length > 0)
    .slice(0, 16)
    .map(e => ({ speakerId: e.speakerId as 'stats' | 'hottake', text: e.text.trim().slice(0, 800) }));
  if (exchanges.length < 4) return null;

  const valid = new Set([f.home.abbr, f.away.abbr]);
  const picksIn = (o.picks ?? {}) as Record<string, { abbr?: unknown; score?: unknown } | undefined>;
  const fallback = generateTemplatedPregame(f).picks;
  const pickOf = (k: 'stats' | 'hottake') => {
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
