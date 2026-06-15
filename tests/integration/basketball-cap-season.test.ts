/**
 * Cap space must price the SAME (upcoming) season on every offseason surface —
 * Re-sign, Free Agency, Roster — so the figure doesn't lurch between them
 * (BUG-29). Before the fix the Re-sign window priced draft.season while the FA
 * page's capRoom/signingBudget priced the stale current season.
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import { initializePlayoffs, simPlayoffDay, getBracket, isRegularSeasonComplete } from '@/../apps/bs-basketball/src/lib/playoffs';
import { enterOffseason } from '@/../apps/bs-basketball/src/lib/season';
import { getDraft, upcomingSeason } from '@/../apps/bs-basketball/src/lib/draft';
import { capRoom, signingBudget } from '@/../apps/bs-basketball/src/lib/freeAgency';
import { resignProjection } from '@/../apps/bs-basketball/src/lib/roster/resignProjection';
import { basketballSalaryCap, basketballTeamPayroll } from '@bs/sport-basketball';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';

function completeSeason(seed: string) {
  let l = createNewBasketballLeague({ rngSeed: seed });
  let g = 0;
  while (!isRegularSeasonComplete(l) && g++ < 400) { const r = simNextDay(l); if (!r) break; l = r.league; }
  l = initializePlayoffs(l); g = 0;
  while (!getBracket(l)!.complete && g++ < 200) { const r = simPlayoffDay(l); if (!r) break; l = r.league; }
  return l;
}

describe('cap space season target (BUG-29)', () => {
  it('prices the upcoming season consistently across Re-sign and Free Agency', () => {
    const off = enterOffseason(completeSeason('bug29-cap'));
    const season = getDraft(off)!.season;
    // Offseason: the upcoming season is next year, and that's what everything uses.
    expect(upcomingSeason(off)).toBe(season);
    expect(season).toBe(off.currentSeason + 1);

    const team = off.teams[0] as BasketballTeam;
    // Re-sign window prices the upcoming season...
    expect(resignProjection(off, team, {}).nextSeason).toBe(season);

    // ...and so does the FA page's capRoom (it used the stale current season).
    const roster = team.playerIds
      .map(id => off.players[id] as BasketballPlayer | undefined)
      .filter((p): p is BasketballPlayer => !!p);
    const expectedRoom = basketballSalaryCap(season) - basketballTeamPayroll(roster, season);
    expect(capRoom(off, team.id)).toBe(expectedRoom);
    // signingBudget never returns below zero and is computed without throwing.
    expect(signingBudget(off, team.id)).toBeGreaterThan(0);
  });
});
