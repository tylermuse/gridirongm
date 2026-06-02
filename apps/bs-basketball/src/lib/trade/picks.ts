/**
 * Draft-pick assets (P1.2).
 *
 * Basketball teams carry future first- and second-round picks as tradeable
 * assets. Rather than materialize a pick object per team (which gets awkward as
 * the draft window rolls forward each season), ownership is a league-level
 * registry of *deltas*: a pick belongs to its original team unless the registry
 * says otherwise. Absent registry → every team owns all of its own picks, so
 * this is fully backward-compatible with saves made before pick trading.
 *
 * Provenance ("via ATL") is preserved because the registry is keyed by the
 * pick's ORIGINAL team; only the current owner changes.
 *
 * Value lives in the engine (basketballFuturePickValue) on the same PTS scale
 * as players, estimated from the original team's projected standing.
 */

import { basketballFuturePickValue, type PickValueContext } from '@bs/sport-basketball';
import type { BaseDraftPick, BaseLeagueState, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

/** How many future drafts are tradeable (the next N seasons). */
export const PICK_WINDOW_YEARS = 3;
export const PICK_ROUNDS = 2;

export interface OwnedPick extends BaseDraftPick {
  /** Stable id: encodes season + round + original team. */
  id: string;
}

interface LeaguePickData {
  /** key = pickKey(season, round, originalTeamId) → current owner team id. */
  pickOwnership?: Record<string, TeamId>;
  [key: string]: unknown;
}

export function pickKey(season: number, round: number, originalTeamId: TeamId): string {
  return `${season}-r${round}-${originalTeamId}`;
}

function ownership(league: LeagueState): Record<string, TeamId> {
  return (league.sportData as LeaguePickData | undefined)?.pickOwnership ?? {};
}

/** The seasons whose drafts are currently tradeable: next N after this one. */
export function pickWindow(league: LeagueState): number[] {
  const start = league.currentSeason + 1;
  return Array.from({ length: PICK_WINDOW_YEARS }, (_, i) => start + i);
}

/** Current owner of a pick — the registry override, or the original team. */
export function currentOwner(
  league: LeagueState,
  season: number,
  round: number,
  originalTeamId: TeamId,
): TeamId {
  return ownership(league)[pickKey(season, round, originalTeamId)] ?? originalTeamId;
}

/** Teams ordered worst record → best (index 0 picks earliest). */
export function standingsWorstFirst(league: LeagueState): TeamId[] {
  return league.teams
    .slice()
    .sort((a, b) => {
      const wpa = a.record.wins + a.record.losses > 0 ? a.record.wins / (a.record.wins + a.record.losses) : 0.5;
      const wpb = b.record.wins + b.record.losses > 0 ? b.record.wins / (b.record.wins + b.record.losses) : 0.5;
      return wpa - wpb;
    })
    .map(t => t.id);
}

function makeOwnedPick(season: number, round: number, originalTeamId: TeamId, owner: TeamId): OwnedPick {
  return {
    id: pickKey(season, round, originalTeamId),
    season,
    round,
    originalTeamId,
    currentTeamId: owner,
  };
}

/** Every pick a team currently owns within the tradeable window, sorted by
 *  season, then round, then the original team's projected draft slot. */
export function getTeamPicks(league: LeagueState, teamId: TeamId): OwnedPick[] {
  const window = pickWindow(league);
  const slotOf = new Map(standingsWorstFirst(league).map((id, i) => [id, i] as const));
  const picks: OwnedPick[] = [];
  for (const season of window) {
    for (let round = 1; round <= PICK_ROUNDS; round++) {
      for (const team of league.teams) {
        if (currentOwner(league, season, round, team.id) === teamId) {
          picks.push(makeOwnedPick(season, round, team.id, teamId));
        }
      }
    }
  }
  return picks.sort(
    (a, b) =>
      a.season - b.season ||
      a.round - b.round ||
      (slotOf.get(a.originalTeamId) ?? 99) - (slotOf.get(b.originalTeamId) ?? 99),
  );
}

/** Resolve a pick id back into an OwnedPick (by parsing the key). */
export function pickFromId(league: LeagueState, id: string): OwnedPick | null {
  const m = /^(\d+)-r(\d+)-(.+)$/.exec(id);
  if (!m) return null;
  const season = Number(m[1]);
  const round = Number(m[2]);
  const originalTeamId = m[3] as TeamId;
  return makeOwnedPick(season, round, originalTeamId, currentOwner(league, season, round, originalTeamId));
}

// ===========================================================================
// Value + labels
// ===========================================================================

export function pickValueContext(league: LeagueState): PickValueContext {
  return {
    numTeams: league.teams.length || 30,
    standingsWorstFirst: standingsWorstFirst(league),
    currentSeason: league.currentSeason,
  };
}

/** A pick-value function (PTS) for the trade evaluator context. */
export function pickValueFnFor(league: LeagueState): (p: BaseDraftPick) => number {
  const ctx = pickValueContext(league);
  return p => basketballFuturePickValue(p, ctx);
}

export function pickValue(league: LeagueState, pick: BaseDraftPick): number {
  return basketballFuturePickValue(pick, pickValueContext(league));
}

const ABBR_CACHE = new WeakMap<object, Map<TeamId, string>>();
function abbrOf(league: LeagueState, teamId: TeamId): string {
  let m = ABBR_CACHE.get(league as object);
  if (!m) {
    m = new Map(league.teams.map(t => [t.id, t.abbreviation] as const));
    ABBR_CACHE.set(league as object, m);
  }
  return m.get(teamId) ?? '???';
}

/** "2027 R1" or "2027 R1 (via ATL)" when held by a team other than the origin. */
export function pickLabel(league: LeagueState, pick: BaseDraftPick): string {
  const base = `${pick.season} R${pick.round}`;
  return pick.originalTeamId !== pick.currentTeamId
    ? `${base} (via ${abbrOf(league, pick.originalTeamId)})`
    : base;
}

/** Compact form for chips: "'27 R1 (via ATL)". */
export function pickShort(league: LeagueState, pick: BaseDraftPick): string {
  const yr = `'${String(pick.season).slice(-2)}`;
  const via = pick.originalTeamId !== pick.currentTeamId ? ` (via ${abbrOf(league, pick.originalTeamId)})` : '';
  return `${yr} R${pick.round}${via}`;
}

// ===========================================================================
// Mutation
// ===========================================================================

/** Reassign a set of picks to new owners, returning a new league. Used by the
 *  trade executor. Each move is keyed by the pick's original team so provenance
 *  is preserved across multiple hops. */
export function applyPickMoves(
  league: LeagueState,
  moves: { pick: BaseDraftPick; toTeamId: TeamId }[],
): LeagueState {
  if (moves.length === 0) return league;
  const sport = (league.sportData as LeaguePickData | undefined) ?? {};
  const next = { ...(sport.pickOwnership ?? {}) };
  for (const { pick, toTeamId } of moves) {
    const key = pickKey(pick.season, pick.round, pick.originalTeamId);
    if (toTeamId === pick.originalTeamId) delete next[key]; // back to origin → no override needed
    else next[key] = toTeamId;
  }
  return { ...league, sportData: { ...sport, pickOwnership: next } };
}
