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
  simPlayoffRound,
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

describe('legacy 0-indexed saves', () => {
  // Saves created before the schedule generator was 1-indexed have games on
  // dayOfSeason 0..169. The sim runner must still play the day-0 (opening
  // night) games, or the regular season can never complete and playoffs are
  // permanently locked. Reproduce that exact save shape and sim it out.
  function makeLegacyZeroIndexedLeague(seed: string) {
    const league = createNewBasketballLeague({ rngSeed: seed });
    const games = league.games.map(g => {
      const sd = g.sportData as { dayOfSeason: number };
      return { ...g, sportData: { ...sd, dayOfSeason: sd.dayOfSeason - 1 } };
    });
    return { ...league, games };
  }

  it('plays the day-0 games and completes the regular season', () => {
    const league = makeLegacyZeroIndexedLeague('legacy-save');
    const dayZeroGames = league.games.filter(
      g => (g.sportData as { dayOfSeason: number }).dayOfSeason === 0,
    );
    expect(dayZeroGames.length).toBeGreaterThan(0); // there really are day-0 games

    let l = league;
    let guard = 0;
    while (!isRegularSeasonComplete(l) && guard < 400) {
      const r = simNextDay(l);
      if (!r) break;
      l = r.league;
      guard++;
    }

    expect(isRegularSeasonComplete(l)).toBe(true);
    expect(l.games.every(g => g.status === 'played')).toBe(true);
    // The day-0 games specifically were played.
    for (const g of dayZeroGames) {
      const played = l.games.find(x => x.id === g.id)!;
      expect(played.status).toBe('played');
    }
  });
});

describe('playoff seeding', () => {
  it('seeds 10 teams per conference (play-in field), all distinct, ranked by record', () => {
    const league = playFullRegularSeason('seed-test');
    expect(isRegularSeasonComplete(league)).toBe(true);

    const { Eastern, Western, seedInfo } = seedConferences(league);
    expect(Eastern).toHaveLength(10);
    expect(Western).toHaveLength(10);
    expect(new Set([...Eastern, ...Western]).size).toBe(20);

    // Seeds must be in non-increasing win order within each conference.
    const winsOf = (id: string) =>
      league.teams.find(t => t.id === id)!.record.wins;
    for (const conf of [Eastern, Western]) {
      for (let i = 1; i < conf.length; i++) {
        expect(winsOf(conf[i - 1])).toBeGreaterThanOrEqual(winsOf(conf[i]));
      }
    }
    // Seed metadata covers exactly the 20 play-in-field teams.
    expect(Object.keys(seedInfo)).toHaveLength(20);
  });
});

describe('bracket generation', () => {
  it('builds the bracket with a play-in feeding the 7/8 seeds', () => {
    const league = initializePlayoffs(playFullRegularSeason('bracket-test'));
    const bracket = getBracket(league)!;

    expect(league.currentPhase).toBe('playoffs');
    expect(bracket.rounds[0]).toHaveLength(8); // first round
    expect(bracket.rounds[1]).toHaveLength(4); // semis
    expect(bracket.rounds[2]).toHaveLength(2); // conf finals
    expect(bracket.rounds[3]).toHaveLength(1); // finals
    expect(bracket.playIn).toHaveLength(6); // 3 per conference

    for (const s of bracket.rounds[0]) {
      if (s.seedB == null) {
        // 7/8 seed comes from the play-in — only the 1 or 2 seed is set.
        expect([1, 2]).toContain(s.seedA);
        expect(s.teamB).toBeNull();
      } else {
        // 4v5 / 3v6 are locked in and sum to 9, home court to the higher seed.
        expect((s.seedA ?? 0) + (s.seedB ?? 0)).toBe(9);
        expect(s.seedA).toBeLessThan(s.seedB!);
      }
    }

    // Play-in: 7v8 and 9v10 start with both teams; the 8-seed game is TBD.
    const piA = bracket.playIn!.filter(s => s.seedA === 7 && s.seedB === 8);
    const pi910 = bracket.playIn!.filter(s => s.seedA === 9 && s.seedB === 10);
    expect(piA).toHaveLength(2);
    expect(pi910).toHaveLength(2);
    for (const s of bracket.playIn!) expect(s.winsNeeded).toBe(1);

    // Later rounds start empty.
    expect(bracket.rounds[3][0].teamA).toBeNull();
  });

  it('resolves the play-in and fills the 7/8 seeds, then crowns a champion', () => {
    let league = initializePlayoffs(playFullRegularSeason('playin-resolve'));
    let guard = 0;
    while (!getBracket(league)!.complete && guard++ < 200) {
      const r = simPlayoffDay(league);
      if (!r) break;
      league = r.league;
    }
    const bracket = getBracket(league)!;
    expect(bracket.complete).toBe(true);
    // Every play-in game decided a winner.
    expect(bracket.playIn!.every(s => s.winnerTeamId)).toBe(true);
    // The 1v8 and 2v7 first-round series got their 7/8 seeds from the play-in.
    const r1 = bracket.rounds[0];
    expect(r1.every(s => s.teamA && s.teamB)).toBe(true);
  });

  it('Sim Round on the play-in resolves the play-in without starting round 1', () => {
    const league = initializePlayoffs(playFullRegularSeason('playin-round-gate'));
    const after = simPlayoffRound(league)!;
    const bracket = getBracket(after.league)!;
    // The play-in finished...
    expect(bracket.playIn!.every(s => s.winnerTeamId)).toBe(true);
    // ...but no first-round games were played yet (every series 0–0), so the
    // round starts aligned next time rather than some series racing ahead.
    for (const s of bracket.rounds[0]) {
      expect(s.winsA + s.winsB).toBe(0);
    }
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
