/**
 * Phase-aware "what do I do next" (Tier 1.2).
 *
 * Derives the single most relevant primary action from the league's actual
 * state (not a stored phase flag, which the app doesn't transition) plus a few
 * secondary sim options during the regular season. The TopBar maps each key to
 * a store action / navigation.
 */

import { getDraft } from '../draft';
import { getBracket } from '../playoffs';
import { TRADE_DEADLINE_DAY } from '../sim/simRange';
import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export type ActionKey =
  | 'simDay' | 'simWeek' | 'simDeadline' | 'simSeason'
  | 'startPlayoffs' | 'simPlayoffDay' | 'simPlayoffRound' | 'simAllPlayoffs'
  | 'enterOffseason' | 'simDraftToUser' | 'goDraft' | 'startNextSeason' | 'goFreeAgency';

export interface NextAction {
  /** Short phase label for the bar, e.g. "Regular Season", "Playoffs". */
  phaseLabel: string;
  label: string;
  primary: ActionKey;
  secondary?: { label: string; key: ActionKey }[];
}

export function nextAction(league: LeagueState): NextAction {
  const draft = getDraft(league);
  const bracket = getBracket(league);
  const hasScheduled = league.games.some(g => g.status === 'scheduled');

  // Offseason draft flow
  if (draft) {
    if (draft.complete) return { phaseLabel: 'Offseason · Draft', label: `Start ${draft.season} Season`, primary: 'startNextSeason' };
    if (league.userTeamId) return { phaseLabel: `Draft · Pick ${draft.currentPick + 1}`, label: 'Sim to My Pick', primary: 'simDraftToUser' };
    return { phaseLabel: 'Draft', label: 'Go to Draft', primary: 'goDraft' };
  }

  // Season finished → roll into the offseason
  if (bracket?.complete) return { phaseLabel: 'Offseason', label: 'Enter Offseason', primary: 'enterOffseason' };

  // Playoffs underway
  if (bracket) {
    return {
      phaseLabel: 'Playoffs',
      label: 'Sim Day',
      primary: 'simPlayoffDay',
      secondary: [
        { label: 'Sim Round', key: 'simPlayoffRound' },
        { label: 'Sim All Playoffs', key: 'simAllPlayoffs' },
      ],
    };
  }

  // Regular season complete, playoffs not started
  if (!hasScheduled) return { phaseLabel: 'Regular Season Over', label: 'Start Playoffs', primary: 'startPlayoffs' };

  // Preseason: a fresh schedule with no games played yet AND free agents in the
  // pool (waived-overflow + undrafted players from the rollover). Steer the user
  // to sign them before tipping off, since nothing else surfaces free agency.
  const noGamesPlayed = !league.games.some(g => g.status === 'played');
  if (noGamesPlayed && league.freeAgentIds.length > 0) {
    return {
      phaseLabel: 'Preseason · Free Agency',
      label: 'Sign Free Agents',
      primary: 'goFreeAgency',
      secondary: [{ label: 'Sim Day', key: 'simDay' }],
    };
  }

  // Regular season in progress
  return {
    phaseLabel: `Day ${league.currentTick} · Regular Season`,
    label: 'Sim Day',
    primary: 'simDay',
    secondary: [
      { label: 'Sim Week', key: 'simWeek' },
      ...(league.currentTick <= TRADE_DEADLINE_DAY
        ? [{ label: 'Sim to Trade Deadline', key: 'simDeadline' as ActionKey }]
        : []),
      { label: 'Sim Rest of Season', key: 'simSeason' },
    ],
  };
}
