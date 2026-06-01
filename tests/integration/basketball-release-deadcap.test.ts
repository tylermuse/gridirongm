/**
 * Release with dead money + waive-and-stretch (#7).
 *
 * Releasing a guaranteed player must (a) move him to free agency and (b) leave
 * his remaining guaranteed money on the team as dead cap. A stretch spreads the
 * total over 2N+1 seasons; a straight waive keeps the per-year charges as-is.
 */
import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { applyRelease, releasePreview, teamDeadCap } from '@/../apps/bs-basketball/src/lib/roster/release';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';

function pickGuaranteed(l: ReturnType<typeof createNewBasketballLeague>, teamId: string): BasketballPlayer {
  const team = l.teams.find(t => t.id === teamId)!;
  const players = l.players as Record<string, BasketballPlayer>;
  return team.playerIds
    .map(id => players[id])
    .find(p => p.contract && p.contract.years.some(y => y.guaranteed && y.season >= l.currentSeason))!;
}

describe('release with dead cap', () => {
  it('straight waive records remaining guaranteed money as dead cap', () => {
    let l = createNewBasketballLeague({ rngSeed: 'release' });
    const teamId = l.teams[0].id;
    l = { ...l, userTeamId: teamId };
    const p = pickGuaranteed(l, teamId);
    const preview = releasePreview(p, l.currentSeason);
    expect(preview.remainingGuaranteed).toBeGreaterThan(0);

    const after = applyRelease(l, p.id, false);
    // Player left the roster.
    const team = after.teams.find(t => t.id === teamId)! as BasketballTeam;
    expect(team.playerIds).not.toContain(p.id);
    // Current-season dead cap equals the straight-waive charge.
    expect(teamDeadCap(team, l.currentSeason)).toBe(preview.waiveThisYear);
  });

  it('stretch spreads total guaranteed over 2N+1 seasons', () => {
    let l = createNewBasketballLeague({ rngSeed: 'release-stretch' });
    const teamId = l.teams[0].id;
    l = { ...l, userTeamId: teamId };
    const p = pickGuaranteed(l, teamId);
    const preview = releasePreview(p, l.currentSeason);

    const after = applyRelease(l, p.id, true);
    const team = after.teams.find(t => t.id === teamId)! as BasketballTeam;
    const thisYear = teamDeadCap(team, l.currentSeason);
    // Stretched charge is lower than (or equal to) a straight waive this year.
    expect(thisYear).toBe(preview.stretchThisYear);
    expect(thisYear).toBeLessThanOrEqual(preview.waiveThisYear || Infinity);
    // Charges extend beyond the current contract length.
    expect(teamDeadCap(team, l.currentSeason + preview.stretchYears - 1)).toBeGreaterThan(0);
  });
});
