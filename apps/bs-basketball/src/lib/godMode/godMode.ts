/**
 * God Mode (parity 3.1).
 *
 * A save-level toggle that unlocks direct editing of players — every rating
 * (overall recomputed via computeOverall), age, potential, position, contract,
 * injury, trade request — and creating new players via the real generator.
 * Stored on league.sportData.godMode so it travels with the save.
 * All editing is pure here; the store wraps these + persists.
 */

import {
  computeOverall, generateBasketballPlayer, BASKETBALL_POSITIONS,
  type BasketballPlayer, type BasketballPosition, type BasketballRatings, type BasketballStats,
} from '@bs/sport-basketball';
import type { BaseContract, BaseLeagueState, PlayerId } from '@bs/core/adapter';
import type { InjuryMap } from '../injuries';

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

/** Every individually-editable rating (all but the computed `overall`). */
export const EDITABLE_RATING_KEYS: (keyof BasketballRatings)[] = [
  'height', 'wingspan', ...OVR_SKILL_KEYS,
];

export interface PlayerEdit {
  /** Scale all skill ratings uniformly until overall hits this target. Applied
   *  BEFORE `ratings`, so explicit per-rating values win. */
  setOverall?: number;
  age?: number;
  potential?: number;
  /** Per-rating overrides (0-99; height 66-92in, wingspan 66-98in). Overall is
   *  always recomputed via computeOverall afterwards. */
  ratings?: Partial<Omit<BasketballRatings, 'overall'>>;
  position?: BasketballPosition;
  /** Rewrite the remaining contract: flat salary for `years` seasons from the
   *  current season. `years: 0` voids the contract. */
  contract?: { salaryPerYear: number; years: number };
  /** `null` clears any injury; an object sets one lasting `days` from today. */
  injury?: { days: number; bodyPart?: string } | null;
  /** `null` clears a trade request; 'requested' files one now. */
  tradeRequest?: null | 'unhappy' | 'requested';
}

const RATING_RANGE: Partial<Record<keyof BasketballRatings, [number, number]>> = {
  height: [66, 92],
  wingspan: [66, 98],
};

function starTierFor(ovr: number): BasketballPlayer['sportData']['starTier'] {
  if (ovr >= 95) return 'superstar';
  if (ovr >= 88) return 'star';
  if (ovr >= 80) return 'starter';
  if (ovr >= 73) return 'role';
  return 'bench';
}

function stampUsed(league: LeagueState): LeagueState {
  const sd = league.sportData as LeagueSportData;
  return { ...league, sportData: { ...sd, godModeEverUsed: true } };
}

function contractFor(salaryPerYear: number, years: number, season: number): BaseContract {
  const salary = Math.max(0, Math.round(salaryPerYear));
  const ys = [];
  for (let i = 0; i < years; i++) ys.push({ season: season + i, baseSalary: salary, proratedBonus: 0, guaranteed: true });
  return {
    years: ys,
    signedSeason: season,
    guaranteedAtSigning: salary * years,
    modifications: [],
    sportData: { contractType: 'god_mode' },
  };
}

/** Apply a God-Mode edit to a player. No-op unless God Mode is on. Pure. */
export function editPlayer(league: LeagueState, playerId: string, patch: PlayerEdit): LeagueState {
  if (!isGodMode(league)) return league;
  const p = league.players[playerId as PlayerId] as BasketballPlayer | undefined;
  if (!p) return league;

  const position: BasketballPosition = patch.position && BASKETBALL_POSITIONS.includes(patch.position)
    ? patch.position
    : p.sportData.position;

  let ratings = { ...p.ratings };
  if (patch.setOverall != null) {
    ratings = scaleToOverall(ratings, position, clamp(patch.setOverall, 40, 99));
  }
  if (patch.ratings) {
    for (const k of EDITABLE_RATING_KEYS) {
      const v = (patch.ratings as Partial<BasketballRatings>)[k];
      if (v == null || !Number.isFinite(v)) continue;
      const [lo, hi] = RATING_RANGE[k] ?? [0, 99];
      ratings[k] = clamp(v, lo, hi);
    }
  }
  // Single source of truth for OVR — same formula generation + aging use.
  ratings.overall = computeOverall(ratings, position);

  const age = patch.age != null ? clamp(patch.age, 18, 44) : p.age;
  const potential = patch.potential != null
    ? clamp(patch.potential, ratings.overall, 99)
    : Math.max(p.development.potential, ratings.overall);

  let sportData: BasketballPlayer['sportData'] = {
    ...p.sportData,
    position,
    starTier: starTierFor(ratings.overall),
  };
  if (sportData.secondaryPosition === position) delete sportData.secondaryPosition;
  if (patch.tradeRequest !== undefined) {
    if (patch.tradeRequest === null) {
      const { tradeRequest: _drop, ...rest } = sportData;
      void _drop;
      sportData = rest;
    } else {
      sportData = {
        ...sportData,
        tradeRequest: {
          stage: patch.tradeRequest,
          since: league.currentTick,
          ...(patch.tradeRequest === 'requested' ? { requestedOn: league.currentTick } : {}),
          reason: 'Commissioner decree',
          season: league.currentSeason,
        },
      };
    }
  }

  let contract = p.contract;
  if (patch.contract) {
    const years = clamp(patch.contract.years, 0, 5);
    contract = years === 0 ? null : contractFor(patch.contract.salaryPerYear, years, league.currentSeason);
  }

  let next: LeagueState = {
    ...league,
    players: {
      ...league.players,
      [playerId]: { ...p, ratings, age, contract, sportData, development: { ...p.development, potential } },
    },
  };

  if (patch.injury !== undefined) next = setInjury(next, playerId, patch.injury);
  // Editing a player is a God-Mode action — stamp the sticky flag.
  return stampUsed(next);
}

/** Set or clear a player's injury (God Mode). Pure. */
function setInjury(league: LeagueState, playerId: string, injury: PlayerEdit['injury']): LeagueState {
  const sd = league.sportData as LeagueSportData & { injuries?: InjuryMap };
  const injuries: InjuryMap = { ...(sd.injuries ?? {}) };
  if (injury === null || injury === undefined) {
    delete injuries[playerId];
  } else {
    const days = clamp(injury.days, 1, 400);
    injuries[playerId] = {
      playerId: playerId as PlayerId,
      bodyPart: injury.bodyPart ?? 'ankle',
      severity: days <= 3 ? 'day_to_day' : days <= 14 ? 'minor' : days <= 120 ? 'major' : 'season_ending',
      occurredDay: league.currentTick,
      returnDay: league.currentTick + days,
    };
  }
  return { ...league, sportData: { ...sd, injuries } };
}

export interface CreatePlayerOpts {
  position: BasketballPosition;
  age: number;
  targetOverall: number;
  /** Team to add him to; omitted/null → free-agent pool. */
  teamId?: string | null;
  /** Contract when added to a team. Defaults to 1yr at the vet minimum-ish $2M. */
  contract?: { salaryPerYear: number; years: number };
  firstName?: string;
  lastName?: string;
}

/**
 * Create a brand-new player through the real generator (position templates +
 * OVR targeting), then land him on a team or in free agency. No-op unless God
 * Mode is on. Returns the league and the new player's id.
 */
export function createPlayer(league: LeagueState, opts: CreatePlayerOpts): { league: LeagueState; playerId: string | null } {
  if (!isGodMode(league)) return { league, playerId: null };
  const position = BASKETBALL_POSITIONS.includes(opts.position) ? opts.position : 'SF';
  const age = clamp(opts.age, 18, 44);
  const target = clamp(opts.targetOverall, 40, 99);
  const n = Object.keys(league.players).length;
  let id = `god-${league.currentSeason}-${n}`;
  for (let i = 1; league.players[id as PlayerId]; i++) id = `god-${league.currentSeason}-${n}-${i}`;

  const gen = generateBasketballPlayer({ position, age, targetOverall: target, idOverride: id });
  // Land exactly on the requested OVR via the editor's own scaler.
  const ratings = scaleToOverall(gen.ratings, position, target);
  ratings.overall = computeOverall(ratings, position);
  const player: BasketballPlayer = {
    ...gen,
    firstName: opts.firstName?.trim() || gen.firstName,
    lastName: opts.lastName?.trim() || gen.lastName,
    ratings,
    development: { ...gen.development, potential: Math.max(gen.development.potential, ratings.overall) },
    sportData: { ...gen.sportData, starTier: starTierFor(ratings.overall), acquiredVia: 'free-agency', acquiredSeason: league.currentSeason },
  };

  const team = opts.teamId ? league.teams.find(t => t.id === opts.teamId) : undefined;
  let next: LeagueState;
  if (team) {
    const c = opts.contract ?? { salaryPerYear: 2_000_000, years: 1 };
    const placed: BasketballPlayer = {
      ...player,
      contract: contractFor(c.salaryPerYear, clamp(c.years, 1, 5), league.currentSeason),
      rosterSlot: { teamId: team.id, bucket: 'active', index: team.playerIds.length },
    };
    next = {
      ...league,
      players: { ...league.players, [id]: placed },
      teams: league.teams.map(t => t.id === team.id
        ? { ...t, playerIds: [...t.playerIds, id as PlayerId], rosterBuckets: { ...t.rosterBuckets, active: [...(t.rosterBuckets.active ?? []), id as PlayerId] } }
        : t),
    };
  } else {
    next = {
      ...league,
      players: { ...league.players, [id]: player },
      freeAgentIds: [...league.freeAgentIds, id as PlayerId],
    };
  }
  return { league: stampUsed(next), playerId: id };
}
