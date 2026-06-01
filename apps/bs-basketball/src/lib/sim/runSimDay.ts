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
  type BasketballPlayer,
  type BasketballTeam,
} from '@bs/sport-basketball';
import { resolveLineup } from '../lineup';
import { getHeadCoach } from '../coaching/coaches';
import { getInjuries, healthyPlayers, applyInjuryRolls, type InjuryMap } from '../injuries';
import { getDiscipline, isSuspendedOn, applyDisciplineRolls, type DisciplineMap } from '../discipline';
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
  // Missing day → Infinity so it's never picked as "next" (effectively skipped).
  // A real day of 0 is valid: older saves use a 0-indexed schedule (days 0..169),
  // newer ones are 1-indexed (1..170). Both must be simmable.
  const d = (g.sportData as { dayOfSeason?: number } | undefined)?.dayOfSeason;
  return typeof d === 'number' ? d : Infinity;
}

export function simNextDay(league: LeagueState): SimDayResult | null {
  // Find the earliest dayOfSeason with at least one scheduled game. Day 0 is a
  // real opening-night day in legacy 0-indexed saves — do NOT skip it, or those
  // games never play and the regular season can't complete (blocking playoffs).
  let nextDay = Infinity;
  for (const g of league.games) {
    if (g.status !== 'scheduled') continue;
    const d = gameDay(g);
    if (d < nextDay) nextDay = d;
  }
  if (!isFinite(nextDay)) return null;

  // Build quick lookups.
  const teamById = new Map(league.teams.map(t => [t.id, t as BasketballTeam]));
  const playerMap = league.players as Record<string, BasketballPlayer>;
  const injuries = getInjuries(league);
  const discipline = getDiscipline(league);

  // Track mutable team records.
  const recordsById = new Map(league.teams.map(t => [t.id, { ...t.record }]));

  // Sim each scheduled game on that day.
  const updatedGames = league.games.slice();
  const playedGames: GameResult[] = [];
  let gamesSimmed = 0;

  for (let i = 0; i < updatedGames.length; i++) {
    const g = updatedGames[i];
    if (g.status !== 'scheduled') continue;
    if (gameDay(g) !== nextDay) continue;

    const home = teamById.get(g.homeTeamId);
    const away = teamById.get(g.awayTeamId);
    if (!home || !away) continue;

    const homeSnap = buildSnapshot(home, playerMap, injuries, discipline, nextDay, getHeadCoach(league, home.id));
    const awaySnap = buildSnapshot(away, playerMap, injuries, discipline, nextDay, getHeadCoach(league, away.id));

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
      // Merge the sim engine's sportData (quarterScores, possessions, …) over
      // the scheduled game's, but KEEP dayOfSeason — spreading `...result` alone
      // dropped it, which is why the news feed read "Day 0".
      sportData: {
        ...(g.sportData as Record<string, unknown> ?? {}),
        ...(result.sportData as Record<string, unknown> ?? {}),
        dayOfSeason: nextDay,
      },
    };
    updatedGames[i] = playedGame;
    playedGames.push(playedGame);
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

  const simmed: LeagueState = {
    ...league,
    games: updatedGames,
    teams: updatedTeams,
    // Simming a scheduled regular-season day means we're in the regular season.
    // `currentPhase` was stamped 'preseason' at creation and never advanced, so
    // the dashboard kept reading "preseason" hundreds of games in.
    currentPhase: 'regular_season',
    // Keep the calendar monotonic. In normal play nextDay > currentTick, so
    // this is just nextDay; for a legacy save mopping up trailing day-0 games
    // after reaching day 169, it avoids the badge snapping back to "Day 0".
    currentTick: Math.max(nextDay, league.currentTick),
  };

  // Heal anyone due back and roll new injuries from today's games.
  const withInjuries = applyInjuryRolls(simmed, playedGames, nextDay, league.currentSeason);
  // Clear served suspensions and roll new discipline from today's foul-outs.
  const withDiscipline = applyDisciplineRolls(withInjuries, playedGames, nextDay, league.currentSeason);

  return { league: withDiscipline, day: nextDay, gamesSimmed };
}

// ===========================================================================
// Helpers
// ===========================================================================

function buildSnapshot(
  team: BasketballTeam,
  playerMap: Record<string, BasketballPlayer>,
  injuries: InjuryMap,
  discipline: DisciplineMap,
  day: number,
  coach: TeamSnapshot<BasketballRatings, BasketballStats>['coach'],
): TeamSnapshot<BasketballRatings, BasketballStats> {
  const roster = team.playerIds
    .map((pid: PlayerId) => playerMap[pid])
    .filter((p): p is BasketballPlayer => !!p);
  // Injured or suspended players are unavailable — they neither play nor get auto-slotted.
  let players = healthyPlayers(roster, injuries, day).filter(p => !isSuspendedOn(discipline, p.id, day));
  let lineup = resolveLineup(team, players);
  // If injuries leave the team unable to field a full five, the walking
  // wounded suit up for this game rather than crashing the sim.
  if (players.length < 5 || lineup.starters.some(id => !id)) {
    players = roster;
    lineup = resolveLineup(team, players);
  }
  return { team, availablePlayers: players, lineup, coach };
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
