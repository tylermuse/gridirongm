/**
 * Release with dead money + waive-and-stretch (parity audit #7).
 *
 * Until now releasing a player simply deleted their salary (free cap relief,
 * unrealistic). Guaranteed money should stick to the team as dead cap. A
 * straight waive leaves the remaining years on the books as-is; a stretch
 * spreads the total over (2·years + 1) seasons to soften the annual hit.
 *
 * Dead cap is stored on team.sportData.deadCap and surfaced by Finances. The
 * underlying releasePlayer (lib/freeAgency) still moves the player to FA.
 */

import { releasePlayer } from '../freeAgency';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';
import type { BaseLeagueState, PlayerId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export interface DeadCapEntry { season: number; amount: number }

export interface ReleasePreview {
  /** Guaranteed money still owed across the remaining contract years. */
  remainingGuaranteed: number;
  /** Number of guaranteed years remaining (incl. current). */
  years: number;
  /** Dead-cap charge in the CURRENT season for a straight waive. */
  waiveThisYear: number;
  /** Dead-cap charge in the current season if stretched. */
  stretchThisYear: number;
  /** How many seasons a stretch spreads the money over. */
  stretchYears: number;
}

function remainingYears(player: BasketballPlayer, season: number): { season: number; salary: number }[] {
  if (!player.contract) return [];
  return player.contract.years
    .filter(y => y.season >= season && y.guaranteed)
    .map(y => ({ season: y.season, salary: y.baseSalary + y.proratedBonus }));
}

export function releasePreview(player: BasketballPlayer, season: number): ReleasePreview {
  const rem = remainingYears(player, season);
  const total = rem.reduce((s, y) => s + y.salary, 0);
  const years = rem.length;
  const stretchYears = years > 0 ? years * 2 + 1 : 1;
  return {
    remainingGuaranteed: total,
    years,
    waiveThisYear: rem.find(y => y.season === season)?.salary ?? 0,
    stretchThisYear: years > 0 ? Math.round(total / stretchYears) : 0,
    stretchYears,
  };
}

function deadCapOf(team: BasketballTeam): DeadCapEntry[] {
  return ((team.sportData as { deadCap?: DeadCapEntry[] }).deadCap) ?? [];
}

/** Current-season dead-cap charge for a team. */
export function teamDeadCap(team: BasketballTeam, season: number): number {
  return deadCapOf(team).filter(d => d.season === season).reduce((s, d) => s + d.amount, 0);
}

/** Release a player, recording the resulting dead cap (stretched or not). */
export function applyRelease(league: LeagueState, playerId: string, stretch: boolean): LeagueState {
  const player = (league.players as Record<string, BasketballPlayer>)[playerId];
  const teamId = player?.rosterSlot?.teamId;
  if (!player || !teamId) return league;
  const season = league.currentSeason;
  const preview = releasePreview(player, season);

  let charges: DeadCapEntry[] = [];
  if (preview.remainingGuaranteed > 0) {
    if (stretch) {
      const per = Math.round(preview.remainingGuaranteed / preview.stretchYears);
      charges = Array.from({ length: preview.stretchYears }, (_, i) => ({ season: season + i, amount: per }));
    } else {
      charges = remainingYears(player, season).map(y => ({ season: y.season, amount: y.salary }));
    }
  }

  // Move the player to FA via the existing path, then record dead cap on the team.
  const released = releasePlayer(league, playerId as PlayerId);
  const teams = released.teams.map(t =>
    t.id === teamId
      ? ({ ...t, sportData: { ...(t as BasketballTeam).sportData, deadCap: [...deadCapOf(t as BasketballTeam), ...charges] } } as typeof t)
      : t,
  );
  return { ...released, teams };
}
