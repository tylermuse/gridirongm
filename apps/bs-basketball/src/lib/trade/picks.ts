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

import { basketballFuturePickValue, basketballPickTradeValue, type PickValueContext } from '@bs/sport-basketball';
import type { BaseDraftPick, BaseLeagueState, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

/** How many future drafts are tradeable (the next N seasons). */
export const PICK_WINDOW_YEARS = 3;
export const PICK_ROUNDS = 2;

export interface OwnedPick extends BaseDraftPick {
  /** Stable id: encodes season + round + original team. */
  id: string;
  /** Exact overall pick number, once a current-year draft order is known. */
  overall?: number;
}

interface LeaguePickData {
  /** key = pickKey(season, round, originalTeamId) → current owner team id. */
  pickOwnership?: Record<string, TeamId>;
  [key: string]: unknown;
}

/** Minimal view of the active draft, read straight from sportData to avoid a
 *  circular import with the draft module. */
interface ActiveDraftLite {
  season: number;
  inaugural?: boolean;
  lotteryRevealed?: boolean;
  picks: { overall: number; round: number; originalTeamId?: TeamId; teamId: TeamId; prospectId: string | null }[];
}

/** The in-progress draft IF it's a normal (non-inaugural) draft. Inaugural
 *  drafts use a slot-based model that the ownership registry can't uniquely key
 *  (a team can hold several firsts), so they trade only via the in-draft modal. */
function activeNormalDraft(league: LeagueState): ActiveDraftLite | null {
  const d = (league.sportData as { draft?: ActiveDraftLite } | undefined)?.draft ?? null;
  return d && !d.inaugural ? d : null;
}

export function pickKey(season: number, round: number, originalTeamId: TeamId): string {
  return `${season}-r${round}-${originalTeamId}`;
}

function ownership(league: LeagueState): Record<string, TeamId> {
  return (league.sportData as LeaguePickData | undefined)?.pickOwnership ?? {};
}

/** The seasons whose drafts are currently tradeable: the next N after this one,
 *  plus the in-progress (current-year) draft when one is underway, so you can
 *  trade this year's remaining picks from the main trade center too. */
export function pickWindow(league: LeagueState): number[] {
  const start = league.currentSeason + 1;
  const future = Array.from({ length: PICK_WINDOW_YEARS }, (_, i) => start + i);
  const draft = activeNormalDraft(league);
  // The current draft's season can sit below `start` (it tips before the year
  // rolls); prepend it when it's not already covered.
  if (draft && !future.includes(draft.season) && draft.season < start) return [draft.season, ...future];
  return future;
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

function makeOwnedPick(season: number, round: number, originalTeamId: TeamId, owner: TeamId, overall?: number): OwnedPick {
  return {
    id: pickKey(season, round, originalTeamId),
    season,
    round,
    originalTeamId,
    currentTeamId: owner,
    ...(overall !== undefined ? { overall } : {}),
  };
}

/** Every pick a team currently owns within the tradeable window, sorted by
 *  season, then round, then the original team's projected draft slot.
 *
 *  For the in-progress (current-year) draft, picks that have already been made
 *  are dropped (they've converted to the drafted player) and the remaining ones
 *  carry their exact overall number once the order is revealed. */
export function getTeamPicks(league: LeagueState, teamId: TeamId): OwnedPick[] {
  const window = pickWindow(league);
  const slotOf = new Map(standingsWorstFirst(league).map((id, i) => [id, i] as const));

  // Index the active draft by pick key: which are spent, and each one's overall.
  const draft = activeNormalDraft(league);
  const made = new Set<string>();
  const overallByKey = new Map<string, number>();
  if (draft) {
    const ordered = draft.lotteryRevealed !== false;
    for (const slot of draft.picks) {
      const orig = slot.originalTeamId ?? slot.teamId;
      const key = pickKey(draft.season, slot.round, orig);
      if (slot.prospectId !== null) made.add(key);
      else if (ordered) overallByKey.set(key, slot.overall);
    }
  }

  const picks: OwnedPick[] = [];
  for (const season of window) {
    for (let round = 1; round <= PICK_ROUNDS; round++) {
      for (const team of league.teams) {
        if (currentOwner(league, season, round, team.id) !== teamId) continue;
        const key = pickKey(season, round, team.id);
        if (draft && season === draft.season && made.has(key)) continue; // already drafted
        picks.push(makeOwnedPick(season, round, team.id, teamId, draft && season === draft.season ? overallByKey.get(key) : undefined));
      }
    }
  }
  return picks.sort(
    (a, b) =>
      a.season - b.season ||
      a.round - b.round ||
      (a.overall ?? 999) - (b.overall ?? 999) ||
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
  // Recover the overall number for a current-year pick (so labels read "· #3").
  const draft = activeNormalDraft(league);
  let overall: number | undefined;
  if (draft && season === draft.season && draft.lotteryRevealed !== false) {
    overall = draft.picks.find(s => (s.originalTeamId ?? s.teamId) === originalTeamId && s.round === round && s.prospectId === null)?.overall;
  }
  return makeOwnedPick(season, round, originalTeamId, currentOwner(league, season, round, originalTeamId), overall);
}

// ===========================================================================
// Value + labels
// ===========================================================================

export function pickValueContext(league: LeagueState): PickValueContext {
  // Confidence in current standings grows with sample size — full trust by the
  // ~halfway mark (41 games). Keeps early-season pick values from swinging on a
  // handful of games.
  const totalGames = league.teams.reduce((s, t) => s + t.record.wins + t.record.losses, 0);
  const avgGames = totalGames / (league.teams.length || 1);
  const confidence = Math.min(1, avgGames / 41);
  return {
    numTeams: league.teams.length || 30,
    standingsWorstFirst: standingsWorstFirst(league),
    currentSeason: league.currentSeason,
    confidence,
  };
}

/** Value a pick on the PTS scale. A current-year pick with a known overall is
 *  valued by its exact slot (same as the in-draft trade modal); future picks are
 *  estimated from the original team's projected standing. */
function valuePick(pick: BaseDraftPick, ctx: PickValueContext): number {
  const overall = (pick as OwnedPick).overall;
  return overall ? basketballPickTradeValue(overall) : basketballFuturePickValue(pick, ctx);
}

/** A pick-value function (PTS) for the trade evaluator context. */
export function pickValueFnFor(league: LeagueState): (p: BaseDraftPick) => number {
  const ctx = pickValueContext(league);
  return p => valuePick(p, ctx);
}

export function pickValue(league: LeagueState, pick: BaseDraftPick): number {
  return valuePick(pick, pickValueContext(league));
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

/** "2027 R1", "2027 R1 (via ATL)", or "2026 R1 · #3" once the order is known. */
export function pickLabel(league: LeagueState, pick: BaseDraftPick): string {
  const base = `${pick.season} R${pick.round}`;
  const via = pick.originalTeamId !== pick.currentTeamId ? ` (via ${abbrOf(league, pick.originalTeamId)})` : '';
  const num = (pick as OwnedPick).overall ? ` · #${(pick as OwnedPick).overall}` : '';
  return `${base}${via}${num}`;
}

/** Compact form for chips: "'27 R1 (via ATL)" or "'26 R1 · #3". */
export function pickShort(league: LeagueState, pick: BaseDraftPick): string {
  const yr = `'${String(pick.season).slice(-2)}`;
  const via = pick.originalTeamId !== pick.currentTeamId ? ` (via ${abbrOf(league, pick.originalTeamId)})` : '';
  const num = (pick as OwnedPick).overall ? ` · #${(pick as OwnedPick).overall}` : '';
  return `${yr} R${pick.round}${via}${num}`;
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
