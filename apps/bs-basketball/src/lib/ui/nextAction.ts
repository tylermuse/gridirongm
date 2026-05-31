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
  | 'startPlayoffs' | 'simPlayoffDay' | 'enterOffseason'
  | 'simDraftToUser' | 'goDraft' | 'startNextSeason';

export interface NextAction {
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
    if (draft.complete) return { label: `Start ${draft.season} Season`, primary: 'startNextSeason' };
    if (league.userTeamId) return { label: 'Sim to My Pick', primary: 'simDraftToUser' };
    return { label: 'Go to Draft', primary: 'goDraft' };
  }

  // Season finished → roll into the offseason
  if (bracket?.complete) return { label: 'Enter Offseason', primary: 'enterOffseason' };

  // Playoffs underway
  if (bracket) return { label: 'Sim Playoff Day', primary: 'simPlayoffDay' };

  // Regular season complete, playoffs not started
  if (!hasScheduled) return { label: 'Start Playoffs', primary: 'startPlayoffs' };

  // Regular season in progress
  return {
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
