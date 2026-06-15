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
  getGmOpenings, clearGmFired,
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

});

describe('firing rule — grace period + two strikes (BUG-22)', () => {
  // A completed season where the user team missed the playoffs (playoffScore -12).
  function missedLeague(seed: string) {
    const done = completeSeason(seed);
    const bracket = getBracket(done)!;
    const playoff = new Set([...bracket.seeds.Eastern, ...bracket.seeds.Western]);
    const loser = done.teams.find(t => !playoff.has(t.id))!;
    return { done, loser };
  }
  function withState(
    done: ReturnType<typeof completeSeason>,
    loserId: TeamId,
    s: { ownerApproval: number; tenureStart: number; consecutiveBad: number },
  ) {
    return {
      ...done,
      userTeamId: loserId,
      sportData: { ...(done.sportData as object), gmTenureStartSeason: s.tenureStart, gmConsecutiveBadSeasons: s.consecutiveBad },
      teams: done.teams.map(t => t.id === loserId ? { ...t, approval: { ...t.approval, ownerApproval: s.ownerApproval } } : t),
    };
  }
  const badCount = (l: { sportData: unknown }) => (l.sportData as { gmConsecutiveBadSeasons?: number }).gmConsecutiveBadSeasons;

  it('one sub-threshold season is a final warning, not a firing', () => {
    const { done, loser } = missedLeague('bug22-warn');
    expect(userPlayoffResult({ ...done, userTeamId: loser.id }, loser.id)).toBe('missed');
    const res = applySeasonApproval(withState(done, loser.id, { ownerApproval: 30, tenureStart: done.currentSeason - 5, consecutiveBad: 0 }));
    expect(res.fired).toBe(false);
    expect(res.league.userTeamId).toBe(loser.id);
    expect((res.league.teams.find(t => t.id === loser.id) as BasketballTeam).approval.jobSecurity).toBe('final_warning');
    expect(badCount(res.league)).toBe(1);
  });

  it('fires after two consecutive sub-threshold seasons, once past the grace window', () => {
    const { done, loser } = missedLeague('bug22-fire');
    const res = applySeasonApproval(withState(done, loser.id, { ownerApproval: 30, tenureStart: done.currentSeason - 5, consecutiveBad: 1 }));
    expect(res.fired).toBe(true);
    expect(res.league.userTeamId).toBeNull();
    expect(getGmFired(res.league)?.teamId).toBe(loser.id);
  });

  it('never fires within the first three seasons of a tenure (grace)', () => {
    const { done, loser } = missedLeague('bug22-grace');
    // Would be a second straight strike, but it's the GM's very first season.
    const res = applySeasonApproval(withState(done, loser.id, { ownerApproval: 30, tenureStart: done.currentSeason, consecutiveBad: 1 }));
    expect(res.fired).toBe(false);
    expect((res.league.teams.find(t => t.id === loser.id) as BasketballTeam).approval.jobSecurity).toBe('final_warning');
  });

  it('an at/above-expectation season resets the bad-season counter', () => {
    const done = completeSeason('bug22-reset');
    const championId = getBracket(done)!.championTeamId as TeamId;
    const league = {
      ...done,
      userTeamId: championId,
      sportData: { ...(done.sportData as object), gmTenureStartSeason: done.currentSeason - 5, gmConsecutiveBadSeasons: 1 },
    };
    const res = applySeasonApproval(league);
    expect(res.fired).toBe(false);
    expect(badCount(res.league)).toBe(0);
  });
});

describe('taking over after a firing (BUG-23)', () => {
  it('preserves the existing league — no regeneration, no data loss', () => {
    const done = completeSeason('takeover-preserve');
    const bracket = getBracket(done)!;
    const playoff = new Set([...bracket.seeds.Eastern, ...bracket.seeds.Western]);
    const loser = done.teams.find(t => !playoff.has(t.id))!;

    // A custom-roster (imported) league the GM just got fired from. Build the
    // fired state directly so this guards the takeover regardless of the firing
    // rule. Capture the league's identity (teams + players + custom flag).
    const openings = done.teams.filter(t => t.id !== loser.id).slice(0, 5).map(t => t.id);
    const fired = {
      ...done,
      userTeamId: null,
      sportData: {
        ...(done.sportData as object),
        imported: true,
        gmFired: { season: done.currentSeason, teamId: loser.id, teamName: `${loser.city} ${loser.name}` },
        gmOpenings: openings,
      },
    };
    const teamIdsBefore = fired.teams.map(t => t.id).sort();
    const playerIdsBefore = Object.keys(fired.players).sort();
    const newTeamId = getGmOpenings(fired)[0];

    // The store's pickUserTeam transform: take over WITHIN the league.
    const after = clearGmFired({ ...fired, userTeamId: newTeamId });

    // Same league: every team and player survives, custom-roster flag intact.
    expect(after.teams.map(t => t.id).sort()).toEqual(teamIdsBefore);
    expect(Object.keys(after.players).sort()).toEqual(playerIdsBefore);
    expect((after.sportData as { imported?: boolean }).imported).toBe(true);
    // The GM now controls the chosen club; the fired flags are cleared.
    expect(after.userTeamId).toBe(newTeamId);
    expect(getGmFired(after)).toBeUndefined();
    expect(getGmOpenings(after)).toEqual([]);
  });
});
