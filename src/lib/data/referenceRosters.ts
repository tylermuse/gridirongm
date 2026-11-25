/**
 * Server-only data access for public roster reference pages.
 *
 * Reads the shipped Football-GM roster export from /public/rosters at build
 * time and exposes typed getters for teams and per-team rosters. This module
 * uses node:fs, so it must only ever be imported from Server Components — the
 * multi-MB JSON must never be bundled for the client.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fbgmPickerTeam, type PickerTeam } from './leagueImport';

export interface EraMeta {
  slug: string;
  file: string;
  label: string;
  season: number;
  blurb: string;
}

// Start with the current season. Historical eras can be added here later.
const ERAS: Record<string, EraMeta> = {
  '2026': {
    slug: '2026',
    file: 'FBGM_NFL_Roster_2026_Updated.json',
    label: '2026 NFL Rosters',
    season: 2026,
    blurb:
      'Every NFL team’s 2026 roster — reconciled against real active rosters as of the season opener, with verified contracts and BS Football overall ratings for all 32 teams.',
  },
};

export interface RefTeam {
  tid: number;
  region: string;
  name: string;
  fullName: string;
  abbrev: string;
  colors: string[];
  won?: number;
  lost?: number;
  tied?: number;
}

export interface RefPlayer {
  pid: number;
  name: string;
  pos: string;
  ovr: number;
  pot: number;
  age: number | null;
  jersey: number | null;
  college: string;
  contractAmount: number; // thousands of dollars (FBGM native units)
  contractExp: number | null;
}

export const POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'];
const POS_RANK: Record<string, number> = Object.fromEntries(POS_ORDER.map((p, i) => [p, i]));

/** The slice of a Football GM export these pages read. */
interface RawTeam {
  tid: number;
  region?: string;
  name?: string;
  abbrev: string;
  colors?: string[];
  imgURL?: string;
  disabled?: boolean;
  seasons?: Array<{ won?: number; lost?: number; tied?: number }>;
}

interface RawPlayer {
  pid: number;
  tid: number;
  firstName?: string;
  lastName?: string;
  pos?: string;
  college?: string;
  jerseyNumber?: string | number | null;
  hgt?: number;
  weight?: number;
  born?: { year?: number };
  contract?: { amount?: number; exp?: number };
  injury?: { type?: string; gamesRemaining?: number };
  draft?: { year?: number; round?: number; pick?: number; tid?: number; originalTid?: number };
  ratings?: Array<Record<string, number | string | undefined> & { ovr?: number; pot?: number; pos?: string }>;
  stats?: Array<Record<string, unknown>>;
}

interface RawLeague {
  teams: RawTeam[];
  players: RawPlayer[];
}

const cache: Record<string, RawLeague> = {};

function loadEra(era: string): RawLeague | null {
  const meta = ERAS[era];
  if (!meta) return null;
  if (cache[era]) return cache[era];
  const filePath = path.join(process.cwd(), 'public', 'rosters', meta.file);
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as RawLeague;
  cache[era] = raw;
  return raw;
}

export function listEras(): EraMeta[] {
  return Object.values(ERAS);
}

export function getEraMeta(era: string): EraMeta | null {
  return ERAS[era] ?? null;
}

function toRefTeam(t: RawTeam): RefTeam {
  const season = Array.isArray(t.seasons) && t.seasons.length ? t.seasons[t.seasons.length - 1] : undefined;
  return {
    tid: t.tid,
    region: t.region ?? '',
    name: t.name ?? '',
    fullName: `${t.region ?? ''} ${t.name ?? ''}`.trim(),
    abbrev: t.abbrev ?? '',
    colors: Array.isArray(t.colors) ? t.colors : [],
    won: season?.won,
    lost: season?.lost,
    tied: season?.tied,
  };
}

export function getTeams(era: string): RefTeam[] {
  const raw = loadEra(era);
  if (!raw) return [];
  return raw.teams
    .filter((t) => !t.disabled && t.tid >= 0)
    .map(toRefTeam)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export function getTeamByAbbrev(era: string, abbrev: string): RefTeam | null {
  const raw = loadEra(era);
  if (!raw) return null;
  const t = raw.teams.find(
    (x) => !x.disabled && String(x.abbrev).toLowerCase() === abbrev.toLowerCase()
  );
  return t ? toRefTeam(t) : null;
}

export function getRoster(era: string, tid: number): RefPlayer[] {
  const raw = loadEra(era);
  if (!raw) return [];
  const meta = ERAS[era];
  const season = meta?.season ?? 0;
  const players: RefPlayer[] = raw.players
    .filter((p) => p.tid === tid && Array.isArray(p.ratings) && p.ratings.length)
    .map((p) => {
      const r = p.ratings![p.ratings!.length - 1]; // non-empty: filtered above
      const bornYear = p.born?.year;
      return {
        pid: p.pid,
        name: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(),
        pos: r.pos ?? '',
        ovr: typeof r.ovr === 'number' ? r.ovr : 0,
        pot: typeof r.pot === 'number' ? r.pot : 0,
        age: bornYear ? season - bornYear : null,
        jersey: p.jerseyNumber != null ? Number(p.jerseyNumber) : null,
        college: p.college ?? '',
        contractAmount: p.contract?.amount ?? 0,
        contractExp: p.contract?.exp ?? null,
      };
    });
  players.sort((a, b) => {
    const pa = POS_RANK[a.pos] ?? 99;
    const pb = POS_RANK[b.pos] ?? 99;
    if (pa !== pb) return pa - pb;
    return b.ovr - a.ovr;
  });
  return players;
}

/** Format FBGM contract amount (thousands) as a short dollar string. */
export function formatContract(amountThousands: number): string {
  if (!amountThousands) return '—';
  const millions = amountThousands / 1000;
  return `$${millions.toFixed(1)}M`;
}

/** The real 2026 teams as homepage picker tiles (names, colors, logos, current records). */
export function getPickerTeams(era: string): PickerTeam[] {
  const raw = loadEra(era);
  if (!raw) return [];
  return raw.teams.filter((t) => !t.disabled && t.tid >= 0).map(fbgmPickerTeam);
}

// ─── Player reference pages (/rosters/[era]/players/[slug]) ─────────────

export const RATING_LABELS: Record<string, string> = {
  hgt: 'Height', stre: 'Strength', spd: 'Speed', endu: 'Endurance',
  thv: 'Throwing vision', thp: 'Throwing power', tha: 'Throwing accuracy',
  bsc: 'Ball security', elu: 'Elusiveness', rtr: 'Route running', hnd: 'Hands',
  rbk: 'Run blocking', pbk: 'Pass blocking', pcv: 'Pass coverage', tck: 'Tackling',
  prs: 'Pass rushing', rns: 'Run stopping', kpw: 'Kicking power', kac: 'Kicking accuracy',
  ppw: 'Punting power', pac: 'Punting accuracy',
};

/** The ratings that drive each position's overall, most important first. */
export const KEY_RATINGS: Record<string, string[]> = {
  QB: ['tha', 'thp', 'thv', 'spd', 'elu', 'bsc'],
  RB: ['spd', 'elu', 'bsc', 'stre', 'hnd', 'rtr'],
  WR: ['rtr', 'hnd', 'spd', 'hgt', 'elu', 'bsc'],
  TE: ['hnd', 'rtr', 'rbk', 'pbk', 'stre', 'spd'],
  OL: ['pbk', 'rbk', 'stre', 'hgt', 'endu'],
  DL: ['prs', 'rns', 'stre', 'spd', 'hgt'],
  LB: ['tck', 'rns', 'pcv', 'prs', 'spd'],
  CB: ['pcv', 'spd', 'hgt', 'tck', 'hnd'],
  S: ['pcv', 'tck', 'spd', 'rns', 'hnd'],
  K: ['kpw', 'kac'],
  P: ['ppw', 'pac'],
};

export const POS_NAMES: Record<string, { one: string; many: string }> = {
  QB: { one: 'quarterback', many: 'quarterbacks' },
  RB: { one: 'running back', many: 'running backs' },
  WR: { one: 'wide receiver', many: 'wide receivers' },
  TE: { one: 'tight end', many: 'tight ends' },
  OL: { one: 'offensive lineman', many: 'offensive linemen' },
  DL: { one: 'defensive lineman', many: 'defensive linemen' },
  LB: { one: 'linebacker', many: 'linebackers' },
  CB: { one: 'cornerback', many: 'cornerbacks' },
  S: { one: 'safety', many: 'safeties' },
  K: { one: 'kicker', many: 'kickers' },
  P: { one: 'punter', many: 'punters' },
};

export interface RefPlayerDetail extends RefPlayer {
  slug: string;
  team: RefTeam;
  heightIn: number | null;
  weightLb: number | null;
  ratings: Record<string, number>;
  injury: { type: string; games: number } | null;
  draft: { year: number; round: number; pick: number; team: string | null } | null;
  /** Summed regular-season stats for the era's season (real NFL stats in the 2026 file). */
  seasonStats: Record<string, number> | null;
  /** Rank by OVR among rostered players at this position (1 = best). */
  posRank: number;
  posCount: number;
  /** Depth chart order on own team by OVR at this position (1 = top). */
  teamPosRank: number;
}

const STAT_KEYS = [
  'gp', 'gs', 'pssCmp', 'pss', 'pssYds', 'pssTD', 'pssInt', 'pssSk', 'rus', 'rusYds', 'rusTD', 'tgt', 'rec', 'recYds', 'recTD',
  'fmbLost', 'defTckSolo', 'defTckAst', 'defTckLoss', 'defSk', 'defInt', 'defPssDef', 'defFmbFrc', 'defFmbRec',
  'fg0', 'fga0', 'fg20', 'fga20', 'fg30', 'fga30', 'fg40', 'fga40', 'fg50', 'fga50', 'fgLng', 'xp', 'xpa', 'pnt', 'pntYds', 'pntIn20',
  'kr', 'krYds', 'pr', 'prYds',
];

export function slugifyName(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const detailCache: Record<string, RefPlayerDetail[]> = {};

/** Every rostered player in an era with the detail a player page needs. Slugs are unique per era. */
export function getPlayerDetails(era: string): RefPlayerDetail[] {
  if (detailCache[era]) return detailCache[era];
  const raw = loadEra(era);
  const meta = ERAS[era];
  if (!raw || !meta) return [];
  const teams = new Map(raw.teams.filter((t) => !t.disabled && t.tid >= 0).map((t) => [t.tid as number, toRefTeam(t)]));
  const abbrevByTid = new Map([...teams].map(([tid, t]) => [tid, t.abbrev]));

  const rows = raw.players
    .filter((p) => teams.has(p.tid) && Array.isArray(p.ratings) && p.ratings.length)
    .map((p) => {
      const r = p.ratings![p.ratings!.length - 1]; // non-empty: filtered above
      const pos: string = r.pos ?? p.pos ?? '';
      const ratings: Record<string, number> = {};
      for (const k of Object.keys(RATING_LABELS)) if (typeof r[k] === 'number') ratings[k] = Math.round(r[k]);
      let stats: Record<string, number> | null = null;
      for (const s of p.stats ?? []) {
        if (s.season !== meta.season || s.playoffs) continue;
        stats ??= Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
        for (const k of STAT_KEYS) {
          const v = Number(s[k] ?? 0);
          if (k === 'fgLng') stats[k] = Math.max(stats[k], v); else stats[k] += v;
        }
      }
      if (stats && !stats.gp) stats = null;
      const inj = p.injury && p.injury.type && p.injury.type !== 'Healthy' && (p.injury.gamesRemaining ?? 0) > 0
        ? { type: String(p.injury.type), games: Number(p.injury.gamesRemaining) }
        : null;
      const d = p.draft;
      const draft = d && d.year && d.round && d.round > 0
        ? { year: d.year, round: d.round, pick: d.pick ?? 0, team: abbrevByTid.get(d.originalTid ?? d.tid ?? -1) ?? null }
        : null;
      const bornYear = p.born?.year;
      return {
        pid: p.pid as number,
        name: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(),
        pos,
        ovr: typeof r.ovr === 'number' ? r.ovr : 0,
        pot: typeof r.pot === 'number' ? r.pot : 0,
        age: bornYear ? meta.season - bornYear : null,
        jersey: p.jerseyNumber != null && p.jerseyNumber !== '' ? Number(p.jerseyNumber) : null,
        college: p.college ?? '',
        contractAmount: p.contract?.amount ?? 0,
        contractExp: p.contract?.exp ?? null,
        slug: '',
        team: teams.get(p.tid)!,
        heightIn: typeof p.hgt === 'number' ? p.hgt : null,
        weightLb: typeof p.weight === 'number' ? p.weight : null,
        ratings,
        injury: inj,
        draft,
        seasonStats: stats,
        posRank: 0,
        posCount: 0,
        teamPosRank: 0,
      } satisfies RefPlayerDetail;
    });

  // Unique slugs. The highest-rated player with a name keeps the plain name
  // (the one people search for); namesakes get -pos, then -pos-team.
  const base = (x: RefPlayerDetail) => slugifyName(x.name) || `player-${x.pid}`;
  const taken = new Set<string>();
  for (const x of [...rows].sort((a, b) => b.ovr - a.ovr || a.pid - b.pid)) {
    const options = [base(x), `${base(x)}-${x.pos.toLowerCase()}`, `${base(x)}-${x.pos.toLowerCase()}-${x.team.abbrev.toLowerCase()}`];
    x.slug = options.find((o) => !taken.has(o)) ?? `${base(x)}-${x.pid}`;
    taken.add(x.slug);
  }

  // League and team ranks by OVR within position (ties share a rank).
  const byPos = new Map<string, RefPlayerDetail[]>();
  for (const x of rows) (byPos.get(x.pos) ?? byPos.set(x.pos, []).get(x.pos)!).push(x);
  for (const list of byPos.values()) {
    list.sort((a, b) => b.ovr - a.ovr);
    list.forEach((x) => { x.posRank = 1 + list.findIndex((y) => y.ovr === x.ovr); x.posCount = list.length; });
    const teamGroups = new Map<number, RefPlayerDetail[]>();
    for (const x of list) (teamGroups.get(x.team.tid) ?? teamGroups.set(x.team.tid, []).get(x.team.tid)!).push(x);
    for (const g of teamGroups.values()) g.forEach((x, i) => { x.teamPosRank = i + 1; });
  }

  detailCache[era] = rows;
  return rows;
}

export function getPlayerBySlug(era: string, slug: string): RefPlayerDetail | null {
  return getPlayerDetails(era).find((p) => p.slug === slug.toLowerCase()) ?? null;
}

/** Player pages worth indexing: anyone who has played a regular-season game this season. */
export function isIndexablePlayer(p: RefPlayerDetail): boolean {
  return !!p.seasonStats?.gp;
}

export function formatHeight(inches: number | null): string {
  if (!inches) return '—';
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}
