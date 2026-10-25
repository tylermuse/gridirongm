/**
 * What a line of the Spotlight show is about — so the graphic shows the
 * numbers that matter for it (basketball port of BS Football's showFocus):
 *
 *  - a player it names (or the role it talks about: "the point guard", "the
 *    big man" → the team's go-to player there) → his stats, ranked at his
 *    position;
 *  - a unit ("the backcourt", "the frontcourt", "the bench") → that unit's
 *    numbers, ranked against every team;
 *  - a team stat ("the defense ranks 27th") → the team stat line;
 *  - standings / schedule talk → those boards;
 *  - nothing measurable → no stats; the show cuts to a shot of the hosts.
 */
import type { ShowPlayer, ShowTeam } from './types';
import { computePlayerStatLine, playerStatsMentioned, showSeasonStats, statSpanLabel, type TileStat } from './playerStats';
import { statsMentioned } from './teamStats';
import { playerNamedIn, type VisualTopic } from './showVisuals';
import type { GameFlow } from './showGame';

export type Unit = 'backcourt' | 'frontcourt' | 'bench';

export type Focus =
  | { kind: 'player'; player: ShowPlayer; tiles: TileStat[] | null; label: string; mentioned: string[] }
  | { kind: 'unit'; unit: Unit; tiles: TileStat[]; label: string; mentioned: string[] }
  /** A team's league ranks: the spotlight team, or `teamId` — another team the line is about. */
  | { kind: 'team'; mentioned: string[]; teamId?: string }
  | { kind: 'standings'; scope: 'conference' | 'division' }
  | { kind: 'schedule' }
  /** Football's scoring timeline (never produced in Hoops; kept for the shared UI). */
  | { kind: 'moment'; play: number | null; quarter?: number }
  | { kind: 'none' };

/** Playoff-race / standings talk → the standings board. */
const STANDINGS = /\bplayoff (picture|race|spot|hunt|chances|line|push)|\bplay-?in\b|\bseeds?\b|\bseeding\b|\bgames? (back|out)\b|\bhalf (a )?game\b|\bstandings\b|\bin the hunt\b|\bclinch|\bhome[- ]court\b|\btop (four|six)\b|\bthe (east|west|conference)\b|\bdivision (lead|race|title)\b/i;
/** Talk about what's coming up → the schedule board. */
const SCHEDULE = /\bschedule\b|\bnext (game|week|one|two|three|four|five|few|couple)\b|\b(next|coming|last|final) \w+ (games?|weeks?)\b|\bon the road\b|\broad (trip|games?|stretch|swing)\b|\bhome ?(stand|stretch|games?)\b|\brest of the (way|season|schedule)\b|\bupcoming\b|\b(games?|weeks?) (left|remaining|to go)\b|\bback[- ]to[- ]backs?\b|\bstretch run\b/i;
const scheduleOf = (text: string): Focus | null => (SCHEDULE.test(text) ? { kind: 'schedule' } : null);
const standingsOf = (text: string): Focus | null =>
  STANDINGS.test(text) ? { kind: 'standings', scope: /\bdivision\b/i.test(text) ? 'division' : 'conference' } : null;

type Role = 'pg' | 'wing' | 'big';

const ROLE_WORDS: [Role, RegExp][] = [
  ['pg', /\bpoint guards?\b|\bPGs?\b|\bfloor general\b|\bball[- ]handlers?\b|\bplaymakers?\b/i],
  ['big', /\b(the |their |your )?(big man|big men|bigs)\b|\bcent(er|re)s?\b|\brim protect(or|ion)\b|\bpower forwards?\b|\bstretch (four|five)\b/i],
  ['wing', /\bwings?\b|\bshooting guards?\b|\bsmall forwards?\b|\b3-and-D\b|\bshooters?\b/i],
];

const UNIT_WORDS: [Unit, RegExp][] = [
  ['bench', /\bbench\b|\bsecond unit\b|\breserves\b|\bsixth man\b|\bdepth\b/i],
  ['backcourt', /\bbackcourt\b|\bguards\b|\bguard play\b/i],
  ['frontcourt', /\bfrontcourt\b|\bthe paint\b|\binside\b|\bin the post\b|\bfront line\b/i],
];

const UNIT_LABEL: Record<Unit, string> = { backcourt: 'Backcourt', frontcourt: 'Frontcourt', bench: 'Bench' };

const ROLE_POS: Record<Role, string[]> = { pg: ['PG'], wing: ['SG', 'SF'], big: ['PF', 'C'] };

/** The team's go-to player for a role (most minutes at those positions). */
function starter(role: Role, team: ShowTeam, players: ShowPlayer[]): ShowPlayer | null {
  const mins = (p: ShowPlayer) => showSeasonStats(p)?.minutes ?? 0;
  const roster = players.filter(p => p.teamId === team.id && ROLE_POS[role].includes(p.position));
  roster.sort((a, b) => mins(b) - mins(a) || b.ratings.overall - a.ratings.overall);
  return roster[0] ?? null;
}

interface UnitRow { id: string; v: Record<string, number> }

/** Unit numbers for every team (from its players' stats), per game. The bench
 *  is everyone outside a team's five biggest-minute players. */
function unitRows(unit: Unit, teams: ShowTeam[], players: ShowPlayer[]): UnitRow[] {
  return teams.map(t => {
    const roster = players.filter(p => p.teamId === t.id && showSeasonStats(p));
    const byMinutes = [...roster].sort((a, b) => (showSeasonStats(b)!.minutes) - (showSeasonStats(a)!.minutes));
    const members = unit === 'bench' ? byMinutes.slice(5)
      : roster.filter(p => (unit === 'backcourt' ? ['PG', 'SG'] : ['PF', 'C']).includes(p.position));
    const gp = Math.max(1, t.record.wins + t.record.losses, ...roster.map(p => showSeasonStats(p)!.gamesPlayed));
    const sum = { pts: 0, reb: 0, ast: 0, blk: 0, stl: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0 };
    for (const p of members) {
      const s = showSeasonStats(p)!;
      sum.pts += s.points; sum.reb += s.totalRebounds; sum.ast += s.assists; sum.blk += s.blocks; sum.stl += s.steals;
      sum.fgm += s.fieldGoalsMade; sum.fga += s.fieldGoalsAttempted; sum.tpm += s.threePointsMade; sum.tpa += s.threePointsAttempted;
    }
    return {
      id: t.id,
      v: {
        pts: sum.pts / gp, reb: sum.reb / gp, ast: sum.ast / gp, blk: sum.blk / gp, stl: sum.stl / gp,
        fg: sum.fga ? (sum.fgm / sum.fga) * 100 : 0, fg3: sum.tpa ? (sum.tpm / sum.tpa) * 100 : 0,
      },
    };
  });
}

const UNIT_STATS: Record<Unit, { key: string; label: string; fmt: (v: number) => string }[]> = {
  backcourt: [
    { key: 'pts', label: 'Points / G', fmt: v => v.toFixed(1) },
    { key: 'ast', label: 'Assists / G', fmt: v => v.toFixed(1) },
    { key: 'fg3', label: '3P %', fmt: v => `${v.toFixed(1)}%` },
    { key: 'stl', label: 'Steals / G', fmt: v => v.toFixed(1) },
  ],
  frontcourt: [
    { key: 'pts', label: 'Points / G', fmt: v => v.toFixed(1) },
    { key: 'reb', label: 'Rebounds / G', fmt: v => v.toFixed(1) },
    { key: 'blk', label: 'Blocks / G', fmt: v => v.toFixed(1) },
    { key: 'fg', label: 'FG %', fmt: v => `${v.toFixed(1)}%` },
  ],
  bench: [
    { key: 'pts', label: 'Bench points / G', fmt: v => v.toFixed(1) },
    { key: 'reb', label: 'Rebounds / G', fmt: v => v.toFixed(1) },
    { key: 'ast', label: 'Assists / G', fmt: v => v.toFixed(1) },
    { key: 'fg', label: 'FG %', fmt: v => `${v.toFixed(1)}%` },
  ],
};

export function computeUnitLine(unit: Unit, team: ShowTeam, teams: ShowTeam[], players: ShowPlayer[]): TileStat[] | null {
  const rows = unitRows(unit, teams, players);
  const me = rows.find(r => r.id === team.id);
  if (!me || UNIT_STATS[unit].every(d => !me.v[d.key])) return null;
  return UNIT_STATS[unit].map(d => {
    const mine = me.v[d.key];
    const better = rows.filter(r => r.v[d.key] > mine).length;
    return { key: d.key, label: d.label, value: d.fmt(mine), rank: better + 1, of: rows.length };
  });
}

const UNIT_HIGHLIGHT: [string, RegExp][] = [
  ['pts', /\bpoints\b|\bscor/i],
  ['reb', /\brebound|\bthe glass\b|\bboards\b/i],
  ['ast', /\bassists?\b|\bplaymak/i],
  ['blk', /\bblock|\brim protect/i],
  ['fg3', /\bthree|\bfrom deep\b/i],
];

function unitMentioned(text: string, tiles: TileStat[]): string[] {
  const keys = new Set(tiles.map(t => t.key));
  return UNIT_HIGHLIGHT.filter(([k, re]) => keys.has(k) && re.test(text)).map(([k]) => k);
}

export interface FocusContext {
  topic?: VisualTopic & {
    headline?: string;
    /** A postgame topic: that game's stat lines replace the season's. */
    gameLines?: Record<string, TileStat[]>;
    gameTeam?: TileStat[];
    gameLabel?: string;
    gameFlow?: GameFlow;
  };
  play?: number;
  earlierPlays?: (number | undefined)[];
  team: ShowTeam;
  teams: ShowTeam[];
  players: ShowPlayer[];
  /** Earlier lines of the same topic, oldest first. */
  earlier: string[];
}

/** A player's profile when there are no stats to show. */
function profileTiles(p: ShowPlayer): TileStat[] {
  const t = (key: string, label: string, value: string, note: string): TileStat => ({ key, label, value, rank: 0, of: 0, note });
  const c = p.contract;
  return [
    t('ovr', 'Overall', String(Math.round(p.ratings.overall)), `Potential ${Math.round(p.potential)}`),
    t('age', 'Age', String(p.age), p.position),
    ...(c ? [t('salary', 'Contract', `$${c.salary.toFixed(1)}M`, `${c.yearsLeft} yr${c.yearsLeft === 1 ? '' : 's'} left`)] : []),
  ];
}

function playerFocus(p: ShowPlayer, text: string, players: ShowPlayer[], topic?: FocusContext['topic']): Focus {
  const game = topic?.gameLines?.[p.id];
  // In a game breakdown, never season numbers: that game's line or nothing.
  const season = game ? null : topic?.gameLines ? null : computePlayerStatLine(p, players);
  const bio = !game && !season && !topic?.gameLines ? profileTiles(p) : null;
  const tiles = game ?? season ?? bio;
  return {
    kind: 'player', player: p, tiles,
    label: game ? `${p.firstName} ${p.lastName} · ${topic?.gameLabel ?? 'this game'}`
      : bio ? `${p.firstName} ${p.lastName} · Profile` : `${p.firstName} ${p.lastName} · ${statSpanLabel(p) ?? 'Season'} · ranks among ${p.position}s`,
    mentioned: tiles ? playerStatsMentioned(text, tiles) : [],
  };
}

const GAME_WORDS: [string, RegExp][] = [
  ['pts', /\bpoints?\b|\bscor/i],
  ['fg', /\bshoot|\bshot\b|\bfrom the field\b|\bpercent/i],
  ['reb', /\brebound|\bthe glass\b|\bboards\b/i],
  ['ast', /\bassists?\b|\bball movement\b/i],
  ['to', /\bturnovers?\b|\bturned it over\b|\bcareless\b/i],
];

/** Words that name a team (city, nickname, abbreviation): never read as a player's name. */
const teamWordCache = new WeakMap<ShowTeam[], Set<string>>();
function teamWords(teams: ShowTeam[]): Set<string> {
  let w = teamWordCache.get(teams);
  if (!w) {
    w = new Set(teams.flatMap(t => [...`${t.city} ${t.name}`.toLowerCase().split(/\s+/), t.abbreviation.toLowerCase()]));
    teamWordCache.set(teams, w);
  }
  return w;
}

/** Other teams a line names (city, nickname or abbreviation), first-named first. */
export function otherTeamsNamedIn(text: string, team: ShowTeam, teams: ShowTeam[]): ShowTeam[] {
  const at = (t: ShowTeam) => {
    const hits = [t.city, t.name, t.abbreviation]
      .map(w => (w ? text.search(new RegExp(`(^|[^A-Za-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`)) : -1))
      .filter(i => i >= 0);
    return hits.length ? Math.min(...hits) : -1;
  };
  return teams.filter(t => t.id !== team.id).map(t => ({ t, i: at(t) })).filter(x => x.i >= 0).sort((a, b) => a.i - b.i).map(x => x.t);
}

function focusOf(text: string, c: FocusContext): Focus | null {
  const others = otherTeamsNamedIn(text, c.team, c.teams);
  const named = playerNamedIn(text, c.topic, c.players, [c.team.id, ...(c.topic?.teamIds ?? []), ...others.map(t => t.id)], teamWords(c.teams));
  if (named) return playerFocus(named, text, c.players, c.topic);
  // A game breakdown: the game's box score, not season unit or team ranks.
  if (c.topic?.gameTeam) {
    for (const [role, re] of ROLE_WORDS) {
      if (!re.test(text)) continue;
      const p = starter(role, c.team, c.players);
      if (p) return playerFocus(p, text, c.players, c.topic);
    }
    return { kind: 'team', mentioned: GAME_WORDS.filter(([, re]) => re.test(text)).map(([k]) => k) };
  }
  const race = standingsOf(text) ?? scheduleOf(text);
  if (race) return race;
  if (others.length) return { kind: 'team', teamId: others[0].id, mentioned: statsMentioned(text) };
  for (const [unit, re] of UNIT_WORDS) {
    if (!re.test(text)) continue;
    const tiles = computeUnitLine(unit, c.team, c.teams, c.players);
    if (tiles) return { kind: 'unit', unit, tiles, label: `${c.team.abbreviation} · ${UNIT_LABEL[unit]} · League ranks`, mentioned: unitMentioned(text, tiles) };
  }
  for (const [role, re] of ROLE_WORDS) {
    if (!re.test(text)) continue;
    const p = starter(role, c.team, c.players);
    if (p) return playerFocus(p, text, c.players, c.topic);
  }
  const team = statsMentioned(text);
  if (team.length) return { kind: 'team', mentioned: team };
  return null;
}

/** Whether the line itself names something to show (a player, a unit, a stat…)
 *  vs talk that only carries the conversation, which plays as a shot of the hosts. */
export function measurableIn(text: string, c: FocusContext): boolean {
  return focusOf(text, c) != null;
}

export function focusForLine(text: string, c: FocusContext): Focus {
  const own = focusOf(text, c);
  // What the conversation was just on (the latest measurable line in this topic).
  let prev: Focus | null = null;
  for (let k = c.earlier.length - 1; k >= 0 && !prev; k--) prev = focusOf(c.earlier[k], c);
  // "His shooting…" — still the player they were talking about.
  const aboutHim = /\b(he|he's|his|him)\b/i.test(text);
  if (prev?.kind === 'player' && aboutHim && own?.kind !== 'player') return playerFocus(prev.player, text, c.players, c.topic);
  if (own) return own;
  if (prev?.kind === 'player') return playerFocus(prev.player, text, c.players, c.topic);
  if (prev?.kind === 'unit') return { ...prev, mentioned: unitMentioned(text, prev.tiles) };
  if (prev?.kind === 'team') return { kind: 'team', mentioned: [], ...(prev.teamId ? { teamId: prev.teamId } : {}) };
  if (prev?.kind === 'standings' || prev?.kind === 'schedule') return prev;
  // The headline sets the subject.
  if (c.topic?.headline) {
    const f = focusOf(c.topic.headline, c);
    if (f && f.kind !== 'team') return f.kind === 'player' ? playerFocus(f.player, text, c.players, c.topic) : f;
    const race = standingsOf(c.topic.headline) ?? scheduleOf(c.topic.headline);
    if (race) return race;
  }
  const ids = c.topic?.playerIds ?? [];
  if (ids.length === 1) {
    const p = c.players.find(x => x.id === ids[0]);
    if (p) return playerFocus(p, text, c.players, c.topic);
  }
  return { kind: 'team', mentioned: [] };
}
