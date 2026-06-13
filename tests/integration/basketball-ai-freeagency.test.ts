/**
 * AI free agency — CPU teams sign from the pool to fill open roster spots.
 * Bug: "in free agency it doesn't look like any of the teams are signing anyone."
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { runAiFreeAgency, signingBudget, bestCompetingOffer, freeAgentPool, capRoom } from '@/../apps/bs-basketball/src/lib/freeAgency';
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

  it('gives every team a real signing budget — over-cap teams get an exception, not zero', () => {
    const league = createNewBasketballLeague({ rngSeed: 'ai-fa-budget' });
    for (const t of league.teams) {
      const budget = signingBudget(league, t.id);
      // Every team can always offer at least a minimum deal.
      expect(budget).toBeGreaterThan(0);
      // Over-cap teams (the common case) still get a meaningful exception, which
      // is the whole point of BUG-6 — competition used to read "none."
      if (capRoom(league, t.id) <= 0) {
        expect(budget).toBeGreaterThanOrEqual(1_200_000);
      }
    }
  });

  it('surfaces competing interest for a quality free agent even with no cap room', () => {
    const base = createNewBasketballLeague({ rngSeed: 'ai-fa-comp' });
    // Move a strong rostered player into the pool from one team.
    const fromTeam = base.teams[0] as BasketballTeam;
    const starId = [...fromTeam.playerIds].sort(
      (a, b) => (base.players[b] as BasketballPlayer).ratings.overall - (base.players[a] as BasketballPlayer).ratings.overall,
    )[0];
    const players = { ...base.players } as Record<string, BasketballPlayer>;
    players[starId] = { ...players[starId], rosterSlot: null, contract: null };
    const teams = base.teams.map(t =>
      t.id !== fromTeam.id ? t : { ...t, playerIds: t.playerIds.filter(id => id !== starId), rosterBuckets: { ...t.rosterBuckets, active: (t.rosterBuckets.active ?? []).filter(id => id !== starId) } },
    );
    const league = { ...base, players, teams, freeAgentIds: [...base.freeAgentIds, starId], userTeamId: fromTeam.id };

    const info = freeAgentPool(league).find(f => f.player.id === starId)!;
    expect(info).toBeTruthy();
    // BUG-6: a productive free agent draws a rival bid (was always null).
    const competing = bestCompetingOffer(league, info);
    expect(competing).not.toBeNull();
    expect(competing!.teamId).not.toBe(fromTeam.id);
  });

  it('absorbs quality free agents off full rosters so the user can\'t scoop them (BUG-13)', () => {
    const base = createNewBasketballLeague({ rngSeed: 'ai-fa-bug13' });
    // Push several of the league's best players into the FA pool (as happens at a
    // rollover when contracts expire), leaving every AI roster otherwise full.
    const players = { ...base.players } as Record<string, BasketballPlayer>;
    const ranked = Object.values(players)
      .filter(p => p.rosterSlot)
      .sort((a, b) => b.ratings.overall - a.ratings.overall);
    const freed = ranked.slice(0, 8); // 8 strong players hit the market
    const freedIds = new Set(freed.map(p => p.id));
    for (const p of freed) players[p.id] = { ...players[p.id], rosterSlot: null, contract: null };
    const teams = base.teams.map(t => ({
      ...t,
      playerIds: t.playerIds.filter(id => !freedIds.has(id)),
      rosterBuckets: { ...t.rosterBuckets, active: (t.rosterBuckets.active ?? []).filter(id => !freedIds.has(id)) },
    }));
    // No user team — pure league-wide AI free agency (the offseason batch).
    const league = { ...base, players, teams, freeAgentIds: [...base.freeAgentIds, ...freedIds], userTeamId: null };

    const { league: after, signings } = runAiFreeAgency(league, { rounds: 8 });
    expect(signings.length).toBeGreaterThan(0);
    // Most of the strong free agents should have been signed by AI teams — not
    // left sitting in the pool for the user.
    const stillFree = new Set(after.freeAgentIds);
    const signedStars = freed.filter(p => !stillFree.has(p.id)).length;
    expect(signedStars).toBeGreaterThanOrEqual(5);
  });

  it('refills thinned AI rosters with depth and drains the pool, even with no positional need (difficulty fix)', () => {
    const base = createNewBasketballLeague({ rngSeed: 'ai-fa-depth' });
    const players = { ...base.players } as Record<string, BasketballPlayer>;
    const freedIds = new Set<string>();
    // Thin every AI team by waiving its 3 weakest, dumping them into the pool —
    // each team keeps 2-per-position depth, so under the OLD gate (need<2 || 75+)
    // none of these sub-75 depth pieces would ever get re-signed.
    const teams = base.teams.map(t => {
      const weakest = [...t.playerIds]
        .sort((a, b) => (players[a] as BasketballPlayer).ratings.overall - (players[b] as BasketballPlayer).ratings.overall)
        .slice(0, 3);
      for (const id of weakest) { players[id] = { ...players[id], rosterSlot: null, contract: null }; freedIds.add(id); }
      return {
        ...t,
        playerIds: t.playerIds.filter(id => !weakest.includes(id)),
        rosterBuckets: { ...t.rosterBuckets, active: (t.rosterBuckets.active ?? []).filter(id => !weakest.includes(id)) },
      };
    });
    const league = { ...base, players, teams, freeAgentIds: [...base.freeAgentIds, ...freedIds], userTeamId: null };

    const poolBefore = league.freeAgentIds.length;
    const { league: after, signings } = runAiFreeAgency(league, { rounds: 8 });

    // AI teams round out their benches toward a full roster instead of stopping
    // at two-per-position, so the average roster climbs back up.
    const avgRoster = after.teams.reduce((s, t) => s + t.playerIds.length, 0) / after.teams.length;
    expect(avgRoster).toBeGreaterThanOrEqual(13);
    // The depth pool drains rather than lingering for the user to scoop.
    expect(after.freeAgentIds.length).toBeLessThan(poolBefore);
    expect(signings.length).toBeGreaterThanOrEqual(after.teams.length);
  });
});
