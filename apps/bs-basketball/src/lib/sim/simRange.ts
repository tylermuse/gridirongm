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

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

/** Trade deadline, ~67% through the 170-day regular season (≈ NBA game 55). */
export const TRADE_DEADLINE_DAY = 115;

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

/** Sim every scheduled day up to and including `targetDay` (null = end of the
 *  regular season). */
export function simThroughDay(league: LeagueState, targetDay: number | null): SimRangeResult {
  let l = league;
  let daysSimmed = 0;
  let gamesSimmed = 0;
  // Hard cap well above a 170-day season — a runaway-loop backstop.
  for (let guard = 0; guard < 400; guard++) {
    const next = earliestScheduledDay(l);
    if (!isFinite(next)) break;
    if (targetDay != null && next > targetDay) break;
    const r = simNextDay(l);
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
  if (inRegularSeason && league.currentTick > TRADE_DEADLINE_DAY) {
    return { closed: true, reason: `The trade deadline (Day ${TRADE_DEADLINE_DAY}) has passed.` };
  }
  return { closed: false, reason: '' };
}
