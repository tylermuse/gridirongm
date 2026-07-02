/**
 * Salary-cap signing CHANNELS — the NBA exception ladder, wired into signing.
 *
 * `signingBudget` (freeAgency.ts) answers "what's the single biggest number this
 * team can offer?". That's enough to gate one offer, but the real NBA rules are a
 * LADDER of distinct, mostly once-per-year exceptions: cap room, the Room
 * Exception, the Mid-Level (full / tax / taxpayer flavors by apron), and the
 * Bi-Annual. Using the full Mid-Level or the Bi-Annual hard-caps the team at the
 * first apron for the rest of the season.
 *
 * This module layers consumable usage tracking + hard-cap activation on top of
 * the package's `basketballAvailableCapActions` (which already knows the amounts
 * and apron availability), so a team can't, e.g., use its Mid-Level twice.
 *
 * Usage is persisted per team in `sportData.capExceptions`, keyed to the season
 * it applies to — a stale entry from a prior season is ignored (so no explicit
 * reset is needed on rollover), and reads default to "nothing used yet". Save
 * compatible: absent on old saves → fresh.
 */

import {
  basketballAvailableCapActions,
  basketballTeamCapStatus,
  minimumSalary,
  type BasketballPlayer,
  type BasketballRatings,
  type BasketballStats,
} from '@bs/sport-basketball';
import type { BaseLeagueState, TeamId } from '@bs/core/adapter';
import { upcomingSeason } from '../draft/draft';
import { teamDeadCap } from '../roster/deadCap';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

/** The minimum-signing channel must cover ANY player's service-scaled minimum,
 *  up to the 10-yr-vet minimum ($3.87M) — otherwise an over-cap team couldn't
 *  sign a veteran to his own minimum without burning an exception. */
const MIN_DEAL_CEILING = minimumSalary(10);

/** Which once-per-year exceptions a team has consumed this offseason, plus
 *  whether it has tripped the hard cap. Keyed to `season` so it self-expires. */
export interface ExceptionUsage {
  season: number;
  mle?: boolean;
  bae?: boolean;
  room?: boolean;
  /** Hard-capped at the first apron for the season (full MLE / BAE / S&T). */
  hardCapFirstApron?: boolean;
}

type ExceptionUsageMap = Record<string, ExceptionUsage>;
type CapSportData = { capExceptions?: ExceptionUsageMap };

/** Stable identifier for the channel a signing spends. */
export type SigningChannelId =
  | 'cap_room'
  | 'room_exception'
  | 'mle'
  | 'bae'
  | 'minimum'
  | 'bird';

export interface SigningChannel {
  id: SigningChannelId;
  /** Human label, e.g. "Non-Tax MLE" or "Cap room". */
  label: string;
  /** Max per-year salary this channel can cover right now. */
  max: number;
  /** True once spent / unavailable this offseason. */
  used: boolean;
  /** Spending it consumes a once-per-year exception. */
  consumable: boolean;
  /** Spending it hard-caps the team at the first apron. */
  hardCaps: boolean;
}

// ---------------------------------------------------------------------------
// Usage state
// ---------------------------------------------------------------------------

export function exceptionUsage(league: LeagueState, teamId: TeamId): ExceptionUsage {
  const season = upcomingSeason(league);
  const stored = (league.sportData as CapSportData | undefined)?.capExceptions?.[teamId];
  // Ignore stale prior-season usage — exceptions refresh every offseason.
  if (!stored || stored.season !== season) return { season };
  return stored;
}

function writeUsage(league: LeagueState, teamId: TeamId, next: ExceptionUsage): LeagueState {
  const sd = league.sportData as CapSportData;
  return {
    ...league,
    sportData: { ...sd, capExceptions: { ...(sd?.capExceptions ?? {}), [teamId]: next } },
  };
}

// ---------------------------------------------------------------------------
// Channel ladder
// ---------------------------------------------------------------------------

function teamPlayers(league: LeagueState, teamId: TeamId): BasketballPlayer[] {
  const team = league.teams.find(t => t.id === teamId);
  if (!team) return [];
  return team.playerIds
    .map(id => league.players[id] as BasketballPlayer | undefined)
    .filter((p): p is BasketballPlayer => !!p);
}

/** Dead money on the team's books for `season` — counts against cap/aprons. */
function deadCapFor(league: LeagueState, teamId: TeamId, season: number): number {
  const team = league.teams.find(t => t.id === teamId);
  return team ? teamDeadCap(team as Parameters<typeof teamDeadCap>[0], season) : 0;
}

/**
 * The signing channels available to a team right now, in spend-priority order
 * (use the cheapest-impact channel that covers a salary). Consumed exceptions
 * come back as { used: true } so the UI can grey them out.
 */
export function signingChannels(league: LeagueState, teamId: TeamId): SigningChannel[] {
  const season = upcomingSeason(league);
  const players = teamPlayers(league, teamId);
  const dead = deadCapFor(league, teamId, season);
  const status = basketballTeamCapStatus(players, season, dead);
  const usage = exceptionUsage(league, teamId);
  // The package enumerates amounts + apron availability; we add usage + hard cap.
  const actions = basketballAvailableCapActions(teamId, players, season, dead);
  const amountOf = (idPrefix: string): number =>
    actions.find(a => a.id.startsWith(idPrefix) && a.available)?.approxAmount ?? 0;

  const channels: SigningChannel[] = [];

  // 1) Cap room — no exception, no hard cap; absorbs any salary up to the room.
  if (status.capRoom > 0) {
    channels.push({ id: 'cap_room', label: 'Cap room', max: status.capRoom, used: false, consumable: false, hardCaps: false });
    // 2) Room Exception — a room team's one mini-MLE after dipping under the cap.
    const room = amountOf('use_room_exception');
    if (room > 0) channels.push({ id: 'room_exception', label: 'Room Exception', max: room, used: !!usage.room, consumable: true, hardCaps: false });
  } else {
    // 3) Mid-Level — flavor + hard-cap depend on apron. Full (non-tax) MLE hard-
    //    caps; the smaller tax/taxpayer flavors do not.
    const mle = amountOf('use_mle');
    if (mle > 0) {
      const isFull = !status.isOverTax && !status.isOverFirstApron;
      channels.push({
        id: 'mle',
        label: isFull ? 'Non-Tax MLE' : status.isOverFirstApron ? 'Taxpayer MLE' : 'Tax MLE',
        max: mle, used: !!usage.mle, consumable: true, hardCaps: isFull,
      });
    }
    // 4) Bi-Annual — under the first apron only; hard-caps at the first apron.
    const bae = amountOf('use_bae');
    if (bae > 0) channels.push({ id: 'bae', label: 'Bi-Annual Exception', max: bae, used: !!usage.bae, consumable: true, hardCaps: true });
  }

  // 5) Veteran minimum — always available, never consumed.
  channels.push({ id: 'minimum', label: 'Veteran minimum', max: MIN_DEAL_CEILING, used: false, consumable: false, hardCaps: false });
  return channels;
}

/**
 * The channel a per-year salary would spend, or null if no channel covers it.
 * Bird rights short-circuit: a team can exceed the cap to re-sign its OWN free
 * agent (no exception consumed, no hard cap). Otherwise pick the cheapest-impact
 * channel that fits, respecting the first-apron hard cap once tripped.
 */
export function channelForSalary(
  league: LeagueState,
  teamId: TeamId,
  salaryPerYear: number,
  opts: { isBird?: boolean; birdMax?: number } = {},
): SigningChannel | null {
  if (opts.isBird) {
    const max = Math.max(opts.birdMax ?? 0, salaryPerYear);
    return { id: 'bird', label: 'Bird rights', max, used: false, consumable: false, hardCaps: false };
  }
  const usage = exceptionUsage(league, teamId);
  const players = teamPlayers(league, teamId);
  const season = upcomingSeason(league);
  const status = basketballTeamCapStatus(players, season, deadCapFor(league, teamId, season));
  // Once hard-capped, a signing can't push payroll past the first apron.
  const hardCapHeadroom = usage.hardCapFirstApron
    ? Math.max(0, status.firstApron - status.payroll)
    : Infinity;
  const fits = (ch: SigningChannel) =>
    !ch.used && salaryPerYear <= ch.max + 50_000 && salaryPerYear <= hardCapHeadroom + 50_000;

  const channels = signingChannels(league, teamId);
  // Prefer channels that DON'T burn an exception (cap room, veteran minimum) so a
  // minimum signing never wastes the Mid-Level. Only then reach for a consumable
  // exception — the SMALLEST one that still covers the salary, to keep the bigger
  // exceptions (the MLE) available for a bigger signing later.
  const free = channels.find(ch => !ch.consumable && fits(ch));
  if (free) return free;
  const consumable = channels
    .filter(ch => ch.consumable && fits(ch))
    .sort((a, b) => a.max - b.max);
  return consumable[0] ?? null;
}

/**
 * Mark the exception a signing spent as used + trip the hard cap if it applies.
 * No-op for non-consumable channels (cap room, minimum, Bird).
 */
export function consumeChannel(league: LeagueState, teamId: TeamId, channel: SigningChannel): LeagueState {
  if (!channel.consumable && !channel.hardCaps) return league;
  const usage = exceptionUsage(league, teamId);
  const next: ExceptionUsage = { ...usage, season: upcomingSeason(league) };
  if (channel.id === 'mle') next.mle = true;
  if (channel.id === 'bae') next.bae = true;
  if (channel.id === 'room_exception') next.room = true;
  if (channel.hardCaps) next.hardCapFirstApron = true;
  return writeUsage(league, teamId, next);
}
