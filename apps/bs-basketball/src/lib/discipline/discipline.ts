/**
 * Discipline — suspensions + fines (parity audit #13).
 *
 * Mirrors the injury model: app-side state on `league.sportData.discipline`
 * (keyed by playerId), a day-based calendar that needs no engine changes.
 * After each game, players who fouled out have a small, deterministic (seeded)
 * chance of an on-court incident — a 1–2 game suspension (which gates lineup
 * availability exactly like an injury) or a technical-foul fine (news flavor
 * only, never benches anyone). Backward-compatible: absent on old saves = none.
 */

import type { BaseGameResult, BaseLeagueState, PlayerId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;
type GameResult = BaseGameResult<BasketballStats>;

export type DisciplineKind = 'suspension' | 'fine';

export interface DisciplineRecord {
  playerId: PlayerId;
  kind: DisciplineKind;
  reason: string;
  /** Games suspended (0 for a fine). */
  games: number;
  /** Fine amount in dollars (0 for a suspension). */
  fine: number;
  occurredDay: number;
  /** Day the player is available again. For a fine this equals occurredDay. */
  returnDay: number;
}

export type DisciplineMap = Record<string, DisciplineRecord>;

interface LeagueSportData {
  discipline?: DisciplineMap;
  [key: string]: unknown;
}

const SUSPENSION_REASONS = [
  'ejected after a flagrant-2 altercation',
  'suspended for escalating an on-court confrontation',
  'suspended for making contact with an official',
  'suspended for leaving the bench during an altercation',
];
const FINE_REASONS = [
  'fined for a technical foul',
  'fined for unsportsmanlike conduct',
  'fined for arguing a call',
];

export function getDiscipline(league: LeagueState): DisciplineMap {
  return (league.sportData as LeagueSportData | undefined)?.discipline ?? {};
}

/** True if the player is serving a suspension on `day`. Fines never gate. */
export function isSuspendedOn(discipline: DisciplineMap, playerId: string, day: number): boolean {
  const d = discipline[playerId];
  return !!d && d.kind === 'suspension' && d.returnDay > day;
}

function setDiscipline(league: LeagueState, discipline: DisciplineMap): LeagueState {
  return { ...league, sportData: { ...(league.sportData as LeagueSportData), discipline } };
}

/** Drop suspensions that have been served by `day` (fines linger as a record
 *  for news but are harmless). Returns a new league only if changed. */
export function clearServed(league: LeagueState, day: number): LeagueState {
  const discipline = getDiscipline(league);
  const next: DisciplineMap = {};
  let changed = false;
  for (const [id, d] of Object.entries(discipline)) {
    if (d.kind === 'suspension' && d.returnDay <= day) { changed = true; continue; }
    next[id] = d;
  }
  return changed ? setDiscipline(league, next) : league;
}

/** Roll discipline for everyone who fouled out (6+ PF) in `game`. Pure. */
export function rollGameDiscipline(
  discipline: DisciplineMap,
  game: GameResult,
  day: number,
  season: number,
): DisciplineMap {
  let result = discipline;
  for (const [pid, box] of Object.entries(game.boxScores)) {
    if (result[pid]?.kind === 'suspension' && result[pid].returnDay > day) continue; // already out
    if ((box.personalFouls ?? 0) < 6) continue; // only foul-outs are eligible
    const rng = makeRng(`disc-${game.id}-${pid}-${season}`);
    const roll = rng.random();
    let rec: DisciplineRecord | null = null;
    if (roll < 0.05) {
      const games = rng.random() < 0.25 ? 2 : 1;
      rec = {
        playerId: pid as PlayerId, kind: 'suspension',
        reason: SUSPENSION_REASONS[rng.int(SUSPENSION_REASONS.length)],
        games, fine: 0, occurredDay: day, returnDay: day + games,
      };
    } else if (roll < 0.13) {
      rec = {
        playerId: pid as PlayerId, kind: 'fine',
        reason: FINE_REASONS[rng.int(FINE_REASONS.length)],
        games: 0, fine: 15_000 + rng.int(20) * 5_000, occurredDay: day, returnDay: day,
      };
    }
    if (!rec) continue;
    if (result === discipline) result = { ...discipline };
    result[pid] = rec;
  }
  return result;
}

/** Apply clearing + per-game discipline rolls for games played on `day`. */
export function applyDisciplineRolls(
  league: LeagueState,
  playedGames: GameResult[],
  day: number,
  season: number,
): LeagueState {
  let discipline = getDiscipline(clearServed(league, day));
  for (const g of playedGames) discipline = rollGameDiscipline(discipline, g, day, season);
  return setDiscipline(league, discipline);
}

// Tiny seeded RNG (matches the injury module's generator).
interface Rng { random(): number; int(n: number): number }
function makeRng(seed: string): Rng {
  let s = hash(seed);
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { random: next, int: (n: number) => Math.floor(next() * n) };
}
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
