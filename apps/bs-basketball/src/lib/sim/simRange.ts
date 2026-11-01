/**
 * Bulk simulation (sim a week / to the trade deadline / rest of season).
 *
 * Repeatedly advances `simNextDay` until a target day-of-season is reached (or
 * the regular season runs out). One persist happens at the end, so a "sim the
 * season" is a single save rather than ~170.
 */

import { simNextDay } from './runSimDay';
import { getBracket } from '../playoffs';
import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import { getTradeDeadlineDay } from '../rules/leagueRules';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

/** DEFAULT trade deadline, ~67% through the 170-day regular season (≈ NBA game
 *  55). A league can move it (League Rules) — read the live value with
 *  `getTradeDeadlineDay(league)`; this constant is only the stock default. */
export const TRADE_DEADLINE_DAY = 115;
export { getTradeDeadlineDay };

export interface SimRangeResult {
  league: LeagueState;
  daysSimmed: number;
  gamesSimmed: number;
}

function earliestScheduledDay(league: LeagueState): number {
  let min = Infinity;
  for (const g of league.games) {
    if (g.status !== 'scheduled') continue;
    const d = (g.sportData as { dayOfSeason?: number } | undefined)?.dayOfSeason;
    const day = typeof d === 'number' ? d : Infinity;
    if (day < min) min = day;
  }
  return min;
}

/** Sim ONE more day of a bulk range, or null when the range is done (no games
 *  left, or the next scheduled day is past `targetDay`; null = end of the
 *  regular season). Lets the store sim a range day by day and repaint between
 *  days instead of freezing the page for the whole range. */
export function simRangeStep(league: LeagueState, targetDay: number | null): { league: LeagueState; gamesSimmed: number } | null {
  const next = earliestScheduledDay(league);
  if (!isFinite(next)) return null;
  if (targetDay != null && next > targetDay) return null;
  const r = simNextDay(league);
  if (!r) return null;
  return { league: r.league, gamesSimmed: r.gamesSimmed };
}

/** How many distinct game days a range covers — the denominator for the
 *  "Day 12/40" progress readout. */
export function scheduledDaysThrough(league: LeagueState, targetDay: number | null): number {
  const days = new Set<number>();
  for (const g of league.games) {
    if (g.status !== 'scheduled') continue;
    const d = (g.sportData as { dayOfSeason?: number; isPlayoff?: boolean } | undefined);
    if (d?.isPlayoff || typeof d?.dayOfSeason !== 'number') continue;
    if (targetDay != null && d.dayOfSeason > targetDay) continue;
    days.add(d.dayOfSeason);
  }
  return days.size;
}

/** Sim every scheduled day up to and including `targetDay` (null = end of the
 *  regular season). */
export function simThroughDay(league: LeagueState, targetDay: number | null): SimRangeResult {
  let l = league;
  let daysSimmed = 0;
  let gamesSimmed = 0;
  // Hard cap well above a 170-day season — a runaway-loop backstop.
  for (let guard = 0; guard < 400; guard++) {
    const r = simRangeStep(l, targetDay);
    if (!r) break;
    l = r.league;
    daysSimmed += 1;
    gamesSimmed += r.gamesSimmed;
  }
  return { league: l, daysSimmed, gamesSimmed };
}

/** Whether the trade window is shut, with a reason for the UI. */
export function tradeWindowClosed(league: LeagueState): { closed: boolean; reason: string } {
  const bracket = getBracket(league);
  if (bracket && !bracket.complete) {
    return { closed: true, reason: 'Trades are frozen during the playoffs.' };
  }
  const inRegularSeason = isFinite(earliestScheduledDay(league));
  const deadline = getTradeDeadlineDay(league);
  if (inRegularSeason && league.currentTick > deadline) {
    return { closed: true, reason: `The trade deadline (Day ${deadline}) has passed.` };
  }
  return { closed: false, reason: '' };
}
