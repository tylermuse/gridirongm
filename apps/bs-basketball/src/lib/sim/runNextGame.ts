/**
 * Run the next scheduled game for a given team.
 *
 * v1 flow:
 *   1. Find the team's earliest 'scheduled' game by season order.
 *   2. Build default lineups for both sides (we don't persist lineups yet —
 *      coming in 2C-5 when the user can manage their rotation).
 *   3. Call basketballAdapter.simEngine.simGame with TeamSnapshots.
 *   4. Splice the result into league.games (status='played', finalScore).
 *   5. Update both teams' BaseTeamRecord (wins/losses, points, streak).
 *
 * Returns the mutated league + the game id (so the caller can navigate to it).
 *
 * Determinism: the sim seed derives from gameId + season so re-simming the
 * same game gives the same result. Useful for replays and tests.
 */

import {
  basketballAdapter,
  type BasketballPlayer,
  type BasketballTeam,
} from '@bs/sport-basketball';
import { resolveLineup } from '../lineup';
import type {
  BaseGameResult,
  BaseLeagueState,
  TeamSnapshot,
  GameContext,
  TeamId,
  PlayerId,
} from '@bs/core/adapter';
import type {
  BasketballRatings,
  BasketballStats,
} from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;
type GameResult = BaseGameResult<BasketballStats>;

export interface SimNextGameResult {
  league: LeagueState;
  gameId: string;
  finalScore: { home: number; away: number };
}

export function simNextGameForTeam(
  league: LeagueState,
  teamId: TeamId,
): SimNextGameResult | null {
  // Find the next 'scheduled' game for this team. games is roughly schedule-
  // ordered; we walk to be safe.
  const nextIdx = league.games.findIndex(g =>
    g.status === 'scheduled' &&
    (g.homeTeamId === teamId || g.awayTeamId === teamId),
  );
  if (nextIdx === -1) return null;

  const game = league.games[nextIdx];
  const homeTeam = league.teams.find(t => t.id === game.homeTeamId) as BasketballTeam | undefined;
  const awayTeam = league.teams.find(t => t.id === game.awayTeamId) as BasketballTeam | undefined;
  if (!homeTeam || !awayTeam) return null;

  const homeSnap = buildSnapshot(league, homeTeam);
  const awaySnap = buildSnapshot(league, awayTeam);

  const ctx: GameContext = {
    season: league.currentSeason,
    tick: league.currentTick,
    competitionId: game.competitionId,
    isPlayoff: false,
    homeAdvantage: 2.5,
    rngSeed: `${game.id}-${league.currentSeason}`,
  };

  const result = basketballAdapter.simEngine.simGame(homeSnap, awaySnap, ctx);

  // Splice the played game in place of the scheduled one — preserving the
  // original scheduled date so the calendar stays consistent.
  const playedGame: GameResult = {
    ...result,
    id: game.id,
    season: game.season,
    competitionId: game.competitionId,
    date: game.date,
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    status: 'played',
  };

  const updatedGames = [...league.games];
  updatedGames[nextIdx] = playedGame;

  const finalScore = playedGame.finalScore ?? { home: 0, away: 0 };
  const updatedTeams = updateTeamRecords(league.teams, playedGame, finalScore);

  return {
    league: {
      ...league,
      games: updatedGames,
      teams: updatedTeams,
    },
    gameId: playedGame.id,
    finalScore,
  };
}

// ===========================================================================
// Helpers
// ===========================================================================

function buildSnapshot(
  league: LeagueState,
  team: BasketballTeam,
): TeamSnapshot<BasketballRatings, BasketballStats> {
  const playerMap = league.players as Record<string, BasketballPlayer>;
  const players = team.playerIds
    .map((pid: PlayerId) => playerMap[pid])
    .filter((p): p is BasketballPlayer => !!p);

  const lineup = resolveLineup(team, players);

  return {
    team,
    availablePlayers: players,
    lineup,
    coach: null, // v1: no coaches yet
  };
}

function updateTeamRecords(
  teams: LeagueState['teams'],
  game: GameResult,
  score: { home: number; away: number },
): LeagueState['teams'] {
  const homeWon = score.home > score.away;
  return teams.map(t => {
    if (t.id === game.homeTeamId) {
      return applyResult(t, /*isWin*/ homeWon, /*pointsFor*/ score.home, /*pointsAgainst*/ score.away);
    }
    if (t.id === game.awayTeamId) {
      return applyResult(t, /*isWin*/ !homeWon, score.away, score.home);
    }
    return t;
  });
}

function applyResult<T extends LeagueState['teams'][number]>(
  team: T,
  isWin: boolean,
  pointsFor: number,
  pointsAgainst: number,
): T {
  const streak = [...team.record.streak.slice(-9), isWin ? 'W' : 'L'];
  return {
    ...team,
    record: {
      ...team.record,
      wins: team.record.wins + (isWin ? 1 : 0),
      losses: team.record.losses + (isWin ? 0 : 1),
      pointsFor: team.record.pointsFor + pointsFor,
      pointsAgainst: team.record.pointsAgainst + pointsAgainst,
      streak,
    },
  };
}
