/**
 * AI-initiated trade proposals (persisted inbox).
 *
 * Football parity: rival front offices send the user REAL offers that persist
 * on `league.sportData.tradeProposals`, expire after a few days, and can be
 * accepted, declined or countered. When the user counters, the AI either takes
 * the counter (it values it) or answers with exactly ONE counteroffer of its own
 * that it would accept — never an endless haggle.
 *
 * Every package is built + validated by the real engine (findDealsForPlayer →
 * evaluateTrade / isExecutable), so a proposal is always cap-legal under Hoops'
 * salary-matching rules and one the AI genuinely accepts. Execution goes through
 * proposeTrade → executeTrade so rosters, pick registry, transactions and
 * trade history all update exactly as a builder trade would.
 *
 * Determinism: no RNG — every roll is an FNV hash of league id + season + day
 * (the same pattern as the rumor mill), so a save always produces the same
 * inbox. `refreshTradeProposals` is called once per simmed regular-season day
 * from runSimDay; nothing touches state on render.
 */

import type { BaseLeagueState, PlayerId, TeamId } from '@bs/core/adapter';
import type { BasketballPlayer, BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import { evaluateTrade, isExecutable, proposeTrade, type TradeSideInput } from './trade';
import { findDealsForPlayer, type DealSuggestion } from './finder';
import { getTeamPicks, pickValue } from './picks';
import { teamStrategy } from './strategy';
import { tradeWindowClosed } from '../sim/simRange';
import { getTradeDeadlineDay } from '../rules/leagueRules';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export type TradeProposalStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'countered';

export interface TradeProposalAssets {
  playerIds: string[];
  pickIds: string[];
}

export interface TradeProposal {
  id: string;
  season: number;
  /** The AI team making the offer. */
  fromTeamId: string;
  /** What the AI sends to the user. */
  aiGives: TradeProposalAssets;
  /** What the AI wants from the user. */
  aiWants: TradeProposalAssets;
  createdDay: number;
  /** Last day the offer can be accepted; expires on the first sim day after. */
  expiresDay: number;
  status: TradeProposalStatus;
  /** Short AI pitch shown on the card. */
  rationale: string;
  /** Set on an AI counteroffer: the proposal it answers. Counters can't be re-countered. */
  counterOf?: string;
  /** Day the proposal left 'pending', with a short note. */
  resolvedDay?: number;
  resolutionNote?: string;
}

interface ProposalData {
  tradeProposals?: TradeProposal[];
  /** User's persisted trading block (player ids) — AI offers target these first. */
  tradeBlockIds?: string[];
  [key: string]: unknown;
}

export const MAX_PENDING_PROPOSALS = 3;
/** An offer stays on the table this many days. */
export const PROPOSAL_TTL_DAYS = 6;
const COUNTER_TTL_DAYS = 3;
/** No offers before the standings have some signal. */
const FIRST_PROPOSAL_DAY = 5;
/** Keep the stored list small (history beyond this is noise). */
const MAX_STORED = 40;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function data(league: LeagueState): ProposalData {
  return (league.sportData as ProposalData | undefined) ?? {};
}

function withProposals(league: LeagueState, list: TradeProposal[]): LeagueState {
  const sport = data(league);
  return { ...league, sportData: { ...sport, tradeProposals: list.slice(-MAX_STORED) } };
}

function playersOf(league: LeagueState): Record<string, BasketballPlayer> {
  return league.players as Record<string, BasketballPlayer>;
}

function teamCity(league: LeagueState, id: string): string {
  return league.teams.find(t => t.id === id)?.city ?? id;
}

/** User-perspective DealSuggestion (giveIds = user sends) for a proposal. */
export function proposalToDeal(p: TradeProposal): DealSuggestion {
  return {
    partnerTeamId: p.fromTeamId,
    giveIds: p.aiWants.playerIds,
    getIds: p.aiGives.playerIds,
    ...(p.aiWants.pickIds.length ? { givePickIds: p.aiWants.pickIds } : {}),
    ...(p.aiGives.pickIds.length ? { getPickIds: p.aiGives.pickIds } : {}),
  };
}

function dealToSides(userTeamId: string, d: DealSuggestion): TradeSideInput[] {
  return [
    { teamId: userTeamId as TeamId, playerIds: d.giveIds as PlayerId[], pickIds: d.givePickIds ?? [] },
    { teamId: d.partnerTeamId as TeamId, playerIds: d.getIds as PlayerId[], pickIds: d.getPickIds ?? [] },
  ];
}

function dealKey(d: DealSuggestion): string {
  const s = (a?: string[]) => [...(a ?? [])].sort().join(',');
  return `${d.partnerTeamId}|${s(d.giveIds)}|${s(d.givePickIds)}|${s(d.getIds)}|${s(d.getPickIds)}`;
}

/** Does every asset still sit with the team that's supposed to send it? */
function assetsStillOwned(league: LeagueState, userTeamId: string, d: DealSuggestion): boolean {
  const team = (id: string) => league.teams.find(t => t.id === id);
  const user = team(userTeamId);
  const ai = team(d.partnerTeamId);
  if (!user || !ai) return false;
  if (!d.giveIds.every(id => user.playerIds.includes(id as PlayerId))) return false;
  if (!d.getIds.every(id => ai.playerIds.includes(id as PlayerId))) return false;
  const userPicks = new Set(getTeamPicks(league, userTeamId as TeamId).map(p => p.id));
  const aiPicks = new Set(getTeamPicks(league, d.partnerTeamId as TeamId).map(p => p.id));
  return (d.givePickIds ?? []).every(id => userPicks.has(id)) && (d.getPickIds ?? []).every(id => aiPicks.has(id));
}

/** Legal, owned, and the AI still accepts it. */
export function isDealStillValid(league: LeagueState, d: DealSuggestion): boolean {
  const uid = league.userTeamId;
  if (!uid || !assetsStillOwned(league, uid, d)) return false;
  const sides = dealToSides(uid, d);
  return isExecutable(evaluateTrade(league, sides), sides);
}

function rationaleFor(league: LeagueState, d: DealSuggestion, counter = false): string {
  const players = playersOf(league);
  const city = teamCity(league, d.partnerTeamId);
  const target = d.giveIds.map(id => players[id]).filter(Boolean).sort((a, b) => b.ratings.overall - a.ratings.overall)[0];
  const disp = teamStrategy(league, d.partnerTeamId as TeamId).disposition;
  const name = target ? `${target.firstName[0]}. ${target.lastName}` : 'that pick';
  const pos = target?.sportData.position ?? '';
  if (counter) return `${city} came back with their best offer — take it or leave it.`;
  switch (disp) {
    case 'Rebuilding':
      return `${city} is retooling and sees ${name} as a long-term piece worth paying for.`;
    case 'Developing':
      return `${city} wants ${name} to grow alongside its young core.`;
    case 'Win Now':
      return `All-in ${city} believes ${name} is the ${pos || 'missing'} piece for a deep playoff run.`;
    default:
      return `${city} is chasing a ${pos ? `${pos} ` : ''}upgrade and has ${name} at the top of its board.`;
  }
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

export function getTradeProposals(league: LeagueState): TradeProposal[] {
  return (data(league).tradeProposals ?? []).filter(p => p.season === league.currentSeason);
}

export function getPendingProposals(league: LeagueState): TradeProposal[] {
  return getTradeProposals(league)
    .filter(p => p.status === 'pending')
    .sort((a, b) => b.createdDay - a.createdDay);
}

export function pendingProposalCount(league: LeagueState | null | undefined): number {
  if (!league?.userTeamId) return 0;
  return getPendingProposals(league).length;
}

export function getTradeBlock(league: LeagueState): string[] {
  return data(league).tradeBlockIds ?? [];
}

export function setTradeBlock(league: LeagueState, ids: string[]): LeagueState {
  const sport = data(league);
  return { ...league, sportData: { ...sport, tradeBlockIds: [...new Set(ids)] } };
}

// ---------------------------------------------------------------------------
// Daily tick: expire + generate
// ---------------------------------------------------------------------------

/** Chance (0-100) of a new offer arriving today — ramps toward the deadline. */
/** User-side value edge (as a fraction of what the user sends) an AI pitch aims for. */
const PROPOSAL_TARGET_EDGE = 0.05;
const PROPOSAL_MAX_EDGE = 0.2;
const PROPOSAL_MIN_EDGE = 0.1;

function dailyChance(day: number, deadline: number): number {
  const toDeadline = deadline - day;
  if (toDeadline <= 10) return 45;
  if (toDeadline <= 25) return 30;
  return 18;
}

function expire(league: LeagueState, day: number, closed: boolean): TradeProposal[] {
  return (data(league).tradeProposals ?? [])
    .map((p): TradeProposal => {
      if (p.status !== 'pending') return p;
      if (p.season !== league.currentSeason) return { ...p, status: 'expired', resolvedDay: day, resolutionNote: 'Season ended.' };
      if (closed) return { ...p, status: 'expired', resolvedDay: day, resolutionNote: 'The trade window closed.' };
      if (day > p.expiresDay) return { ...p, status: 'expired', resolvedDay: day, resolutionNote: 'The offer expired.' };
      if (!assetsStillOwned(league, league.userTeamId ?? '', proposalToDeal(p))) {
        return { ...p, status: 'expired', resolvedDay: day, resolutionNote: 'The rosters changed — offer withdrawn.' };
      }
      return p;
    });
}

/** Candidate user players to shop: trading block first, then trade requesters,
 *  then the top of the roster. */
function shopList(league: LeagueState, userTeamId: string): string[] {
  const players = playersOf(league);
  const team = league.teams.find(t => t.id === userTeamId);
  if (!team) return [];
  const roster = team.playerIds.map(id => players[id]).filter(Boolean).sort((a, b) => b.ratings.overall - a.ratings.overall);
  const block = getTradeBlock(league).filter(id => team.playerIds.includes(id as PlayerId));
  if (block.length) return block;
  const season = league.currentSeason;
  const requesting = roster.filter(p => {
    const r = p.sportData.tradeRequest;
    return !!r && r.season === season && (r.stage === 'requested' || r.stage === 'holdout');
  });
  const ids = [...requesting, ...roster.slice(0, 8)].map(p => p.id);
  return [...new Set(ids)];
}

/** Build one new proposal for today, or null. Tries a few shop targets in a
 *  hash-rotated order and picks the deal that's best for the user (the AI is
 *  pitching — it leads with something the user might actually take). */
function buildProposal(league: LeagueState, day: number, pending: TradeProposal[], seed: number): TradeProposal | null {
  const uid = league.userTeamId;
  if (!uid) return null;
  const list = shopList(league, uid);
  if (list.length === 0) return null;
  const busyTeams = new Set(pending.map(p => p.fromTeamId));
  const seen = new Set(getTradeProposals(league).map(p => dealKey(proposalToDeal(p))));
  const players = playersOf(league);

  const start = seed % list.length;
  const tries = Math.min(3, list.length);
  for (let t = 0; t < tries; t++) {
    const pid = list[(start + t) % list.length];
    const deals = findDealsForPlayer(league, pid, 8)
      .filter(d => !busyTeams.has(d.partnerTeamId) && !seen.has(dealKey(d)));
    if (deals.length === 0) continue;
    // Score from the user's side as a ratio of what they give up. The AI is
    // pitching, so it leads with a deal that's roughly fair with a small
    // sweetener (~+5%) — never a giveaway (capped at +20%) and never an
    // obvious fleece (floor −10%). Picking the user-best deal made every
    // offer grade A+ and turned AI teams into a farmable value pump.
    const scored = deals.map(d => {
      const sides = dealToSides(uid, d);
      const ev = evaluateTrade(league, sides);
      const me = ev.perTeam.find(x => x.teamId === uid);
      const out = Math.max(1, me?.valueOut ?? 1);
      const ratio = me ? (me.valueIn - me.valueOut) / out : 0;
      return { d, ratio };
    })
      .filter(x => x.ratio >= -PROPOSAL_MIN_EDGE && x.ratio <= PROPOSAL_MAX_EDGE)
      .sort((a, b) => Math.abs(a.ratio - PROPOSAL_TARGET_EDGE) - Math.abs(b.ratio - PROPOSAL_TARGET_EDGE));
    if (scored.length === 0) continue;
    const choice = scored[(seed >>> 8) % Math.min(2, scored.length)].d;
    const target = players[pid];
    return {
      id: `tp-${league.currentSeason}-${day}-${choice.partnerTeamId}-${target?.id ?? pid}`,
      season: league.currentSeason,
      fromTeamId: choice.partnerTeamId,
      aiGives: { playerIds: choice.getIds, pickIds: choice.getPickIds ?? [] },
      aiWants: { playerIds: choice.giveIds, pickIds: choice.givePickIds ?? [] },
      createdDay: day,
      expiresDay: day + PROPOSAL_TTL_DAYS,
      status: 'pending',
      rationale: rationaleFor(league, choice),
    };
  }
  return null;
}

/**
 * Advance the proposal inbox one sim day: expire stale/invalid offers, then
 * maybe (hash-rolled) generate one new offer. Pure — returns a new league.
 * No-ops for spectators, after the deadline, and outside the regular season.
 */
export function refreshTradeProposals(league: LeagueState): LeagueState {
  const uid = league.userTeamId;
  const existing = data(league).tradeProposals;
  if (!uid) return league;
  const day = league.currentTick;
  const closed = tradeWindowClosed(league).closed || day > getTradeDeadlineDay(league) || league.currentPhase !== 'regular_season';
  let list = expire(league, day, closed);
  if (!existing && list.length === 0 && closed) return league;

  const pending = list.filter(p => p.status === 'pending' && p.season === league.currentSeason);
  const lastCreated = list.filter(p => p.season === league.currentSeason).reduce((m, p) => Math.max(m, p.createdDay), -99);
  if (!closed && day >= FIRST_PROPOSAL_DAY && pending.length < MAX_PENDING_PROPOSALS && day - lastCreated >= 2) {
    const seed = hash(`${league.id}-${league.currentSeason}-${day}-proposal`);
    if (seed % 100 < dailyChance(day, getTradeDeadlineDay(league))) {
      const prop = buildProposal(withProposals(league, list), day, pending, seed);
      if (prop) list = [...list, prop];
    }
  }
  return withProposals(league, pruneResolved(list, league.currentSeason));
}

/** Keep every pending offer plus the 20 most recent resolved ones from this
 *  season — the inbox history — so the list can't grow across seasons. */
const KEEP_RESOLVED = 20;
function pruneResolved(list: TradeProposal[], season: number): TradeProposal[] {
  const resolved = list
    .filter(p => p.status !== 'pending' && p.season === season)
    .sort((a, b) => (b.resolvedDay ?? b.createdDay) - (a.resolvedDay ?? a.createdDay))
    .slice(0, KEEP_RESOLVED);
  const keep = new Set(resolved.map(p => p.id));
  return list.filter(p => p.status === 'pending' || keep.has(p.id));
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export interface ProposalResponse {
  league: LeagueState;
  ok: boolean;
  message: string;
}

function setStatus(league: LeagueState, id: string, status: TradeProposalStatus, note?: string): LeagueState {
  const list = (data(league).tradeProposals ?? []).map(p =>
    p.id === id ? { ...p, status, resolvedDay: league.currentTick, ...(note ? { resolutionNote: note } : {}) } : p,
  );
  return withProposals(league, list);
}

function findPending(league: LeagueState, id: string): TradeProposal | null {
  const p = getTradeProposals(league).find(x => x.id === id);
  return p && p.status === 'pending' ? p : null;
}

/** Accept a pending offer: re-validate, then execute through proposeTrade so
 *  every trade side effect (rosters, picks, transactions, history) happens. */
export function acceptTradeProposal(league: LeagueState, id: string): ProposalResponse {
  const p = findPending(league, id);
  const uid = league.userTeamId;
  if (!p || !uid) return { league, ok: false, message: 'That offer is no longer available.' };
  if (tradeWindowClosed(league).closed) {
    return { league: setStatus(league, id, 'expired', 'The trade window closed.'), ok: false, message: 'The trade window is closed.' };
  }
  const deal = proposalToDeal(p);
  if (!isDealStillValid(league, deal)) {
    return { league: setStatus(league, id, 'expired', 'Offer withdrawn — the deal no longer works.'), ok: false, message: `${teamCity(league, p.fromTeamId)} pulled the offer — the deal no longer works for them.` };
  }
  const result = proposeTrade(league, dealToSides(uid, deal));
  if (!result.accepted) {
    return { league: setStatus(league, id, 'expired', result.reason), ok: false, message: result.reason };
  }
  let next = setStatus(result.league, id, 'accepted', 'Trade completed.');
  // Any other pending offer that relied on now-moved assets is withdrawn.
  next = withProposals(next, expire(next, next.currentTick, false));
  return { league: next, ok: true, message: `Trade with ${teamCity(league, p.fromTeamId)} completed.` };
}

export function declineTradeProposal(league: LeagueState, id: string): ProposalResponse {
  const p = findPending(league, id);
  if (!p) return { league, ok: false, message: 'That offer is no longer available.' };
  return { league: setStatus(league, id, 'declined', 'You declined.'), ok: true, message: 'Offer declined.' };
}

export interface CounterResult extends ProposalResponse {
  /** 'accepted' — AI took the user's counter (trade executed);
   *  'countered' — AI answered with one counteroffer (new pending proposal);
   *  'rejected' — nothing workable (illegal edit, or no counter found). */
  outcome: 'accepted' | 'countered' | 'rejected';
  counter?: TradeProposal;
}

/** Candidate AI counters to the user's edited package, in preference order. */
function counterCandidates(league: LeagueState, edited: DealSuggestion, original: DealSuggestion): { d: DealSuggestion; note: string }[] {
  const uid = league.userTeamId!;
  const players = playersOf(league);
  const out: { d: DealSuggestion; note: string }[] = [];
  const city = teamCity(league, edited.partnerTeamId);

  // 1) Ask for one of the user's picks on top (cheapest first).
  const usedPicks = new Set(edited.givePickIds ?? []);
  const myPicks = getTeamPicks(league, uid as TeamId)
    .filter(pk => !usedPicks.has(pk.id))
    .sort((a, b) => pickValue(league, a) - pickValue(league, b));
  for (const pk of myPicks.slice(0, 4)) {
    out.push({ d: { ...edited, givePickIds: [...(edited.givePickIds ?? []), pk.id] }, note: `${city} will do it if you add a draft pick.` });
  }

  // 2) Ask for a lesser user player added (lowest OVR first).
  const team = league.teams.find(t => t.id === uid);
  const used = new Set(edited.giveIds);
  const bench = (team?.playerIds ?? [])
    .map(id => players[id]).filter(Boolean)
    .filter(p => !used.has(p.id))
    .sort((a, b) => a.ratings.overall - b.ratings.overall);
  for (const pl of bench.slice(0, 4)) {
    out.push({ d: { ...edited, giveIds: [...edited.giveIds, pl.id] }, note: `${city} wants ${pl.firstName[0]}. ${pl.lastName} included.` });
  }

  // 3) Pull one of the AI's pieces out (least valuable first).
  const aiPieces: { kind: 'player' | 'pick'; id: string; v: number }[] = [
    ...edited.getIds.map(id => ({ kind: 'player' as const, id, v: players[id]?.ratings.overall ?? 0 })),
    ...(edited.getPickIds ?? []).map(id => ({ kind: 'pick' as const, id, v: 0 })),
  ];
  const totalGet = aiPieces.length;
  if (totalGet > 1) {
    for (const piece of aiPieces.sort((a, b) => a.v - b.v)) {
      const d: DealSuggestion = piece.kind === 'player'
        ? { ...edited, getIds: edited.getIds.filter(x => x !== piece.id) }
        : { ...edited, getPickIds: (edited.getPickIds ?? []).filter(x => x !== piece.id) };
      out.push({ d, note: `${city} can't include everything — they'd keep one piece.` });
    }
  }

  // 4) Fallback: stand firm on the original offer.
  out.push({ d: original, note: `${city} won't budge — their original offer stands.` });
  return out;
}

/**
 * Counter a pending AI offer with an edited package (user perspective). If the
 * AI accepts the edit, the trade executes. Otherwise it answers with ONE
 * counteroffer it would accept (pending, can't be re-countered). An illegal
 * edit (salary matching) is rejected without touching the original.
 */
export function counterTradeProposal(league: LeagueState, id: string, edited: DealSuggestion): CounterResult {
  const p = findPending(league, id);
  const uid = league.userTeamId;
  if (!p || !uid) return { league, ok: false, outcome: 'rejected', message: 'That offer is no longer available.' };
  if (p.counterOf) return { league, ok: false, outcome: 'rejected', message: 'This is already their final offer — accept or decline.' };
  if (tradeWindowClosed(league).closed) return { league, ok: false, outcome: 'rejected', message: 'The trade window is closed.' };
  const deal: DealSuggestion = { ...edited, partnerTeamId: p.fromTeamId };
  const hasBoth = deal.giveIds.length + (deal.givePickIds?.length ?? 0) > 0 && deal.getIds.length + (deal.getPickIds?.length ?? 0) > 0;
  if (!hasBoth || !assetsStillOwned(league, uid, deal)) {
    return { league, ok: false, outcome: 'rejected', message: 'A counter needs assets on both sides.' };
  }
  const sides = dealToSides(uid, deal);
  const ev = evaluateTrade(league, sides);
  if (!ev.legal) {
    const why = ev.perTeam.find(t => !t.capCompliant)?.reasoning ?? 'Salaries don’t match.';
    return { league, ok: false, outcome: 'rejected', message: `That counter isn't cap-legal: ${why}` };
  }
  const city = teamCity(league, p.fromTeamId);

  if (isExecutable(ev, sides)) {
    const result = proposeTrade(league, sides);
    if (result.accepted) {
      let next = setStatus(result.league, id, 'accepted', 'They accepted your counter.');
      next = withProposals(next, expire(next, next.currentTick, false));
      return { league: next, ok: true, outcome: 'accepted', message: `${city} accepted your counter — trade completed.` };
    }
  }

  const original = proposalToDeal(p);
  const editedKey = dealKey(deal);
  for (const cand of counterCandidates(league, deal, original)) {
    if (dealKey(cand.d) === editedKey) continue;
    if (!isDealStillValid(league, cand.d)) continue;
    const day = league.currentTick;
    const counter: TradeProposal = {
      id: `${p.id}-c`,
      season: league.currentSeason,
      fromTeamId: p.fromTeamId,
      aiGives: { playerIds: cand.d.getIds, pickIds: cand.d.getPickIds ?? [] },
      aiWants: { playerIds: cand.d.giveIds, pickIds: cand.d.givePickIds ?? [] },
      createdDay: day,
      expiresDay: day + COUNTER_TTL_DAYS,
      status: 'pending',
      rationale: cand.note || rationaleFor(league, cand.d, true),
      counterOf: p.id,
    };
    let next = setStatus(league, id, 'countered', 'You countered; they replied.');
    next = withProposals(next, [...(data(next).tradeProposals ?? []), counter]);
    return { league: next, ok: true, outcome: 'countered', counter, message: counter.rationale };
  }

  return {
    league: setStatus(league, id, 'declined', 'They walked away from talks.'),
    ok: false,
    outcome: 'rejected',
    message: `${city} turned down your counter and walked away.`,
  };
}

/** Toast suffix when a sim produced new pending offers (e.g. " · 📨 New trade offer from Chicago"). */
export function newProposalNote(before: LeagueState, after: LeagueState): string {
  const had = new Set(getTradeProposals(before).map(p => p.id));
  const fresh = getPendingProposals(after).filter(p => !had.has(p.id));
  if (fresh.length === 0) return '';
  if (fresh.length === 1) return ` · 📨 New trade offer from ${teamCity(after, fresh[0].fromTeamId)}`;
  return ` · 📨 ${fresh.length} new trade offers`;
}
