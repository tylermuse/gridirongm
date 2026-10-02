/**
 * What a line of the Spotlight show is about — so the graphic shows the
 * numbers that matter for it:
 *
 *  - a player it names (or the position it talks about: "the quarterback"
 *    → the team's starter) → that player's stats, ranked at his position;
 *  - a unit ("the offensive line", "the pass rush", "the secondary") →
 *    that unit's numbers, ranked against every team;
 *  - a team stat ("the offense ranks 27th") → the team stat line;
 *  - nothing measurable ("time to make a move") → no stats at all; the show
 *    cuts to the wide shot of the hosts instead of a wall of numbers.
 */
import type { Player, Team } from '@/types';
import { computePlayerStatLine, playerStatsMentioned, showSeasonStats, statSpanLabel, type TileStat } from './playerStats';
import { statsMentioned } from './teamStats';
import { playerNamedIn, type VisualTopic } from './showVisuals';
import type { GameFlow } from './showGame';

export type Unit = 'oline' | 'run' | 'front' | 'secondary';

export type Focus =
  | { kind: 'player'; player: Player; tiles: TileStat[] | null; label: string; mentioned: string[] }
  | { kind: 'unit'; unit: Unit; tiles: TileStat[]; label: string; mentioned: string[] }
  | { kind: 'team'; mentioned: string[] }
  | { kind: 'standings'; scope: 'conference' | 'division' }
  /** The game's flow (every score on a timeline), with one score called
   *  out — or none, when the line is about the game as a whole. */
  | { kind: 'moment'; play: number | null; quarter?: number }
  | { kind: 'none' };

/** Playoff-race / standings talk → the standings board. */
const STANDINGS = /\bplayoff (picture|race|spot|hunt|chances|line|push)|\bwild ?card|\bseeds?\b|\bseeding\b|\bgames? (back|out)\b|\bhalf (a )?game\b|\b(and a half|a half) back\b|\bstandings\b|\bin the hunt\b|\bclinch|\bdivision (lead|race|title|crown)|\bwin the division\b|\bthe division\b/i;
const standingsOf = (text: string): Focus | null =>
  STANDINGS.test(text) ? { kind: 'standings', scope: /\bdivision\b/i.test(text) ? 'division' : 'conference' } : null;

type PositionRole = 'qb' | 'rb' | 'wr' | 'k';

const ROLE_WORDS: [PositionRole, RegExp][] = [
  ['qb', /\bquarterbacks?\b|\bQBs?\b|\bunder center\b|\bsignal[- ]callers?\b/i],
  ['rb', /\brunning backs?\b|\bRBs?\b|\bhalfbacks?\b|\bbell ?cow\b/i],
  ['wr', /\breceivers?\b|\bwideouts?\b|\bWRs?\b|\btight ends?\b|\bpass[- ]catchers?\b/i],
  // Only the kicker himself: "held them to field goals" is about the defense.
  ['k', /\bkicker\b/i],
];

const UNIT_WORDS: [Unit, RegExp][] = [
  ['oline', /\boffensive line\b|\bo-?line\b|\bprotection\b|\bpass[- ]block|\bblocking\b|\bsacks? allowed\b|\b(giving|gave|given) up( \w+)? sacks\b|\bgetting sacked\b|\bin the trenches\b/i],
  ['front', /\bpass rush|\bdefensive line\b|\bd-?line\b|\bfront seven\b|\brun defense\b|\bget(ting)? to the quarterback\b|\bsacking\b/i],
  ['secondary', /\bsecondary\b|\bcoverage\b|\bcornerbacks?\b|\bsafet(y|ies)\b|\bdefensive backs?\b|\bpass defense\b/i],
  ['run', /\brun game\b|\brunning game\b|\bground game\b|\brushing attack\b/i],
];

const UNIT_LABEL: Record<Unit, string> = {
  oline: 'Offensive line',
  run: 'Run game',
  front: 'Pass rush & front seven',
  secondary: 'Secondary',
};

/** The team's go-to player for a role (most volume at the position). */
function starter(role: PositionRole, team: Team, players: Player[]): Player | null {
  const pos = { qb: ['QB'], rb: ['RB'], wr: ['WR', 'TE'], k: ['K'] }[role];
  const vol = (p: Player) => {
    const s = showSeasonStats(p);
    if (!s) return 0;
    return role === 'qb' ? s.passAttempts : role === 'rb' ? s.rushAttempts : role === 'wr' ? s.receivingYards : s.fieldGoalAttempts;
  };
  const roster = players.filter(p => p.teamId === team.id && pos.includes(p.position));
  roster.sort((a, b) => vol(b) - vol(a));
  return roster[0] ?? null;
}

interface UnitRow { id: string; v: Record<string, number> }

/** Unit numbers for every team (from its players' stats), per game. */
function unitRows(teams: Team[], players: Player[]): UnitRow[] {
  return teams.map(t => {
    let gp = t.record.wins + t.record.losses + (t.record.ties ?? 0);
    const sum = { sacksAllowed: 0, rushYds: 0, rushAtt: 0, rushTd: 0, passYds: 0, sacks: 0, tfl: 0, ff: 0, ints: 0, pd: 0 };
    for (const p of players) {
      if (p.teamId !== t.id) continue;
      const s = showSeasonStats(p);
      if (!s) continue;
      sum.sacksAllowed += s.sacksAllowed;
      sum.rushYds += s.rushYards;
      sum.rushAtt += s.rushAttempts;
      sum.rushTd += s.rushTDs;
      sum.passYds += s.passYards;
      sum.sacks += s.sacks;
      sum.tfl += s.tacklesForLoss;
      sum.ff += s.forcedFumbles;
      sum.ints += s.defensiveINTs;
      sum.pd += s.passDeflections;
      // Between seasons the record is reset: use games played instead.
      if (!(t.record.wins + t.record.losses)) gp = Math.max(gp, s.gamesPlayed);
    }
    gp = Math.max(1, gp);
    return {
      id: t.id,
      v: {
        sacksAllowed: sum.sacksAllowed,
        ypc: sum.rushAtt ? sum.rushYds / sum.rushAtt : 0,
        rushPg: sum.rushYds / gp,
        passPg: sum.passYds / gp,
        rushTd: sum.rushTd,
        sacks: sum.sacks,
        tfl: sum.tfl,
        ff: sum.ff,
        ints: sum.ints,
        pd: sum.pd,
        papg: t.record.pointsAgainst / gp,
      },
    };
  });
}

const UNIT_STATS: Record<Unit, { key: string; label: string; fmt: (v: number) => string; lower?: boolean }[]> = {
  oline: [
    { key: 'sacksAllowed', label: 'Sacks Allowed', fmt: v => String(Math.round(v)), lower: true },
    { key: 'ypc', label: 'YDS / Carry', fmt: v => v.toFixed(1) },
    { key: 'rushPg', label: 'Rush YDS/G', fmt: v => v.toFixed(0) },
    { key: 'passPg', label: 'Pass YDS/G', fmt: v => v.toFixed(0) },
  ],
  run: [
    { key: 'rushPg', label: 'Rush YDS/G', fmt: v => v.toFixed(0) },
    { key: 'ypc', label: 'YDS / Carry', fmt: v => v.toFixed(1) },
    { key: 'rushTd', label: 'Rush TD', fmt: v => String(Math.round(v)) },
  ],
  front: [
    { key: 'sacks', label: 'Sacks', fmt: v => v.toFixed(0) },
    { key: 'tfl', label: 'Tackles for Loss', fmt: v => String(Math.round(v)) },
    { key: 'ff', label: 'Forced Fumbles', fmt: v => String(Math.round(v)) },
    { key: 'papg', label: 'Opp PPG', fmt: v => v.toFixed(1), lower: true },
  ],
  secondary: [
    { key: 'ints', label: 'Interceptions', fmt: v => String(Math.round(v)) },
    { key: 'pd', label: 'Passes Defended', fmt: v => String(Math.round(v)) },
    { key: 'papg', label: 'Opp PPG', fmt: v => v.toFixed(1), lower: true },
  ],
};

export function computeUnitLine(unit: Unit, team: Team, teams: Team[], players: Player[]): TileStat[] | null {
  const rows = unitRows(teams, players);
  const me = rows.find(r => r.id === team.id);
  // No player stats yet (preseason, or a unit with nothing recorded): the
  // line falls through to the team numbers instead of a row of zeros.
  if (!me || UNIT_STATS[unit].every(d => !me.v[d.key])) return null;
  return UNIT_STATS[unit].map(d => {
    const mine = me.v[d.key];
    const better = rows.filter(r => (d.lower ? r.v[d.key] < mine : r.v[d.key] > mine)).length;
    return { key: d.key, label: d.label, value: d.fmt(mine), rank: better + 1, of: rows.length };
  });
}

const UNIT_HIGHLIGHT: [string, RegExp][] = [
  ['sacksAllowed', /\bsack/i],
  ['ypc', /\bper carry\b|\byards a carry\b/i],
  ['sacks', /\bsacks?\b/i],
  ['ints', /\bintercept|\bpicks?\b|\bturnovers?\b/i],
  ['papg', /\bpoints\b|\bgiving up\b|\ballow/i],
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
  /** The score the writer said this line is about. */
  play?: number;
  /** The same for each of `earlier`. */
  earlierPlays?: (number | undefined)[];
  team: Team;
  teams: Team[];
  players: Player[];
  /** Earlier lines of the same topic, oldest first. */
  earlier: string[];
}

function playerFocus(p: Player, text: string, players: Player[], topic?: FocusContext['topic']): Focus {
  const game = topic?.gameLines?.[p.id];
  // In a game breakdown, a player without a line from that game shows no
  // tiles of his own (the game's box score stays up) — never season numbers.
  const season = game ? null : topic?.gameLines ? null : computePlayerStatLine(p, players);
  // No numbers yet (a rookie, a new signing, between seasons): his profile.
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
  ['passYds', /\bpass|\bthrow|\bthrew|\bthrown|\bthrough the air/i],
  ['rushYds', /\brush|\bran\b|\brun\b|\bon the ground\b|\bcarr/i],
  ['to', /\bturn(ed|s)? (it|the ball) over|\bturnovers?\b|\bgave it away|\bpicks?\b|\bintercept|\bfumbl/i],
  ['sacks', /\bsack/i],
];

/** A line about a score: the touchdown, the kick, the drive, the lead. */
const SCORE_WORDS = /\btouchdowns?\b|\bTDs?\b|\bscor(e|ed|es|ing)\b|\bfield goals?\b|\bkick(ed|s)?\b|\bend zone\b|\bthe drive\b|\b(go-ahead|game-winning|game-winner)\b|\btook the lead\b|\btie[ds]? it\b|\banswer(ed|s)?\b|\bthe (catch|throw|run)\b|\b(found|hit) (him|\w+) for\b|\b\d+[- ]yard(er)?\b|\byarder\b|\bpunched it\b|\bwalk-off\b|\bsafety\b/i;
/** One play, not a stat line ("his touchdown", "the 34-yarder") — vs "two
 *  touchdowns and 140 yards", which is his numbers. */
const ONE_PLAY = /(\b(the|that|his|a|this)|'s) (touchdown|TD|score|field goal|kick|catch|throw|run|strike|play)\b|\b\d+[- ]yard(er)?\b|\byarder\b|\b(go-ahead|game-winning|game-winner)\b|\btook the lead\b|\btie[ds]? it\b|\bend zone\b|\bpunched it\b|\bwalk-off\b|\bthe drive\b/i;
/** A line about how the game went: who led, when, by how much. */
const BEHIND = /\b(were|was|got|being|fell) down\b|\bdown (seven|eight|ten|fourteen|three|four|six|eleven|twelve|thirteen|\d+)\b|\btrail(ed|ing)?\b|\bbehind\b|\bin a hole\b|\bcome-?back\b|\bcame back\b|\brall(y|ied)\b|\bdug out\b/i;
const AHEAD = /\bup (seven|eight|ten|fourteen|three|four|six|\d+)\b|\bpulled away\b|\bran away\b|\bbiggest lead\b|\bblew (it|the lead)\b|\bcomfortable lead\b/i;
const FLOW = /\bquarter\b|\bhalf(time)?\b|\bovertime\b|\blead changes?\b|\bback and forth\b|\bseesaw\b|\bmomentum\b|\bwire[- ]to[- ]wire\b|\bthe lead\b|\bthe flow\b|\bhow (this|that|the) game\b|\bthe finish\b|\blate\b|\bearly\b|\bthe final\b|\bthe game\b/i;
const QUARTER: [number, RegExp][] = [
  [1, /\bfirst quarter\b|\bopening (drive|quarter)\b/i],
  [2, /\bsecond quarter\b|\bbefore (the )?half(time)?\b|\bend of the (first )?half\b/i],
  [3, /\bthird quarter\b|\bout of (the )?half(time)?\b|\bsecond half\b/i],
  [4, /\bfourth quarter\b|\bthe fourth\b|\blate in the game\b|\bthe final (minutes|drive)\b/i],
  [5, /\bovertime\b|\bOT\b/],
];

/** The score a line is about, if it names one of the players in it. */
function momentOf(text: string, flow: GameFlow, named: Player | null): Focus | null {
  const quarter = QUARTER.find(([, re]) => re.test(text))?.[0];
  const inQ = (n: number) => quarter == null || flow.plays[n - 1]?.quarter === quarter;
  if (named && ONE_PLAY.test(text)) {
    const his = flow.plays.filter(p => p.playerIds.includes(named.id));
    if (his.length) {
      // "the 34-yarder" → that one; else the one in the quarter named; else his last.
      const yards = [...text.matchAll(/\b(\d+)[- ]yard/gi)].map(m => m[1]);
      const pick = his.find(p => yards.some(y => new RegExp(`\\b${y}\\b`).test(p.description)))
        ?? his.filter(p => inQ(p.n)).at(-1) ?? his.at(-1)!;
      return { kind: 'moment', play: pick.n };
    }
  }
  if (named) return null;
  if (BEHIND.test(text) && flow.lowPoint) return { kind: 'moment', play: flow.lowPoint };
  if (AHEAD.test(text) && flow.highPoint) return { kind: 'moment', play: flow.highPoint };
  if (quarter != null && SCORE_WORDS.test(text)) {
    const q = flow.plays.filter(p => p.quarter === quarter);
    if (q.length) return { kind: 'moment', play: q.at(-1)!.n, quarter };
  }
  if (quarter != null) return { kind: 'moment', play: null, quarter };
  if (FLOW.test(text) || SCORE_WORDS.test(text)) return { kind: 'moment', play: null };
  return null;
}

/** A player's profile when there are no stats to show. */
function profileTiles(p: Player): TileStat[] {
  const t = (key: string, label: string, value: string, note: string): TileStat => ({ key, label, value, rank: 0, of: 0, note });
  const c = p.contract;
  return [
    t('ovr', 'Overall', String(Math.round(p.ratings.overall)), `Potential ${Math.round(p.potential)}`),
    t('age', 'Age', String(p.age), p.position),
    ...(c ? [t('salary', 'Contract', `$${c.salary.toFixed(1)}M`, `${c.yearsLeft} yr${c.yearsLeft === 1 ? '' : 's'} left`)] : []),
  ];
}

/** Words that name a team (city, nickname, abbreviation): never read as a
 *  player's first or last name ("the Dallas defense" isn't Dallas Wilson). */
const teamWordCache = new WeakMap<Team[], Set<string>>();
function teamWords(teams: Team[]): Set<string> {
  let w = teamWordCache.get(teams);
  if (!w) {
    w = new Set(teams.flatMap(t => [...`${t.city} ${t.name}`.toLowerCase().split(/\s+/), t.abbreviation.toLowerCase()]));
    teamWordCache.set(teams, w);
  }
  return w;
}

/** Focus from one piece of text alone (no carry-over). */
function focusOf(text: string, c: FocusContext): Focus | null {
  const named = playerNamedIn(text, c.topic, c.players, [c.team.id, ...(c.topic?.teamIds ?? [])], teamWords(c.teams));
  // A game breakdown: a score that's being described goes on the timeline.
  const flow = c.topic?.gameFlow;
  if (flow) {
    const m = momentOf(text, flow, named);
    if (m) return m;
  }
  if (named) return playerFocus(named, text, c.players, c.topic);
  // A game breakdown: the game's box score, not season unit or team ranks.
  if (c.topic?.gameTeam) {
    for (const [role, re] of ROLE_WORDS) {
      if (!re.test(text)) continue;
      const p = starter(role, c.team, c.players);
      if (p) return playerFocus(p, text, c.players, c.topic);
    }
    const mentioned = GAME_WORDS.filter(([, re]) => re.test(text)).map(([k]) => k);
    // With the flow on hand, the box score only for the box-score numbers.
    if (flow && !mentioned.some(k => k !== 'pts')) return null;
    return { kind: 'team', mentioned };
  }
  const race = standingsOf(text);
  if (race) return race;
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

/** Whether the line itself names something to show (a player, a unit, a
 *  stat, a score…) — vs talk that only carries the conversation ("Right.",
 *  "You'd get lost."), which plays as a shot of the hosts instead. */
export function measurableIn(text: string, c: FocusContext): boolean {
  return !!(c.play && c.topic?.gameFlow?.plays[c.play - 1]) || focusOf(text, c) != null;
}

export function focusForLine(text: string, c: FocusContext): Focus {
  const flow = c.topic?.gameFlow;
  // The writer marked the score this line is about.
  if (flow && c.play && flow.plays[c.play - 1]) {
    // …unless the line is really about a player's numbers or the box score.
    const own = focusOf(text, c);
    if (!own || own.kind === 'moment' || (own.kind === 'player' && !own.mentioned.length)) return { kind: 'moment', play: c.play };
    return own;
  }
  const own = focusOf(text, c);
  // What the conversation was just on (the latest line in this topic that
  // was about something measurable).
  let prev: Focus | null = null;
  for (let k = c.earlier.length - 1; k >= 0 && !prev; k--) {
    const tagged = flow && c.earlierPlays?.[k];
    prev = tagged && flow.plays[tagged - 1] ? { kind: 'moment', play: tagged } : focusOf(c.earlier[k], c);
  }
  // "His completion rate…" — still the player they were talking about, even
  // though the line also mentions a team stat.
  const aboutHim = /\b(he|he's|his|him)\b/i.test(text);
  if (prev?.kind === 'player' && aboutHim && own?.kind !== 'player') return playerFocus(prev.player, text, c.players, c.topic);
  if (own) return own;
  // Nothing measurable in this line: stay on what they were just discussing,
  // so the numbers stay up rather than just the words.
  if (prev?.kind === 'player') return playerFocus(prev.player, text, c.players, c.topic);
  if (prev?.kind === 'unit') return { ...prev, mentioned: unitMentioned(text, prev.tiles) };
  if (prev?.kind === 'team') return { kind: 'team', mentioned: [] };
  if (prev?.kind === 'standings') return prev;
  if (prev?.kind === 'moment') return prev;
  // The headline sets the subject ("QB Watch", "Trenches trouble").
  if (c.topic?.headline) {
    const f = focusOf(c.topic.headline, c);
    if (f && f.kind !== 'team') return f.kind === 'player' ? playerFocus(f.player, text, c.players, c.topic) : f;
    const race = standingsOf(c.topic.headline);
    if (race) return race;
  }
  if (flow) return { kind: 'moment', play: null };
  // A topic about exactly one player.
  const ids = c.topic?.playerIds ?? [];
  if (ids.length === 1) {
    const p = c.players.find(x => x.id === ids[0]);
    if (p) return playerFocus(p, text, c.players, c.topic);
  }
  // Never a quote on its own: the team's numbers.
  return { kind: 'team', mentioned: [] };
}
