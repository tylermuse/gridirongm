/**
 * Editorial dashboard derivations (#23): By the Numbers, scoring leaders, and
 * the user-team star are derived from box scores and must be sensible after a
 * stretch of regular-season games.
 */
import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simThroughDay } from '@/../apps/bs-basketball/src/lib/sim/simRange';
import { byTheNumbers, scoringLeaders, teamStar } from '@/../apps/bs-basketball/src/lib/dashboard/editorial';
import type { BasketballTeam } from '@bs/sport-basketball';

describe('editorial widgets', () => {
  it('derives callouts, MVP race, and a team star after games are played', () => {
    const fresh = createNewBasketballLeague({ rngSeed: 'editorial' });
    const userTeam = fresh.teams[0] as BasketballTeam;
    const l = { ...simThroughDay(fresh, 30).league, userTeamId: userTeam.id };
    const team = l.teams.find(t => t.id === userTeam.id)! as BasketballTeam;

    const numbers = byTheNumbers(l, team);
    expect(numbers.length).toBeGreaterThan(0);
    // Every callout has a non-empty value + label.
    for (const n of numbers) { expect(n.value).toBeTruthy(); expect(n.label).toBeTruthy(); }

    const leaders = scoringLeaders(l, 5);
    expect(leaders.length).toBeGreaterThan(0);
    // Sorted descending by ppg.
    for (let i = 1; i < leaders.length; i++) expect(leaders[i - 1].ppg).toBeGreaterThanOrEqual(leaders[i].ppg);

    const star = teamStar(l, team);
    expect(star).not.toBeNull();
    expect(star!.ppg).toBeGreaterThan(0);
    // Star belongs to the user team.
    expect(team.playerIds).toContain(star!.id);
  });

  it('returns empty before any games are played', () => {
    const fresh = createNewBasketballLeague({ rngSeed: 'editorial-empty' });
    const team = fresh.teams[0] as BasketballTeam;
    expect(byTheNumbers(fresh, team)).toHaveLength(0);
    expect(teamStar(fresh, team)).toBeNull();
  });
});
