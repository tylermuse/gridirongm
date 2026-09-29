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
  /** Games this player has appeared in this season. */
  games: number;
  /** Full season stat line in broadcast prose, or null before any production. */
  statLine: string | null;
  /** Short headline stat ("1,640 passing yards"), or null before any production. */
  headline: string | null;
  /** League rank in the headline stat among all players (1 = best), when top 15. */
  leagueRank: number | null;
  /** Raw + derived season numbers (for the LLM and template comparisons). */
  season: Record<string, number>;
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
  /** Lead rusher (RB). */
  rusher: PregamePlayerFact | null;
  /** Lead pass-catcher (WR/TE). */
  receiver: PregamePlayerFact | null;
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
const RECEIVER_POS: Position[] = ['WR', 'TE'];
const DEF_POS: Position[] = ['DL', 'LB', 'CB', 'S'];
const RANK_CUTOFF = 15;

function fullName(p: Player): string {
  return `${p.firstName} ${p.lastName}`;
}

const num = (n: number) => Math.round(n).toLocaleString('en-US');
const one = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** NFL passer rating (0–158.3). */
export function passerRating(cmp: number, att: number, yds: number, td: number, int: number): number {
  if (att <= 0) return 0;
  const c = (x: number) => Math.max(0, Math.min(2.375, x));
  const a = c((cmp / att - 0.3) * 5);
  const b = c((yds / att - 3) * 0.25);
  const t = c((td / att) * 20);
  const i = c(2.375 - (int / att) * 25);
  return Math.round(((a + b + t + i) / 6) * 1000) / 10;
}

type Line = { statLine: string; headline: string; season: Record<string, number> } | null;

function qbLine(p: Player): Line {
  const s = p.stats;
  if (!s || !(s.passAttempts > 0)) return null;
  const g = Math.max(1, s.gamesPlayed ?? 1);
  const pct = (s.passCompletions / s.passAttempts) * 100;
  const ypa = s.passYards / s.passAttempts;
  const rating = passerRating(s.passCompletions, s.passAttempts, s.passYards, s.passTDs, s.interceptions);
  let statLine = `${s.passCompletions}-of-${s.passAttempts} (${one(pct)}%) for ${num(s.passYards)} yards — ${num(s.passYards / g)} a game at ${one(ypa)} yards per attempt — with ${plural(s.passTDs, 'touchdown')}, ${plural(s.interceptions, 'interception')} and a ${one(rating)} passer rating`;
  if (s.rushYards >= 100) statLine += `, plus ${num(s.rushYards)} yards on the ground`;
  return {
    statLine,
    headline: `${num(s.passYards)} passing yards`,
    season: {
      games: g, completions: s.passCompletions, attempts: s.passAttempts, compPct: Math.round(pct * 10) / 10,
      passYards: s.passYards, passYardsPerGame: Math.round(s.passYards / g), yardsPerAttempt: Math.round(ypa * 10) / 10,
      passTDs: s.passTDs, interceptions: s.interceptions, passerRating: rating, rushYards: s.rushYards, rushTDs: s.rushTDs,
    },
  };
}

function rusherLine(p: Player): Line {
  const s = p.stats;
  if (!s || !(s.rushAttempts > 0)) return null;
  const g = Math.max(1, s.gamesPlayed ?? 1);
  const ypc = s.rushYards / s.rushAttempts;
  let statLine = `${s.rushAttempts} carries for ${num(s.rushYards)} yards — ${one(ypc)} a carry, ${num(s.rushYards / g)} a game — and ${plural(s.rushTDs, 'touchdown')}`;
  if (s.receptions > 0) statLine += `, plus ${plural(s.receptions, 'catch').replace('catchs', 'catches')} for ${num(s.receivingYards)} yards out of the backfield`;
  return {
    statLine,
    headline: `${num(s.rushYards)} rushing yards`,
    season: {
      games: g, carries: s.rushAttempts, rushYards: s.rushYards, yardsPerCarry: Math.round(ypc * 10) / 10,
      rushYardsPerGame: Math.round(s.rushYards / g), rushTDs: s.rushTDs, fumbles: s.fumbles ?? 0,
      receptions: s.receptions, receivingYards: s.receivingYards,
    },
  };
}

function receiverLine(p: Player): Line {
  const s = p.stats;
  if (!s || !(s.receptions > 0)) return null;
  const g = Math.max(1, s.gamesPlayed ?? 1);
  const ypr = s.receivingYards / s.receptions;
  const catchRate = s.targets > 0 ? (s.receptions / s.targets) * 100 : 0;
  const statLine = `${plural(s.receptions, 'catch').replace('catchs', 'catches')}${s.targets > 0 ? ` on ${s.targets} targets` : ''} for ${num(s.receivingYards)} yards — ${one(ypr)} a catch, ${num(s.receivingYards / g)} a game — and ${plural(s.receivingTDs, 'touchdown')}`;
  return {
    statLine,
    headline: `${num(s.receivingYards)} receiving yards`,
    season: {
      games: g, targets: s.targets, receptions: s.receptions, catchRatePct: Math.round(catchRate),
      receivingYards: s.receivingYards, yardsPerCatch: Math.round(ypr * 10) / 10,
      receivingYardsPerGame: Math.round(s.receivingYards / g), receivingTDs: s.receivingTDs,
    },
  };
}

function defenderLine(p: Player): Line {
  const s = p.stats;
  if (!s) return null;
  const parts: string[] = [];
  if (s.tackles > 0) parts.push(plural(s.tackles, 'tackle'));
  if (s.tacklesForLoss > 0) parts.push(`${s.tacklesForLoss} for loss`);
  if (s.sacks > 0) parts.push(`${s.sacks} sack${s.sacks === 1 ? '' : 's'}`);
  if (s.defensiveINTs > 0) parts.push(plural(s.defensiveINTs, 'interception'));
  if (s.passDeflections > 0) parts.push(`${s.passDeflections} passes defended`);
  if (s.forcedFumbles > 0) parts.push(`${s.forcedFumbles} forced fumble${s.forcedFumbles === 1 ? '' : 's'}`);
  if (!parts.length) return null;
  const statLine = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
  const headline = s.sacks >= 2 ? `${s.sacks} sacks` : s.defensiveINTs >= 2 ? plural(s.defensiveINTs, 'interception') : plural(s.tackles, 'tackle');
  return {
    statLine,
    headline,
    season: {
      games: Math.max(1, s.gamesPlayed ?? 1), tackles: s.tackles, tacklesForLoss: s.tacklesForLoss ?? 0, sacks: s.sacks,
      interceptions: s.defensiveINTs, passesDefended: s.passDeflections ?? 0, forcedFumbles: s.forcedFumbles ?? 0,
    },
  };
}

/** 1-based rank of `p` among `pool` by `stat`, or null outside the top RANK_CUTOFF / no production. */
function leagueRank(p: Player, pool: Player[], stat: (q: Player) => number): number | null {
  const mine = stat(p);
  if (!(mine > 0)) return null;
  const rank = pool.filter(q => q.id !== p.id && stat(q) > mine).length + 1;
  return rank <= RANK_CUTOFF ? rank : null;
}

function fact(p: Player | undefined, line: (p: Player) => Line, pool: Player[], stat: (q: Player) => number): PregamePlayerFact | null {
  if (!p) return null;
  const l = line(p);
  return {
    name: fullName(p),
    position: p.position,
    ovr: p.ratings.overall,
    games: p.stats?.gamesPlayed ?? 0,
    statLine: l?.statLine ?? null,
    headline: l?.headline ?? null,
    leagueRank: l ? leagueRank(p, pool, stat) : null,
    season: l?.season ?? {},
  };
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

/** Best healthy player at `positions` by a season stat (OVR breaks ties / week 1). */
function leaderAt(roster: Player[], positions: Position[], stat: (p: Player) => number): Player | undefined {
  return roster
    .filter(p => positions.includes(p.position) && !p.injury)
    .sort((a, b) => (stat(b) * 100 + b.ratings.overall) - (stat(a) * 100 + a.ratings.overall))[0];
}

const passYds = (p: Player) => p.stats?.passYards ?? 0;
const rushYds = (p: Player) => p.stats?.rushYards ?? 0;
const recYds = (p: Player) => p.stats?.receivingYards ?? 0;
const defImpact = (p: Player) => {
  const s = p.stats;
  return (s?.sacks ?? 0) * 12 + (s?.defensiveINTs ?? 0) * 15 + (s?.forcedFumbles ?? 0) * 10
    + (s?.tacklesForLoss ?? 0) * 3 + (s?.passDeflections ?? 0) * 2 + (s?.tackles ?? 0);
};

function teamFacts(
  team: Team,
  roster: Player[],
  teams: Team[],
  allPlayers: Player[],
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

  const defender = leaderAt(roster, DEF_POS, defImpact);
  const defStat = (q: Player) => (defender && (defender.stats?.sacks ?? 0) >= 2 ? (q.stats?.sacks ?? 0)
    : defender && (defender.stats?.defensiveINTs ?? 0) >= 2 ? (q.stats?.defensiveINTs ?? 0) : (q.stats?.tackles ?? 0));

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
    qb: fact(starterAt(team, roster, ['QB']), qbLine, allPlayers, passYds),
    rusher: fact(leaderAt(roster, ['RB'], rushYds), rusherLine, allPlayers, rushYds),
    receiver: fact(leaderAt(roster, RECEIVER_POS, recYds), receiverLine, allPlayers, recYds),
    defender: fact(defender, defenderLine, allPlayers, defStat),
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
  const home = teamFacts(args.homeTeam, args.homePlayers, args.teams, args.players, metrics);
  const away = teamFacts(args.awayTeam, args.awayPlayers, args.teams, args.players, metrics);
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

  // Player intro: the full season line when he has one; the rating only before any production.
  const rankTag = (p: PregamePlayerFact) =>
    p.leagueRank && p.headline ? ` That's ${p.leagueRank === 1 ? 'the most' : `${ordinal(p.leagueRank)} in the league in`} ${p.headline.replace(/^[\d,.]+ /, '')}${p.leagueRank === 1 ? ' in the league' : ''}.` : '';
  const intro = (p: PregamePlayerFact, city: string) => p.statLine
    ? `${city}'s ${p.name} is ${p.statLine} through ${plural(p.games, 'game')}.${rankTag(p)}`
    : `${city}'s ${p.name} hasn't put numbers on the board yet this season — he comes in rated ${p.ovr}.`;

  // 2) QB duel — a stat breakdown for each side, then Tony's verdict.
  const hq = home.qb, aq = away.qb;
  if (hq && aq) {
    say('stats', `Let's start under center. ${intro(aq, away.city)}`);
    say('stats', `On the other side, ${intro(hq, home.city)}`);
    const hr = hq.season.passerRating ?? 0, ar = aq.season.passerRating ?? 0;
    if (hq.statLine && aq.statLine) {
      const better = hr >= ar ? hq : aq;
      const worse = better === hq ? aq : hq;
      const bTd = better.season.passTDs, bInt = better.season.interceptions;
      const wTd = worse.season.passTDs, wInt = worse.season.interceptions;
      if (wInt > wTd) {
        say('hottake', `${worse.name} has thrown MORE picks than touchdowns — ${wInt} to ${wTd}! You can't win like that, Marcus. Meanwhile ${better.name} is sitting at ${bTd} to ${bInt}. That's the whole ballgame right there.`);
      } else if (Math.abs(hr - ar) < 6) {
        say('hottake', `A ${one(ar)} rating against a ${one(hr)}? That's a DEAD HEAT. This is a quarterback SHOOTOUT waiting to happen, and I want ${better.name} with the ball last.`);
      } else {
        say('hottake', pick([
          `A ${one(better.season.passerRating)} passer rating versus ${one(worse.season.passerRating)} — it's not close! ${better.name} is in a different ZIP code than ${worse.name} right now.`,
          `${better.name} has ${bTd} touchdowns at ${one(better.season.yardsPerAttempt)} yards a throw. ${worse.name} is dinking and dunking at ${one(worse.season.yardsPerAttempt)}. Give me the guy who PUSHES the ball downfield!`,
        ], rng));
      }
    } else {
      const better = hq.ovr >= aq.ovr ? hq : aq;
      say('hottake', `No stat sheet yet, so I'm going on gut — and my gut says ${better.name}. He's the most dangerous player on this field.`);
    }
  }

  // Ground game: the two lead backs.
  const hrb = home.rusher, arb = away.rusher;
  if (hrb?.statLine || arb?.statLine) {
    const lead = (hrb?.season.rushYards ?? 0) >= (arb?.season.rushYards ?? 0) ? { p: hrb!, t: home, o: arb, ot: away } : { p: arb!, t: away, o: hrb, ot: home };
    say('stats', `In the backfield: ${intro(lead.p, lead.t.city)}${lead.o?.statLine ? ` ${lead.ot.city} counters with ${lead.o.name} — ${lead.o.statLine}.` : ''}`);
    const ypc = lead.p.season.yardsPerCarry ?? 0;
    say('hottake', ypc >= 4.5
      ? `${one(ypc)} a carry! ${lead.p.name} is RIPPING off chunks. If ${lead.ot.city} can't set the edge, he's going for 150 today.`
      : `Volume over flash with ${lead.p.name}, and I LOVE it. You feed that man ${Math.max(15, Math.round((lead.p.season.carries ?? 0) / Math.max(1, lead.p.games)))} times and let him wear that defense DOWN.`);
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

  // 4) X-factor (a pass-catcher), the other side's top target, defense, injuries.
  const xTeam = rng() < 0.5 ? dog : fav;
  const oTeam = xTeam === fav ? dog : fav;
  const x = xTeam.receiver;
  if (x) {
    if (ex[ex.length - 1]?.speakerId === 'hottake') say('stats', pick([`Alright Tony, who's your X-factor?`, `Give me one name, Tony. Who swings this game?`], rng));
    say('hottake', x.statLine
      ? `My X-factor? ${x.name}. ${x.statLine.replace(/^./, c => c.toUpperCase())}.${x.leagueRank ? ` ${ordinal(x.leagueRank).toUpperCase()} in the league!` : ''} He's due for a MONSTER game.`
      : `My X-factor is ${x.name}. Nobody's talking about him yet. They will be after today.`);
    const o = oTeam.receiver;
    if (o?.statLine) {
      say('stats', `Don't sleep on ${oTeam.city}'s ${o.name} either — ${o.statLine}${o.season.catchRatePct ? `, catching ${o.season.catchRatePct}% of the balls thrown his way` : ''}.`);
    }
  }
  const defs = [home.defender, away.defender].filter((d): d is PregamePlayerFact => !!d?.statLine);
  if (defs.length) {
    const d = defs.sort((a, b) => (a.leagueRank ?? 99) - (b.leagueRank ?? 99))[0];
    const dTeam = d === home.defender ? home : away;
    say('stats', `Defensively, the name to know is ${dTeam.city}'s ${d.name}: ${d.statLine} in ${plural(d.games, 'game')}.${d.leagueRank && d.headline ? ` His ${d.headline.replace(/^[\d,.]+ /, '')} rank ${ordinal(d.leagueRank)} in the league.` : ''}`);
    if ((d.season.sacks ?? 0) >= 3) {
      say('hottake', `${d.name} lives in the backfield! ${d.season.sacks} sacks — somebody better chip him or it's gonna be a LONG day for the quarterback.`);
    }
  }
  const hurt = [...home.injuries.map(s => ({ s, t: home })), ...away.injuries.map(s => ({ s, t: away }))];
  if (hurt.length) {
    const h = hurt[0];
    say('stats', `One note on the injury report: ${h.t.city} is without ${h.s}. That changes the plan more than people think.`);
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
