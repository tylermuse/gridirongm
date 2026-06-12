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

/**
 * Conditional ("protected") pick obligation. When team A trades its pick to B
 * top-N protected, ownership flips to B immediately but the conveyance is
 * conditional: at the lottery, if A's pick lands within the top N it stays with
 * A (the protection "hits") and the obligation rolls forward (or expires per the
 * fallback); otherwise it conveys to B for good. Keyed in `pickProtections` by
 * the same pickKey as ownership.
 */
export interface PickProtection {
  /** Pick is PROTECTED (stays with the original team) when its pick-in-round is
   *  ≤ topN. e.g. topN=2 → "top-2 protected", conveys at #3 or later. */
  topN: number;
  /** Team that receives the pick once it conveys (the creditor). */
  creditorTeamId: TeamId;
  /** Last season the obligation may roll. While the pick's season < this, a
   *  protected (un-conveyed) pick rolls to next year's same-round pick with the
   *  same terms. At/after it, `fallback` settles the debt. */
  rollUntilSeason: number;
  /** How the obligation settles if it never conveys by `rollUntilSeason`:
   *  'void' → creditor gets nothing; 'second' → creditor takes the original
   *  team's second-round pick that season instead. */
  fallback: 'void' | 'second';
}

interface LeaguePickData {
  /** key = pickKey(season, round, originalTeamId) → current owner team id. */
  pickOwnership?: Record<string, TeamId>;
  /** key = pickKey(...) → conditional-conveyance terms for that pick. */
  pickProtections?: Record<string, PickProtection>;
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

function protections(league: LeagueState): Record<string, PickProtection> {
  return (league.sportData as LeaguePickData | undefined)?.pickProtections ?? {};
}

/** The protection terms attached to a pick, or null if it conveys unconditionally. */
export function getProtection(
  league: LeagueState,
  season: number,
  round: number,
  originalTeamId: TeamId,
): PickProtection | null {
  return protections(league)[pickKey(season, round, originalTeamId)] ?? null;
}

/** "top-2 protected", "lottery protected", or "unprotected". */
export function protectionText(topN: number, numTeams = 30): string {
  if (topN <= 0) return 'unprotected';
  if (topN >= 14 && topN < numTeams) return 'lottery protected';
  return `top-${topN} protected`;
}

/** Compact protection tag for a pick chip, or '' when unprotected. */
export function protectionShort(league: LeagueState, pick: BaseDraftPick): string {
  const prot = getProtection(league, pick.season, pick.round, pick.originalTeamId);
  if (!prot) return '';
  const n = prot.topN;
  return n >= 14 && n < (league.teams.length || 30) ? ' (lottery prot)' : ` (top-${n} prot)`;
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

/** A protection authored on a pick at trade time (creditor is the receiving
 *  team, so only the terms are supplied here). topN ≤ 0 → unprotected. */
export interface ProtectionTerms {
  topN: number;
  rollUntilSeason: number;
  fallback: 'void' | 'second';
}

/** Reassign a set of picks to new owners, returning a new league. Used by the
 *  trade executor. Each move is keyed by the pick's original team so provenance
 *  is preserved across multiple hops. A move may carry `protection` terms, which
 *  flip ownership to the receiver now but leave the conveyance conditional on the
 *  lottery (resolved by `resolveProtectedPicks` at draft setup). */
export function applyPickMoves(
  league: LeagueState,
  moves: { pick: BaseDraftPick; toTeamId: TeamId; protection?: ProtectionTerms }[],
): LeagueState {
  if (moves.length === 0) return league;
  const sport = (league.sportData as LeaguePickData | undefined) ?? {};
  const next = { ...(sport.pickOwnership ?? {}) };
  const nextProt = { ...(sport.pickProtections ?? {}) };
  for (const { pick, toTeamId, protection } of moves) {
    const key = pickKey(pick.season, pick.round, pick.originalTeamId);
    if (toTeamId === pick.originalTeamId) {
      delete next[key]; // back to origin → no override needed
      delete nextProt[key]; // a pick returning home carries no obligation
    } else {
      next[key] = toTeamId;
      if (protection && protection.topN > 0) {
        nextProt[key] = {
          topN: protection.topN,
          creditorTeamId: toTeamId,
          rollUntilSeason: protection.rollUntilSeason,
          fallback: protection.fallback,
        };
      } else {
        delete nextProt[key]; // unconditional move clears any prior protection
      }
    }
  }
  return { ...league, sportData: { ...sport, pickOwnership: next, pickProtections: nextProt } };
}

// ===========================================================================
// Protected-pick conveyance (resolved at draft setup, once the order is known)
// ===========================================================================

export interface PickConveyance {
  season: number;
  round: number;
  originalTeamId: TeamId;
  creditorTeamId: TeamId;
  /** Where the original team's pick actually landed (1..30 within the round). */
  pickInRound: number;
  topN: number;
  result: 'conveyed' | 'rolled' | 'expired-void' | 'expired-second';
  /** For 'rolled': the season the obligation moved to. */
  rolledToSeason?: number;
}

type DraftSlotLite = { round: number; pickInRound: number; originalTeamId?: TeamId; teamId: TeamId };

/**
 * Settle every protected obligation for `season` against the now-known draft
 * order. Pure: takes the current ownership + protection registries and the
 * draft slots, returns updated registries plus a conveyance log.
 *
 * - Lands OUTSIDE protection → conveys to the creditor (ownership stays flipped).
 * - Lands INSIDE protection → reverts to the original team; if it can still roll,
 *   the obligation moves to next season's same-round pick (same terms); otherwise
 *   the fallback settles it (void, or the original team's 2nd-rounder).
 */
export function resolveProtectedPicks(
  ownershipIn: Record<string, TeamId>,
  protectionsIn: Record<string, PickProtection>,
  draftSlots: DraftSlotLite[],
  season: number,
): {
  ownership: Record<string, TeamId>;
  protections: Record<string, PickProtection>;
  conveyances: PickConveyance[];
} {
  const ownership = { ...ownershipIn };
  const protections = { ...protectionsIn };
  const conveyances: PickConveyance[] = [];

  // pick-in-round for each (round, originalTeam) from the resolved order.
  const slotByKey = new Map<string, number>();
  for (const s of draftSlots) {
    const orig = s.originalTeamId ?? s.teamId;
    slotByKey.set(`${s.round}-${orig}`, s.pickInRound);
  }

  for (const [key, prot] of Object.entries(protectionsIn)) {
    const m = /^(\d+)-r(\d+)-(.+)$/.exec(key);
    if (!m) continue;
    const pSeason = Number(m[1]);
    const round = Number(m[2]);
    const originalTeamId = m[3] as TeamId;
    if (pSeason !== season) continue; // only this year's obligations settle now
    const pickInRound = slotByKey.get(`${round}-${originalTeamId}`);
    if (pickInRound == null) continue; // team has no slot this round (folded?) — leave as-is

    const isProtected = pickInRound <= prot.topN;
    const base = { season: pSeason, round, originalTeamId, creditorTeamId: prot.creditorTeamId, pickInRound, topN: prot.topN };

    if (!isProtected) {
      ownership[key] = prot.creditorTeamId; // conveys for good
      delete protections[key];
      conveyances.push({ ...base, result: 'conveyed' });
      continue;
    }

    // Protected: the pick stays home this year.
    delete ownership[key];
    delete protections[key];

    if (pSeason < prot.rollUntilSeason) {
      const nextKey = pickKey(pSeason + 1, round, originalTeamId);
      ownership[nextKey] = prot.creditorTeamId;
      protections[nextKey] = { ...prot };
      conveyances.push({ ...base, result: 'rolled', rolledToSeason: pSeason + 1 });
    } else if (prot.fallback === 'second' && round === 1) {
      const secondKey = pickKey(pSeason, 2, originalTeamId);
      // Only divert the 2nd-rounder if the original team still holds it.
      if ((ownership[secondKey] ?? originalTeamId) === originalTeamId) {
        ownership[secondKey] = prot.creditorTeamId;
        conveyances.push({ ...base, result: 'expired-second' });
      } else {
        conveyances.push({ ...base, result: 'expired-void' });
      }
    } else {
      conveyances.push({ ...base, result: 'expired-void' });
    }
  }

  return { ownership, protections, conveyances };
}

/** Build a transaction-log entry describing a conveyance for League News. */
export function describeConveyance(
  league: LeagueState,
  c: PickConveyance,
): { summary: string; detail: string; teamIds: TeamId[] } {
  const orig = abbrOf(league, c.originalTeamId);
  const cred = abbrOf(league, c.creditorTeamId);
  const pickStr = `${c.season} R${c.round} (#${c.round === 1 ? c.pickInRound : c.pickInRound + 30})`;
  const prot = protectionText(c.topN, league.teams.length || 30);
  switch (c.result) {
    case 'conveyed':
      return {
        summary: `${cred} receive ${orig}'s ${c.season} R${c.round} pick`,
        detail: `${orig}'s pick landed at #${c.pickInRound} in round ${c.round}, outside its ${prot} — it conveys to ${cred}.`,
        teamIds: [c.originalTeamId, c.creditorTeamId],
      };
    case 'rolled':
      return {
        summary: `${orig} keep ${prot} pick; obligation to ${cred} rolls to ${c.rolledToSeason}`,
        detail: `${orig}'s ${pickStr} landed at #${c.pickInRound}, inside the ${prot} — ${orig} keep it and the obligation to ${cred} rolls to ${c.rolledToSeason}.`,
        teamIds: [c.originalTeamId, c.creditorTeamId],
      };
    case 'expired-second':
      return {
        summary: `${orig}'s protection held; ${cred} take a 2nd-rounder instead`,
        detail: `${orig}'s ${prot} pick stayed home for the final time — the debt settles with ${orig}'s ${c.season} second-round pick going to ${cred}.`,
        teamIds: [c.originalTeamId, c.creditorTeamId],
      };
    default:
      return {
        summary: `${orig}'s protection held; obligation to ${cred} expires`,
        detail: `${orig}'s ${prot} pick stayed home for the final time — the obligation to ${cred} expires with nothing conveyed.`,
        teamIds: [c.originalTeamId, c.creditorTeamId],
      };
  }
}
