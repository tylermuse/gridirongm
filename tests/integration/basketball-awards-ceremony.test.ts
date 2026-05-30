/**
 * Phase 2D-2 — Awards ceremony integration tests.
 *
 * Verifies the app-level awards pipeline: aggregate box scores back into season
 * stats, feed the engine, and surface winners. The sim never writes
 * player.seasonStats, so this guards the aggregation that makes awards possible.
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import {
  initializePlayoffs,
  simPlayoffDay,
  getBracket,
  isRegularSeasonComplete,
} from '@/../apps/bs-basketball/src/lib/playoffs';
import { computeSeasonAwards } from '@/../apps/bs-basketball/src/lib/awards';

function playFullRegularSeason(seed: string) {
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

describe('awards computation', () => {
  it('returns null before any games are played', () => {
    const fresh = createNewBasketballLeague({ rngSeed: 'fresh' });
    expect(computeSeasonAwards(fresh)).toBeNull();
  });

  it('awards regular-season trophies from aggregated box scores', () => {
    const league = playFullRegularSeason('awards-reg');
    const awards = computeSeasonAwards(league)!;
    expect(awards).not.toBeNull();

    // MVP resolves to a real, eligible player (>= 50 games via aggregation).
    const mvp = awards.winners.mvp!;
    expect(mvp).toBeTruthy();
    expect(league.players[mvp.winnerId]).toBeTruthy();
    expect((awards.seasonStats.get(mvp.winnerId)?.gamesPlayed ?? 0)).toBeGreaterThanOrEqual(50);
    expect(mvp.finalists.length).toBeGreaterThan(0);

    // DPOY and Sixth Man also resolve over a full season.
    expect(awards.winners.dpoy).toBeTruthy();
    expect(awards.winners.sixthMan).toBeTruthy();

    // No champion yet → no Finals MVP.
    expect(awards.championTeamId).toBeNull();
    expect(awards.finalsStats).toBeNull();
    expect(awards.winners.finalsMvp).toBeNull();
  });

  it('awards Finals MVP to a player on the champion after the playoffs', () => {
    const league = runPlayoffsToCompletion(playFullRegularSeason('awards-finals'));
    const bracket = getBracket(league)!;
    const awards = computeSeasonAwards(league)!;

    expect(awards.championTeamId).toBe(bracket.championTeamId);
    const finalsMvp = awards.winners.finalsMvp!;
    expect(finalsMvp).toBeTruthy();
    // The Finals MVP plays for the champion.
    expect(finalsMvp.teamId).toBe(bracket.championTeamId);
    const player = league.players[finalsMvp.winnerId];
    expect(player.rosterSlot?.teamId).toBe(bracket.championTeamId);
    // They actually logged Finals minutes.
    expect((awards.finalsStats?.get(finalsMvp.winnerId)?.minutes ?? 0)).toBeGreaterThan(0);

    // Season trophies still present.
    expect(awards.winners.mvp).toBeTruthy();
  });
});
