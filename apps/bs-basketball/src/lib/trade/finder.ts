/**
 * Trade finder + incoming offers (parity audit #6).
 *
 * No separate AI value model — every suggestion is validated through the real
 * evaluateTrade/isExecutable engine, so anything surfaced is a legal deal both
 * sides accept. Deterministic (no RNG): packages are tried in OVR order.
 */

import { evaluateTrade, isExecutable, type TradeSideInput } from './trade';
import { getTeamPicks, pickValue, type OwnedPick } from './picks';
import { isPositionalSurplus } from '@bs/sport-basketball';
import type { BasketballPlayer, BasketballPosition } from '@bs/sport-basketball';
import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export interface DealSuggestion {
  partnerTeamId: string;
  /** Player ids the user sends. */
  giveIds: string[];
  /** Player ids the user receives. */
  getIds: string[];
  /** Draft-pick ids the user sends (FEAT-25). */
  givePickIds?: string[];
  /** Draft-pick ids the user receives (FEAT-25). */
  getPickIds?: string[];
}

interface DealParts {
  give?: string[];
  get?: string[];
  givePicks?: string[];
  getPicks?: string[];
}

function sides(userTeamId: string, partnerId: string, parts: DealParts): TradeSideInput[] {
  return [
    { teamId: userTeamId as TradeSideInput['teamId'], playerIds: (parts.give ?? []) as TradeSideInput['playerIds'], pickIds: parts.givePicks ?? [] },
    { teamId: partnerId as TradeSideInput['teamId'], playerIds: (parts.get ?? []) as TradeSideInput['playerIds'], pickIds: parts.getPicks ?? [] },
  ];
}

function toSuggestion(partnerTeamId: string, parts: DealParts): DealSuggestion {
  return {
    partnerTeamId,
    giveIds: parts.give ?? [],
    getIds: parts.get ?? [],
    ...(parts.givePicks?.length ? { givePickIds: parts.givePicks } : {}),
    ...(parts.getPicks?.length ? { getPickIds: parts.getPicks } : {}),
  };
}

/** Picks a team owns, cheapest first (lowest PTS), so the finder reaches for the
 *  least valuable pick that completes a deal rather than overpaying. */
function picksByValue(league: LeagueState, teamId: string): OwnedPick[] {
  return getTeamPicks(league, teamId as OwnedPick['currentTeamId'])
    .map(pk => ({ pk, v: pickValue(league, pk) }))
    .sort((a, b) => a.v - b.v)
    .map(x => x.pk);
}

function rosterByOvr(league: LeagueState, teamId: string): BasketballPlayer[] {
  const players = league.players as Record<string, BasketballPlayer>;
  const team = league.teams.find(t => t.id === teamId);
  if (!team) return [];
  return team.playerIds.map(id => players[id]).filter((p): p is BasketballPlayer => !!p).sort((a, b) => b.ratings.overall - a.ratings.overall);
}

/** Best OVR a roster has at a given position (0 if it has nobody there). */
function bestOvrAtPosition(roster: BasketballPlayer[], pos: BasketballPosition): number {
  return roster.reduce((m, p) => (p.sportData.position === pos && p.ratings.overall > m ? p.ratings.overall : m), 0);
}

/** A team won't trade FOR a player it has no room for (§D.1, root cause 3): if
 *  it's already deep at his position AND he's not an upgrade on what it has, the
 *  acquisition is redundant ("third starting center") — skip it entirely. */
function isRedundantAcquisition(aiRoster: BasketballPlayer[], target: BasketballPlayer): boolean {
  const pos = target.sportData.position;
  if (!pos) return false;
  return isPositionalSurplus(aiRoster, pos) && target.ratings.overall <= bestOvrAtPosition(aiRoster, pos);
}

/** Stepien rule (§D.3/§D.4): a team can't trade away first-round picks in
 *  consecutive future drafts. True if two of these picks are both first-rounders
 *  one season apart. */
function violatesStepien(picks: OwnedPick[]): boolean {
  const firstRoundSeasons = picks.filter(p => p.round === 1).map(p => p.season).sort((a, b) => a - b);
  for (let i = 1; i < firstRoundSeasons.length; i++) {
    if (firstRoundSeasons[i] - firstRoundSeasons[i - 1] === 1) return true;
  }
  return false;
}

/** Order candidate return players so a team deals from POSITIONAL SURPLUS first
 *  (real teams give up what they're deep in), and avoids handing back a player at
 *  the SAME position the user just vacated unless he's a genuine upgrade (§D.4 —
 *  no pointless lateral swaps). Stable within a tier by the caller's OVR order. */
function preferSurplus(
  candidates: BasketballPlayer[],
  aiRoster: BasketballPlayer[],
  targetPos: BasketballPosition | undefined,
  targetOvr: number,
): BasketballPlayer[] {
  const rank = (p: BasketballPlayer): number => {
    const pos = p.sportData.position;
    if (!pos) return 1;
    const surplus = isPositionalSurplus(aiRoster, pos);
    const lateral = pos === targetPos && p.ratings.overall <= targetOvr;
    if (lateral) return 2; // deprioritize a same-position, non-upgrade return
    return surplus ? 0 : 1; // surplus positions lead
  };
  return candidates.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map(x => x.p);
}

/** Options for shopping a player (FEAT-25). `offerPickIds` are user-owned picks
 *  the user is willing to throw in to complete/sweeten a deal. */
export interface FindDealsOptions {
  /** User picks offered alongside the player (to balance/sweeten). */
  offerPickIds?: string[];
  /** Also try returns that include the opponent's draft picks. Default true. */
  includeOpponentPicks?: boolean;
}

/** Realistic packages other teams would give for one of the user's players.
 *
 *  FEAT-25: picks are first-class on both sides. The user may toss in owned
 *  picks (`offerPickIds`) to complete a deal, and a returned package can include
 *  the opponent's draft picks (player+pick or pick-only sweeteners). */
export function findDealsForPlayer(
  league: LeagueState,
  userPlayerId: string,
  maxResults = 10,
  opts: FindDealsOptions = {},
): DealSuggestion[] {
  const userTeamId = league.userTeamId;
  if (!userTeamId) return [];
  const target = (league.players as Record<string, BasketballPlayer>)[userPlayerId];
  if (!target) return [];
  const tOvr = target.ratings.overall;
  const includeOpponentPicks = opts.includeOpponentPicks !== false;
  // Validate offered picks belong to the user (defensive against stale UI ids).
  const offerPicks = (opts.offerPickIds ?? []).filter(id => getTeamPicks(league, userTeamId).some(pk => pk.id === id));
  const out: DealSuggestion[] = [];

  const tPos = target.sportData.position;
  for (const ai of league.teams) {
    if (ai.id === userTeamId) continue;
    const aiPlayers = rosterByOvr(league, ai.id);
    // Positional fit (§D.1): a team already loaded at the target's spot won't
    // trade for him — skip it so the board stops surfacing "third center" deals.
    if (isRedundantAcquisition(aiPlayers, target)) continue;
    const aiPicks = includeOpponentPicks ? picksByValue(league, ai.id) : [];

    // Single-player swaps in a sensible OVR band, with the user's offered picks
    // included on the give side (often what makes a lopsided swap legal/fair).
    // Return players are ordered so the AI deals from surplus first (§D.4).
    const singles = preferSurplus(
      aiPlayers.filter(p => p.ratings.overall >= tOvr - 3 && p.ratings.overall <= tOvr + 8),
      aiPlayers,
      tPos,
      tOvr,
    ).slice(0, 3);
    let matched = false;
    for (const cand of singles) {
      const parts: DealParts = { give: [userPlayerId], get: [cand.id], givePicks: offerPicks };
      const s = sides(userTeamId, ai.id, parts);
      if (isExecutable(evaluateTrade(league, s), s)) { out.push(toSuggestion(ai.id, parts)); matched = true; break; }
    }
    // Two-for-one for a star: pair a mid starter with a role player, drawn from
    // the AI's surplus positions first (§D.4) so the consolidation makes sense.
    if (!matched && tOvr >= 76) {
      const pair = preferSurplus(
        aiPlayers.filter(p => p.ratings.overall >= tOvr - 12 && p.ratings.overall < tOvr + 2),
        aiPlayers,
        tPos,
        tOvr,
      ).slice(0, 4);
      outer: for (let i = 0; i < pair.length; i++) {
        for (let j = i + 1; j < pair.length; j++) {
          const parts: DealParts = { give: [userPlayerId], get: [pair[i].id, pair[j].id], givePicks: offerPicks };
          const s = sides(userTeamId, ai.id, parts);
          if (isExecutable(evaluateTrade(league, s), s)) { out.push(toSuggestion(ai.id, parts)); matched = true; break outer; }
        }
      }
    }
    // Player + pick sweetener: a slightly-under-value starter plus one of the
    // opponent's picks. Tried when a clean swap didn't land, so the finder can
    // round out the value gap with draft capital.
    if (!matched && includeOpponentPicks && aiPicks.length > 0) {
      const sweetenable = preferSurplus(
        aiPlayers.filter(p => p.ratings.overall >= tOvr - 10 && p.ratings.overall <= tOvr + 4),
        aiPlayers,
        tPos,
        tOvr,
      ).slice(0, 3);
      outer2: for (const cand of sweetenable) {
        for (const pk of aiPicks.slice(0, 4)) {
          const parts: DealParts = { give: [userPlayerId], get: [cand.id], givePicks: offerPicks, getPicks: [pk.id] };
          const s = sides(userTeamId, ai.id, parts);
          if (isExecutable(evaluateTrade(league, s), s)) { out.push(toSuggestion(ai.id, parts)); matched = true; break outer2; }
        }
      }
    }
    // Pick-only return: a rebuilding team buys the player purely for draft
    // capital. Tried last; one or two of their picks for your player.
    if (!matched && includeOpponentPicks && aiPicks.length > 0) {
      const top = aiPicks.slice().sort((a, b) => pickValue(league, b) - pickValue(league, a)).slice(0, 4);
      single: for (const pk of top) {
        const parts: DealParts = { give: [userPlayerId], get: [], givePicks: offerPicks, getPicks: [pk.id] };
        const s = sides(userTeamId, ai.id, parts);
        if (isExecutable(evaluateTrade(league, s), s)) { out.push(toSuggestion(ai.id, parts)); matched = true; break single; }
      }
      if (!matched) {
        pairPick: for (let i = 0; i < top.length; i++) {
          for (let j = i + 1; j < top.length; j++) {
            if (violatesStepien([top[i], top[j]])) continue; // no consecutive-year firsts
            const parts: DealParts = { give: [userPlayerId], get: [], givePicks: offerPicks, getPicks: [top[i].id, top[j].id] };
            const s = sides(userTeamId, ai.id, parts);
            if (isExecutable(evaluateTrade(league, s), s)) { out.push(toSuggestion(ai.id, parts)); break pairPick; }
          }
        }
      }
    }
  }

  // Rank by total return value: players' OVR plus a small bump per returned pick
  // so player-rich packages still lead but pick sweeteners aren't ignored.
  const ovr = (ids: string[]) => ids.reduce((s, id) => s + ((league.players as Record<string, BasketballPlayer>)[id]?.ratings.overall ?? 0), 0);
  const score = (d: DealSuggestion) => ovr(d.getIds) + (d.getPickIds?.length ? d.getPickIds.length * 25 : 0);
  return out.sort((a, b) => score(b) - score(a)).slice(0, maxResults);
}

/** Realistic returns other teams would give for one of the user's OWNED draft
 *  picks (FEAT-25 — Trading Block can put picks up too). The user sends the pick
 *  (plus any `offerPickIds`/`offerPlayerIds` sweeteners) and gets back the
 *  opponent's players, and optionally their picks, valued on the same PTS scale. */
export function findDealsForPick(
  league: LeagueState,
  userPickId: string,
  maxResults = 6,
  opts: { offerPlayerIds?: string[]; offerPickIds?: string[]; includeOpponentPicks?: boolean } = {},
): DealSuggestion[] {
  const userTeamId = league.userTeamId;
  if (!userTeamId) return [];
  const owned = getTeamPicks(league, userTeamId);
  const pick = owned.find(p => p.id === userPickId);
  if (!pick) return [];
  const give = (opts.offerPlayerIds ?? []);
  const givePicks = [userPickId, ...(opts.offerPickIds ?? []).filter(id => id !== userPickId && owned.some(p => p.id === id))];
  const pVal = pickValue(league, pick);
  const includeOpponentPicks = opts.includeOpponentPicks !== false;
  const out: DealSuggestion[] = [];

  for (const ai of league.teams) {
    if (ai.id === userTeamId) continue;
    const aiPlayers = rosterByOvr(league, ai.id);
    let matched = false;

    // The pick (and any sweeteners) for a single player in a sensible value band.
    // We don't know player PTS here, so probe a spread of OVRs and let the engine
    // gate legality/acceptance.
    const cands = aiPlayers.filter(p => p.ratings.overall >= 55 && p.ratings.overall <= 82).slice(0, 8);
    for (const cand of cands) {
      const parts: DealParts = { give, get: [cand.id], givePicks };
      const s = sides(userTeamId, ai.id, parts);
      if (isExecutable(evaluateTrade(league, s), s)) { out.push(toSuggestion(ai.id, parts)); matched = true; break; }
    }

    // Pick-for-pick: send our pick, get one of theirs of comparable value.
    if (!matched && includeOpponentPicks) {
      const theirs = picksByValue(league, ai.id).filter(p => pickValue(league, p) <= pVal * 1.4);
      for (const tp of theirs.slice(-4).reverse()) {
        const parts: DealParts = { give, get: [], givePicks, getPicks: [tp.id] };
        const s = sides(userTeamId, ai.id, parts);
        if (isExecutable(evaluateTrade(league, s), s)) { out.push(toSuggestion(ai.id, parts)); break; }
      }
    }
  }

  const ovr = (ids: string[]) => ids.reduce((s, id) => s + ((league.players as Record<string, BasketballPlayer>)[id]?.ratings.overall ?? 0), 0);
  const score = (d: DealSuggestion) => ovr(d.getIds) + (d.getPickIds?.length ? d.getPickIds.length * 25 : 0);
  return out.sort((a, b) => score(b) - score(a)).slice(0, maxResults);
}

/** AI-initiated offers: deals available for the user's most valuable players. */
export function incomingOffers(league: LeagueState, maxOffers = 4): DealSuggestion[] {
  const userTeamId = league.userTeamId;
  if (!userTeamId) return [];
  const season = league.currentSeason;
  const roster = rosterByOvr(league, userTeamId);
  // A player who has formally filed a trade request (or is holding out) is "more
  // available" — shop him FIRST so AI offers actually surface for a disgruntled
  // star, even if he isn't a top-OVR name (Phase 1 of the trade-request loop).
  // Deterministic: preserves OVR order within each group. Deeper ask-discounting
  // in the value engine is Phase 2.
  const wantsOut = (p: BasketballPlayer): boolean => {
    const r = p.sportData.tradeRequest;
    return !!r && r.season === season && (r.stage === 'requested' || r.stage === 'holdout');
  };
  const requesting = roster.filter(wantsOut);
  const others = roster.filter(p => !wantsOut(p)).slice(0, 6);
  const mine = [...requesting, ...others];
  const offers: DealSuggestion[] = [];
  const seen = new Set<string>();
  for (const p of mine) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    const deals = findDealsForPlayer(league, p.id, 1);
    if (deals.length) offers.push(deals[0]);
    if (offers.length >= maxOffers) break;
  }
  return offers;
}
