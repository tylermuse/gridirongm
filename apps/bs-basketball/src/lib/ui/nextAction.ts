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
import { isSeasonUnderway } from '../freeAgency';
import { TRADE_DEADLINE_DAY } from '../sim/simRange';
import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export type ActionKey =
  | 'simDay' | 'simWeek' | 'simDeadline' | 'simSeason'
  | 'startPlayoffs' | 'simPlayoffDay' | 'simPlayoffRound' | 'simAllPlayoffs'
  | 'enterOffseason' | 'simDraftToUser' | 'simDraftPick' | 'simDraftAll' | 'goDraft' | 'startNextSeason' | 'startFreeAgency' | 'finishInaugural' | 'beginRegularSeason' | 'goFreeAgency' | 'goReSign';

/** User-team players with no contract for the upcoming season (expiring). */
export function userExpiringCount(league: LeagueState, upcomingSeason: number): number {
  if (!league.userTeamId) return 0;
  const team = league.teams.find(t => t.id === league.userTeamId);
  let n = 0;
  for (const id of team?.playerIds ?? []) {
    const p = league.players[id];
    if (p && !p.contract?.years.some(y => y.season >= upcomingSeason)) n++;
  }
  return n;
}

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

  // Offseason flow: Draft → Re-sign → Cuts → Free Agency.
  if (draft) {
    // 1) The draft itself, until every pick is in.
    if (!draft.complete) {
      if (league.userTeamId) return {
        phaseLabel: `Draft · Pick ${draft.currentPick + 1}`,
        label: 'Sim to My Pick',
        primary: 'simDraftToUser',
        secondary: [
          { label: 'Sim One Pick', key: 'simDraftPick' },
          { label: 'Auto Draft All', key: 'simDraftAll' },
          // Quick jump back to the board after checking the roster/trades mid-draft.
          { label: 'Go to Draft', key: 'goDraft' },
        ],
      };
      return { phaseLabel: 'Draft', label: 'Go to Draft', primary: 'goDraft' };
    }
    // 2) Re-sign → Free Agency. The offseason stepper is Draft → Re-sign → Free
    //    Agency (BUG-12). The draft object lives for the WHOLE offseason (it's
    //    cleared only at startNextSeason), so we can't key the phase off "draft
    //    exists" alone — instead we advance the CTA off re-sign progress:
    //      • players still to re-sign, or an over-15 roster → the Re-sign step
    //        (which hosts the hard 15-man trim gate);
    //      • re-signing done + legal roster → the Free Agency step. Its primary
    //        opens the FA window (startNextSeason rolls rosters into the preseason
    //        and stocks the pool) and lands on /free-agency.
    //    Inaugural imported drafts finish in place (no year roll) via
    //    finishInauguralDraft, which already opens FA.
    if (league.userTeamId) {
      const expiring = userExpiringCount(league, draft.season);
      const rosterN = league.teams.find(t => t.id === league.userTeamId)?.playerIds.length ?? 0;
      const overLimit = rosterN > 15;
      const skipKey: ActionKey = draft.inaugural ? 'finishInaugural' : 'startNextSeason';

      // Still re-signing, or an illegal roster → stay on the Re-sign step.
      if (expiring > 0 || overLimit) {
        return {
          phaseLabel: overLimit && expiring === 0 ? 'Offseason · Roster' : 'Offseason · Re-sign',
          label: expiring > 0
            ? `Re-sign ${expiring} Player${expiring === 1 ? '' : 's'}`
            : 'Trim Roster to 15',
          primary: 'goReSign',
          // "Skip" only when it wouldn't bypass the hard 15-man gate.
          secondary: overLimit ? undefined : [{ label: 'Skip to season', key: skipKey }],
        };
      }

      // Re-signing done + legal roster → advance to Free Agency.
      return {
        phaseLabel: 'Offseason · Free Agency',
        label: 'Sign Free Agents',
        primary: draft.inaugural ? 'finishInaugural' : 'startFreeAgency',
        secondary: [{ label: 'Skip to season', key: skipKey }],
      };
    }
    // 3) Spectating (no user team): just tip the season off — inaugural finishes
    //    in place, a normal offseason rolls the year.
    return {
      phaseLabel: 'Offseason · Draft',
      label: `Start ${draft.season} Season`,
      primary: draft.inaugural ? 'finishInaugural' : 'startNextSeason',
    };
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
  // Once the user explicitly tips off (beginRegularSeason), we stop steering to
  // FA and fall through to the live regular season even with FAs still unsigned.
  const noGamesPlayed = !league.games.some(g => g.status === 'played');
  if (noGamesPlayed && league.freeAgentIds.length > 0 && !isSeasonUnderway(league)) {
    return {
      phaseLabel: 'Preseason · Free Agency',
      label: 'Sign Free Agents',
      primary: 'goFreeAgency',
      secondary: [{ label: 'Start the Season', key: 'beginRegularSeason' }],
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
