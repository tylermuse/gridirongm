/**
 * Free agency (Phase 2D-5).
 *
 * Pure functions over league state. The free-agent pool is `league.freeAgentIds`
 * (draft-overflow waivers + any unsigned). A signing is the user (or a competing
 * AI team) winning a player with a contract built from years × salary.
 *
 * "Multi-team bidding (simplified)": when the user makes an offer we compute the
 * single best competing AI offer (a team with cap room + positional need willing
 * to pay market). The player takes the larger total — ties go to the user. The
 * displayed "projected acceptance" is a heuristic estimate to guide the offer.
 *
 * Contracts only exist on drafted rookies + FA signings in v1, so cap room is
 * effectively the full cap for most teams — we still compute + show it.
 */

import {
  basketballMarketSalary,
  basketballMarketContractYears,
  basketballSalaryCap,
  basketballTeamPayroll,
  basketballTeamCapStatus,
  LEAGUE_MINIMUM_SALARY,
  type BasketballPlayer,
} from '@bs/sport-basketball';
import type { BaseContract, BaseLeagueState, PlayerId, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import { appendTransaction } from '../transactions';
import { upcomingSeason } from '../draft/draft';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

function teamLabel(league: LeagueState, teamId: TeamId): string {
  const t = league.teams.find(x => x.id === teamId);
  return t ? `${t.city} ${t.name}` : teamId;
}
function playerLabel(league: LeagueState, playerId: PlayerId): string {
  const p = league.players[playerId] as BasketballPlayer | undefined;
  return p ? `${p.firstName} ${p.lastName}` : playerId;
}

export const MAX_ROSTER = 15;
/** AI teams keep signing the best-available depth until they reach this many
 *  men, even without a strict positional need — so the free-agent pool actually
 *  drains each offseason and the user can't scoop a full bench of unsigned
 *  65–74 OVR players (the core reason the league played too easy). */
export const TARGET_ROSTER = 14;
/** Players won't take less than this fraction of their market total. */
const LOWBALL_FLOOR = 0.7;

interface LeagueSportData {
  freeAgentLastTeam?: Record<string, TeamId>;
  /** Current day of the free-agency window (0..FA_DAYS). Drives price decay. */
  faDay?: number;
  /** Set once the user tips off the regular season from the FA window. Until
   *  then the preseason steers to free agency even though a schedule exists;
   *  after it, Day 1 is live and unplayed (we do NOT auto-sim game 1). */
  seasonStarted?: boolean;
  [key: string]: unknown;
}

/** Length of the free-agency window, in days. */
export const FA_DAYS = 30;

/** Current FA day (0 = market just opened). */
export function getFaDay(league: LeagueState): number {
  const d = (league.sportData as LeagueSportData | undefined)?.faDay ?? 0;
  return Math.max(0, Math.min(FA_DAYS, d));
}

/** True once the user has tipped off the regular season from the FA window.
 *  Distinguishes "still in the preseason FA window" (free agents linger in the
 *  pool all season) from "season is live, Day 1 unplayed". */
export function isSeasonUnderway(league: LeagueState): boolean {
  return (league.sportData as LeagueSportData | undefined)?.seasonStarted === true;
}

/** Market price multiplier as the window ages: 1.0 on day 0 → 0.5 by day 30.
 *  Unsigned players grow cheaper, so late shopping lands bargains. The floor was
 *  0.6, which left expensive stars (an 83-OVR asking ~$30M → $18M at day 30)
 *  above what any full-roster team can pay with its MLE-sized budget, so they sat
 *  unsigned all window. Dropping to 0.5 lets the bargain bin actually clear. */
export function faPriceDecay(day: number): number {
  const d = Math.max(0, Math.min(FA_DAYS, day));
  return Math.max(0.5, 1 - d * (0.5 / FA_DAYS));
}

/** Phase label/color for the current FA day (UI). */
export function faPhase(day: number): { label: string; color: string } {
  if (day <= 7) return { label: 'Full Market', color: '#10b981' };
  if (day <= 15) return { label: 'Cooling', color: '#3b82f6' };
  if (day <= 23) return { label: 'Dropping', color: '#f59e0b' };
  return { label: 'Bargain Bin', color: '#dc2626' };
}

export interface FreeAgentInfo {
  player: BasketballPlayer;
  /** Asking salary, $/year (deterministic per player+season). */
  marketSalary: number;
  desiredYears: number;
  lastTeamId: TeamId | null;
  birdRights: 'full' | 'early' | 'none';
}

export interface Offer {
  years: number;
  salaryPerYear: number;
}

export interface OfferResult {
  outcome: 'signed' | 'signed_elsewhere' | 'rejected';
  league: LeagueState;
  signedTeamId: TeamId | null;
  competingTeamId: TeamId | null;
  competingOfferTotal: number;
  message: string;
}

// ===========================================================================
// Pool + cap
// ===========================================================================

function lastTeamMap(league: LeagueState): Record<string, TeamId> {
  return (league.sportData as LeagueSportData | undefined)?.freeAgentLastTeam ?? {};
}

export function freeAgentInfo(league: LeagueState, playerId: PlayerId): FreeAgentInfo | null {
  const player = league.players[playerId] as BasketballPlayer | undefined;
  if (!player) return null;
  const decay = faPriceDecay(getFaDay(league));
  return {
    player,
    marketSalary: Math.round(basketballMarketSalary(player, {
      season: league.currentSeason,
      noiseSeed: `fa-${player.id}-${league.currentSeason}`,
    }) * decay),
    desiredYears: basketballMarketContractYears(player),
    lastTeamId: lastTeamMap(league)[playerId] ?? null,
    birdRights: (player.sportData as { birdRights: 'full' | 'early' | 'none' }).birdRights,
  };
}

/** The free-agent pool, richest-talent first. */
export function freeAgentPool(league: LeagueState): FreeAgentInfo[] {
  return league.freeAgentIds
    .map(id => freeAgentInfo(league, id))
    .filter((f): f is FreeAgentInfo => !!f)
    .sort((a, b) => b.player.ratings.overall - a.player.ratings.overall);
}

export function rosterCount(league: LeagueState, teamId: TeamId): number {
  return league.teams.find(t => t.id === teamId)?.playerIds.length ?? 0;
}

export function capRoom(league: LeagueState, teamId: TeamId): number {
  const team = league.teams.find(t => t.id === teamId);
  if (!team) return 0;
  // Price the UPCOMING season (BUG-29) — the same year the Re-sign window uses —
  // so the cap-space figure doesn't lurch between Re-sign and Free Agency when
  // FA is opened during the offseason before the year has rolled.
  const season = upcomingSeason(league);
  const players = team.playerIds
    .map(id => league.players[id] as BasketballPlayer | undefined)
    .filter((p): p is BasketballPlayer => !!p);
  const payroll = basketballTeamPayroll(players, season);
  return basketballSalaryCap(season) - payroll;
}

/**
 * The most a team can realistically commit to a SINGLE free agent this offseason
 * — the key to a live market. Cap room alone makes almost no one a bidder
 * (most rosters are over the cap), which is why competition used to read "none."
 * Over-cap teams get a Mid-Level-style exception instead, scaled down past the
 * tax/apron and gone above the second apron (where only minimums remain). Every
 * team can always offer at least the league minimum to fill out a roster.
 */
export function signingBudget(league: LeagueState, teamId: TeamId): number {
  const team = league.teams.find(t => t.id === teamId);
  if (!team) return 0;
  // Upcoming season (BUG-29) — consistent with capRoom + the Re-sign window.
  const season = upcomingSeason(league);
  const players = team.playerIds
    .map(id => league.players[id] as BasketballPlayer | undefined)
    .filter((p): p is BasketballPlayer => !!p);
  const status = basketballTeamCapStatus(players, season);
  // Under the cap → that room, but always at least a minimum deal: the minimum
  // exception is always available, so a team a hair under the cap (e.g. $75K of
  // room) must still read as able to sign someone, not "can't afford anyone".
  if (status.capRoom > 0) return Math.max(LEAGUE_MINIMUM_SALARY, status.capRoom);

  // Over the cap: largest available exception, scaled by how deep into the tax
  // a team is, and hard-stopped at the second apron.
  const cap = status.cap;
  let exception: number;
  if (status.isOverSecondApron) exception = 0; // only minimum deals remain
  else if (status.isOverTax || status.isOverFirstApron) exception = cap * 0.04; // taxpayer MLE
  else exception = cap * 0.094; // full non-tax MLE
  // Don't let an exception signing punch through the second apron.
  const apronHeadroom = Math.max(0, status.secondApron - status.payroll);
  return Math.max(LEAGUE_MINIMUM_SALARY, Math.min(exception, apronHeadroom));
}

// ===========================================================================
// Offer math
// ===========================================================================

/** Projected chance the user's offer wins the player (heuristic, for the UI). */
/** A team's pull on free agents, 0..1, from its winning %. Contenders are a
 *  draw (players take a touch less); cellar teams must pay a premium. */
export function teamAppeal(league: LeagueState, teamId: TeamId): number {
  const t = league.teams.find(x => x.id === teamId);
  if (!t) return 0.5;
  const gp = t.record.wins + t.record.losses;
  return gp > 0 ? clamp(t.record.wins / gp, 0, 1) : 0.5;
}

/**
 * The minimum CONTRACT TOTAL a free agent will accept from a team — the real
 * gate (BUG-18). It's a fraction of his market ask, shaped by his tier (stars
 * demand market+, depth pieces flex down) and the team's appeal (contenders get
 * a discount, also-rans pay up), and never below a competing offer. A player
 * with Bird rights gives his own team a small loyalty discount.
 */
export function acceptanceThreshold(
  info: FreeAgentInfo,
  appeal: number,
  competingTotal: number,
  isOwnBirdTeam = false,
): number {
  const marketTotal = info.marketSalary * info.desiredYears;
  const ovr = info.player.ratings.overall;
  let frac = ovr >= 80 ? 1.02 : ovr >= 74 ? 0.96 : ovr >= 68 ? 0.9 : 0.82;
  frac += (0.5 - appeal) * 0.18; // appeal 1.0 → −0.09, appeal 0 → +0.09
  if (isOwnBirdTeam && info.birdRights !== 'none') frac -= 0.04;
  frac = clamp(frac, 0.72, 1.2);
  return Math.max(competingTotal, Math.round(marketTotal * frac));
}

/** Projected chance the offer is accepted (for the UI), honest to the gate:
 *  ~0 well below the acceptance threshold, exactly 1 at/above it. */
export function acceptanceProbability(
  info: FreeAgentInfo,
  offer: Offer,
  competingTotal: number,
  appeal = 0.5,
): number {
  const userTotal = offer.salaryPerYear * offer.years;
  const threshold = acceptanceThreshold(info, appeal, competingTotal);
  // The acceptance gate (`resolveUserOffer`) is deterministic: `userTotal >=
  // threshold` accepts, anything below rejects. The probability bar exists to
  // guide the user toward that gate, so it should read 100% the moment the
  // offer crosses it — not 99% forever (BUG-22). Below the gate, it decays
  // linearly to 0 at 80% of threshold.
  if (userTotal >= threshold) return 1;
  return clamp((userTotal / threshold - 0.8) / 0.25, 0.02, 0.99);
}

/** The best competing AI offer: a team that can afford the player (cap room or
 *  an exception) and either has an open spot at a need or would waive its weakest
 *  player to add a clear upgrade. Null if no one is interested. Mirrors the logic
 *  in `runAiFreeAgency`, so the displayed "Competition" matches who would sign. */
export function bestCompetingOffer(
  league: LeagueState,
  info: FreeAgentInfo,
): { teamId: TeamId; total: number } | null {
  const pos = info.player.sportData.position;
  const total = info.marketSalary * info.desiredYears;
  const ovr = info.player.ratings.overall;

  let best: { teamId: TeamId; score: number } | null = null;
  for (const team of league.teams) {
    if (team.id === league.userTeamId) continue;
    const roster = team.playerIds
      .map(id => league.players[id] as BasketballPlayer | undefined)
      .filter((p): p is BasketballPlayer => !!p);
    const atPos = roster.filter(p => p.sportData.position === pos).length;
    const need = atPos <= 1 ? 2 : atPos === 2 ? 1 : 0;

    let affordable: boolean;
    if (team.playerIds.length < MAX_ROSTER) {
      // Open spot: afford straight from the budget; bid on a need, clear talent,
      // or — below a full roster — the best available depth (mirrors runAiFreeAgency).
      const needsDepth = team.playerIds.length < TARGET_ROSTER;
      if (need === 0 && ovr < 75 && !(needsDepth && atPos < 3)) continue;
      affordable = signingBudget(league, team.id) >= info.marketSalary;
    } else {
      // Full roster: a contender waives its weakest player for a clear upgrade.
      const worst = roster.length ? Math.min(...roster.map(p => p.ratings.overall)) : 99;
      if (ovr < worst + 4) continue; // not enough of an upgrade to bother
      const worstSalary = [...roster].sort((a, b) => a.ratings.overall - b.ratings.overall)[0]?.contract?.years[0]?.baseSalary ?? 0;
      affordable = signingBudget(league, team.id) + worstSalary >= info.marketSalary;
    }
    if (!affordable) continue;

    let score = need * 100 + ovr;
    // Bird rights: a player's former team can exceed the cap to keep him, and
    // fights to do so. Give that team a strong re-sign edge regardless of budget.
    if (info.birdRights !== 'none' && team.id === info.lastTeamId) score += 250;
    if (!best || score > best.score) best = { teamId: team.id, score };
  }

  // Even a capped-out former team with Bird rights stays in the hunt — model it
  // as a competitor at market when nobody else qualified (or it'd outbid them).
  if (info.birdRights !== 'none' && info.lastTeamId && info.lastTeamId !== league.userTeamId) {
    const holder = league.teams.find(t => t.id === info.lastTeamId);
    if (holder && holder.playerIds.length < MAX_ROSTER && (!best || best.teamId !== info.lastTeamId)) {
      // Bird team's effective pull beats a non-Bird suitor of similar interest.
      const bestScore = best ? best.score : 0;
      if (250 + ovr >= bestScore) best = { teamId: info.lastTeamId, score: 250 + ovr };
    }
  }
  return best ? { teamId: best.teamId, total } : null;
}

// ===========================================================================
// Signing
// ===========================================================================

export function buildContract(offer: Offer, signedSeason: number): BaseContract {
  const years = [];
  for (let i = 0; i < offer.years; i++) {
    years.push({
      season: signedSeason + i,
      baseSalary: offer.salaryPerYear,
      proratedBonus: 0,
      guaranteed: true,
    });
  }
  return {
    years,
    signedSeason,
    guaranteedAtSigning: offer.salaryPerYear * offer.years,
    modifications: [],
    sportData: { contractType: 'free_agent' },
  };
}

function addToTeam(
  league: LeagueState,
  playerId: PlayerId,
  teamId: TeamId,
  contract: BaseContract,
): LeagueState {
  const team = league.teams.find(t => t.id === teamId)!;
  const players = { ...league.players };
  const prev = players[playerId] as BasketballPlayer;
  players[playerId] = {
    ...prev,
    contract,
    rosterSlot: { teamId, bucket: 'active', index: team.playerIds.length },
    sportData: { ...prev.sportData, acquiredVia: 'free-agency', acquiredSeason: league.currentSeason },
  };
  const teams = league.teams.map(t =>
    t.id === teamId
      ? {
          ...t,
          playerIds: [...t.playerIds, playerId],
          rosterBuckets: { ...t.rosterBuckets, active: [...(t.rosterBuckets.active ?? []), playerId] },
        }
      : t,
  );
  const lastTeam = { ...lastTeamMap(league) };
  delete lastTeam[playerId];
  const signed: LeagueState = {
    ...league,
    players,
    teams,
    freeAgentIds: league.freeAgentIds.filter(id => id !== playerId),
    sportData: { ...(league.sportData as LeagueSportData), freeAgentLastTeam: lastTeam },
  };
  const yearly = contract.years[0]?.baseSalary ?? 0;
  return appendTransaction(signed, {
    kind: 'signing',
    season: league.currentSeason,
    teamIds: [teamId],
    summary: `${teamLabel(league, teamId)} sign ${playerLabel(league, playerId)}`,
    detail: `${playerLabel(league, playerId)} — ${contract.years.length}yr, $${(yearly / 1_000_000).toFixed(1)}M/yr.`,
  });
}

/** Release a rostered player back into free agency (opens a roster spot). */
export function releasePlayer(league: LeagueState, playerId: PlayerId): LeagueState {
  const player = league.players[playerId] as BasketballPlayer | undefined;
  const teamId = player?.rosterSlot?.teamId;
  if (!player || !teamId) return league;
  const players = { ...league.players };
  players[playerId] = { ...player, rosterSlot: null };
  const teams = league.teams.map(t =>
    t.id === teamId
      ? {
          ...t,
          playerIds: t.playerIds.filter(id => id !== playerId),
          rosterBuckets: Object.fromEntries(
            Object.entries(t.rosterBuckets).map(([k, ids]) => [k, ids.filter(id => id !== playerId)]),
          ),
        }
      : t,
  );
  const lastTeam = { ...lastTeamMap(league), [playerId]: teamId };
  const released: LeagueState = {
    ...league,
    players,
    teams,
    freeAgentIds: [...league.freeAgentIds, playerId],
    sportData: { ...(league.sportData as LeagueSportData), freeAgentLastTeam: lastTeam },
  };
  return appendTransaction(released, {
    kind: 'release',
    season: league.currentSeason,
    teamIds: [teamId],
    summary: `${teamLabel(league, teamId)} waive ${playerLabel(league, playerId)}`,
    detail: `${playerLabel(league, playerId)} released to free agency.`,
  });
}

/**
 * Resolve a user offer for a free agent. The player signs with the larger total
 * (user vs best competing AI), provided it clears the lowball floor; ties go to
 * the user. If signing to a full user roster, `releaseId` must name the player
 * to waive first.
 */
export function resolveUserOffer(
  league: LeagueState,
  playerId: PlayerId,
  offer: Offer,
  releaseId?: PlayerId,
): OfferResult {
  const info = freeAgentInfo(league, playerId);
  const userTeamId = league.userTeamId;
  if (!info || !userTeamId) {
    return { outcome: 'rejected', league, signedTeamId: null, competingTeamId: null, competingOfferTotal: 0, message: 'No team to sign for.' };
  }

  const marketTotal = info.marketSalary * info.desiredYears;
  const userTotal = offer.salaryPerYear * offer.years;
  const competing = bestCompetingOffer(league, info);
  const competingTotal = competing?.total ?? 0;
  const name = `${info.player.firstName} ${info.player.lastName}`;

  // The player's real bar: tier + team appeal + any competing offer (BUG-18).
  const appeal = teamAppeal(league, userTeamId);
  const isBird = info.birdRights !== 'none' && info.lastTeamId === userTeamId;
  const threshold = acceptanceThreshold(info, appeal, competingTotal, isBird);

  // Cap / exception enforcement — the user plays by the same budget the AI does
  // (signingBudget). You CAN sign over the cap, but only through an exception
  // (the Mid-Level, etc.), so a slightly-over team can still add a mid-priced
  // free agent — it just can't offer cap space it doesn't have. Bird rights are
  // the one carve-out: a team may exceed the cap to re-sign ITS OWN free agent,
  // capped at his market price. (The vet-minimum path is always within budget,
  // since signingBudget floors at the league minimum.)
  const budget = signingBudget(league, userTeamId);
  const maxPerYear = isBird ? Math.max(budget, info.marketSalary) : budget;
  if (offer.salaryPerYear > maxPerYear + 50_000) {
    const room = capRoom(league, userTeamId);
    const max = faMoney(maxPerYear);
    return {
      outcome: 'rejected', league, signedTeamId: null,
      competingTeamId: null, competingOfferTotal: 0,
      message: room > 0
        ? `That's above your cap room — the most you can offer ${name} is ${max}/yr. Clear more room or lower the offer.`
        : `You're over the cap. Without cap space you can only sign through an exception — up to ${max}/yr here. Offer ${max}/yr or less, or free up cap room first.`,
    };
  }

  // Vet-minimum safety valve (BUG-30): a team with an open roster spot can always
  // sign an UNCONTESTED free agent to a one-year minimum, regardless of his market
  // value — so a short-handed team can always get back to a legal roster off the
  // available pool. A contested player (someone else is bidding) still won't take
  // the minimum, so this can't be used to poach stars on the cheap.
  const isMinOffer = offer.years <= 1
    && offer.salaryPerYear >= LEAGUE_MINIMUM_SALARY        // a real minimum, not a sub-min lowball
    && offer.salaryPerYear <= LEAGUE_MINIMUM_SALARY * 1.5;
  const hasOpenSpot = rosterCount(league, userTeamId) < MAX_ROSTER;
  const minSigning = isMinOffer && hasOpenSpot && competingTotal === 0;
  const userWins = userTotal >= threshold || minSigning;

  // Offer falls short and nobody else is bidding → he holds out for more.
  if (!userWins && competingTotal === 0) {
    return {
      outcome: 'rejected', league, signedTeamId: null,
      competingTeamId: null, competingOfferTotal: 0,
      message: userTotal < marketTotal * LOWBALL_FLOOR
        ? `${name} turned that down flat — it's well below market.`
        : `${name} wants closer to ${faMoney(threshold)} total; your ${faMoney(userTotal)} fell short.`,
    };
  }

  if (userWins) {
    let l = league;
    if (rosterCount(l, userTeamId) >= MAX_ROSTER) {
      if (!releaseId) {
        return {
          outcome: 'rejected', league, signedTeamId: null,
          competingTeamId: competing?.teamId ?? null, competingOfferTotal: competingTotal,
          message: 'Your roster is full (15/15) — release a player to make room.',
        };
      }
      l = releasePlayer(l, releaseId);
    }
    l = addToTeam(l, playerId, userTeamId, buildContract(offer, l.currentSeason));
    return {
      outcome: 'signed', league: l, signedTeamId: userTeamId,
      competingTeamId: competing?.teamId ?? null, competingOfferTotal: competingTotal,
      message: `${name} signed with your team!`,
    };
  }

  // Otherwise the competing team lands them (it had room + need by construction).
  const l = addToTeam(league, playerId, competing!.teamId, buildContract(
    { years: info.desiredYears, salaryPerYear: info.marketSalary },
    league.currentSeason,
  ));
  const team = league.teams.find(t => t.id === competing!.teamId);
  return {
    outcome: 'signed_elsewhere', league: l, signedTeamId: competing!.teamId,
    competingTeamId: competing!.teamId, competingOfferTotal: competingTotal,
    message: `${name} signed elsewhere — ${team?.city ?? 'another team'} offered more.`,
  };
}

// ===========================================================================
// Negotiation (counter-offers)
// ===========================================================================

/** Below this fraction of market, the agent won't even engage. */
const ENGAGE_FLOOR = 0.45;

export interface CounterOffer {
  years: number;
  salaryPerYear: number;
  total: number;
  /** The competing total the player is weighing, if any. */
  competingTotal: number;
  message: string;
}

export type Negotiation =
  | { kind: 'resolved'; result: OfferResult }
  | { kind: 'counter'; counter: CounterOffer };

function faMoney(n: number): string {
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1000)}K`;
}

/**
 * A negotiating layer over resolveUserOffer. An offer that clears the bar (beats
 * any rival + clears the lowball floor) signs immediately; a fair-but-short
 * offer draws a COUNTER with the agent's number (so the user can raise instead
 * of instantly losing the player); an insulting offer is brushed off. The
 * competing-team note surfaces who else is bidding.
 */
export function negotiateOffer(
  league: LeagueState,
  playerId: PlayerId,
  offer: Offer,
  releaseId?: PlayerId,
): Negotiation {
  const info = freeAgentInfo(league, playerId);
  if (!info || !league.userTeamId) {
    return { kind: 'resolved', result: resolveUserOffer(league, playerId, offer, releaseId) };
  }
  const name = `${info.player.firstName} ${info.player.lastName}`;
  const marketTotal = info.marketSalary * info.desiredYears;
  const userTotal = offer.salaryPerYear * offer.years;
  const competing = bestCompetingOffer(league, info);
  const competingTotal = competing?.total ?? 0;
  const appeal = teamAppeal(league, league.userTeamId);
  const isBird = info.birdRights !== 'none' && info.lastTeamId === league.userTeamId;
  const winBar = acceptanceThreshold(info, appeal, competingTotal, isBird);

  // Clears the bar → sign (resolveUserOffer handles roster-full / releaseId).
  if (userTotal >= winBar) {
    return { kind: 'resolved', result: resolveUserOffer(league, playerId, offer, releaseId) };
  }

  // Insulting → the camp won't engage (but the player stays available).
  if (userTotal < marketTotal * ENGAGE_FLOOR) {
    return {
      kind: 'resolved',
      result: {
        outcome: 'rejected', league, signedTeamId: null,
        competingTeamId: competing?.teamId ?? null, competingOfferTotal: competingTotal,
        message: `${name}'s camp won't take that call — it's nowhere near market.`,
      },
    };
  }

  // Fair-but-short → counter at the number it takes to win (≥ market).
  // Round UP to the nearest $100K (BUG-22): rounding to nearest caused the
  // displayed counter to land just below the real `winBar` whenever
  // targetTotal/years fell into the lower half of a $100K bucket, so matching
  // the counter exactly still failed `userTotal >= winBar` and negotiateOffer
  // re-countered at the same number — an infinite loop the user could only
  // escape by offering more than the displayed ask. ceiling guarantees the
  // counter total is at least `targetTotal`, so an exact-match offer closes.
  const targetTotal = Math.max(winBar, marketTotal);
  const years = info.desiredYears;
  const perYear = Math.max(LEAGUE_MINIMUM_SALARY, Math.ceil(targetTotal / years / 100_000) * 100_000);
  const compNote = competingTotal > 0
    ? ` ${teamLabel(league, competing!.teamId)} is in at ~${faMoney(competingTotal)}.`
    : '';
  return {
    kind: 'counter',
    counter: {
      years, salaryPerYear: perYear, total: perYear * years, competingTotal,
      message: `${name}'s agent counters: ${years}yr at ${faMoney(perYear)}/yr.${compNote}`,
    },
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// ===========================================================================
// AI free agency — CPU teams sign / upgrade from the pool
// ===========================================================================

/** Waive a player to the free-agent pool (no dead cap — AI churn is simple). */
function waivePlayer(league: LeagueState, teamId: TeamId, playerId: PlayerId): LeagueState {
  const players = { ...league.players };
  players[playerId] = { ...(players[playerId] as BasketballPlayer), contract: null, rosterSlot: null };
  const teams = league.teams.map(t =>
    t.id === teamId
      ? {
          ...t,
          playerIds: t.playerIds.filter(id => id !== playerId),
          rosterBuckets: { ...t.rosterBuckets, active: (t.rosterBuckets.active ?? []).filter(id => id !== playerId) },
        }
      : t,
  );
  const lastTeam = { ...lastTeamMap(league), [playerId]: teamId };
  return {
    ...league,
    players,
    teams,
    freeAgentIds: [...league.freeAgentIds, playerId],
    sportData: { ...(league.sportData as LeagueSportData), freeAgentLastTeam: lastTeam },
  };
}

function ovr(p: BasketballPlayer): number { return p.ratings.overall; }
function rosterPlayers(league: LeagueState, teamId: TeamId): BasketballPlayer[] {
  const t = league.teams.find(x => x.id === teamId);
  return (t?.playerIds ?? []).map(id => league.players[id] as BasketballPlayer | undefined).filter((p): p is BasketballPlayer => !!p);
}
function countAtPos(roster: BasketballPlayer[], pos: string): number {
  return roster.filter(p => p.sportData.position === pos).length;
}

export interface AiFreeAgencyResult { league: LeagueState; signings: { teamId: TeamId; playerId: PlayerId }[] }

/**
 * One pass of CPU free agency: each non-user team fills open roster spots at
 * positions of need, then makes at most one upgrade (waive its weakest player
 * for a clearly-better, affordable free agent). Bounded + deterministic — no
 * RNG — so it's safe to run on demand. The user's team is never touched.
 */
export function runAiFreeAgency(league: LeagueState, opts?: { rounds?: number; fillOnly?: boolean }): AiFreeAgencyResult {
  let l = league;
  const signings: { teamId: TeamId; playerId: PlayerId }[] = [];
  const rounds = opts?.rounds ?? 3;
  const fillOnly = opts?.fillOnly ?? false;
  const UPGRADE_GAP = 4;

  for (let round = 0; round < rounds; round++) {
    let progressed = false;
    for (const team of l.teams) {
      const teamId = team.id;
      if (teamId === l.userTeamId) continue;
      if (l.freeAgentIds.length === 0) break;

      // 1) Fill an open spot with the best affordable FA. Genuine positional need
      //    (fewer than 2 at the spot) and clear talent (75+ OVR anywhere) always
      //    qualify; below a full roster the team also keeps adding the best
      //    available depth (up to 3 deep at a position) so the pool drains instead
      //    of leaving a benchful of useful veterans for the user to scoop.
      if (rosterCount(l, teamId) < MAX_ROSTER) {
        const budget = signingBudget(l, teamId);
        const roster = rosterPlayers(l, teamId);
        const needsDepth = rosterCount(l, teamId) < TARGET_ROSTER;
        const fill = freeAgentPool(l).find(f => {
          if (f.marketSalary > budget) return false;
          const atPos = countAtPos(roster, f.player.sportData.position);
          if (atPos < 2 || f.player.ratings.overall >= 75) return true; // need, or a clear talent add
          return needsDepth && atPos < 3; // round out the bench with the best affordable depth
        });
        if (fill) {
          l = addToTeam(l, fill.player.id, teamId, buildContract({ years: fill.desiredYears, salaryPerYear: fill.marketSalary }, l.currentSeason));
          signings.push({ teamId, playerId: fill.player.id });
          progressed = true;
          continue;
        }
      }

      // 2) One upgrade: swap the weakest rostered player for a notably better,
      //    affordable free agent (room frees up once the weak player is waived).
      //    Never waive a team's LAST player at a position — a real GM keeps
      //    positional coverage, and dropping the only C/PG would leave a hole the
      //    next sim can't fill (also kept the multi-season roster invariant safe).
      //    Skipped in fill-only mode (in-season backfill) to avoid waive churn.
      if (fillOnly) continue;
      const roster = rosterPlayers(l, teamId);
      if (roster.length === 0) continue;
      const posCount: Record<string, number> = {};
      for (const p of roster) posCount[p.sportData.position] = (posCount[p.sportData.position] ?? 0) + 1;
      // BUG-28: choose the "worst" player by keep value, not raw current OVR.
      // The old sort dumped freshly-drafted high-potential rookies (a 64-OVR
      // 92-potential SF reads as worse than a 70-OVR 70-potential bench vet
      // by overall alone, even though no NBA team waives a 92-upside 20-year-
      // old). That was the path putting 2026 draftees (and undrafted-prospects
      // signed off the pool) back in the FA pool the next offseason.
      const kvWaive = (p: BasketballPlayer): number => {
        const pot = p.development?.potential ?? 0;
        const base = Math.max(p.ratings.overall, Math.round(pot * 0.9));
        const youngUpside = p.age <= 22 && pot >= 75;
        return youngUpside ? Math.max(base, pot) : base;
      };
      const worst = [...roster]
        .filter(p => (posCount[p.sportData.position] ?? 0) > 1)
        .sort((a, b) => kvWaive(a) - kvWaive(b))[0];
      if (!worst) continue; // can't waive anyone without opening a positional hole
      const budgetAfterWaive = signingBudget(l, teamId) + (worst.contract?.years[0]?.baseSalary ?? 0);
      // Replace like-for-like at the freed position so coverage is preserved.
      const upgrade = freeAgentPool(l).find(f =>
        f.player.sportData.position === worst.sportData.position &&
        f.player.ratings.overall >= ovr(worst) + UPGRADE_GAP && f.marketSalary <= budgetAfterWaive,
      );
      if (upgrade) {
        l = waivePlayer(l, teamId, worst.id);
        l = addToTeam(l, upgrade.player.id, teamId, buildContract({ years: upgrade.desiredYears, salaryPerYear: upgrade.marketSalary }, l.currentSeason));
        signings.push({ teamId, playerId: upgrade.player.id });
        progressed = true;
      }
    }
    if (!progressed) break;
  }

  return { league: l, signings };
}

export { LEAGUE_MINIMUM_SALARY };
