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
import { computePlayerStatLine, playerStatsMentioned, type TileStat } from './playerStats';
import { statsMentioned } from './teamStats';
import { playerNamedIn, type VisualTopic } from './showVisuals';

export type Unit = 'oline' | 'run' | 'front' | 'secondary';

export type Focus =
  | { kind: 'player'; player: Player; tiles: TileStat[] | null; label: string; mentioned: string[] }
  | { kind: 'unit'; unit: Unit; tiles: TileStat[]; label: string; mentioned: string[] }
  | { kind: 'team'; mentioned: string[] }
  | { kind: 'none' };

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
    const s = p.stats;
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
    const gp = Math.max(1, t.record.wins + t.record.losses + (t.record.ties ?? 0));
    const sum = { sacksAllowed: 0, rushYds: 0, rushAtt: 0, rushTd: 0, passYds: 0, sacks: 0, tfl: 0, ff: 0, ints: 0, pd: 0 };
    for (const p of players) {
      if (p.teamId !== t.id || !p.stats) continue;
      const s = p.stats;
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
    }
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
  };
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
  const tiles = game ?? (topic?.gameLines ? null : computePlayerStatLine(p, players));
  return {
    kind: 'player', player: p, tiles,
    label: game ? `${p.firstName} ${p.lastName} · ${topic?.gameLabel ?? 'this game'}` : `${p.firstName} ${p.lastName} · ${p.position} ranks`,
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

/** Focus from one piece of text alone (no carry-over). */
function focusOf(text: string, c: FocusContext): Focus | null {
  const named = playerNamedIn(text, c.topic, c.players, [c.team.id, ...(c.topic?.teamIds ?? [])]);
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

export function focusForLine(text: string, c: FocusContext): Focus {
  const own = focusOf(text, c);
  if (own) return own;
  // A topic about a player stays on him ("Bench him. I said what I said.").
  for (let k = c.earlier.length - 1; k >= 0; k--) {
    const f = focusOf(c.earlier[k], c);
    if (f?.kind === 'player') return playerFocus(f.player, text, c.players, c.topic);
  }
  // The headline sets the subject ("QB Watch", "Trenches trouble").
  if (c.topic?.headline) {
    const f = focusOf(c.topic.headline, c);
    if (f && f.kind !== 'team') return f.kind === 'player' ? playerFocus(f.player, text, c.players, c.topic) : f;
  }
  // A topic about exactly one player.
  const ids = c.topic?.playerIds ?? [];
  if (ids.length === 1) {
    const p = c.players.find(x => x.id === ids[0]);
    if (p) return playerFocus(p, text, c.players, c.topic);
  }
  return { kind: 'none' };
}
