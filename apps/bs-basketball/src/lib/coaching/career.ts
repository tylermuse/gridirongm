/**
 * Coach career views (profile page + league coaches table).
 *
 * Completed seasons come from the résumé stamped at each rollover
 * (coach.sportData.seasons); the in-progress season is appended live from the
 * current team record so the page is useful mid-season and on fresh leagues.
 */

import type { BaseCoach, BaseLeagueState, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import { coachData, type CoachSeasonLog } from './coaches';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export interface CareerRow extends CoachSeasonLog {
  /** True for the in-progress (not yet archived) season. */
  live?: boolean;
}

export interface CoachCareer {
  rows: CareerRow[];
  wins: number;
  losses: number;
  pct: number;
  playoffApps: number;
  titles: number;
  coys: number;
  /** Distinct teams, in order first coached. */
  teams: { teamId: TeamId; from: number; to: number; wins: number; losses: number }[];
}

export function coachCareer(league: LeagueState, coach: BaseCoach): CoachCareer {
  const rows: CareerRow[] = [...(coachData(coach).seasons ?? [])].sort((a, b) => a.season - b.season);
  const team = coach.teamId ? league.teams.find(t => t.id === coach.teamId) : undefined;
  if (team && league.currentPhase !== 'offseason' && !rows.some(r => r.season === league.currentSeason)) {
    const gp = team.record.wins + team.record.losses;
    if (gp > 0) {
      rows.push({ season: league.currentSeason, teamId: team.id, wins: team.record.wins, losses: team.record.losses, playoffRound: 0, live: true });
    }
  }
  const wins = rows.reduce((s, r) => s + r.wins, 0);
  const losses = rows.reduce((s, r) => s + r.losses, 0);
  const teams: CoachCareer['teams'] = [];
  for (const r of rows) {
    const last = teams[teams.length - 1];
    if (last && last.teamId === r.teamId) {
      last.to = r.season; last.wins += r.wins; last.losses += r.losses;
    } else {
      teams.push({ teamId: r.teamId, from: r.season, to: r.season, wins: r.wins, losses: r.losses });
    }
  }
  return {
    rows,
    wins,
    losses,
    pct: wins + losses > 0 ? wins / (wins + losses) : 0,
    playoffApps: rows.filter(r => r.playoffRound > 0).length,
    titles: rows.filter(r => r.champion).length,
    coys: rows.filter(r => r.coy).length,
    teams,
  };
}

export const PLAYOFF_ROUND_LABEL: Record<number, string> = {
  0: '—',
  1: 'First Round',
  2: 'Conf. Semis',
  3: 'Conf. Finals',
  4: 'Finals',
};
