/**
 * Stat line for a single player on the Spotlight show's graphics: the
 * numbers that matter for his position, each ranked among the league's
 * players at that position (rate stats only among players with real volume).
 * Basketball port of BS Football's playerStats.
 */
import type { ShowPlayer, ShowPlayerStats } from './types';

export interface TileStat {
  key: string;
  label: string;
  value: string;
  /** 1 = best in the league at this position (0 = not ranked: shown with `note`). */
  rank: number;
  of: number;
  note?: string;
}

interface Def {
  key: string;
  label: string;
  /** Raw value used for ranking. */
  get: (s: ShowPlayerStats) => number;
  format: (v: number) => string;
  lowerIsBetter?: boolean;
  /** Volume needed for a rate stat to count (ranked only among qualifiers). */
  volume?: (s: ShowPlayerStats) => number;
}

const one = (v: number) => v.toFixed(1);
const pct = (v: number) => `${v.toFixed(1)}%`;
const safe = (a: number, b: number) => (b > 0 ? a / b : 0);
const pg = (k: keyof ShowPlayerStats) => (s: ShowPlayerStats) => safe(s[k], s.gamesPlayed);
const ts = (s: ShowPlayerStats) => safe(s.points, 2 * (s.fieldGoalsAttempted + 0.44 * s.freeThrowsAttempted)) * 100;

const PPG: Def = { key: 'ppg', label: 'PPG', get: pg('points'), format: one };
const RPG: Def = { key: 'rpg', label: 'RPG', get: pg('totalRebounds'), format: one };
const APG: Def = { key: 'apg', label: 'APG', get: pg('assists'), format: one };
const TS: Def = { key: 'ts', label: 'TS %', get: ts, format: pct, volume: s => s.fieldGoalsAttempted };
const FG3: Def = { key: 'fg3', label: '3P %', get: s => safe(s.threePointsMade, s.threePointsAttempted) * 100, format: pct, volume: s => s.threePointsAttempted };
const BPG: Def = { key: 'bpg', label: 'BPG', get: pg('blocks'), format: one };
const SPG: Def = { key: 'spg', label: 'SPG', get: pg('steals'), format: one };
const TOV: Def = { key: 'tov', label: 'TOV', get: pg('turnovers'), format: one, lowerIsBetter: true, volume: s => s.minutes };

const DEFS: Record<string, Def[]> = {
  PG: [PPG, APG, TS, FG3, TOV],
  SG: [PPG, FG3, TS, APG, SPG],
  SF: [PPG, RPG, FG3, TS, SPG],
  PF: [PPG, RPG, TS, BPG, APG],
  C: [PPG, RPG, BPG, TS, APG],
};

/** This season's line, or last season's between seasons. */
export function showSeasonStats(p: ShowPlayer): ShowPlayerStats | null {
  if (p.stats && p.stats.gamesPlayed > 0) return p.stats;
  return p.lastSeasonStats && p.lastSeasonStats.gamesPlayed > 0 ? p.lastSeasonStats : null;
}

/** Null until the player has played. */
export function computePlayerStatLine(player: ShowPlayer, allPlayers: ShowPlayer[]): TileStat[] | null {
  const own = showSeasonStats(player);
  if (!own) return null;
  const defs = DEFS[player.position];
  if (!defs) return null;
  // Rank against everyone at the same position, on the same footing, and only
  // players who actually played (a third of the most games).
  const all = allPlayers.flatMap(p => {
    if (p.position !== player.position) return [];
    const s = p.id === player.id ? own : showSeasonStats(p);
    return s ? [{ id: p.id, s }] : [];
  });
  const maxGp = Math.max(0, ...all.map(p => p.s.gamesPlayed));
  const peers = all.filter(p => p.id === player.id || p.s.gamesPlayed >= maxGp / 3);
  return defs.map(d => {
    let pool = peers;
    if (d.volume) {
      const max = Math.max(0, ...peers.map(p => d.volume!(p.s)));
      pool = peers.filter(p => d.volume!(p.s) >= max / 3);
      if (!pool.some(p => p.id === player.id)) pool = [...pool, { id: player.id, s: own }];
    }
    const mine = d.get(own);
    if (mine === 0 && !d.lowerIsBetter && !d.volume) return { key: d.key, label: d.label, value: d.format(mine), rank: 0, of: 0, note: 'None' };
    const better = pool.filter(p => (d.lowerIsBetter ? d.get(p.s) < mine : d.get(p.s) > mine)).length;
    return { key: d.key, label: d.label, value: d.format(mine), rank: better + 1, of: pool.length };
  });
}

/** What a player's tiles cover: "This season · 24 games". */
export function statSpanLabel(p: ShowPlayer): string | null {
  const s = showSeasonStats(p);
  if (!s) return null;
  const current = !!p.stats && p.stats.gamesPlayed > 0;
  return `${current ? 'This season' : 'Last season'} · ${s.gamesPlayed} game${s.gamesPlayed === 1 ? '' : 's'}`;
}

const KEYWORDS: [string, RegExp][] = [
  ['ppg', /\bpoints\b|\bscor(e|es|ed|ing)\b|\bbuckets\b|\ba night\b/i],
  ['rpg', /\brebound|\bthe glass\b|\bboards\b/i],
  ['apg', /\bassists?\b|\bdimes\b|\bplaymak|\bsetting (up|guys up)\b/i],
  ['ts', /\befficien|\btrue shooting\b|\bshooting\b/i],
  ['fg3', /\bthree|\bfrom deep\b|\bfrom downtown\b|\bthe arc\b/i],
  ['bpg', /\bblock|\brim protect/i],
  ['spg', /\bsteals?\b|\bpick(ing)? pockets\b/i],
  ['tov', /\bturnovers?\b|\bturning it over\b|\bcoughing it up\b/i],
];

/** Player-stat tiles a line of commentary is talking about. */
export function playerStatsMentioned(text: string, tiles: TileStat[]): string[] {
  const keys = new Set(tiles.map(t => t.key));
  return KEYWORDS.filter(([k, re]) => keys.has(k) && re.test(text)).map(([k]) => k);
}
