/**
 * Stat line for a single player on the Spotlight show's graphics: the
 * numbers that matter for their position, each ranked among the league's
 * players at that position (rate stats only among players with real volume).
 */
import type { Player, PlayerStats, Position } from '@/types';

export interface TileStat {
  key: string;
  label: string;
  value: string;
  /** 1 = best in the league at this position. */
  rank: number;
  of: number;
}

interface Def {
  key: string;
  label: string;
  /** Raw value used for ranking. */
  get: (s: PlayerStats) => number;
  format: (v: number) => string;
  lowerIsBetter?: boolean;
  /** Volume needed for a rate stat to count (ranked only among qualifiers). */
  volume?: (s: PlayerStats) => number;
}

const int = (v: number) => Math.round(v).toLocaleString('en-US');
const one = (v: number) => v.toFixed(1);
const pct = (v: number) => `${v.toFixed(1)}%`;
const safe = (a: number, b: number) => (b > 0 ? a / b : 0);

function passerRating(s: PlayerStats): number {
  const att = s.passAttempts;
  if (!att) return 0;
  const clamp = (x: number) => Math.max(0, Math.min(2.375, x));
  const a = clamp((s.passCompletions / att - 0.3) * 5);
  const b = clamp((s.passYards / att - 3) * 0.25);
  const c = clamp((s.passTDs / att) * 20);
  const d = clamp(2.375 - (s.interceptions / att) * 25);
  return ((a + b + c + d) / 6) * 100;
}

const DEFS: Record<string, Def[]> = {
  QB: [
    { key: 'passYds', label: 'Pass YDS', get: s => s.passYards, format: int },
    { key: 'cmp', label: 'CMP %', get: s => safe(s.passCompletions, s.passAttempts) * 100, format: pct, volume: s => s.passAttempts },
    { key: 'passTd', label: 'Pass TD', get: s => s.passTDs, format: int },
    { key: 'int', label: 'INT', get: s => s.interceptions, format: int, lowerIsBetter: true, volume: s => s.passAttempts },
    { key: 'rating', label: 'Rating', get: passerRating, format: one, volume: s => s.passAttempts },
  ],
  RB: [
    { key: 'rushYds', label: 'Rush YDS', get: s => s.rushYards, format: int },
    { key: 'ypc', label: 'YDS / Carry', get: s => safe(s.rushYards, s.rushAttempts), format: one, volume: s => s.rushAttempts },
    { key: 'rushTd', label: 'Rush TD', get: s => s.rushTDs, format: int },
    { key: 'recYds', label: 'Rec YDS', get: s => s.receivingYards, format: int },
    { key: 'fum', label: 'Fumbles', get: s => s.fumbles, format: int, lowerIsBetter: true, volume: s => s.rushAttempts },
  ],
  WR: [
    { key: 'rec', label: 'Catches', get: s => s.receptions, format: int },
    { key: 'recYds', label: 'Rec YDS', get: s => s.receivingYards, format: int },
    { key: 'ypr', label: 'YDS / Catch', get: s => safe(s.receivingYards, s.receptions), format: one, volume: s => s.receptions },
    { key: 'recTd', label: 'Rec TD', get: s => s.receivingTDs, format: int },
    { key: 'catchPct', label: 'Catch %', get: s => safe(s.receptions, s.targets) * 100, format: pct, volume: s => s.targets },
  ],
  DEF: [
    { key: 'tackles', label: 'Tackles', get: s => s.tackles, format: int },
    { key: 'sacks', label: 'Sacks', get: s => s.sacks, format: one },
    { key: 'tfl', label: 'TFL', get: s => s.tacklesForLoss, format: int },
    { key: 'defInt', label: 'INT', get: s => s.defensiveINTs, format: int },
    { key: 'pd', label: 'Pass Def', get: s => s.passDeflections, format: int },
  ],
  OL: [
    { key: 'snaps', label: 'Snaps', get: s => s.snaps, format: int },
    { key: 'sacksAllowed', label: 'Sacks Allowed', get: s => s.sacksAllowed, format: int, lowerIsBetter: true, volume: s => s.snaps },
    { key: 'passBlocks', label: 'Pass Blocks', get: s => s.passBlocks, format: int },
    { key: 'gp', label: 'Games', get: s => s.gamesPlayed, format: int },
  ],
  K: [
    { key: 'fgm', label: 'FG Made', get: s => s.fieldGoalsMade, format: int },
    { key: 'fgPct', label: 'FG %', get: s => safe(s.fieldGoalsMade, s.fieldGoalAttempts) * 100, format: pct, volume: s => s.fieldGoalAttempts },
    { key: 'xpPct', label: 'XP %', get: s => safe(s.extraPointsMade, s.extraPointAttempts) * 100, format: pct, volume: s => s.extraPointAttempts },
  ],
  P: [
    { key: 'punts', label: 'Punts', get: s => s.puntAttempts, format: int },
    { key: 'puntAvg', label: 'Avg', get: s => safe(s.puntYards, s.puntAttempts), format: one, volume: s => s.puntAttempts },
    { key: 'in20', label: 'Inside 20', get: s => s.puntsInside20, format: int },
  ],
};

const GROUP: Record<Position, string> = {
  QB: 'QB', RB: 'RB', WR: 'WR', TE: 'WR', OL: 'OL', DL: 'DEF', LB: 'DEF', CB: 'DEF', S: 'DEF', K: 'K', P: 'P',
};

/** Null until the player has played. */
export function computePlayerStatLine(player: Player, allPlayers: Player[]): TileStat[] | null {
  if (!player.stats || player.stats.gamesPlayed <= 0) return null;
  const group = GROUP[player.position];
  const defs = DEFS[group];
  if (!defs) return null;
  // Rank against everyone at the same position (TE with TE, CB with CB).
  const peers = allPlayers.filter(p => p.position === player.position && p.stats && p.stats.gamesPlayed > 0);
  return defs.map(d => {
    let pool = peers;
    if (d.volume) {
      // Rate stats: only players with at least a third of the top volume.
      const max = Math.max(0, ...peers.map(p => d.volume!(p.stats)));
      pool = peers.filter(p => d.volume!(p.stats) >= max / 3);
      if (!pool.some(p => p.id === player.id)) pool = [...pool, player];
    }
    const mine = d.get(player.stats);
    const better = pool.filter(p => (d.lowerIsBetter ? d.get(p.stats) < mine : d.get(p.stats) > mine)).length;
    return { key: d.key, label: d.label, value: d.format(mine), rank: better + 1, of: pool.length };
  });
}

const KEYWORDS: [string, RegExp][] = [
  ['cmp', /\bcomplet(ion|ions|ing|ed)\b|\baccura/i],
  ['int', /\bintercept|\bpicks?\b|\bturnovers?\b/i],
  ['rating', /\brating\b/i],
  ['passTd', /\btouchdown pass|\btd pass|\bpassing touchdowns?/i],
  ['passYds', /\bpassing yards\b|\bthrowing for\b/i],
  ['ypc', /\bper carry\b|\bypc\b/i],
  ['rushYds', /\brushing yards\b|\brushed for\b/i],
  ['rushTd', /\brushing touchdowns?\b/i],
  ['fum', /\bfumbl/i],
  ['rec', /\bcatch(es)?\b|\breceptions?\b|\bcaught\b/i],
  ['recYds', /\breceiving yards\b|\byards receiving\b/i],
  ['recTd', /\btouchdown catch|\breceiving touchdowns?\b/i],
  ['tackles', /\btackl/i],
  ['sacks', /\bsacks?\b/i],
  ['defInt', /\bintercept|\bpicks?\b/i],
  ['pd', /\bpass(es)? defended\b|\bdeflect|\bbreakups?\b/i],
  ['fgPct', /\bfield goals?\b|\bkick(ing|er)\b/i],
];

/** Player-stat tiles a line of commentary is talking about. */
export function playerStatsMentioned(text: string, tiles: TileStat[]): string[] {
  const keys = new Set(tiles.map(t => t.key));
  return KEYWORDS.filter(([k, re]) => keys.has(k) && re.test(text)).map(([k]) => k);
}
