/**
 * Playoff games and player stat lines: the same whether simmed or watched.
 *
 * A playoff game committed from the live game page (commitLiveGame) used to
 * add its box score to `player.stats` and `player.careerStats`, while the
 * playoff sims (simPlayoffGame, simPlayoffRound, simAllPlayoffGames) add
 * nothing. So only the games the user watched reached a season line: up to
 * four extra games for those two rosters, counted by the season awards, the
 * stat leaders and the season log, and by nobody else's.
 *
 * The rule now: `stats` and `careerStats` are regular-season lines. A playoff
 * game writes its box score to `schedule` and to no player, however it was
 * played.
 *
 * What must hold:
 *  - a live playoff game and a simmed one both leave every player's season and
 *    career line where the regular season left it, and both keep a box score;
 *  - the season awards are the same after the playoffs as before them;
 *  - the season that goes into the log at rollover is the regular season;
 *  - careerStatsRepair has nothing to repair in a league played this way.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { emptyStats, type GameResult, type Player, type PlayerStats } from '@/types';
import { computeSeasonAwards } from '@/lib/engine/awards';
import { repairSaveCareerStats } from '@/lib/engine/careerStatsRepair';
import { simulateGame } from '@/lib/engine/simulate';
import { useGameStore, whenSaveLoadSettles } from '@/lib/engine/store';

const game = () => useGameStore.getState();
const openMatchups = () => game().playoffBracket!.filter(m => m.homeTeamId && m.awayTeamId && !m.winnerId);

type Lines = Map<string, { stats: PlayerStats; careerStats: PlayerStats }>;
const linesOf = (players: Player[]): Lines =>
  new Map(players.map(p => [p.id, { stats: p.stats, careerStats: p.careerStats }]));

/** Every player's season and career line is what it was in `before`. */
function expectLinesUnchanged(before: Lines): void {
  const { players } = game();
  expect(players.length).toBe(before.size);
  for (const p of players) {
    const was = before.get(p.id)!;
    expect(p.stats, `${p.position} season`).toEqual(was.stats);
    expect(p.careerStats, `${p.position} career`).toEqual(was.careerStats);
  }
}

/** Re-signing, free agency and the draft, through to the next season. */
function finishOffseason(): void {
  if (game().phase === 'playoffs') game().advanceToResigning();
  game().passOnResigningBatch(game().resigningPlayers.map(r => r.playerId));
  game().advanceToFreeAgency();
  for (let guard = 0; game().phase === 'freeAgency' && guard < 40; guard++) game().advanceFAWeek();
  if (game().phase !== 'draft') game().advanceToDraft();
  game().simToEndDraft({ skipAdvance: true });
  game().startNewSeason();
  if (game().phase === 'preseason') { game().autoCutToRosterLimit(); game().skipPreseason(); }
}

/** Play a playoff matchup of the league in memory, as the live game page
 *  does, and return what it would hand to commitLiveGame. */
function playLive(matchup: { id: string; homeTeamId: string | null; awayTeamId: string | null }): GameResult {
  const { players, season } = game();
  const result = simulateGame(
    { id: matchup.id, week: 99, season, homeTeamId: matchup.homeTeamId!, awayTeamId: matchup.awayTeamId!, homeScore: 0, awayScore: 0, played: false, playerStats: {} },
    players.filter(p => p.teamId === matchup.homeTeamId),
    players.filter(p => p.teamId === matchup.awayTeamId),
  );
  if (result.homeScore === result.awayScore) result.homeScore += 3; // the live page always ends with a winner
  return { ...result, played: true };
}

/** A played game's box score, as kept in the schedule. */
function boxScore(id: string): GameResult['playerStats'] {
  const entry = game().schedule.find(g => g.id === id);
  expect(entry?.played, `${id} in the schedule`).toBe(true);
  return entry!.playerStats;
}

let regularSeason: Lines;
let season: number;
let awardsBeforePlayoffs: ReturnType<typeof computeSeasonAwards>;

beforeAll(async () => {
  await whenSaveLoadSettles();
  vi.stubGlobal('alert', () => {});
  // The generated league (no roster file): the fetch failure is expected.
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
  await game().newLeague('');
  quiet.mockRestore();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  finishOffseason(); // a generated league starts in its first offseason
  expect(game().phase).toBe('regular');
  for (let guard = 0; game().phase === 'regular' && guard < 40; guard++) game().simWeek();
  if (game().phase === 'regular') game().advanceToPlayoffs();
  expect(game().phase).toBe('playoffs');

  season = game().season;
  regularSeason = linesOf(game().players);
  awardsBeforePlayoffs = computeSeasonAwards(game());
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('playoff games and player stat lines', () => {
  it('treats a live playoff game and a simmed one the same: a box score, and no change to any line', () => {
    expect([...regularSeason.values()].filter(l => l.stats.gamesPlayed > 0).length).toBeGreaterThan(1000);
    const [watched, simmed] = openMatchups();
    expect(watched && simmed).toBeTruthy();

    // One wild-card game watched live...
    const result = playLive(watched);
    game().commitLiveGame(result, watched.id);
    expect(game().playoffBracket!.find(m => m.id === watched.id)!.winnerId)
      .toBe(result.homeScore > result.awayScore ? watched.homeTeamId : watched.awayTeamId);
    expectLinesUnchanged(regularSeason);

    // ...and one simmed.
    game().simPlayoffGame(simmed.id);
    expect(game().playoffBracket!.find(m => m.id === simmed.id)!.winnerId).toBeTruthy();
    expectLinesUnchanged(regularSeason);

    // Both were real games with a full box score, kept in the schedule.
    for (const id of [watched.id, simmed.id]) {
      const box = boxScore(id);
      expect(Object.keys(box).length, `${id} box score`).toBeGreaterThan(30);
      expect(Object.values(box).some(s => (s.passYards ?? 0) > 0)).toBe(true);
    }
    expect(boxScore(watched.id)).toEqual(result.playerStats);
  });

  it('holds for every way of finishing the bracket, live games included', () => {
    game().simPlayoffRound();
    expectLinesUnchanged(regularSeason);
    game().simNextPlayoffGame();
    expectLinesUnchanged(regularSeason);

    // A live game in a later round too (the user's team gets up to four).
    const next = openMatchups().filter(m => m.id !== 'championship')[0];
    if (next) {
      game().commitLiveGame(playLive(next), next.id);
      expectLinesUnchanged(regularSeason);
    }

    game().simAllPlayoffGames();
    expect(game().champions?.some(c => c.season === season)).toBe(true);
    expectLinesUnchanged(regularSeason);
  });

  it('gives the same season awards after the playoffs as before them', () => {
    expect(awardsBeforePlayoffs.length).toBeGreaterThan(0);
    expect(computeSeasonAwards(game())).toEqual(awardsBeforePlayoffs);
  });

  it('logs the regular season at rollover, and leaves the save repair nothing to do', () => {
    finishOffseason();
    const { players } = game();
    expect(game().season).toBe(season + 1);

    let logged = 0;
    for (const p of players) {
      const was = regularSeason.get(p.id);
      if (!was) continue; // this year's rookies
      const entry = (p.seasonLog ?? []).find(e => e.season === season);
      if (was.stats.gamesPlayed === 0) { expect(entry).toBeUndefined(); continue; }
      if (!entry) continue; // played, then ended the season without a team to credit
      logged++;
      expect(entry.stats).toEqual(was.stats);
      expect(p.careerStats).toEqual(was.careerStats);
    }
    expect(logged).toBeGreaterThan(1000);

    const asSaved = { version: 0, state: { season: game().season, players: structuredClone(players) } };
    const repaired = repairSaveCareerStats(structuredClone(asSaved));
    expect(repaired).toEqual(asSaved);
  });
});

describe('a season logged before this rule', () => {
  it('is left as it is: live playoff games already in a log or a career line stay there', () => {
    // 17 regular-season games and 3 watched playoff games, on both lines.
    const withPlayoffs = { ...emptyStats(), gamesPlayed: 20, passYards: 5100, passTDs: 38 };
    const player = {
      id: 'qb',
      seasonLog: [{ season: 2028, teamId: 'DAL', stats: withPlayoffs }],
      stats: { ...emptyStats(), gamesPlayed: 2, passYards: 510 },
      careerStats: { ...emptyStats(), gamesPlayed: 22, passYards: 5610, passTDs: 38 },
    };
    const save = { version: 37, state: { season: 2029, players: [player] } };
    expect(repairSaveCareerStats(structuredClone(save))).toEqual(save);
  });
});
