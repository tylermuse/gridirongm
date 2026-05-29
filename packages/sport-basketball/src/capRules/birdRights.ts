/**
 * Bird rights resolution.
 *
 * NBA Bird rights are a cap exception that lets a team re-sign their own
 * player above the cap. The three tiers:
 *
 *   - Full Bird Rights: Played 3+ consecutive years with the same team
 *     without changing teams as a free agent. Team can re-sign up to max
 *     salary, exceeding the cap, with 5-year max + 8% raises.
 *
 *   - Early Bird Rights: 2 consecutive years with the same team. Limited
 *     to 175% of prior salary OR league average salary (whichever is
 *     higher), 5-year max with 8% raises.
 *
 *   - Non-Bird Rights: 1 year or less with the team. Limited to 120% of
 *     prior salary OR 120% of league minimum (whichever is higher),
 *     4-year max with 5% raises.
 *
 * v1 simplifications:
 *   - We don't yet track per-year team history on the player; we
 *     approximate via the player's current `sportData.birdRights` field
 *     (set when contract was signed) and current team membership.
 *   - The "consecutive years" requirement (no FA gap) is approximated:
 *     if the player's current team matches the team asking, the stored
 *     birdRights value is honored. Otherwise 'none'.
 *   - Cap holds (placeholder cap charges for departed FAs the team
 *     hasn't formally renounced) are not modeled in v1.
 */

import type { TeamId } from '@bs/core/adapter';
import type { BasketballPlayer } from '../types';
import { basketballSalaryCap } from './capRules';

export type BirdRightsTier = 'full' | 'early' | 'none';

/**
 * What Bird rights tier (if any) the given team has on this player.
 *
 * v1: Returns the stored value on the player if the team matches the
 * player's current rosterSlot team. Otherwise returns 'none' (new team
 * starts with no Bird rights on a player they just acquired or signed).
 *
 * Future enhancement: track per-year team history so trade scenarios
 * preserve Bird rights correctly (acquiring team inherits Bird rights
 * via trade if the player's tenure with the prior team would have
 * earned them).
 */
export function basketballResolveBirdRights(
  player: BasketballPlayer,
  forTeamId: TeamId,
): BirdRightsTier {
  // Player must be currently rostered with the asking team to use stored
  // Bird rights. New teams start at 'none'.
  if (!player.rosterSlot || player.rosterSlot.teamId !== forTeamId) {
    return 'none';
  }
  return player.sportData.birdRights;
}

/**
 * Compute the maximum starting salary the team can offer this player
 * under their current Bird rights tier.
 *
 * Returns null if the player has no Bird rights with this team; caller
 * should fall back to standard exceptions (MLE, BAE, room).
 */
export function basketballBirdRightsMaxSalary(
  player: BasketballPlayer,
  forTeamId: TeamId,
  season: number,
): { tier: BirdRightsTier; maxStartingSalary: number; maxLengthYears: number; maxRaisePct: number } | null {
  const tier = basketballResolveBirdRights(player, forTeamId);
  if (tier === 'none') return null;

  const cap = basketballSalaryCap(season);
  const yearsInLeague = player.sportData.yearsInLeague;
  // Max salary tier from cap rules: 25/30/35% by years-in-league
  const maxPct = yearsInLeague >= 10 ? 0.35 : yearsInLeague >= 7 ? 0.30 : 0.25;
  const absoluteMax = cap * maxPct;

  if (tier === 'full') {
    // Full Bird = up to absolute max salary, 5-year deal, 8% raises
    return {
      tier,
      maxStartingSalary: absoluteMax,
      maxLengthYears: 5,
      maxRaisePct: 0.08,
    };
  }

  // Early Bird = 175% of prior or league average, whichever higher
  const priorYearSalary = currentSalary(player, season - 1);
  const earlyBirdCap = Math.max(priorYearSalary * 1.75, cap * 0.10);
  return {
    tier,
    maxStartingSalary: Math.min(absoluteMax, earlyBirdCap),
    maxLengthYears: 5,
    maxRaisePct: 0.08,
  };
}

function currentSalary(player: BasketballPlayer, season: number): number {
  if (!player.contract) return 0;
  const y = player.contract.years.find(yr => yr.season === season);
  if (!y) return 0;
  return y.baseSalary + y.proratedBonus;
}
