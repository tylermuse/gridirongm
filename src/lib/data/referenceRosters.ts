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

interface RawLeague {
  teams: any[];
  players: any[];
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

function toRefTeam(t: any): RefTeam {
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
      const r = p.ratings[p.ratings.length - 1];
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
