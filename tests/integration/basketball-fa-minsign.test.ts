/**
 * Vet-minimum safety valve (BUG-30): a team with an open roster spot can always
 * sign an UNCONTESTED free agent to a one-year minimum — regardless of his market
 * value — so a short-handed team can get back to a legal roster off the available
 * pool. A contested player still won't take the minimum (no star poaching).
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import {
  resolveUserOffer, bestCompetingOffer, freeAgentInfo, LEAGUE_MINIMUM_SALARY,
} from '@/../apps/bs-basketball/src/lib/freeAgency';
import { generateBasketballPlayer, minimumSalary, type BasketballPlayer } from '@bs/sport-basketball';

type League = ReturnType<typeof createNewBasketballLeague>;

/** Open a roster spot on team 0 and make it the user team. */
function openSpotLeague(seed: string): League {
  const base = createNewBasketballLeague({ rngSeed: seed });
  const userTeam = base.teams[0];
  const teams = base.teams.map(t => t.id === userTeam.id ? { ...t, playerIds: t.playerIds.slice(0, -1) } : t);
  return { ...base, teams, userTeamId: userTeam.id } as League;
}

/** Move a rostered player into the free-agent pool. */
function toFreeAgent(league: League, playerId: string, fromTeamId: string): League {
  const players = {
    ...league.players,
    [playerId]: { ...(league.players[playerId] as BasketballPlayer), rosterSlot: null, contract: null },
  };
  const teams = league.teams.map(t => t.id === fromTeamId ? { ...t, playerIds: t.playerIds.filter(id => id !== playerId) } : t);
  return { ...league, players, teams, freeAgentIds: [...league.freeAgentIds, playerId] } as League;
}

describe('vet-minimum signings (BUG-30)', () => {
  it('an open-spot team can sign an uncontested free agent to a vet minimum', () => {
    const open = openSpotLeague('bug30-min');
    const uid = open.userTeamId!;
    // A fresh low-OVR free agent depletes no roster, so no AI team has a need for
    // him — he's genuinely uncontested. (Moving a rostered player would create a
    // hole on his old team, which would then bid for him.)
    const fa = generateBasketballPlayer({ position: 'SG', targetOverall: 58, age: 29 });
    const lg = {
      ...open,
      players: { ...open.players, [fa.id]: { ...fa, rosterSlot: null, contract: null } },
      freeAgentIds: [...open.freeAgentIds, fa.id],
    } as League;

    const info = freeAgentInfo(lg, fa.id)!;
    expect(bestCompetingOffer(lg, info)).toBeNull(); // uncontested

    // Minimums scale with service time — a 29-year-old is a 10-yr vet, so his
    // minimum is $3.87M, not the flat rookie floor.
    const vetMin = minimumSalary(fa.sportData.yearsInLeague);
    const res = resolveUserOffer(lg, fa.id, { years: 1, salaryPerYear: vetMin });
    expect(res.outcome).toBe('signed');
    expect(res.signedTeamId).toBe(uid);
  });

  it('a contested player still will not take a vet minimum (no star poaching)', () => {
    const open = openSpotLeague('bug30-star');
    const uid = open.userTeamId!;
    const star = (Object.values(open.players) as BasketballPlayer[])
      .filter(p => p.rosterSlot && p.rosterSlot.teamId !== uid)
      .sort((a, b) => b.ratings.overall - a.ratings.overall)[0];
    const lg = toFreeAgent(open, star.id, star.rosterSlot!.teamId);

    const info = freeAgentInfo(lg, star.id)!;
    expect(bestCompetingOffer(lg, info)).not.toBeNull(); // contested

    const res = resolveUserOffer(lg, star.id, { years: 1, salaryPerYear: LEAGUE_MINIMUM_SALARY });
    expect(res.outcome).not.toBe('signed'); // the user did not poach him at the minimum
  });
});
