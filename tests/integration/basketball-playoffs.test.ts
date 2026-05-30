/**
 * Phase 2D-1 — Playoffs integration tests.
 *
 * Drives a full league from a fresh regular season through a complete
 * postseason and asserts the bracket behaves like the NBA playoffs:
 *   - 16 teams seeded (8 per conference), higher seeds get home court
 *   - every round is best-of-7; a series ends at exactly 4 wins
 *   - winners advance through semis → conf finals → Finals
 *   - exactly one champion emerges and is recorded on competition history
 *   - playoff games are injected with isPlayoff + post-regular-season days
 *   - regular-season team records are untouched by playoff games
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import {
  initializePlayoffs,
  simPlayoffDay,
  getBracket,
  isRegularSeasonComplete,
  seedConferences,
} from '@/../apps/bs-basketball/src/lib/playoffs';

function playFullRegularSeason(seed = 'playoff-test') {
  let league = createNewBasketballLeague({ rngSeed: seed });
  let guard = 0;
  while (!isRegularSeasonComplete(league) && guard < 400) {
    const r = simNextDay(league);
    if (!r) break;
    league = r.league;
    guard++;
  }
  return league;
}

function runPlayoffsToCompletion(league: ReturnType<typeof createNewBasketballLeague>) {
  let l = initializePlayoffs(league);
  let guard = 0;
  while (!getBracket(l)!.complete && guard < 200) {
    const r = simPlayoffDay(l);
    if (!r) break;
    l = r.league;
    guard++;
  }
  return l;
}

describe('playoff seeding', () => {
  it('seeds 8 teams per conference, all distinct, ranked by record', () => {
    const league = playFullRegularSeason('seed-test');
    expect(isRegularSeasonComplete(league)).toBe(true);

    const { Eastern, Western, seedInfo } = seedConferences(league);
    expect(Eastern).toHaveLength(8);
    expect(Western).toHaveLength(8);
    expect(new Set([...Eastern, ...Western]).size).toBe(16);

    // Seeds must be in non-increasing win order within each conference.
    const winsOf = (id: string) =>
      league.teams.find(t => t.id === id)!.record.wins;
    for (const conf of [Eastern, Western]) {
      for (let i = 1; i < conf.length; i++) {
        expect(winsOf(conf[i - 1])).toBeGreaterThanOrEqual(winsOf(conf[i]));
      }
    }
    // Seed metadata covers exactly the 16 playoff teams.
    expect(Object.keys(seedInfo)).toHaveLength(16);
  });
});

describe('bracket generation', () => {
  it('builds a 16-team bracket with 1v8/4v5/3v6/2v7 first-round matchups', () => {
    const league = initializePlayoffs(playFullRegularSeason('bracket-test'));
    const bracket = getBracket(league)!;

    expect(league.currentPhase).toBe('playoffs');
    expect(bracket.rounds[0]).toHaveLength(8); // first round
    expect(bracket.rounds[1]).toHaveLength(4); // semis
    expect(bracket.rounds[2]).toHaveLength(2); // conf finals
    expect(bracket.rounds[3]).toHaveLength(1); // finals

    // Each first-round series pairs seeds summing to 9 (1+8, 2+7, 3+6, 4+5).
    for (const s of bracket.rounds[0]) {
      expect((s.seedA ?? 0) + (s.seedB ?? 0)).toBe(9);
      // teamA is the home-court (higher) seed.
      expect(s.seedA).toBeLessThan(s.seedB!);
    }
    // Later rounds start empty.
    expect(bracket.rounds[3][0].teamA).toBeNull();
  });
});

describe('playoff simulation', () => {
  it('plays best-of-7 series and crowns exactly one champion', () => {
    const league = runPlayoffsToCompletion(playFullRegularSeason('sim-test'));
    const bracket = getBracket(league)!;

    expect(bracket.complete).toBe(true);
    expect(bracket.championTeamId).toBeTruthy();
    expect(bracket.runnerUpTeamId).toBeTruthy();
    expect(bracket.championTeamId).not.toBe(bracket.runnerUpTeamId);

    // Every series resolved with exactly 4 wins for the victor and <4 for the loser.
    for (const series of bracket.rounds.flat()) {
      expect(series.winnerTeamId).toBeTruthy();
      const winnerWins = series.winnerTeamId === series.teamA ? series.winsA : series.winsB;
      const loserWins = series.winnerTeamId === series.teamA ? series.winsB : series.winsA;
      expect(winnerWins).toBe(4);
      expect(loserWins).toBeLessThan(4);
      expect(series.gameIds.length).toBe(winnerWins + loserWins);
      expect(series.gameIds.length).toBeGreaterThanOrEqual(4);
      expect(series.gameIds.length).toBeLessThanOrEqual(7);
    }

    // Champion came out of the Finals.
    expect(bracket.rounds[3][0].winnerTeamId).toBe(bracket.championTeamId);
  });

  it('records the champion on competition history', () => {
    const league = runPlayoffsToCompletion(playFullRegularSeason('history-test'));
    const bracket = getBracket(league)!;
    const history = league.competitions[0].history;
    const entry = history.find(h => h.season === league.currentSeason);
    expect(entry).toBeTruthy();
    expect(entry!.champion).toBe(bracket.championTeamId);
    expect(entry!.runnerUp).toBe(bracket.runnerUpTeamId);
  });

  it('injects playoff games tagged isPlayoff with post-regular-season days', () => {
    const before = playFullRegularSeason('inject-test');
    const regularGameCount = before.games.length;
    const recordsBefore = new Map(before.teams.map(t => [t.id, { ...t.record }]));

    const league = runPlayoffsToCompletion(before);
    const playoffGames = league.games.filter(
      g => (g.sportData as { isPlayoff?: boolean }).isPlayoff,
    );

    expect(league.games.length).toBeGreaterThan(regularGameCount);
    expect(playoffGames.length).toBe(league.games.length - regularGameCount);
    for (const g of playoffGames) {
      expect(g.status).toBe('played');
      expect(g.finalScore).toBeTruthy();
      // Past the 170-day regular season.
      expect((g.sportData as { dayOfSeason: number }).dayOfSeason).toBeGreaterThan(170);
    }
    // A best-of-7, 15-series bracket plays between 60 and 105 games.
    expect(playoffGames.length).toBeGreaterThanOrEqual(60);
    expect(playoffGames.length).toBeLessThanOrEqual(105);

    // Regular-season records are untouched by playoff games.
    for (const t of league.teams) {
      const prev = recordsBefore.get(t.id)!;
      expect(t.record.wins).toBe(prev.wins);
      expect(t.record.losses).toBe(prev.losses);
    }
  });
});
