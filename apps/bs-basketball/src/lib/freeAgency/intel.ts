/**
 * Free-agent suitor intel (Football parity: intelReportFA).
 *
 * Pure + deterministic. For one free agent it reports:
 *   - which AI teams are interested — exactly the `aiSuitors` set that the real
 *     competing-offer logic (`bestCompetingOffer` / `runAiFreeAgency`) uses,
 *     ranked by the same interest score, bucketed Hot / Warm / Lukewarm;
 *   - a FUZZED offer range per suitor. AI teams bid market × desired years, so
 *     the true total always lies inside the range; the window is ±(8-14)% and
 *     its centre is shifted up to ±5%, both hashed off (player, team, season),
 *     so it is stable across renders but doesn't reveal the exact number;
 *   - the player's stated priorities, read straight off the acceptance gate
 *     (`acceptanceThreshold`): money (tier fraction of market), contender
 *     (the ±9% appeal swing), loyalty (Bird-rights discount) and role
 *     (the mood model's "top-5 talent expects to start").
 *
 * Cost: each FA window (season) grants `INTEL_REPORTS_PER_WINDOW` reports.
 * Revealed reports are stored as player ids on league.sportData.faIntel —
 * optional, so old saves default to "none used".
 */

import type { BasketballPlayer, BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import type { BaseLeagueState, PlayerId, TeamId } from '@bs/core/adapter';
import {
  aiSuitors, bestCompetingOffer, freeAgentInfo, teamAppeal, acceptanceThreshold,
  type AiSuitor,
} from './freeAgency';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export const INTEL_REPORTS_PER_WINDOW = 5;

export interface FaIntelState {
  season: number;
  revealed: string[];
}

interface LeagueSportData { faIntel?: FaIntelState; [key: string]: unknown }

export type Interest = 'hot' | 'warm' | 'lukewarm';
export type PriorityKey = 'money' | 'contender' | 'loyalty' | 'role';

export interface SuitorIntel {
  teamId: TeamId;
  interest: Interest;
  /** True for the suitor the competing-offer logic would actually pick. */
  frontRunner: boolean;
  via: AiSuitor['via'];
  /** Fuzzed contract-total range (dollars). Always contains the real bid. */
  offerLow: number;
  offerHigh: number;
  years: number;
}

export interface Priority {
  key: PriorityKey;
  label: string;
  /** 0..1 importance. */
  weight: number;
  note: string;
}

export interface FaIntelReport {
  playerId: string;
  suitors: SuitorIntel[];
  priorities: Priority[];
  /** The top priority's label, for a one-line summary. */
  headline: string;
  /** Rough minimum total the player would take from the USER's team, fuzzed. */
  userAskLow: number;
  userAskHigh: number;
}

// ---------------------------------------------------------------------------
// Fuzz
// ---------------------------------------------------------------------------

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/** Deterministic fuzzed range around `actual` that always contains it. */
export function fuzzRange(actual: number, seed: string): { low: number; high: number } {
  const halfWidth = 0.08 + 0.06 * hash01(`${seed}|w`);     // 8-14%
  const shift = (hash01(`${seed}|c`) - 0.5) * 0.1;          // ±5%
  const centre = actual * (1 + shift);
  const step = 100_000;
  let low = Math.floor((centre * (1 - halfWidth)) / step) * step;
  let high = Math.ceil((centre * (1 + halfWidth)) / step) * step;
  // |shift| ≤ 5% < halfWidth ≥ 8%, so actual is always inside; clamp anyway.
  if (low > actual) low = Math.floor(actual / step) * step;
  if (high < actual) high = Math.ceil(actual / step) * step;
  return { low: Math.max(0, low), high };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function interestFor(s: AiSuitor, topScore: number): Interest {
  if (s.via === 'bird_rights' || s.score >= topScore - 25) return 'hot';
  if (s.need >= 1) return 'warm';
  return 'lukewarm';
}

function prioritiesFor(player: BasketballPlayer, hasBird: boolean): Priority[] {
  const ovr = player.ratings.overall;
  // Mirrors acceptanceThreshold's tier fraction: 1.02 / 0.96 / 0.90 / 0.82.
  const frac = ovr >= 80 ? 1.02 : ovr >= 74 ? 0.96 : ovr >= 68 ? 0.9 : 0.82;
  const money = Math.min(1, Math.max(0, (frac - 0.78) / 0.26)); // 0.82→.15, 1.02→.92
  // The appeal swing is a fixed ±9% of market; it matters most to players whose
  // tier fraction leaves the least slack (the tier-scaled weight below).
  const contender = 0.35 + 0.35 * (1 - money);
  const loyalty = hasBird ? 0.45 : 0;
  // Mood model: a top-5 talent on a roster expects to start.
  const role = ovr >= 74 ? 0.6 : ovr >= 68 ? 0.4 : 0.2;

  const list: Priority[] = [
    { key: 'money', label: 'Money', weight: money,
      note: frac >= 1 ? 'Wants at least full market value.' : `Will take ~${Math.round((1 - frac) * 100)}% under market from the right fit.` },
    { key: 'contender', label: 'Contender', weight: contender,
      note: 'A winning team gets up to ~9% off; a losing team pays up to ~9% more.' },
    { key: 'role', label: 'Role', weight: role,
      note: ovr >= 74 ? 'Expects starter minutes.' : 'Open to a bench role.' },
  ];
  if (hasBird) list.push({ key: 'loyalty', label: 'Loyalty', weight: loyalty, note: 'Gives his former (Bird-rights) team a ~4% discount.' });
  return list.sort((a, b) => b.weight - a.weight);
}

/** Build the intel report for a free agent (null if not a free agent). Pure. */
export function faIntelReport(league: LeagueState, playerId: string): FaIntelReport | null {
  if (!league.freeAgentIds.includes(playerId as PlayerId)) return null;
  const info = freeAgentInfo(league, playerId as PlayerId);
  if (!info) return null;

  const raw = aiSuitors(league, info).sort((a, b) => b.score - a.score);
  const best = bestCompetingOffer(league, info);
  const topScore = raw[0]?.score ?? 0;
  const total = info.marketSalary * info.desiredYears;
  const season = league.currentSeason;

  const suitors: SuitorIntel[] = raw.map(s => {
    const { low, high } = fuzzRange(total, `${playerId}|${s.teamId}|${season}`);
    return {
      teamId: s.teamId,
      interest: interestFor(s, topScore),
      frontRunner: best?.teamId === s.teamId,
      via: s.via,
      offerLow: low,
      offerHigh: high,
      years: info.desiredYears,
    };
  });

  const hasBird = info.birdRights !== 'none' && !!info.lastTeamId;
  const priorities = prioritiesFor(info.player, hasBird);

  let userAskLow = 0, userAskHigh = 0;
  if (league.userTeamId) {
    const isBird = info.birdRights !== 'none' && info.lastTeamId === league.userTeamId;
    const threshold = acceptanceThreshold(info, teamAppeal(league, league.userTeamId), best?.total ?? 0, isBird);
    const r = fuzzRange(threshold, `${playerId}|user|${season}`);
    userAskLow = r.low; userAskHigh = r.high;
  }

  return {
    playerId,
    suitors,
    priorities,
    headline: priorities[0]?.label ?? 'Money',
    userAskLow: roundTo(userAskLow, 100_000),
    userAskHigh: roundTo(userAskHigh, 100_000),
  };
}

// ---------------------------------------------------------------------------
// Budget (persisted)
// ---------------------------------------------------------------------------

export function getFaIntel(league: LeagueState): FaIntelState {
  const st = (league.sportData as LeagueSportData | undefined)?.faIntel;
  if (!st || st.season !== league.currentSeason) return { season: league.currentSeason, revealed: [] };
  return st;
}

export function intelRemaining(league: LeagueState): number {
  return Math.max(0, INTEL_REPORTS_PER_WINDOW - getFaIntel(league).revealed.length);
}

export function isIntelRevealed(league: LeagueState, playerId: string): boolean {
  return getFaIntel(league).revealed.includes(playerId);
}

/** Spend one intel report on a free agent. No-op (same league) if already
 *  revealed, out of reports, or not a free agent. Pure. */
export function revealFaIntel(league: LeagueState, playerId: string): LeagueState {
  if (!league.freeAgentIds.includes(playerId as PlayerId)) return league;
  const st = getFaIntel(league);
  if (st.revealed.includes(playerId) || st.revealed.length >= INTEL_REPORTS_PER_WINDOW) return league;
  const next: FaIntelState = { season: st.season, revealed: [...st.revealed, playerId] };
  return { ...league, sportData: { ...(league.sportData as LeagueSportData), faIntel: next } };
}
