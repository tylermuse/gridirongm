/**
 * God Mode: force the outcome of the user's next game (parity 3.1d).
 *
 * Mirrors how simNextDay records a played game — sets finalScore + a
 * synthesized box score (so the box/stats stay coherent) and bumps both teams'
 * records (wins/losses/streak/points). Standings are derived from records on
 * read, so nothing else needs updating. No-op unless God Mode is on. Pure.
 */

import { emptyBasketballStats, type BasketballPlayer, type BasketballStats, type BasketballTeam } from '@bs/sport-basketball';
import type { BaseGameResult, BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings } from '@bs/sport-basketball';
import { isGodMode } from './godMode';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;
type GameResult = BaseGameResult<BasketballStats>;

function gameDay(g: GameResult): number {
  return (g.sportData as { dayOfSeason?: number } | undefined)?.dayOfSeason ?? 0;
}

/** Distribute a team's points across its top rotation, summing exactly to `target`. */
function synthBox(team: BasketballTeam, players: Record<string, BasketballPlayer>, target: number): Record<string, BasketballStats> {
  const roster = team.playerIds
    .map(id => players[id])
    .filter((p): p is BasketballPlayer => !!p)
    .sort((a, b) => b.ratings.overall - a.ratings.overall)
    .slice(0, 9);
  const weights = roster.map(p => Math.max(1, p.ratings.overall - 50));
  const wsum = weights.reduce((s, w) => s + w, 0) || 1;
  const box: Record<string, BasketballStats> = {};
  let remaining = target;
  roster.forEach((p, i) => {
    const last = i === roster.length - 1;
    const pts = last ? Math.max(0, remaining) : Math.min(remaining, Math.round((target * weights[i]) / wsum));
    remaining -= pts;
    const s = emptyBasketballStats();
    s.gamesPlayed = 1;
    s.gamesStarted = i < 5 ? 1 : 0;
    s.minutes = i < 5 ? 34 - i * 2 : Math.max(8, 22 - (i - 5) * 3);
    s.points = pts;
    s.fieldGoalsMade = Math.round(pts * 0.4);
    s.fieldGoalsAttempted = Math.max(s.fieldGoalsMade, Math.round(pts * 0.85));
    s.totalRebounds = Math.round((p.ratings.rebounding / 100) * 9);
    s.defensiveRebounds = s.totalRebounds;
    s.assists = Math.round((p.ratings.passing / 100) * 7);
    box[p.id] = s;
  });
  return box;
}

function bumpTeam(t: BasketballTeam, isWin: boolean, pf: number, pa: number): BasketballTeam {
  const r = t.record;
  return {
    ...t,
    record: {
      ...r,
      wins: r.wins + (isWin ? 1 : 0),
      losses: r.losses + (isWin ? 0 : 1),
      pointsFor: r.pointsFor + pf,
      pointsAgainst: r.pointsAgainst + pa,
      streak: [...r.streak.slice(-9), isWin ? 'W' : 'L'],
    },
  };
}

/** Force the user's next scheduled game to a win or loss. Returns the updated
 *  league, or null if God Mode is off / spectator / no upcoming game. */
export function forceUserGameResult(league: LeagueState, win: boolean): LeagueState | null {
  if (!isGodMode(league) || !league.userTeamId) return null;
  const uid = league.userTeamId;
  const games = league.games as GameResult[];
  const next = games
    .filter(g => g.status === 'scheduled' && (g.homeTeamId === uid || g.awayTeamId === uid))
    .sort((a, b) => gameDay(a) - gameDay(b))[0];
  if (!next) return null;

  const userHome = next.homeTeamId === uid;
  const userScore = win ? 113 : 101;
  const oppScore = win ? 104 : 112;
  const home = userHome ? userScore : oppScore;
  const away = userHome ? oppScore : userScore;

  const players = league.players as Record<string, BasketballPlayer>;
  const teams = league.teams as BasketballTeam[];
  const homeTeam = teams.find(t => t.id === next.homeTeamId);
  const awayTeam = teams.find(t => t.id === next.awayTeamId);
  if (!homeTeam || !awayTeam) return null;

  const played: GameResult = {
    ...next,
    status: 'played',
    finalScore: { home, away },
    boxScores: { ...synthBox(homeTeam, players, home), ...synthBox(awayTeam, players, away) },
    sportData: { ...(next.sportData as object), dayOfSeason: gameDay(next), forced: true },
  };

  const homeWon = home > away;
  const updatedTeams = teams.map(t =>
    t.id === next.homeTeamId ? bumpTeam(t, homeWon, home, away)
    : t.id === next.awayTeamId ? bumpTeam(t, !homeWon, away, home)
    : t,
  );

  const sd = league.sportData as { godModeEverUsed?: boolean };
  return {
    ...league,
    games: games.map(g => (g.id === next.id ? played : g)),
    teams: updatedTeams,
    sportData: { ...sd, godModeEverUsed: true },
  };
}
