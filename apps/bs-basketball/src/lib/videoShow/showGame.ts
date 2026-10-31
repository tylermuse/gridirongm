/**
 * The postgame breakdown that opens a Spotlight show episode (basketball):
 * the team's most recent game — result, how it swung quarter by quarter, the
 * box score side by side, and who carried it — as topics for the writer, with
 * each player's line from that game for the on-screen tiles.
 *
 * Port of BS Football's showGame. Football also draws a scoring timeline
 * (every touchdown/field goal); Hoops box scores have no play log, so the
 * `gameFlow` graphic isn't produced here (the types stay for the shared UI).
 * Hoops draws the line score instead (`gameQuarters`): the quarter-by-quarter
 * board that comes up when the hosts talk about how the game swung.
 */
import type { BasketballStats } from '@bs/sport-basketball';
import type { BasketballLeagueState } from '../persistence/db';
import { dayOf } from '../standings/extendedStandings';
import type { TileStat } from './playerStats';
import type { ShowPlayer, ShowTeam } from './types';

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
  /** Short label for the tiles ("Day 41 · BOS vs NYK"). */
  gameLabel?: string;
  /** Every score in order (football only; never set in Hoops). */
  gameFlow?: GameFlow;
  /** The line score: points per quarter, for the quarter-by-quarter board. */
  gameQuarters?: GameQuarters;
}

/** A game's line score from the team's side: Q1–Q4, then any overtimes. */
export interface GameQuarters {
  us: { teamId: string; abbreviation: string; color: string };
  them: { teamId: string; abbreviation: string; color: string };
  /** [us, them] points in each period. */
  periods: [number, number][];
}

export interface FlowPlay {
  n: number;
  quarter: number;
  timeLeft?: string;
  at: number;
  ours: boolean;
  points: number;
  kind: 'td' | 'fg' | 'safety' | 'other';
  description: string;
  us: number;
  them: number;
  swing: 'go-ahead' | 'ties' | 'extends' | 'cuts' | 'opens';
  playerIds: string[];
  title: string;
}

export interface GameFlow {
  us: { teamId: string; abbreviation: string; color: string };
  them: { teamId: string; abbreviation: string; color: string };
  plays: FlowPlay[];
  quarters: number;
  lowPoint: number | null;
  highPoint: number | null;
}

export interface GameCompare {
  left: { teamId: string; abbreviation: string };
  right: { teamId: string; abbreviation: string };
  rows: { key: string; label: string; left: string; right: string; edge: 'left' | 'right' | null }[];
}

type S = Partial<BasketballStats>;
const n = (v: number | undefined) => v ?? 0;
const pct = (m: number, a: number) => (a > 0 ? Math.round((m / a) * 1000) / 10 : 0);

/** Game score-style impact, for picking the standouts. */
const impact = (s: S) => n(s.points) + 0.4 * n(s.fieldGoalsMade) - 0.7 * n(s.fieldGoalsAttempted) + 0.7 * n(s.totalRebounds)
  + 0.7 * n(s.assists) + n(s.steals) + 0.7 * n(s.blocks) - n(s.turnovers);

function statLine(p: ShowPlayer, s: S): string {
  const parts = [`${n(s.points)} points`, `${n(s.totalRebounds)} rebounds`, `${n(s.assists)} assists`];
  if (n(s.steals) >= 2) parts.push(`${n(s.steals)} steals`);
  if (n(s.blocks) >= 2) parts.push(`${n(s.blocks)} blocks`);
  const shooting = `${n(s.fieldGoalsMade)} of ${n(s.fieldGoalsAttempted)} from the field${n(s.threePointsAttempted) ? `, ${n(s.threePointsMade)} of ${n(s.threePointsAttempted)} from three` : ''}`;
  return `${p.firstName} ${p.lastName} (${p.position}): ${parts.join(', ')} on ${shooting}${n(s.turnovers) >= 4 ? `, ${n(s.turnovers)} turnovers` : ''}.`;
}

function gameTiles(s: S): TileStat[] {
  const t = (key: string, label: string, value: string, note?: string): TileStat => ({ key, label, value, rank: 0, of: 0, ...(note ? { note } : {}) });
  return [
    t('ppg', 'Points', String(n(s.points))),
    t('rpg', 'Rebounds', String(n(s.totalRebounds))),
    t('apg', 'Assists', String(n(s.assists))),
    t('ts', 'FG', `${n(s.fieldGoalsMade)}-${n(s.fieldGoalsAttempted)}`, `${pct(n(s.fieldGoalsMade), n(s.fieldGoalsAttempted))}%`),
    t('fg3', '3PT', `${n(s.threePointsMade)}-${n(s.threePointsAttempted)}`),
  ];
}

function colorDistance(a: string | undefined, b: string): number {
  const rgb = (h: string) => {
    const x = h.replace('#', '');
    const f = x.length === 3 ? x.split('').map(c => c + c).join('') : x;
    return [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16) || 0);
  };
  const [p, q] = [rgb(a ?? ''), rgb(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** The line score, with team colors that tell the two apart. */
function gameQuartersOf(qs: [number, number][], team: ShowTeam, opp: ShowTeam): GameQuarters | null {
  if (qs.length < 4) return null;
  // Two navy teams: the opponent's second color, so the board reads.
  const themColor = colorDistance(team.primaryColor, opp.primaryColor ?? '') < 90 ? opp.secondaryColor : opp.primaryColor;
  return {
    us: { teamId: team.id, abbreviation: team.abbreviation, color: team.primaryColor || '#1e3a5f' },
    them: { teamId: opp.id, abbreviation: opp.abbreviation, color: !themColor || colorDistance(themColor, '#ffffff') < 60 ? '#94a3b8' : themColor },
    periods: qs,
  };
}

function totals(box: Record<string, S>, ids: Set<string>) {
  const sum = { fgm: 0, fga: 0, tpm: 0, tpa: 0, reb: 0, ast: 0, tov: 0, stl: 0, blk: 0 };
  for (const [id, s] of Object.entries(box)) {
    if (!ids.has(id)) continue;
    sum.fgm += n(s.fieldGoalsMade); sum.fga += n(s.fieldGoalsAttempted);
    sum.tpm += n(s.threePointsMade); sum.tpa += n(s.threePointsAttempted);
    sum.reb += n(s.totalRebounds); sum.ast += n(s.assists); sum.tov += n(s.turnovers);
    sum.stl += n(s.steals); sum.blk += n(s.blocks);
  }
  return sum;
}

/**
 * The postgame topics for the team's most recent game (none before its
 * first game). Goes first in the episode.
 */
export function buildGameTopics(league: BasketballLeagueState, team: ShowTeam, teams: ShowTeam[], players: ShowPlayer[]): GameTopic[] {
  const mine = league.games
    .filter(g => g.season === league.currentSeason && g.status === 'played' && (g.homeTeamId === team.id || g.awayTeamId === team.id))
    .sort((a, b) => dayOf(b) - dayOf(a));
  const g = mine[0];
  if (!g?.finalScore) return [];
  const home = g.homeTeamId === team.id;
  const opp = teams.find(t => t.id === (home ? g.awayTeamId : g.homeTeamId));
  if (!opp) return [];
  const sd = (g.sportData ?? {}) as { isPlayoff?: boolean; wentToOvertime?: boolean; quarterScores?: { home: number; away: number }[] };
  const us = home ? g.finalScore.home : g.finalScore.away;
  const them = home ? g.finalScore.away : g.finalScore.home;
  const won = us > them;
  const label = sd.isPlayoff ? 'Playoffs' : `Day ${dayOf(g)}`;
  const ab = team.abbreviation;
  const box = g.boxScores as Record<string, S>;

  const byId = new Map(players.map(p => [p.id, p]));
  const ourIds = new Set(players.filter(p => p.teamId === team.id).map(p => p.id));
  const theirIds = new Set(players.filter(p => p.teamId === opp.id).map(p => p.id));
  const lines = Object.entries(box).flatMap(([id, s]) => {
    const p = byId.get(id);
    return p && (ourIds.has(id) || theirIds.has(id)) && n(s.minutes) > 0 ? [{ p, s, score: impact(s) }] : [];
  });
  const top = (ids: Set<string>, k: number) => lines.filter(l => ids.has(l.p.id)).sort((a, b) => b.score - a.score).slice(0, k);
  const ours = top(ourIds, 3);
  const theirs = top(theirIds, 2);
  const gameLines: Record<string, TileStat[]> = {};
  for (const l of lines) gameLines[l.p.id] = gameTiles(l.s);

  const a = totals(box, ourIds);
  const b = totals(box, theirIds);
  const vs = (x: number | string) => `${opp.abbreviation} ${x}`;
  const cmp = (key: string, label: string, l: number, r: number, lowerBetter = false, fmt: (v: number) => string = String) =>
    ({ key, label, left: fmt(l), right: fmt(r), edge: l === r ? null : (l > r) !== lowerBetter ? 'left' as const : 'right' as const });
  const fgA = pct(a.fgm, a.fga), fgB = pct(b.fgm, b.fga);
  const gameCompare: GameCompare = {
    left: { teamId: team.id, abbreviation: ab },
    right: { teamId: opp.id, abbreviation: opp.abbreviation },
    rows: [
      cmp('pts', 'Points', us, them),
      cmp('fg', 'FG %', fgA, fgB, false, v => `${v}%`),
      cmp('fg3', '3PM', a.tpm, b.tpm),
      cmp('reb', 'Rebounds', a.reb, b.reb),
      cmp('ast', 'Assists', a.ast, b.ast),
      cmp('to', 'Turnovers', a.tov, b.tov, true),
    ],
  };
  const gameTeam: TileStat[] = [
    { key: 'pts', label: 'Points', value: String(us), rank: 0, of: 0, note: vs(them) },
    { key: 'fg', label: 'FG %', value: `${fgA}%`, rank: 0, of: 0, note: vs(`${fgB}%`) },
    { key: 'reb', label: 'Rebounds', value: String(a.reb), rank: 0, of: 0, note: vs(b.reb) },
    { key: 'ast', label: 'Assists', value: String(a.ast), rank: 0, of: 0, note: vs(b.ast) },
    { key: 'to', label: 'Turnovers', value: String(a.tov), rank: 0, of: 0, note: vs(b.tov) },
  ];

  // How it swung: quarter by quarter, and the quarter that decided it.
  const qs = (sd.quarterScores ?? []).map(q => (home ? [q.home, q.away] : [q.away, q.home]) as [number, number]);
  const gameQuarters = gameQuartersOf(qs, team, opp);
  const qName = (i: number) => (i >= 4 ? (i === 4 ? 'overtime' : `overtime ${i - 3}`) : `Q${i + 1}`);
  const flow = qs.map(([m, t], i) => `${qName(i)}: ${ab} ${m}, ${opp.abbreviation} ${t}`).join('; ');
  const swing = qs.map(([m, t], i) => ({ i, d: m - t })).sort((x, y) => (won ? y.d - x.d : x.d - y.d))[0];
  let run = 0, low = 0;
  for (const [m, t] of qs) { run += m - t; low = Math.min(low, run); }

  const where = home ? `at home against the ${opp.city} ${opp.name}` : `on the road at the ${opp.city} ${opp.name}`;
  const facts = [
    `${label}: ${won ? 'won' : 'lost'} ${us}-${them} ${where}${sd.wentToOvertime ? ' in overtime' : ''}.`,
    flow && `Scoring by quarter — ${flow}.`,
    swing && Math.abs(swing.d) >= 6 && `The ${qName(swing.i)} decided it: ${won ? 'they won it' : 'they lost it'} by ${Math.abs(swing.d)}.`,
    won && low <= -8 && `They were down by ${-low} after a quarter break and came back.`,
    `Team numbers — ${ab}: ${fgA}% from the field, ${a.tpm} of ${a.tpa} from three, ${a.reb} rebounds, ${a.ast} assists, ${a.tov} turnovers. ${opp.abbreviation}: ${fgB}% from the field, ${b.tpm} of ${b.tpa} from three, ${b.reb} rebounds, ${b.ast} assists, ${b.tov} turnovers.`,
  ].filter((x): x is string => !!x);

  const shared = {
    teamIds: [opp.id],
    playerIds: [...ours, ...theirs].map(l => l.p.id),
    depth: 'deep' as const,
    gameLines,
    gameTeam,
    gameCompare,
    gameLabel: `${label} · ${ab} vs ${opp.abbreviation}`,
    ...(gameQuarters ? { gameQuarters } : {}),
  };
  const topics: GameTopic[] = [{
    headline: `${label}: ${ab} ${us}, ${opp.abbreviation} ${them}`,
    icon: won ? '🏆' : '💔',
    exchanges: facts.map((text, i) => ({ speakerId: i % 2 ? 'hottake' : 'stats', text })),
    ...shared,
  }];
  const performerNotes = [
    ...ours.map(l => `${ab} — ${statLine(l.p, l.s)}`),
    ...theirs.map(l => `${opp.abbreviation} — ${statLine(l.p, l.s)}`),
  ];
  if (performerNotes.length) {
    topics.push({
      headline: won ? 'Who won it' : 'Who showed up',
      icon: '⭐',
      exchanges: performerNotes.map((text, i) => ({ speakerId: i % 2 ? 'hottake' : 'stats', text })),
      ...shared,
    });
  }
  return topics;
}

/**
 * The game segment for this point of the season. At the trade deadline the
 * episode is about needs and targets, so the last game shrinks to one quick
 * topic: the result and what it showed, no walkthrough, no standouts list.
 */
export function gameTopicsForMoment(topics: GameTopic[], narrative?: string): GameTopic[] {
  if (narrative !== 'tradeDeadline' || topics.length === 0) return topics;
  const [g] = topics;
  const keep = g.exchanges.filter(e => !/^Scoring by quarter/.test(e.text));
  return [{
    ...g,
    depth: undefined,
    exchanges: [
      ...keep,
      { speakerId: 'hottake', text: 'Trade deadline week: two or three lines on this result — what it says about what they need — then on to the deadline.' },
    ],
  }];
}

/** Stable identity of the game a set of game topics is about (cache key). */
export const gameTopicsKey = (t: GameTopic[]) => t.map(x => x.headline).join('|');
