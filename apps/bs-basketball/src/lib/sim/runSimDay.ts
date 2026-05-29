/**
 * Sim all scheduled games on the next day-of-season that has any.
 *
 * Flow:
 *   1. Find the earliest game.sportData.dayOfSeason whose status === 'scheduled'.
 *   2. Sim every game on that day in turn — sharing the same lineup-build
 *      logic as simNextGameForTeam.
 *   3. Update both teams' records per game.
 *   4. Set league.currentTick to that day so the calendar advances.
 *
 * Returns:
 *   { league, day, gamesSimmed } — caller can show a toast like
 *   "Simmed Day 3 (8 games)" and persist via Dexie.
 */

import {
  basketballAdapter,
  buildDefaultBasketballLineup,
  type BasketballPlayer,
  type BasketballTeam,
} from '@bs/sport-basketball';
import type {
  BaseGameResult,
  BaseLeagueState,
  TeamSnapshot,
  GameContext,
  PlayerId,
} from '@bs/core/adapter';
import type {
  BasketballRatings,
  BasketballStats,
} from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;
type GameResult = BaseGameResult<BasketballStats>;

export interface SimDayResult {
  league: LeagueState;
  day: number;
  gamesSimmed: number;
}

function gameDay(g: GameResult): number {
  return (g.sportData as { dayOfSeason: number } | undefined)?.dayOfSeason ?? 0;
}

export function simNextDay(league: LeagueState): SimDayResult | null {
  // Find the earliest dayOfSeason with at least one scheduled game.
  let nextDay = Infinity;
  for (const g of league.games) {
    if (g.status !== 'scheduled') continue;
    const d = gameDay(g);
    if (d > 0 && d < nextDay) nextDay = d;
  }
  if (!isFinite(nextDay)) return null;

  // Build quick lookups.
  const teamById = new Map(league.teams.map(t => [t.id, t as BasketballTeam]));
  const playerMap = league.players as Record<string, BasketballPlayer>;

  // Track mutable team records.
  const recordsById = new Map(league.teams.map(t => [t.id, { ...t.record }]));

  // Sim each scheduled game on that day.
  const updatedGames = league.games.slice();
  let gamesSimmed = 0;

  for (let i = 0; i < updatedGames.length; i++) {
    const g = updatedGames[i];
    if (g.status !== 'scheduled') continue;
    if (gameDay(g) !== nextDay) continue;

    const home = teamById.get(g.homeTeamId);
    const away = teamById.get(g.awayTeamId);
    if (!home || !away) continue;

    const homeSnap = buildSnapshot(home, playerMap);
    const awaySnap = buildSnapshot(away, playerMap);

    const ctx: GameContext = {
      season: league.currentSeason,
      tick: nextDay,
      competitionId: g.competitionId,
      isPlayoff: false,
      homeAdvantage: 2.5,
      rngSeed: `${g.id}-${league.currentSeason}`,
    };

    const result = basketballAdapter.simEngine.simGame(homeSnap, awaySnap, ctx);
    const final = result.finalScore ?? { home: 0, away: 0 };

    const playedGame: GameResult = {
      ...result,
      id: g.id,
      season: g.season,
      competitionId: g.competitionId,
      date: g.date,
      homeTeamId: g.homeTeamId,
      awayTeamId: g.awayTeamId,
      status: 'played',
    };
    updatedGames[i] = playedGame;
    gamesSimmed++;

    const homeWon = final.home > final.away;
    bumpRecord(recordsById.get(g.homeTeamId)!, homeWon, final.home, final.away);
    bumpRecord(recordsById.get(g.awayTeamId)!, !homeWon, final.away, final.home);
  }

  if (gamesSimmed === 0) return null;

  const updatedTeams = league.teams.map(t => {
    const rec = recordsById.get(t.id);
    if (!rec) return t;
    return { ...t, record: rec };
  });

  return {
    league: {
      ...league,
      games: updatedGames,
      teams: updatedTeams,
      currentTick: nextDay,
    },
    day: nextDay,
    gamesSimmed,
  };
}

// ===========================================================================
// Helpers
// ===========================================================================

function buildSnapshot(
  team: BasketballTeam,
  playerMap: Record<string, BasketballPlayer>,
): TeamSnapshot<BasketballRatings, BasketballStats> {
  const players = team.playerIds
    .map((pid: PlayerId) => playerMap[pid])
    .filter((p): p is BasketballPlayer => !!p);
  const lineup = buildDefaultBasketballLineup(players);
  return { team, availablePlayers: players, lineup, coach: null };
}

function bumpRecord(
  rec: { wins: number; losses: number; pointsFor: number; pointsAgainst: number; streak: string[]; otherResults: number },
  isWin: boolean,
  pf: number,
  pa: number,
): void {
  rec.wins += isWin ? 1 : 0;
  rec.losses += isWin ? 0 : 1;
  rec.pointsFor += pf;
  rec.pointsAgainst += pa;
  rec.streak = [...rec.streak.slice(-9), isWin ? 'W' : 'L'];
}
