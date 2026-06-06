/**
 * God Mode (parity 3.1).
 *
 * A save-level toggle that unlocks direct editing of players (overall, age,
 * potential). Stored on league.sportData.godMode so it travels with the save.
 * All editing is pure here; the store wraps these + persists.
 */

import { computeOverall, type BasketballPlayer, type BasketballRatings, type BasketballStats } from '@bs/sport-basketball';
import type { BaseLeagueState, PlayerId } from '@bs/core/adapter';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

interface LeagueSportData {
  godMode?: boolean;
  /** Sticky: once God Mode is used, the save is forever excluded from the
   *  global GM leaderboard (closes the toggle-off-to-sync-clean loophole). */
  godModeEverUsed?: boolean;
  [key: string]: unknown;
}

/** Skill ratings that feed computeOverall (everything except height/wingspan/overall). */
const OVR_SKILL_KEYS: (keyof BasketballRatings)[] = [
  'speed', 'strength', 'vertical',
  'threePoint', 'midRange', 'finishing', 'freeThrow', 'postScoring',
  'handles', 'passing',
  'perimeterDefense', 'interiorDefense', 'rebounding', 'steal', 'block',
  'basketballIQ', 'intangibles',
];

function clamp(n: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, Math.round(n))); }

export function isGodMode(league: LeagueState | null): boolean {
  return !!(league?.sportData as LeagueSportData | undefined)?.godMode;
}

/** True if God Mode has ever been turned on / used in this save (sticky). */
export function godModeEverUsed(league: LeagueState | null): boolean {
  return !!(league?.sportData as LeagueSportData | undefined)?.godModeEverUsed;
}

export function setGodMode(league: LeagueState, on: boolean): LeagueState {
  const sd = league.sportData as LeagueSportData;
  return { ...league, sportData: { ...sd, godMode: on, godModeEverUsed: sd?.godModeEverUsed || on } };
}

/** Shift skill ratings by a uniform delta until computeOverall hits `target`. */
function scaleToOverall(base: BasketballRatings, position: BasketballPlayer['sportData']['position'], target: number): BasketballRatings {
  const at = (d: number) => {
    const probe = { ...base };
    for (const k of OVR_SKILL_KEYS) probe[k] = clamp(base[k] + d, 0, 99);
    return computeOverall(probe, position);
  };
  let lo = -60, hi = 60;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) < target) lo = mid; else hi = mid;
  }
  const d = (lo + hi) / 2;
  const out = { ...base };
  for (const k of OVR_SKILL_KEYS) out[k] = clamp(base[k] + d, 0, 99);
  return out;
}

export interface PlayerEdit {
  setOverall?: number;
  age?: number;
  potential?: number;
}

/** Apply a God-Mode edit to a player. No-op unless God Mode is on. Pure. */
export function editPlayer(league: LeagueState, playerId: string, patch: PlayerEdit): LeagueState {
  if (!isGodMode(league)) return league;
  const p = league.players[playerId as PlayerId] as BasketballPlayer | undefined;
  if (!p) return league;

  let ratings = { ...p.ratings };
  if (patch.setOverall != null) {
    ratings = scaleToOverall(ratings, p.sportData.position, clamp(patch.setOverall, 40, 99));
  }
  ratings.overall = computeOverall(ratings, p.sportData.position);

  const age = patch.age != null ? clamp(patch.age, 18, 44) : p.age;
  const potential = patch.potential != null
    ? clamp(patch.potential, ratings.overall, 99)
    : Math.max(p.development.potential, ratings.overall);

  const players = {
    ...league.players,
    [playerId]: { ...p, ratings, age, development: { ...p.development, potential } },
  };
  // Editing a player is a God-Mode action — stamp the sticky flag.
  const sd = league.sportData as LeagueSportData;
  return { ...league, players, sportData: { ...sd, godModeEverUsed: true } };
}
