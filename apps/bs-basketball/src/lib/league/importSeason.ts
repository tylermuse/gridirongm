/**
 * Mid-season import: open an imported league on the next real game day.
 *
 * The shipped NBA roster file is refreshed weekly during the season with the
 * real results so far and the remaining real schedule (see
 * apps/bs-basketball/scripts/weekly_roster_update.py). This swaps the
 * generated 82-game schedule for that real one: completed games become
 * 'played' results (score only — no box scores, flagged `realResult`),
 * upcoming games stay 'scheduled', team records are rebuilt from the results,
 * and the league skips the offseason straight into the regular season.
 */
import type { BaseGameResult, BaseLeagueState, GameId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import type { ImportedSeasonInProgress } from '../data/leagueImport';
import { FA_DAYS } from '../freeAgency';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;
type GameResult = BaseGameResult<BasketballStats>;

/** Calendar fallback when a game carries no date: day 1 = opening night. */
function dateForDay(season: number, day: number): string {
  const d = new Date(Date.UTC(season, 9, 20 + day - 1));
  return d.toISOString().slice(0, 10);
}

export function applySeasonInProgress(league: LeagueState, sip: ImportedSeasonInProgress): LeagueState {
  const season = league.currentSeason;
  const games: GameResult[] = sip.games.map((g, i) => ({
    id: `${season}-bball-g${i + 1}` as GameId,
    season,
    competitionId: 'primary' as GameResult['competitionId'],
    date: g.date ?? dateForDay(season, g.day),
    homeTeamId: g.homeTeamId,
    awayTeamId: g.awayTeamId,
    status: g.finalScore ? 'played' : 'scheduled',
    finalScore: g.finalScore,
    boxScores: {},
    sportData: g.finalScore ? { dayOfSeason: g.day, realResult: true } : { dayOfSeason: g.day },
  }));

  const records = new Map(league.teams.map(t => [t.id, { wins: 0, losses: 0, otherResults: 0, pointsFor: 0, pointsAgainst: 0, streak: [] as string[] }]));
  for (const g of games) {
    if (!g.finalScore) continue;
    const home = records.get(g.homeTeamId);
    const away = records.get(g.awayTeamId);
    if (!home || !away) continue;
    const homeWon = g.finalScore.home > g.finalScore.away;
    home.pointsFor += g.finalScore.home; home.pointsAgainst += g.finalScore.away;
    away.pointsFor += g.finalScore.away; away.pointsAgainst += g.finalScore.home;
    if (homeWon) { home.wins++; away.losses++; } else { away.wins++; home.losses++; }
    home.streak = [...home.streak.slice(-9), homeWon ? 'W' : 'L'];
    away.streak = [...away.streak.slice(-9), homeWon ? 'L' : 'W'];
  }

  const lastPlayedDay = games.reduce((m, g) => (g.finalScore ? Math.max(m, (g.sportData as { dayOfSeason: number }).dayOfSeason) : m), 0);
  return {
    ...league,
    games,
    teams: league.teams.map(t => ({ ...t, record: { ...t.record, ...records.get(t.id) } })),
    competitions: league.competitions.map(c => ({
      ...c,
      standings: c.standings.map(s => {
        const r = records.get(s.teamId);
        return r ? { ...s, wins: r.wins, losses: r.losses, pointsFor: r.pointsFor, pointsAgainst: r.pointsAgainst } : s;
      }),
    })),
    currentPhase: 'regular_season',
    currentTick: Math.max(1, lastPlayedDay),
    sportData: {
      ...(league.sportData as object),
      // Offseason is over: free-agency window closed, season underway.
      faDay: FA_DAYS,
      seasonStarted: true,
      midSeasonImport: true,
    },
  };
}
