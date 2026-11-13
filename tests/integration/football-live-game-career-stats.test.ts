/**
 * Career totals for games played or watched live.
 *
 * A game committed from the live game page (commitLiveGame) was added to
 * `player.stats` but not to `player.careerStats`, so the career line on the
 * player modal and player page ran short by every live game, mostly for the
 * user's own team. The weekly sim adds a game to both.
 *
 * What must hold:
 *  - a live regular-season game moves the season line and the career line by
 *    its box score; a live playoff game moves neither, like a simmed one;
 *  - a league that mixes simmed and live games ends up with career totals no
 *    lower than the seasons they are made of;
 *  - a save written while the bug was live gets its career lines brought back
 *    up to their seasons when it loads (careerStatsRepair.ts), and loading it
 *    again changes nothing.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getItem } from '@bs/core/storage';
import { emptyStats, type GameResult, type Player, type PlayerStats } from '@/types';
import { repairSaveCareerStats } from '@/lib/engine/careerStatsRepair';
import { parseSave } from '@/lib/engine/saveStatCompaction';
import { simulateGame } from '@/lib/engine/simulate';
import { flushToStorage, retrySaveLoad, useGameStore, whenSaveLoadSettles } from '@/lib/engine/store';

const AUTOSAVE_KEY = 'gridiron-gm-autosave';
const STAT_KEYS = Object.keys(emptyStats()) as (keyof PlayerStats)[];

const game = () => useGameStore.getState();
const line = (over: Partial<PlayerStats> = {}): PlayerStats => ({ ...emptyStats(), ...over });
const plus = (a: PlayerStats, b: Partial<PlayerStats>): PlayerStats => {
  const out = { ...a };
  for (const k of STAT_KEYS) out[k] += b[k] ?? 0;
  return out;
};
const byId = (players: Player[]) => new Map(players.map(p => [p.id, p]));

/** The sum of a player's seasons: the logged ones plus the one in progress. */
function seasonsTotal(p: Player): PlayerStats {
  return [...(p.seasonLog ?? []).map(e => e.stats), p.stats].reduce(plus, emptyStats());
}

/** Players whose career line is below the seasons it is made of. */
function shortCareers(players: Player[]): string[] {
  return players
    .filter(p => { const floor = seasonsTotal(p); return STAT_KEYS.some(k => p.careerStats[k] < floor[k]); })
    .map(p => `${p.firstName} ${p.lastName}`);
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

/** Play a game between two teams of the league in memory, as the live game
 *  page does, and return what it would hand to commitLiveGame. */
function playLive(fixture: Pick<GameResult, 'id' | 'week' | 'season' | 'homeTeamId' | 'awayTeamId'>): GameResult {
  const { players } = game();
  const result = simulateGame(
    { ...fixture, homeScore: 0, awayScore: 0, played: false, playerStats: {} },
    players.filter(p => p.teamId === fixture.homeTeamId),
    players.filter(p => p.teamId === fixture.awayTeamId),
  );
  return { ...result, played: true };
}

/** Every player in the box score moved by his line on both the season and the
 *  career; everyone else was not touched. */
function expectBoxScoreApplied(before: Map<string, Player>, result: GameResult): void {
  const boxIds = Object.keys(result.playerStats);
  expect(boxIds.length).toBeGreaterThan(30);
  for (const p of game().players) {
    const was = before.get(p.id)!;
    const box = result.playerStats[p.id];
    if (!box) {
      expect(p.stats).toEqual(was.stats);
      expect(p.careerStats).toEqual(was.careerStats);
      continue;
    }
    expect(p.stats, `${p.position} season`).toEqual(plus(was.stats, box));
    expect(p.careerStats, `${p.position} career`).toEqual(plus(was.careerStats, box));
  }
}

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
  // A simmed week first, so the live game below is added to lines that
  // already hold something.
  game().simWeek();
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('a game committed from the live game page', () => {
  it('adds a regular-season box score to the season line and the career line', () => {
    const userFixture = () => {
      const { schedule, week, userTeamId } = game();
      return schedule.find(g => g.week === week && !g.played && (g.homeTeamId === userTeamId || g.awayTeamId === userTeamId));
    };
    // Sim past a bye, if this is one.
    for (let guard = 0; !userFixture() && guard < 3; guard++) game().simWeek();
    const fixture = userFixture()!;
    expect(fixture).toBeDefined();
    const s = game();
    const before = byId(s.players);
    const qb = s.players.find(p => p.teamId === s.userTeamId && p.stats.passAttempts > 0)!;
    expect(qb.careerStats.passYards).toBeGreaterThan(0);

    const result = playLive(fixture);
    game().commitLiveGame(result);

    expect(game().schedule.find(g => g.id === fixture.id)!.played).toBe(true);
    expectBoxScoreApplied(before, result);
    const qbAfter = game().players.find(p => p.id === qb.id)!;
    expect(qbAfter.careerStats.passYards).toBe(qb.careerStats.passYards + (result.playerStats[qb.id]?.passYards ?? 0));
  });

  it('counts a live game the same as the simmed games around it', () => {
    // The rest of that week, then the rest of the season, simmed. No one in
    // this league had played before this season, so every career line is the
    // season line, whichever way each game was played.
    for (let guard = 0; game().phase === 'regular' && guard < 40; guard++) game().simWeek();
    const played = game().players.filter(p => p.stats.gamesPlayed > 0);
    expect(played.length).toBeGreaterThan(1000);
    for (const p of played) expect(p.careerStats).toEqual(p.stats);
  });

  it('keeps a playoff box score off both lines, as the playoff sims do', () => {
    // More in football-playoff-stats-consistency.test.ts.
    if (game().phase === 'regular') game().advanceToPlayoffs();
    const s = game();
    const matchup = s.playoffBracket!.find(m => m.homeTeamId && m.awayTeamId && !m.winnerId)!;
    const before = byId(s.players);

    const result = playLive({
      id: matchup.id, week: 99, season: s.season,
      homeTeamId: matchup.homeTeamId!, awayTeamId: matchup.awayTeamId!,
    });
    if (result.homeScore === result.awayScore) result.homeScore += 3; // the live page always ends with a winner
    game().commitLiveGame(result, matchup.id);

    const winner = result.homeScore > result.awayScore ? matchup.homeTeamId : matchup.awayTeamId;
    expect(game().playoffBracket!.find(m => m.id === matchup.id)!.winnerId).toBe(winner);
    expect(Object.keys(result.playerStats).length).toBeGreaterThan(30);
    for (const p of game().players) {
      expect(p.stats).toEqual(before.get(p.id)!.stats);
      expect(p.careerStats).toEqual(before.get(p.id)!.careerStats);
    }
  });

  it('leaves every career total at or above its seasons once the season is in the log', () => {
    game().simAllPlayoffGames();
    finishOffseason();
    const { players } = game();
    expect(players.filter(p => (p.seasonLog ?? []).length > 0).length).toBeGreaterThan(1000);
    expect(shortCareers(players)).toEqual([]);
  });
});

describe('career lines in a save from before the fix', () => {
  const save = (players: unknown[], season = 2029) => ({ version: 37, state: { season, teams: [], players } });

  it('raises each short career stat to the sum of the seasons, and nothing else', () => {
    const repaired = repairSaveCareerStats(save([{
      id: 'qb',
      ratings: { overall: 80 },
      // Two logged seasons and three games into this one; five of those games
      // were watched live and never reached the career line.
      seasonLog: [
        { season: 2027, teamId: 'DAL', stats: line({ gamesPlayed: 17, passYards: 4100, passTDs: 30, sacks: 0.5 }) },
        { season: 2028, teamId: 'DAL', stats: line({ gamesPlayed: 17, passYards: 3900, passTDs: 27 }) },
      ],
      stats: line({ gamesPlayed: 3, passYards: 800, passTDs: 5 }),
      careerStats: line({ gamesPlayed: 32, passYards: 7600, passTDs: 62, rushYards: 40 }),
    }, {
      id: 'kneeler',
      seasonLog: [{ season: 2028, teamId: 'DAL', stats: line({ gamesPlayed: 17, rushYards: -9 }) }],
      stats: line(),
      careerStats: line({ gamesPlayed: 12, rushYards: -4 }),
    }]));
    const qb = repaired.state.players[0] as { careerStats: PlayerStats; ratings: unknown };
    expect(qb.careerStats).toEqual(line({
      gamesPlayed: 37,   // 17 + 17 + 3, was 32
      passYards: 8800,   // 4100 + 3900 + 800, was 7600
      passTDs: 62,       // already at the seasons' 62
      rushYards: 40,     // above the seasons' 0: history the log does not have
      sacks: 0.5,
    }));
    expect(qb.ratings).toEqual({ overall: 80 });
    // A career stat is only ever raised: -4 is already above the seasons' -9.
    expect((repaired.state.players[1] as { careerStats: PlayerStats }).careerStats)
      .toEqual(line({ gamesPlayed: 17, rushYards: -4 }));
  });

  it('changes nothing when run again, or on a career that is not short', () => {
    const short = { id: 'a', seasonLog: [{ season: 2028, teamId: 'T', stats: line({ gamesPlayed: 17, tackles: 90 }) }], stats: line({ gamesPlayed: 2, tackles: 9 }), careerStats: line({ gamesPlayed: 4 }) };
    const whole = { id: 'b', seasonLog: [{ season: 2028, teamId: 'T', stats: line({ gamesPlayed: 17, tackles: 90 }) }], stats: line({ gamesPlayed: 2, tackles: 9 }), careerStats: line({ gamesPlayed: 60, tackles: 400 }) };
    const rookie = { id: 'c', stats: line(), careerStats: line() };

    const once = repairSaveCareerStats(structuredClone(save([short, whole, rookie])));
    expect(once.state.players[0]).toEqual({ ...short, careerStats: line({ gamesPlayed: 19, tackles: 99 }) });
    expect(once.state.players[1]).toEqual(whole);
    expect(once.state.players[2]).toEqual(rookie);

    const twice = repairSaveCareerStats(structuredClone(once));
    expect(twice).toEqual(once);
  });

  it('does not count the season in progress twice when the log already has it', () => {
    const player = {
      id: 'p',
      seasonLog: [{ season: 2029, teamId: 'T', stats: line({ gamesPlayed: 17, rushYards: 1200 }) }],
      stats: line({ gamesPlayed: 17, rushYards: 1200 }),
      careerStats: line({ gamesPlayed: 10, rushYards: 700 }),
    };
    const repaired = repairSaveCareerStats(save([player], 2029));
    expect((repaired.state.players[0] as typeof player).careerStats).toEqual(line({ gamesPlayed: 17, rushYards: 1200 }));
  });

  it('handles a bare state, and does not trip on shapes it does not know', () => {
    const bare = { season: 2027, players: [{ id: 'p', stats: line({ gamesPlayed: 5, receptions: 22 }), careerStats: line() }] };
    expect(repairSaveCareerStats(bare).players[0].careerStats).toEqual(line({ gamesPlayed: 5, receptions: 22 }));

    const odd = [null, 7, 'x', [], {}, { state: null }, { state: { players: 'none' } },
      { state: { players: [null, 3, { stats: line({ snaps: 4 }) }, { careerStats: line() }, { stats: [1], careerStats: line(), seasonLog: [null, { season: 1 }, { stats: 'x' }] }] } }];
    for (const value of odd) expect(repairSaveCareerStats(structuredClone(value))).toEqual(value);
  });

  it('is repaired when the save loads, and stays as it is on the next load', async () => {
    // Put the league in the state the bug left it in: every game of the
    // user's team watched live, so none of them is on a career line.
    const { players, userTeamId } = game();
    const affected = players.filter(p => p.teamId === userTeamId && (p.seasonLog ?? []).length > 0);
    expect(affected.length).toBeGreaterThan(5);
    const affectedIds = new Set(affected.map(p => p.id));
    // Each emptied stat comes back up to its seasons. A season total below
    // zero (a quarterback's kneel-downs) is not above the emptied 0, and a
    // stat is only ever raised, so that one stays where the save had it.
    const expected = new Map(players.map(p => {
      if (!affectedIds.has(p.id)) return [p.id, p.careerStats];
      const career = { ...p.careerStats };
      for (const k of STAT_KEYS) career[k] = Math.max(0, career[k]);
      return [p.id, career];
    }));
    useGameStore.setState({
      players: players.map(p => (affectedIds.has(p.id) ? { ...p, careerStats: emptyStats() } : p)),
    });
    expect(shortCareers(game().players).length).toBe(affected.filter(p => p.seasonLog!.some(e => e.stats.gamesPlayed > 0)).length);
    await flushToStorage();

    expect(await retrySaveLoad()).toBe('ready');
    expect(shortCareers(game().players)).toEqual([]);
    for (const p of game().players) expect(p.careerStats).toEqual(expected.get(p.id));

    // The repaired league is what gets written, and it loads back unchanged.
    const loaded = byId(game().players);
    await flushToStorage();
    const onDisk = parseSave<{ state: { players: Player[] } }>((await getItem(AUTOSAVE_KEY))!);
    for (const p of onDisk.state.players) expect(p.careerStats).toEqual(loaded.get(p.id)!.careerStats);
    expect(await retrySaveLoad()).toBe('ready');
    for (const p of game().players) expect(p.careerStats).toEqual(loaded.get(p.id)!.careerStats);
  });
});
