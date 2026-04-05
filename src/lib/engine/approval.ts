/**
 * Fan Approval & Owner Approval system.
 * Updates after games, trades, and end-of-season.
 */

import type { ApprovalState, OwnerObjective } from '@/types';

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function defaultApproval(): ApprovalState {
  return {
    fanApproval: 50,
    ownerApproval: 55,
    objectives: [],
    tenureSeasons: 0,
    warningIssued: false,
  };
}

/**
 * Update approval after a game result.
 */
export function updateApprovalAfterGame(
  approval: ApprovalState,
  won: boolean,
  margin: number,
  isRivalry: boolean,
): ApprovalState {
  let { fanApproval, ownerApproval } = approval;

  // Fan approval
  if (won) {
    fanApproval += isRivalry ? 4 : 2;
    if (margin >= 21) fanApproval += 2; // blowout win
  } else {
    fanApproval -= isRivalry ? 4 : 2;
    if (margin >= 21) fanApproval -= 2; // blowout loss
  }

  // Owner approval
  ownerApproval += won ? 1 : -1;

  return {
    ...approval,
    fanApproval: clamp(fanApproval, 0, 100),
    ownerApproval: clamp(ownerApproval, 0, 100),
  };
}

/**
 * Update approval at end of season based on objectives and playoff result.
 */
export function updateApprovalEndOfSeason(
  approval: ApprovalState,
  playoffResult: string,
  evaluatedObjectives: OwnerObjective[],
): ApprovalState {
  let { fanApproval, ownerApproval, tenureSeasons, warningIssued } = approval;

  // Evaluate objectives
  for (const obj of evaluatedObjectives) {
    if (obj.status === 'completed') {
      ownerApproval += 10;
      fanApproval += 5;
    } else if (obj.status === 'failed') {
      ownerApproval -= 15;
      fanApproval -= 8;
    }
  }

  // Season result bonuses
  switch (playoffResult) {
    case 'champion':
      ownerApproval += 25;
      fanApproval = 95;
      break;
    case 'runnerup':
      ownerApproval += 10;
      fanApproval += 12;
      break;
    case 'conference':
    case 'divisional':
    case 'wildcard':
      ownerApproval += 5;
      fanApproval += 5;
      break;
    case 'missed':
      ownerApproval -= 5;
      fanApproval -= 5;
      break;
  }

  // Regress toward 50 by 10%
  fanApproval = Math.round(fanApproval + (50 - fanApproval) * 0.1);
  ownerApproval = Math.round(ownerApproval + (50 - ownerApproval) * 0.1);

  tenureSeasons += 1;

  // Check firing threshold
  if (ownerApproval < 25) {
    if (warningIssued) {
      // FIRED — handled by the caller
      ownerApproval = 0; // signal firing
    } else {
      warningIssued = true;
    }
  } else if (ownerApproval >= 40) {
    warningIssued = false; // reset warning if recovered
  }

  return {
    ...approval,
    fanApproval: clamp(fanApproval, 0, 100),
    ownerApproval: clamp(ownerApproval, 0, 100),
    tenureSeasons,
    warningIssued,
  };
}

/**
 * Update approval for roster moves (trades, signings, etc.)
 */
export function updateApprovalForMove(
  approval: ApprovalState,
  moveType: 'trade_away_star' | 'trade_for_star' | 'sign_star' | 'over_cap' | 'bad_trade',
): ApprovalState {
  let { fanApproval, ownerApproval } = approval;

  switch (moveType) {
    case 'trade_away_star':
      fanApproval -= 5;
      break;
    case 'trade_for_star':
      fanApproval += 5;
      break;
    case 'sign_star':
      fanApproval += 4;
      break;
    case 'over_cap':
      ownerApproval -= 3;
      break;
    case 'bad_trade':
      ownerApproval -= 4;
      break;
  }

  return {
    ...approval,
    fanApproval: clamp(fanApproval, 0, 100),
    ownerApproval: clamp(ownerApproval, 0, 100),
  };
}
