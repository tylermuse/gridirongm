/**
 * Free-agency negotiation (parity 2.2): a fair-but-short offer draws a counter;
 * a strong offer signs; an insulting one is brushed off.
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { freeAgentInfo, negotiateOffer, releasePlayer } from '@/../apps/bs-basketball/src/lib/freeAgency';
import type { PlayerId, TeamId } from '@bs/core/adapter';

function setup() {
  let league = createNewBasketballLeague({ rngSeed: 'fa-negotiation' });
  const userTeam = league.teams[0];
  const otherTeam = league.teams[1];
  // Make room on the user roster, and waive a target into free agency.
  league = releasePlayer(league, userTeam.playerIds[userTeam.playerIds.length - 1] as PlayerId);
  const targetId = otherTeam.playerIds[0] as PlayerId;
  league = releasePlayer(league, targetId);
  league = { ...league, userTeamId: userTeam.id as TeamId };
  const info = freeAgentInfo(league, targetId)!;
  return { league, targetId, info };
}

describe('negotiateOffer', () => {
  it('counters a fair-but-short offer instead of losing the player', () => {
    const { league, targetId, info } = setup();
    const neg = negotiateOffer(league, targetId, {
      years: info.desiredYears,
      salaryPerYear: Math.round(info.marketSalary * 0.6),
    });
    expect(neg.kind).toBe('counter');
    if (neg.kind === 'counter') {
      expect(neg.counter.salaryPerYear).toBeGreaterThan(info.marketSalary * 0.6);
      expect(neg.counter.message).toMatch(/counter/i);
    }
  });

  it('signs a strong offer outright', () => {
    const { league, targetId, info } = setup();
    const neg = negotiateOffer(league, targetId, {
      years: info.desiredYears,
      salaryPerYear: Math.round(info.marketSalary * 2),
    });
    expect(neg.kind).toBe('resolved');
    if (neg.kind === 'resolved') expect(neg.result.outcome).toBe('signed');
  });

  it("won't engage an insulting offer", () => {
    const { league, targetId, info } = setup();
    const neg = negotiateOffer(league, targetId, {
      years: info.desiredYears,
      salaryPerYear: Math.round(info.marketSalary * 0.2),
    });
    expect(neg.kind).toBe('resolved');
    if (neg.kind === 'resolved') expect(neg.result.outcome).toBe('rejected');
  });
});
