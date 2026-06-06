/**
 * AI free agency — CPU teams sign from the pool to fill open roster spots.
 * Bug: "in free agency it doesn't look like any of the teams are signing anyone."
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { runAiFreeAgency } from '@/../apps/bs-basketball/src/lib/freeAgency';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';

describe('runAiFreeAgency', () => {
  it('fills open roster spots from the free-agent pool (and never touches the user team)', () => {
    const base = createNewBasketballLeague({ rngSeed: 'ai-fa' });
    const aiTeam = base.teams[0] as BasketballTeam;
    const userTeam = base.teams[1] as BasketballTeam;

    // Open two spots on an AI team and one on the user team, dropping those
    // players into the pool.
    const aiDrop = aiTeam.playerIds.slice(-2);
    const userDrop = userTeam.playerIds.slice(-1);
    const dropped = [...aiDrop, ...userDrop];
    const players = { ...base.players } as Record<string, BasketballPlayer>;
    for (const id of dropped) players[id] = { ...players[id], rosterSlot: null, contract: null };
    const teams = base.teams.map(t => {
      if (t.id !== aiTeam.id && t.id !== userTeam.id) return t;
      const drop = t.id === aiTeam.id ? aiDrop : userDrop;
      return { ...t, playerIds: t.playerIds.filter(id => !drop.includes(id)), rosterBuckets: { ...t.rosterBuckets, active: (t.rosterBuckets.active ?? []).filter(id => !drop.includes(id)) } };
    });
    const league = { ...base, players, teams, freeAgentIds: [...base.freeAgentIds, ...dropped], userTeamId: userTeam.id };

    const { league: after, signings } = runAiFreeAgency(league);

    // CPU teams actively sign free agents (the bug: nobody was signing).
    expect(signings.length).toBeGreaterThan(0);

    // The user team was never auto-signed for.
    expect(signings.every(s => s.teamId !== userTeam.id)).toBe(true);
    const userAfter = after.teams.find(t => t.id === userTeam.id)!;
    expect(userAfter.playerIds.length).toBe(userTeam.playerIds.length - 1); // still down its dropped player
  });
});
