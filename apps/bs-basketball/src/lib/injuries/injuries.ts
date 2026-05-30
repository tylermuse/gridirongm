/**
 * Injuries (Phase 2E-2).
 *
 * App-side injury state on `league.sportData.injuries` (keyed by playerId) — a
 * day-based model that fits the sim's day-of-season calendar without touching
 * the engine. Each played game rolls a small, minutes-scaled injury chance for
 * the players who appeared; injuries heal once their return day passes. Injured
 * players are filtered out of the snapshot the sim builds, so they neither play
 * nor get auto-slotted into a lineup.
 */

import type { BaseGameResult, BaseLeagueState, PlayerId } from '@bs/core/adapter';
import type { BasketballPlayer, BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;
type GameResult = BaseGameResult<BasketballStats>;

export type InjurySeverity = 'day_to_day' | 'minor' | 'major' | 'season_ending';

export interface InjuryRecord {
  playerId: PlayerId;
  bodyPart: string;
  severity: InjurySeverity;
  occurredDay: number;
  /** Day-of-season the player is available again (huge number = out for season). */
  returnDay: number;
}

export type InjuryMap = Record<string, InjuryRecord>;

interface LeagueSportData {
  injuries?: InjuryMap;
  [key: string]: unknown;
}

const BODY_PARTS = ['ankle', 'knee', 'hamstring', 'shoulder', 'wrist', 'back', 'foot', 'calf', 'hip', 'groin'];
/** Base per-game injury probability at 36 minutes. */
const BASE_INJURY_RATE = 0.012;
const OUT_FOR_SEASON = 100_000;

export const SEVERITY_LABEL: Record<InjurySeverity, string> = {
  day_to_day: 'day-to-day',
  minor: 'minor',
  major: 'major',
  season_ending: 'season-ending',
};

// ===========================================================================
// Accessors
// ===========================================================================

export function getInjuries(league: LeagueState): InjuryMap {
  return (league.sportData as LeagueSportData | undefined)?.injuries ?? {};
}

export function isInjuredOn(injuries: InjuryMap, playerId: string, day: number): boolean {
  const inj = injuries[playerId];
  return !!inj && inj.returnDay > day;
}

function setInjuries(league: LeagueState, injuries: InjuryMap): LeagueState {
  return { ...league, sportData: { ...(league.sportData as LeagueSportData), injuries } };
}

/** Roster players who are healthy as of `day`. */
export function healthyPlayers(
  players: BasketballPlayer[],
  injuries: InjuryMap,
  day: number,
): BasketballPlayer[] {
  return players.filter(p => !isInjuredOn(injuries, p.id, day));
}

// ===========================================================================
// Healing + rolling
// ===========================================================================

/** Drop injuries that have healed by `day` (returns a new league only if changed). */
export function clearHealed(league: LeagueState, day: number): LeagueState {
  const injuries = getInjuries(league);
  const next: InjuryMap = {};
  let changed = false;
  for (const [id, inj] of Object.entries(injuries)) {
    if (inj.returnDay > day) next[id] = inj;
    else changed = true;
  }
  return changed ? setInjuries(league, next) : league;
}

/** Roll injuries for everyone who logged minutes in `game` (played on `day`),
 *  returning a new injuries map with any new ones added. Pure. */
export function rollGameInjuries(
  injuries: InjuryMap,
  game: GameResult,
  day: number,
  season: number,
): InjuryMap {
  let result = injuries;
  for (const [pid, box] of Object.entries(game.boxScores)) {
    if (result[pid]) continue; // already hurt
    const minutes = box.minutes ?? 0;
    if (minutes <= 0) continue;
    const rng = makeRng(`injury-${game.id}-${pid}-${season}`);
    const chance = BASE_INJURY_RATE * Math.min(1.4, minutes / 36);
    if (rng.random() >= chance) continue;
    if (result === injuries) result = { ...injuries }; // copy-on-write
    result[pid] = makeInjury(pid as PlayerId, day, rng);
  }
  return result;
}

function makeInjury(playerId: PlayerId, day: number, rng: Rng): InjuryRecord {
  const bodyPart = BODY_PARTS[rng.int(BODY_PARTS.length)];
  const roll = rng.random();
  let severity: InjurySeverity;
  let returnDay: number;
  if (roll < 0.68) { severity = 'day_to_day'; returnDay = day + 2 + rng.int(4); }
  else if (roll < 0.89) { severity = 'minor'; returnDay = day + 7 + rng.int(8); }
  else if (roll < 0.98) { severity = 'major'; returnDay = day + 21 + rng.int(25); }
  else { severity = 'season_ending'; returnDay = OUT_FOR_SEASON; }
  return { playerId, bodyPart, severity, occurredDay: day, returnDay };
}

/** Apply healing + per-game injury rolls for a set of games played on `day`. */
export function applyInjuryRolls(
  league: LeagueState,
  playedGames: GameResult[],
  day: number,
  season: number,
): LeagueState {
  let injuries = getInjuries(clearHealed(league, day));
  for (const g of playedGames) {
    injuries = rollGameInjuries(injuries, g, day, season);
  }
  return setInjuries(league, injuries);
}

// ===========================================================================
// Tiny seeded RNG (consistent with the rest of the app)
// ===========================================================================

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
