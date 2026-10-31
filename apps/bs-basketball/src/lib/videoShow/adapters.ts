/**
 * Hoops league → the video show's teams / players / schedule (see types.ts).
 *
 * Player season totals come from box scores (Hoops saves don't keep
 * player.seasonStats current); last season's from the history the stats
 * module keeps, when there is one.
 */
import type { BasketballPlayer, BasketballStats, BasketballTeam } from '@bs/sport-basketball';
import type { BasketballLeagueState } from '../persistence/db';
import { regularSeasonStatsByPlayer } from '../stats/seasonStats';
import { dayOf } from '../standings/extendedStandings';
import type { ShowPlayer, ShowPlayerStats, ShowScheduleGame, ShowTeam } from './types';

const DAYS_PER_WEEK = 7;

function toStats(s: BasketballStats | undefined | null): ShowPlayerStats | null {
  if (!s || !s.gamesPlayed) return null;
  return {
    gamesPlayed: s.gamesPlayed, minutes: s.minutes, points: s.points, totalRebounds: s.totalRebounds,
    assists: s.assists, steals: s.steals, blocks: s.blocks, turnovers: s.turnovers,
    fieldGoalsMade: s.fieldGoalsMade, fieldGoalsAttempted: s.fieldGoalsAttempted,
    threePointsMade: s.threePointsMade, threePointsAttempted: s.threePointsAttempted,
    freeThrowsMade: s.freeThrowsMade, freeThrowsAttempted: s.freeThrowsAttempted,
  };
}

export function showTeam(t: BasketballTeam): ShowTeam {
  const sd = t.sportData as { conference?: string; division?: string } | undefined;
  return {
    id: t.id, abbreviation: t.abbreviation, city: t.city, name: t.name,
    conference: sd?.conference ?? '', division: sd?.division ?? '',
    record: { wins: t.record.wins, losses: t.record.losses, pointsFor: t.record.pointsFor, pointsAgainst: t.record.pointsAgainst },
    primaryColor: t.primaryColor, secondaryColor: t.secondaryColor, logoUrl: t.logoUrl,
  };
}

export interface ShowLeague {
  team: ShowTeam;
  teams: ShowTeam[];
  players: ShowPlayer[];
  schedule: ShowScheduleGame[];
  season: number;
}

/** The show's view of a league for the user team (null without one). */
export function fromLeague(league: BasketballLeagueState): ShowLeague | null {
  const season = league.currentSeason;
  const teams = (league.teams as BasketballTeam[]).map(showTeam);
  const team = teams.find(t => t.id === league.userTeamId);
  if (!team) return null;
  const teamOf = new Map<string, string>();
  for (const t of league.teams as BasketballTeam[]) for (const id of t.playerIds) teamOf.set(id, t.id);
  const statsById = regularSeasonStatsByPlayer(league);
  const players: ShowPlayer[] = Object.values(league.players as Record<string, BasketballPlayer>)
    .filter(p => teamOf.has(p.id))
    .map(p => {
      const y = p.contract?.years.find(yr => yr.season === season);
      const history = (p as { statsHistory?: { season: number; stats: BasketballStats }[] }).statsHistory;
      const last = history?.filter(h => h.season < season).sort((a, b) => b.season - a.season)[0];
      return {
        id: p.id, firstName: p.firstName, lastName: p.lastName, teamId: teamOf.get(p.id) ?? null,
        position: p.sportData.position, age: p.age, potential: p.development.potential,
        ratings: { overall: p.ratings.overall },
        contract: p.contract ? {
          salary: y ? Math.round(((y.baseSalary + y.proratedBonus) / 1_000_000) * 10) / 10 : 0,
          yearsLeft: p.contract.years.filter(yr => yr.season >= season).length,
        } : null,
        stats: toStats(statsById.get(p.id)),
        lastSeasonStats: toStats(last?.stats),
        // Hoops keeps the headshot on sportData (imported BBGM `imgURL`).
        imageUrl: p.sportData.photoUrl,
      };
    });
  const schedule: ShowScheduleGame[] = league.games
    .filter(g => g.season === season && !(g.sportData as { isPlayoff?: boolean } | undefined)?.isPlayoff)
    .sort((a, b) => dayOf(a) - dayOf(b))
    .map(g => ({
      week: Math.floor(dayOf(g) / DAYS_PER_WEEK) + 1,
      season: g.season,
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      homeScore: g.finalScore?.home ?? 0,
      awayScore: g.finalScore?.away ?? 0,
      played: g.status === 'played',
    }));
  return { team, teams, players, schedule, season };
}
