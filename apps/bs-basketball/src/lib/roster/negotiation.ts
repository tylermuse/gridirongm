/**
 * Re-sign / extension negotiation with personality (multi-round).
 *
 * Replaces the single-shot "is this ≥ 50% acceptance" check. Each player you
 * talk to gets a NEGOTIATION PROFILE built from data he already carries:
 *
 *   - market value      extensionMarket() (same market math as before)
 *   - mood              playerMood() (role vs talent, contract year, upside)
 *   - loyalty signals   seasons with the team, Bird rights tier, team winning,
 *                       starter role
 *   - age / star power  young stars push harder, vets settle sooner
 *
 * Profile fields (all deterministic per save + season + player):
 *   patience        2–4 rounds of offers before he ends talks
 *   anchor          his opening ask $/yr (≥ market for unhappy / disloyal players)
 *   reservation     his walk-away floor $/yr — the least he'll take
 *   lowballLine     an offer below this (effective $/yr) offends him
 *   askYears        term he wants (market term)
 *
 * Round rules (one offer = one round):
 *   - Offers must be cap-legal for the new years (service-time max / minimum,
 *     1–5 years). Illegal offers are refused without costing a round.
 *   - Effective value = $/yr × years-fit (−5% per year away from askYears, ≥80%).
 *   - ACCEPT when effective ≥ max(reservation, 97% of his current ask); on his
 *     final round of patience, ≥ the midpoint of reservation and current ask.
 *   - LOWBALL (effective < lowballLine): offended — patience −1, an offense is
 *     recorded and a mood hit: his walk-away floor hardens 3% and his ask
 *     doesn't move. A 2nd lowball, or patience reaching 0, ENDS talks ("he'll
 *     test free agency").
 *   - Otherwise COUNTER: patience −1, his ask concedes part of the gap toward
 *     max(offer, reservation); the counter sits between your offer and his
 *     anchor. Patience reaching 0 on a counter also ends talks.
 *   - "Offer what he wants" (acceptAsk) always signs at his current ask while
 *     talks are open; after talks end it still works, at a 10% premium over his
 *     anchor (the price of keeping him off the market). Asks are clamped to the
 *     player's legal min/max, so this path is always cap-legal.
 *
 * Talk state persists per player on `league.sportData.resignTalks[playerId]`
 * for the current season (old saves: absent → a fresh talk opens lazily).
 * Bird rights / cap rules are unchanged: extensions still go through
 * buildExtension and the same contract legality checks.
 */

import {
  basketballMaxSalary,
  minimumSalary,
  type BasketballPlayer,
  type BasketballTeam,
} from '@bs/sport-basketball';
import type { BaseLeagueState, PlayerId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import type { Offer } from '../freeAgency';
import { extensionMarket, buildExtension, type ExtensionMarket } from './extension';
import { playerMood } from './mood';
import { contractYearsLeft } from './playerActions';
import { resolveLineup } from '../lineup';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export const MAX_EXTENSION_YEARS = 5;
const ENDED_PREMIUM = 1.10;

export interface NegotiationProfile {
  patience: number;
  anchor: number;
  reservation: number;
  lowballLine: number;
  askYears: number;
  /** 0..1 — how attached he is to the team. */
  loyalty: number;
  moodLabel: string;
  /** Plain-English reasons behind the profile, for the UI. */
  traits: string[];
  /** Legal salary bounds for the new years. */
  minSalary: number;
  maxSalary: number;
}

export type TalkStatus = 'open' | 'agreed' | 'ended';
export type OfferResponseKind = 'accepted' | 'countered' | 'offended' | 'walked' | 'invalid';

export interface TalkRound {
  offer: Offer;
  response: OfferResponseKind;
  counter?: Offer;
}

export interface TalkState {
  season: number;
  playerId: string;
  profile: NegotiationProfile;
  patienceLeft: number;
  currentAsk: number;
  offenses: number;
  status: TalkStatus;
  rounds: TalkRound[];
}

export interface OfferResponse {
  kind: OfferResponseKind;
  message: string;
  talk: TalkState;
  counter?: Offer;
  /** The signed deal when kind === 'accepted'. */
  signed?: Offer;
}

interface TalksSportData {
  resignTalks?: Record<string, TalkState>;
  [key: string]: unknown;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const roundTo100k = (n: number) => Math.round(n / 100_000) * 100_000;
const fmtM = (n: number) => `$${(n / 1e6).toFixed(1)}M`;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ===========================================================================
// Profile
// ===========================================================================

function teamOf(league: LeagueState, player: BasketballPlayer): BasketballTeam | undefined {
  const tid = player.rosterSlot?.teamId;
  return tid ? (league.teams.find(t => t.id === tid) as BasketballTeam | undefined) : undefined;
}

export function negotiationProfile(league: LeagueState, player: BasketballPlayer): NegotiationProfile {
  const season = league.currentSeason;
  const market: ExtensionMarket = extensionMarket(player, season);
  const team = teamOf(league, player);
  const traits: string[] = [];

  // Role + mood (same derivation as the roster mood chip).
  let isStarter = false;
  let talentRank = 99;
  if (team) {
    const players = league.players as Record<string, BasketballPlayer>;
    const roster = team.playerIds.map(id => players[id]).filter((p): p is BasketballPlayer => !!p);
    const lineup = resolveLineup(team, roster);
    isStarter = lineup.starters.includes(player.id as PlayerId);
    talentRank = [...roster].sort((a, b) => b.ratings.overall - a.ratings.overall).findIndex(p => p.id === player.id);
  }
  const mood = playerMood({ player, team, talentRank: talentRank < 0 ? 99 : talentRank, isStarter, yearsLeft: contractYearsLeft(player, season) });

  // Loyalty signals.
  const sd = player.sportData;
  const joined = sd.acquiredSeason ?? sd.draftYear ?? season;
  const yearsWithTeam = Math.max(0, season - joined);
  let loyalty = Math.min(0.35, yearsWithTeam * 0.09);
  if (yearsWithTeam >= 3) traits.push(`${yearsWithTeam} seasons with the team`);
  if (sd.birdRights === 'full') loyalty += 0.1;
  const winning = !!team && team.record.wins + team.record.losses > 0 && team.record.wins >= team.record.losses;
  if (winning) { loyalty += 0.15; traits.push('likes the winning culture'); }
  if (isStarter) { loyalty += 0.1; traits.push('happy with his starting role'); }
  if (mood.label === 'Thrilled' || mood.label === 'Happy') loyalty += 0.15;
  if (mood.label === 'Unhappy') { loyalty -= 0.2; traits.push('unhappy with his role'); }
  if (mood.label === 'Angry') { loyalty -= 0.35; traits.push('angry about his role'); }
  loyalty = clamp(loyalty, 0, 1);

  const ovr = player.ratings.overall;
  const youngStar = player.age <= 26 && ovr >= 78;
  const vet = player.age >= 32;
  if (youngStar) traits.push('young star who knows his worth');
  if (vet) traits.push('veteran looking for security');

  // Patience: 2–4 rounds.
  const patience = clamp(Math.round(2 + loyalty * 2 + (vet ? 0.5 : 0) - (youngStar ? 0.5 : 0)), 2, 4);

  // Anchor / reservation around the existing market number. Small deterministic
  // jitter so two identical-looking players don't negotiate identically.
  const jitter = ((hash(`${league.id}-${season}-${player.id}-neg`) % 100) / 100 - 0.5) * 0.04; // ±2%
  const anchorMult = 1.0 + 0.10 * (1 - loyalty) + (youngStar ? 0.04 : 0) + (mood.label === 'Angry' ? 0.04 : 0) + jitter;
  const reserveMult = 0.80 + 0.12 * (1 - loyalty) + (youngStar ? 0.03 : 0) - (vet ? 0.03 : 0) + jitter;

  const startSeason = market.startSeason;
  const minSalary = minimumSalary(sd.yearsInLeague ?? 0);
  const maxSalary = Math.floor(basketballMaxSalary(sd.yearsInLeague ?? 0, startSeason) / 100_000) * 100_000;
  const anchor = clamp(roundTo100k(market.marketSalary * anchorMult), minSalary, maxSalary);
  const reservation = clamp(roundTo100k(market.marketSalary * reserveMult), minSalary, anchor);
  const lowballLine = Math.max(minSalary, roundTo100k(reservation * 0.8));

  return {
    patience, anchor, reservation, lowballLine,
    askYears: clamp(market.desiredYears, 1, MAX_EXTENSION_YEARS),
    loyalty, moodLabel: mood.label, traits, minSalary, maxSalary,
  };
}

// ===========================================================================
// Talk state
// ===========================================================================

export function getTalk(league: LeagueState, playerId: string): TalkState | null {
  const t = (league.sportData as TalksSportData | undefined)?.resignTalks?.[playerId];
  return t && t.season === league.currentSeason ? t : null;
}

/** Existing talk for this season, or a fresh (not yet persisted) one. */
export function openTalk(league: LeagueState, player: BasketballPlayer): TalkState {
  const existing = getTalk(league, player.id);
  if (existing) return existing;
  const profile = negotiationProfile(league, player);
  return {
    season: league.currentSeason,
    playerId: player.id,
    profile,
    patienceLeft: profile.patience,
    currentAsk: profile.anchor,
    offenses: 0,
    status: 'open',
    rounds: [],
  };
}

export function setTalk(league: LeagueState, talk: TalkState): LeagueState {
  const sd = league.sportData as TalksSportData;
  // Drop talks from earlier seasons so the map doesn't grow forever.
  const kept: Record<string, TalkState> = {};
  for (const [id, t] of Object.entries(sd.resignTalks ?? {})) if (t.season === league.currentSeason) kept[id] = t;
  kept[talk.playerId] = talk;
  return { ...league, sportData: { ...sd, resignTalks: kept } };
}

/** What "Offer what he wants" costs right now. */
export function currentAsk(talk: TalkState): Offer {
  const salary = talk.status === 'ended'
    ? Math.min(talk.profile.maxSalary, roundTo100k(talk.profile.anchor * ENDED_PREMIUM))
    : talk.currentAsk;
  return { years: talk.profile.askYears, salaryPerYear: salary };
}

/** Cap legality of the NEW years (service-time max/min, 1–5 years). */
export function validateOffer(profile: NegotiationProfile, offer: Offer): string | null {
  if (!Number.isFinite(offer.years) || offer.years < 1 || offer.years > MAX_EXTENSION_YEARS || Math.round(offer.years) !== offer.years) {
    return `Extensions run 1–${MAX_EXTENSION_YEARS} years.`;
  }
  if (offer.salaryPerYear > profile.maxSalary + 1) return `That's over his max salary (${fmtM(profile.maxSalary)}/yr).`;
  if (offer.salaryPerYear < profile.minSalary) return `That's below his league minimum (${fmtM(profile.minSalary)}/yr).`;
  return null;
}

function effectiveSalary(profile: NegotiationProfile, offer: Offer): number {
  const fit = Math.max(0.8, 1 - 0.05 * Math.abs(offer.years - profile.askYears));
  return offer.salaryPerYear * fit;
}

/** Live read for the UI meter: 0 = insulting, 1 = he'll sign. */
export function offerTemperature(talk: TalkState, offer: Offer): number {
  const eff = effectiveSalary(talk.profile, offer);
  const r = talk.profile.reservation;
  const accept = talk.patienceLeft <= 1 ? Math.max(r, (r + talk.currentAsk) / 2) : Math.max(r, talk.currentAsk * 0.97);
  const lo = talk.profile.lowballLine;
  if (eff >= accept) return 1;
  if (eff <= lo) return 0;
  return clamp((eff - lo) / (accept - lo), 0, 1) * 0.95;
}

// ===========================================================================
// A round of talks (pure)
// ===========================================================================

export function respondToOffer(talk: TalkState, offer: Offer, playerName = 'He'): OfferResponse {
  if (talk.status !== 'open') {
    return {
      kind: 'invalid',
      message: talk.status === 'agreed' ? `${playerName} already agreed to terms.` : `${playerName} has ended talks — he's testing free agency. Meet his full ask (${fmtM(currentAsk(talk).salaryPerYear)}/yr) to keep him.`,
      talk,
    };
  }
  const illegal = validateOffer(talk.profile, offer);
  if (illegal) return { kind: 'invalid', message: illegal, talk };

  const p = talk.profile;
  const eff = effectiveSalary(p, offer);
  // Final round (last patience point): deal-or-nothing — he'll meet you at
  // the midpoint between his floor and his current ask.
  const finalRound = talk.patienceLeft <= 1;
  const acceptLine = finalRound
    ? Math.max(p.reservation, (p.reservation + talk.currentAsk) / 2)
    : Math.max(p.reservation, talk.currentAsk * 0.97);

  if (eff >= acceptLine) {
    const next: TalkState = { ...talk, status: 'agreed', rounds: [...talk.rounds, { offer, response: 'accepted' }] };
    return { kind: 'accepted', message: `${playerName} accepts: ${offer.years} yrs at ${fmtM(offer.salaryPerYear)}/yr.`, talk: next, signed: offer };
  }

  if (eff < p.lowballLine) {
    const offenses = talk.offenses + 1;
    const patienceLeft = talk.patienceLeft - 1;
    const ended = offenses >= 2 || patienceLeft <= 0;
    const counter: Offer = { years: p.askYears, salaryPerYear: talk.currentAsk };
    // Mood hit: the insult hardens his floor 3% (never above his anchor).
    const hardened = Math.min(p.anchor, roundTo100k(p.reservation * 1.03));
    const next: TalkState = {
      ...talk, offenses, patienceLeft: Math.max(0, patienceLeft),
      profile: { ...p, reservation: hardened },
      status: ended ? 'ended' : 'open',
      rounds: [...talk.rounds, { offer, response: ended ? 'walked' : 'offended', counter: ended ? undefined : counter }],
    };
    return ended
      ? { kind: 'walked', message: `${playerName} is insulted and ends talks — he'll test free agency.`, talk: next }
      : { kind: 'offended', message: `${playerName} is offended by that number. He's still at ${fmtM(counter.salaryPerYear)}/yr over ${counter.years} yrs — and his patience is wearing thin.`, talk: next, counter };
  }

  // Fair-but-short: he counters, conceding part of the gap.
  const patienceLeft = talk.patienceLeft - 1;
  const concession = 0.35 + 0.2 * p.loyalty;
  const target = Math.max(p.reservation, eff);
  const newAsk = Math.max(p.reservation, roundTo100k(talk.currentAsk - (talk.currentAsk - target) * concession));
  const counterSalary = Math.min(p.anchor, Math.max(newAsk, offer.salaryPerYear));
  const counter: Offer = { years: p.askYears, salaryPerYear: counterSalary };
  const ended = patienceLeft <= 0;
  const next: TalkState = {
    ...talk, patienceLeft: Math.max(0, patienceLeft), currentAsk: newAsk,
    status: ended ? 'ended' : 'open',
    rounds: [...talk.rounds, { offer, response: ended ? 'walked' : 'countered', counter: ended ? undefined : counter }],
  };
  return ended
    ? { kind: 'walked', message: `${playerName} is done negotiating — he'll test free agency.`, talk: next }
    : { kind: 'countered', message: `${playerName} counters at ${fmtM(counter.salaryPerYear)}/yr over ${counter.years} yrs.`, talk: next, counter };
}

// ===========================================================================
// League-level operations (used by thin store actions)
// ===========================================================================

export interface NegotiationOutcome {
  league: LeagueState;
  response: OfferResponse;
}

function nameOf(p: BasketballPlayer): string {
  return `${p.firstName} ${p.lastName}`;
}

function signExtension(league: LeagueState, player: BasketballPlayer, offer: Offer): LeagueState {
  const market = extensionMarket(player, league.currentSeason);
  const contract = buildExtension(player, offer, market);
  return { ...league, players: { ...league.players, [player.id]: { ...player, contract } } };
}

/** Make an offer; persists the talk and signs the deal on acceptance. */
export function negotiateExtension(league: LeagueState, playerId: string, offer: Offer): NegotiationOutcome | null {
  const player = league.players[playerId as PlayerId] as BasketballPlayer | undefined;
  if (!player) return null;
  const talk = openTalk(league, player);
  const response = respondToOffer(talk, offer, nameOf(player));
  if (response.kind === 'invalid') return { league, response };
  let next = setTalk(league, response.talk);
  if (response.kind === 'accepted' && response.signed) next = signExtension(next, player, response.signed);
  return { league: next, response };
}

/** "Offer what he wants" — sign at his current ask (premium if talks ended). */
export function acceptExtensionAsk(league: LeagueState, playerId: string): NegotiationOutcome | null {
  const player = league.players[playerId as PlayerId] as BasketballPlayer | undefined;
  if (!player) return null;
  const talk = openTalk(league, player);
  if (talk.status === 'agreed') {
    return { league, response: { kind: 'invalid', message: `${nameOf(player)} already agreed to terms.`, talk } };
  }
  const ask = currentAsk(talk);
  const illegal = validateOffer(talk.profile, ask);
  if (illegal) return { league, response: { kind: 'invalid', message: illegal, talk } };
  const agreed: TalkState = { ...talk, status: 'agreed', rounds: [...talk.rounds, { offer: ask, response: 'accepted' }] };
  const next = signExtension(setTalk(league, agreed), player, ask);
  return {
    league: next,
    response: { kind: 'accepted', message: `${nameOf(player)} signed: ${ask.years} yrs at ${fmtM(ask.salaryPerYear)}/yr.`, talk: agreed, signed: ask },
  };
}
