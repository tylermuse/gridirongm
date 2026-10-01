/**
 * Team Spotlight video show — the postgame segment.
 *
 * The Spotlight's own topics are season storylines; after a game the show
 * should break that game down the way a real postgame show does: how it
 * was won (scoring flow, turning points), the standout stat lines on both
 * sides, the team numbers, and what's next. This builds those topics from
 * the box score so the writer has the facts to go deep. Pure (client-safe).
 */
import type { GameResult, Player, PlayerStats, PlayoffMatchup, Team } from '@/types';
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
  const late = plays.filter(p => p.quarter >= 4).slice(-4).map(p => `${qName(p.quarter)}${p.timeLeft ? ` ${p.timeLeft}` : ''}: ${p.description} (${home ? p.score[1] : p.score[0]}-${home ? p.score[0] : p.score[1]})`);
  const deciding = [...plays].reverse().find(p => p.teamId === (won ? c.team.id : opp.id));

  const where = home ? `at home against the ${opp.city} ${opp.name}` : `on the road at the ${opp.city} ${opp.name}`;
  const facts = [
    `${label}: ${won ? 'won' : 'lost'} ${us}-${them} ${where}.`,
    flow && `Scoring by quarter — ${flow}.`,
    biggestDeficit > 0 && won && `They trailed by as many as ${biggestDeficit} and came back.`,
    leadChanges >= 2 && `${leadChanges} lead changes.`,
    late.length > 0 && `Late scoring: ${late.join(' | ')}.`,
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
