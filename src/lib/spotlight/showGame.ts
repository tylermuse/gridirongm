/**
 * Team Spotlight video show — the postgame segment.
 *
 * The Spotlight's own topics are season storylines; after a game the show
 * should break that game down the way a real postgame show does: how it
 * was won (scoring flow, turning points), the standout stat lines on both
 * sides, the team numbers, and what's next. This builds those topics from
 * the box score so the writer has the facts to go deep. Pure (client-safe).
 */
import type { GameResult, Player, PlayerStats, PlayoffMatchup, ScoringPlay, Team } from '@/types';
import type { TileStat } from './playerStats';

/** A show topic built from a game: notes for the writer, plus what the
 *  graphics need (who's pictured, that game's numbers). */
export interface GameTopic {
  headline: string;
  icon: string;
  exchanges: { speakerId: string; text: string }[];
  teamIds?: string[];
  playerIds?: string[];
  /** Tell the writer to spend real time here. */
  depth?: 'deep';
  /** Per-player stat lines for this game (player id → tiles). */
  gameLines?: Record<string, TileStat[]>;
  /** Team box-score tiles for this game. */
  gameTeam?: TileStat[];
  /** The same box score as a side-by-side: us (left) vs them (right). */
  gameCompare?: GameCompare;
  /** Short label for the tiles ("Wild Card · NE vs BUF"). */
  gameLabel?: string;
  /** Every score in order, for the game-flow graphic (key moments). */
  gameFlow?: GameFlow;
}

/** One score, from the user team's side: `us`/`them` is the score after it. */
export interface FlowPlay {
  /** 1-based, the number the writer uses to point at it. */
  n: number;
  quarter: number;
  timeLeft?: string;
  /** Minutes into the game (for the chart's x axis). */
  at: number;
  ours: boolean;
  points: number;
  kind: 'td' | 'fg' | 'safety' | 'other';
  description: string;
  us: number;
  them: number;
  /** What it did to the game. */
  swing: 'go-ahead' | 'ties' | 'extends' | 'cuts' | 'opens';
  /** The players in it (scorer first), when the description names them. */
  playerIds: string[];
  /** Clean caption ("Prescott to Lamb · 34-yd TD pass"). */
  title: string;
}

export interface GameFlow {
  us: { teamId: string; abbreviation: string; color: string };
  them: { teamId: string; abbreviation: string; color: string };
  plays: FlowPlay[];
  /** Quarters played (5 with overtime). */
  quarters: number;
  /** The play that left them furthest behind (null if they never trailed). */
  lowPoint: number | null;
  /** The play that put them furthest ahead. */
  highPoint: number | null;
}

export interface GameCompare {
  left: { teamId: string; abbreviation: string };
  right: { teamId: string; abbreviation: string };
  rows: { key: string; label: string; left: string; right: string; /** Which side won the row (lower is better for turnovers). */ edge: 'left' | 'right' | null }[];
}

const ROUND = ['', 'Wild Card', 'Divisional Round', 'Conference Championship', 'Championship'];

type S = Partial<PlayerStats>;
const n = (v: number | undefined) => v ?? 0;
const name = (p: Player) => `${p.firstName} ${p.lastName}`;

function lastGame(teamId: string, season: number, schedule: GameResult[], bracket?: PlayoffMatchup[] | null): { game: GameResult; round: number } | null {
  const mine = (g: { homeTeamId: string | null; awayTeamId: string | null }) => g.homeTeamId === teamId || g.awayTeamId === teamId;
  const playoff = (bracket ?? []).filter(m => m.winnerId && mine(m)).sort((a, b) => b.round - a.round);
  for (const m of playoff) {
    const g = schedule.find(x => x.id === m.id && x.played);
    if (g) return { game: g, round: m.round };
  }
  const reg = schedule.filter(g => g.played && g.season === season && mine(g) && g.week < 99).sort((a, b) => b.week - a.week)[0];
  return reg ? { game: reg, round: 0 } : null;
}

/** One line per notable player, in plain stats. */
function statLine(p: Player, s: S): string | null {
  const parts: string[] = [];
  if (n(s.passAttempts) >= 5) parts.push(`${n(s.passCompletions)} of ${n(s.passAttempts)} for ${n(s.passYards)} yards, ${n(s.passTDs)} TD, ${n(s.interceptions)} INT`);
  if (n(s.rushAttempts) >= 5 || n(s.rushTDs)) parts.push(`${n(s.rushAttempts)} carries for ${n(s.rushYards)} yards${n(s.rushTDs) ? `, ${n(s.rushTDs)} rushing TD` : ''}`);
  if (n(s.receptions) >= 3 || n(s.receivingTDs)) parts.push(`${n(s.receptions)} catches for ${n(s.receivingYards)} yards${n(s.receivingTDs) ? `, ${n(s.receivingTDs)} TD` : ''}`);
  const def: string[] = [];
  if (n(s.sacks)) def.push(`${n(s.sacks)} sack${n(s.sacks) === 1 ? '' : 's'}`);
  if (n(s.defensiveINTs)) def.push(`${n(s.defensiveINTs)} INT`);
  if (n(s.forcedFumbles)) def.push(`${n(s.forcedFumbles)} forced fumble`);
  if (n(s.tacklesForLoss) >= 2) def.push(`${n(s.tacklesForLoss)} tackles for loss`);
  if (def.length || n(s.tackles) >= 8) parts.push([`${n(s.tackles)} tackles`, ...def].join(', '));
  if (n(s.fieldGoalAttempts) >= 2) parts.push(`${n(s.fieldGoalsMade)} of ${n(s.fieldGoalAttempts)} field goals`);
  if (n(s.fumbles)) parts.push(`${n(s.fumbles)} fumble${n(s.fumbles) === 1 ? '' : 's'}`);
  return parts.length ? `${name(p)} (${p.position}): ${parts.join('; ')}` : null;
}

/** How much a stat line mattered (to pick each side's standouts). */
function impact(s: S): number {
  return n(s.passYards) / 25 + n(s.passTDs) * 4 - n(s.interceptions) * 3
    + n(s.rushYards) / 10 + n(s.rushTDs) * 6 + n(s.receivingYards) / 10 + n(s.receivingTDs) * 6
    + n(s.sacks) * 4 + n(s.defensiveINTs) * 5 + n(s.forcedFumbles) * 3 + n(s.tacklesForLoss) * 1.5 + n(s.tackles) * 0.3
    + n(s.fieldGoalsMade) * 1.5 - n(s.fumbles) * 3;
}

/** Tiles for one player's game: the numbers that matter for his position. */
function gameTiles(p: Player, s: S): TileStat[] {
  const t = (key: string, label: string, value: string | number): TileStat => ({ key, label, value: String(value), rank: 0, of: 0, note: 'This game' });
  switch (p.position) {
    case 'QB': return [t('cmp', 'CMP / ATT', `${n(s.passCompletions)}/${n(s.passAttempts)}`), t('passYds', 'Pass YDS', n(s.passYards)), t('passTd', 'Pass TD', n(s.passTDs)), t('int', 'INT', n(s.interceptions)), t('rushYds', 'Rush YDS', n(s.rushYards))];
    case 'RB': return [t('rushAtt', 'Carries', n(s.rushAttempts)), t('rushYds', 'Rush YDS', n(s.rushYards)), t('ypc', 'YDS / Carry', n(s.rushAttempts) ? (n(s.rushYards) / n(s.rushAttempts)).toFixed(1) : '0.0'), t('rushTd', 'Rush TD', n(s.rushTDs)), t('recYds', 'Rec YDS', n(s.receivingYards))];
    case 'WR': case 'TE': return [t('rec', 'Catches', n(s.receptions)), t('tgt', 'Targets', n(s.targets)), t('recYds', 'Rec YDS', n(s.receivingYards)), t('recTd', 'Rec TD', n(s.receivingTDs))];
    case 'K': return [t('fg', 'FG', `${n(s.fieldGoalsMade)}/${n(s.fieldGoalAttempts)}`), t('xp', 'XP', `${n(s.extraPointsMade)}/${n(s.extraPointAttempts)}`)];
    default: return [t('tackles', 'Tackles', n(s.tackles)), t('sacks', 'Sacks', n(s.sacks)), t('tfl', 'TFL', n(s.tacklesForLoss)), t('defInt', 'INT', n(s.defensiveINTs)), t('ff', 'Forced Fum', n(s.forcedFumbles))];
  }
}

function teamTotals(g: GameResult, teamId: string, players: Player[]) {
  const tot = { pass: 0, rush: 0, ints: 0, fum: 0, sacks: 0, sacked: 0 };
  for (const [id, s] of Object.entries(g.playerStats)) {
    const p = players.find(x => x.id === id);
    if (!p || p.teamId !== teamId) continue;
    tot.pass += n(s.passYards); tot.rush += n(s.rushYards); tot.ints += n(s.interceptions);
    tot.fum += n(s.fumbles); tot.sacks += n(s.sacks); tot.sacked += n(s.sacksAllowed);
  }
  return tot;
}

const clockMin = (t?: string) => {
  const m = /^(\d+):(\d{2})$/.exec(t ?? '');
  return m ? Number(m[1]) + Number(m[2]) / 60 : null;
};

/** "D. Prescott 34 yd pass to C. Lamb" → the players it names, scorer first
 *  (the receiver on a pass). */
function playersIn(desc: string, pool: Player[]): string[] {
  const out: string[] = [];
  const re = /\b([A-Z])\. ([A-Z][A-Za-z'.-]+(?: (?:Jr\.|Sr\.|II|III|IV))?)/g;
  for (const m of desc.matchAll(re)) {
    const p = pool.find(x => x.firstName.startsWith(m[1]) && x.lastName === m[2])
      ?? pool.find(x => x.lastName === m[2]);
    if (p && !out.includes(p.id)) out.push(p.id);
  }
  // A pass: the receiver scored (the quarterback is named first).
  if (out.length === 2 && pool.find(x => x.id === out[0])?.position === 'QB') out.reverse();
  return out;
}

/** A clean caption for a score, whatever wrote the description (the sim's
 *  "D. Prescott 34 yd pass to C. Lamb" or the live feed's "TOUCHDOWN! D.
 *  Prescott QB hits C. Lamb WR for the 34-yard score!"):
 *  "Prescott to Lamb · 34-yd TD pass". */
export function playTitle(desc: string, kind: FlowPlay['kind'], ids: string[], pool: Player[]): string {
  const last = (id: string) => pool.find(x => x.id === id)?.lastName ?? '';
  const yds = /(\d+)[- ]?(?:yd|yard)/i.exec(desc)?.[1];
  const y = yds ? `${yds}-yd ` : '';
  const [scorer, other] = ids;
  if (kind === 'fg') return scorer ? `${last(scorer)} · ${y}field goal` : `${y}field goal`;
  if (kind === 'safety') return 'Safety';
  if (kind === 'td') {
    if (scorer && other) return `${last(other)} to ${last(scorer)} · ${y}TD pass`;
    if (scorer) return /\b(pass|catch|grab|hauls|hits|throw)/i.test(desc) ? `${last(scorer)} · ${y}TD catch` : `${last(scorer)} · ${y}TD run`;
    return `${y}touchdown`;
  }
  return desc.replace(/[^\p{L}\p{N}\s.,'—-]/gu, '').replace(/\s+/g, ' ').trim();
}

function colorDistance(a: string, b: string): number {
  const rgb = (h: string) => {
    const x = (h ?? '').replace('#', '');
    const f = x.length === 3 ? x.split('').map(c => c + c).join('') : x;
    return [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16) || 0);
  };
  const [p, q] = [rgb(a), rgb(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** The game's scores as a flow, from the user team's side. */
export function gameFlowOf(g: GameResult, team: Team, opp: Team, players: Player[]): GameFlow | null {
  // A live game logs the extra point (or two-point try) as its own score:
  // fold it into the touchdown before it.
  const sps: ScoringPlay[] = [];
  for (const sp of g.scoringPlays ?? []) {
    const prev = sps[sps.length - 1];
    if (prev && sp.points <= 2 && !/safety/i.test(sp.description) && prev.teamId === sp.teamId && prev.points >= 6) {
      sps[sps.length - 1] = { ...prev, points: prev.points + sp.points, score: sp.score };
    } else sps.push(sp);
  }
  if (!sps.length) return null;
  const home = g.homeTeamId === team.id;
  const pool = players.filter(p => p.teamId === team.id || p.teamId === opp.id);
  let lastAt = 0;
  let prevUs = 0, prevThem = 0;
  let low = 0, lowN: number | null = null, high = 0, highN: number | null = null;
  const plays: FlowPlay[] = sps.map((sp, i) => {
    const us = home ? sp.score[1] : sp.score[0];
    const them = home ? sp.score[0] : sp.score[1];
    const ours = sp.teamId === team.id;
    const len = sp.quarter <= 4 ? 15 : 10;
    const left = clockMin(sp.timeLeft);
    // Clock times are approximate: keep them in order within the game.
    const at = Math.max(lastAt, (Math.min(sp.quarter, 5) - 1) * 15 + (left == null ? len / 2 : len - Math.min(len, left)));
    lastAt = at;
    const before = prevUs - prevThem, after = us - them;
    const swing: FlowPlay['swing'] = after === 0 ? 'ties'
      : before === 0 ? (i === 0 ? 'opens' : 'go-ahead')
        : Math.sign(before) !== Math.sign(after) ? 'go-ahead'
          : Math.abs(after) > Math.abs(before) ? 'extends' : 'cuts';
    prevUs = us; prevThem = them;
    if (after < low) { low = after; lowN = i + 1; }
    if (after > high) { high = after; highN = i + 1; }
    const kind: FlowPlay['kind'] = /safety/i.test(sp.description) ? 'safety'
      : /field goal/i.test(sp.description) ? 'fg'
        : /touchdown|\byd (pass|rush)\b|XP/i.test(sp.description) || sp.points >= 6 ? 'td' : 'other';
    const playerIds = playersIn(sp.description, pool);
    const description = sp.description.replace(/\s*\((XP good|XP missed)\)/, '');
    return { n: i + 1, quarter: sp.quarter, timeLeft: sp.timeLeft, at, ours, points: sp.points, kind, description, us, them, swing, playerIds, title: playTitle(description, kind, playerIds, pool) };
  });
  // Two navy teams: the opponent's second color, so the chart reads.
  const themColor = colorDistance(team.primaryColor, opp.primaryColor) < 90 ? opp.secondaryColor : opp.primaryColor;
  return {
    us: { teamId: team.id, abbreviation: team.abbreviation, color: team.primaryColor || '#1e3a5f' },
    them: { teamId: opp.id, abbreviation: opp.abbreviation, color: !themColor || colorDistance(themColor, '#ffffff') < 60 ? '#94a3b8' : themColor },
    plays,
    quarters: Math.max(4, ...sps.map(p => p.quarter)),
    lowPoint: lowN,
    highPoint: highN,
  };
}

export interface GameContext {
  team: Team;
  teams: Team[];
  players: Player[];
  schedule: GameResult[];
  season: number;
  playoffBracket?: PlayoffMatchup[] | null;
}

/**
 * The postgame topics for the team's most recent game (none before its
 * first game). Goes first in the episode.
 */
export function buildGameTopics(c: GameContext): GameTopic[] {
  const last = lastGame(c.team.id, c.season, c.schedule, c.playoffBracket);
  if (!last) return [];
  const { game: g, round } = last;
  const home = g.homeTeamId === c.team.id;
  const oppId = home ? g.awayTeamId : g.homeTeamId;
  const opp = c.teams.find(t => t.id === oppId);
  if (!opp) return [];
  const us = home ? g.homeScore : g.awayScore;
  const them = home ? g.awayScore : g.homeScore;
  const won = us > them;
  const label = round ? ROUND[round] ?? 'Playoffs' : `Week ${g.week}`;
  const ab = c.team.abbreviation;

  // Standouts on each side.
  const lines = Object.entries(g.playerStats).flatMap(([id, s]) => {
    const p = c.players.find(x => x.id === id);
    return p && (p.teamId === c.team.id || p.teamId === opp.id) ? [{ p, s, score: impact(s) }] : [];
  });
  const top = (teamId: string, k: number) => lines.filter(l => l.p.teamId === teamId).sort((a, b) => b.score - a.score).slice(0, k);
  const ours = top(c.team.id, 4);
  const theirs = top(opp.id, 2);
  // Every player who did something in this game gets that game's line on
  // screen when he's discussed (never his season numbers here).
  const gameLines: Record<string, TileStat[]> = {};
  for (const l of lines) if (l.score > 0) gameLines[l.p.id] = gameTiles(l.p, l.s);

  // Team numbers, us vs them.
  const a = teamTotals(g, c.team.id, c.players);
  const b = teamTotals(g, opp.id, c.players);
  const vs = (x: number) => `${opp.abbreviation} ${x}`;
  const cmp = (key: string, label: string, l: number, r: number, lowerBetter = false) =>
    ({ key, label, left: String(l), right: String(r), edge: l === r ? null : (l > r) !== lowerBetter ? 'left' as const : 'right' as const });
  const gameCompare: GameCompare = {
    left: { teamId: c.team.id, abbreviation: ab },
    right: { teamId: opp.id, abbreviation: opp.abbreviation },
    rows: [
      cmp('pts', 'Points', us, them),
      cmp('passYds', 'Pass YDS', a.pass, b.pass),
      cmp('rushYds', 'Rush YDS', a.rush, b.rush),
      cmp('to', 'Turnovers', a.ints + a.fum, b.ints + b.fum, true),
      cmp('sacks', 'Sacks', a.sacks, b.sacks),
    ],
  };
  const gameTeam: TileStat[] = [
    { key: 'pts', label: 'Points', value: String(us), rank: 0, of: 0, note: vs(them) },
    { key: 'passYds', label: 'Pass YDS', value: String(a.pass), rank: 0, of: 0, note: vs(b.pass) },
    { key: 'rushYds', label: 'Rush YDS', value: String(a.rush), rank: 0, of: 0, note: vs(b.rush) },
    { key: 'to', label: 'Turnovers', value: String(a.ints + a.fum), rank: 0, of: 0, note: vs(b.ints + b.fum) },
    { key: 'sacks', label: 'Sacks', value: String(a.sacks), rank: 0, of: 0, note: vs(b.sacks) },
  ];

  // Scoring flow: by quarter, lead changes, the deciding score.
  const plays = [...(g.scoringPlays ?? [])];
  const byQ = new Map<number, [number, number]>();
  let leadChanges = 0;
  let leader: string | null = null;
  let biggestDeficit = 0;
  for (const sp of plays) {
    const [awayS, homeS] = sp.score;
    const mine = home ? homeS : awayS, theirsS = home ? awayS : homeS;
    const q = byQ.get(sp.quarter) ?? [0, 0];
    byQ.set(sp.quarter, sp.teamId === c.team.id ? [q[0] + sp.points, q[1]] : [q[0], q[1] + sp.points]);
    const now: string | null = mine > theirsS ? 'us' : mine < theirsS ? 'them' : leader;
    if (leader && now && now !== leader) leadChanges++;
    if (now) leader = now;
    biggestDeficit = Math.max(biggestDeficit, theirsS - mine);
  }
  const qName = (q: number) => (q === 5 ? 'overtime' : `Q${q}`);
  const flow = [...byQ.entries()].sort((x, y) => x[0] - y[0]).map(([q, [m, t]]) => `${qName(q)}: ${ab} ${m}, ${opp.abbreviation} ${t}`).join('; ');
  const deciding = [...plays].reverse().find(p => p.teamId === (won ? c.team.id : opp.id));

  const gameFlow = gameFlowOf(g, c.team, opp, c.players);
  const playList = gameFlow?.plays.map(p => `#${p.n} ${qName(p.quarter)}${p.timeLeft ? ` ${p.timeLeft}` : ''}, ${p.ours ? ab : opp.abbreviation}: ${p.title} (${ab} ${p.us}-${p.them})`) ?? [];

  const where = home ? `at home against the ${opp.city} ${opp.name}` : `on the road at the ${opp.city} ${opp.name}`;
  const facts = [
    `${label}: ${won ? 'won' : 'lost'} ${us}-${them} ${where}.`,
    flow && `Scoring by quarter — ${flow}.`,
    biggestDeficit > 0 && won && `They trailed by as many as ${biggestDeficit} and came back.`,
    leadChanges >= 2 && `${leadChanges} lead changes.`,
    playList.length > 0 && `Every score, in order (mark a line about one of these with its number): ${playList.join(' | ')}.`,
    deciding && `The deciding score: ${deciding.description}.`,
    `Team numbers — ${ab}: ${a.pass} passing yards, ${a.rush} rushing, ${a.ints + a.fum} turnovers, ${a.sacks} sacks, quarterback sacked ${a.sacked} times. ${opp.abbreviation}: ${b.pass} passing, ${b.rush} rushing, ${b.ints + b.fum} turnovers, ${b.sacks} sacks.`,
  ].filter((x): x is string => !!x);

  const topics: GameTopic[] = [{
    headline: `${label}: ${ab} ${us}, ${opp.abbreviation} ${them}`,
    icon: won ? '🏆' : '💔',
    exchanges: facts.map((text, i) => ({ speakerId: i % 2 ? 'hottake' : 'stats', text })),
    teamIds: [opp.id],
    playerIds: [...ours, ...theirs].map(l => l.p.id),
    depth: 'deep',
    gameLines,
    gameTeam,
    gameCompare,
    gameLabel: `${label} · ${ab} vs ${opp.abbreviation}`,
    ...(gameFlow ? { gameFlow } : {}),
  }];

  const performerNotes = [
    ...ours.map(l => statLine(l.p, l.s)).filter((x): x is string => !!x).map(x => `${ab} — ${x}`),
    ...theirs.map(l => statLine(l.p, l.s)).filter((x): x is string => !!x).map(x => `${opp.abbreviation} — ${x}`),
  ];
  if (performerNotes.length) {
    topics.push({
      headline: won ? 'Who won it' : 'Who showed up',
      icon: '⭐',
      exchanges: performerNotes.map((text, i) => ({ speakerId: i % 2 ? 'hottake' : 'stats', text })),
      teamIds: [opp.id],
      playerIds: [...ours, ...theirs].map(l => l.p.id),
      depth: 'deep',
      gameLines,
      gameTeam,
      gameLabel: `${label} · ${ab} vs ${opp.abbreviation}`,
      ...(gameFlow ? { gameFlow } : {}),
    });
  }

  // What's next (playoffs: the next round, if it's set).
  if (round && won) {
    const next = (c.playoffBracket ?? []).find(m => !m.winnerId && (m.homeTeamId === c.team.id || m.awayTeamId === c.team.id) && m.homeTeamId && m.awayTeamId);
    const nextOpp = next && c.teams.find(t => t.id === (next.homeTeamId === c.team.id ? next.awayTeamId : next.homeTeamId));
    if (next && nextOpp) {
      const rec = `${nextOpp.record.wins}-${nextOpp.record.losses}`;
      topics.push({
        headline: `Next: ${ROUND[next.round] ?? 'Playoffs'} vs ${nextOpp.abbreviation}`,
        icon: '➡️',
        exchanges: [
          { speakerId: 'stats', text: `Next up: the ${ROUND[next.round] ?? 'next round'} ${next.homeTeamId === c.team.id ? 'at home against' : 'on the road at'} the ${nextOpp.city} ${nextOpp.name} (${rec}).` },
        ],
        teamIds: [nextOpp.id],
      });
    }
  }
  return topics;
}

/** Stable identity of the game a set of game topics is about (cache key). */
export const gameTopicsKey = (t: GameTopic[]) => t.map(x => x.headline).join('|');
