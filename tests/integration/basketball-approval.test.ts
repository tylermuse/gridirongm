/**
 * Phase 2E-5 — GM tenure + approval integration tests.
 *
 * The user team's owner/fan approval swings on the season just played; a bad
 * enough season fires the GM (clears userTeamId, flags gmFired).
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import {
  initializePlayoffs, simPlayoffDay, getBracket, isRegularSeasonComplete,
} from '@/../apps/bs-basketball/src/lib/playoffs';
import {
  applySeasonApproval, userPlayoffResult, jobSecurityFor, getGmFired,
} from '@/../apps/bs-basketball/src/lib/approval';
import type { BasketballTeam } from '@bs/sport-basketball';
import type { TeamId } from '@bs/core/adapter';

function completeSeason(seed: string) {
  let league = createNewBasketballLeague({ rngSeed: seed });
  let g = 0;
  while (!isRegularSeasonComplete(league) && g++ < 400) { const r = simNextDay(league); if (!r) break; league = r.league; }
  league = initializePlayoffs(league); g = 0;
  while (!getBracket(league)!.complete && g++ < 200) { const r = simPlayoffDay(league); if (!r) break; league = r.league; }
  return league;
}

describe('approval mechanics', () => {
  it('maps owner approval to job security tiers', () => {
    expect(jobSecurityFor(80)).toBe('safe');
    expect(jobSecurityFor(50)).toBe('warm');
    expect(jobSecurityFor(35)).toBe('hot');
    expect(jobSecurityFor(10)).toBe('final_warning');
  });

  it('rewards the champion and identifies the playoff result', () => {
    const done = completeSeason('approval-champ');
    const championId = getBracket(done)!.championTeamId as TeamId;
    const league = { ...done, userTeamId: championId };

    expect(userPlayoffResult(league, championId)).toBe('champion');

    const before = (league.teams.find(t => t.id === championId) as BasketballTeam).approval.ownerApproval;
    const res = applySeasonApproval(league);
    expect(res.fired).toBe(false);
    const after = (res.league.teams.find(t => t.id === championId) as BasketballTeam).approval;
    expect(after.ownerApproval).toBeGreaterThan(before);
    expect(after.jobSecurity).toBe('safe');
  });

  it('fires the GM after a disastrous season', () => {
    const done = completeSeason('approval-fire');
    // Pick a non-playoff team and bottom out its owner approval to force a firing.
    const bracket = getBracket(done)!;
    const playoff = new Set([...bracket.seeds.Eastern, ...bracket.seeds.Western]);
    const loser = done.teams.find(t => !playoff.has(t.id))!;
    const league = {
      ...done,
      userTeamId: loser.id,
      teams: done.teams.map(t => t.id === loser.id
        ? { ...t, approval: { ...t.approval, ownerApproval: 22 } }
        : t),
    };

    expect(userPlayoffResult(league, loser.id)).toBe('missed');
    const res = applySeasonApproval(league);
    expect(res.fired).toBe(true);
    expect(res.league.userTeamId).toBeNull();
    expect(getGmFired(res.league)?.teamId).toBe(loser.id);
  });
});
