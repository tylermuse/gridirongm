/**
 * League-wide per-game stat ranks (parity 1.1): ordinal formatting + that a
 * player's computed rank matches the leaderboard ordering.
 */

import { describe, it, expect } from 'vitest';
import { computeLeagueStatRanks, ordinal } from '@/../apps/bs-basketball/src/lib/stats/leagueRank';
import { regularSeasonStatsByPlayer } from '@/../apps/bs-basketball/src/lib/stats/seasonStats';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';

describe('ordinal', () => {
  it('formats English ordinals incl. the 11-13 exceptions', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual(
      ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th'],
    );
  });
});

describe('computeLeagueStatRanks', () => {
  it('ranks the scoring leader 1st and stays consistent with the leaderboard', () => {
    let league = createNewBasketballLeague({ rngSeed: 'rank-test' });
    for (let i = 0; i < 25; i++) {
      const r = simNextDay(league);
      if (!r) break;
      league = r.league;
    }

    const ranks = computeLeagueStatRanks(league);
    expect(ranks.of).toBeGreaterThan(0);

    // Independently find the qualified ppg leader and confirm it's rank 1.
    const stats = regularSeasonStatsByPlayer(league);
    let maxGp = 1;
    for (const s of stats.values()) maxGp = Math.max(maxGp, s.gamesPlayed);
    const gpMin = Math.max(1, Math.floor(maxGp * 0.4));
    let topId = '', topPpg = -1;
    for (const [pid, s] of stats) {
      if (s.gamesPlayed < gpMin) continue;
      const ppg = s.points / s.gamesPlayed;
      if (ppg > topPpg) { topPpg = ppg; topId = pid as string; }
    }
    expect(ranks.rank(topId, 'ppg')).toBe(1);

    // An unqualified / unknown id ranks null.
    expect(ranks.rank('nobody', 'ppg')).toBeNull();
  });
});
