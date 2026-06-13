import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { freeAgentInfo, resolveUserOffer, acceptanceThreshold, teamAppeal } from '@/../apps/bs-basketball/src/lib/freeAgency';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';

describe("FA acceptance gate (BUG-18)", () => {
  it('rejects a lowball but accepts a market offer', () => {
    const base = createNewBasketballLeague({ rngSeed: 'bug18' });
    const team = base.teams[0] as BasketballTeam;
    // Move a mid player to FA.
    const pid = [...team.playerIds].sort((a, b) => (base.players[b] as BasketballPlayer).ratings.overall - (base.players[a] as BasketballPlayer).ratings.overall)[3];
    const players = { ...base.players } as Record<string, BasketballPlayer>;
    players[pid] = { ...players[pid], rosterSlot: null, contract: null };
    const teams = base.teams.map(t => t.id !== team.id ? t : { ...t, playerIds: t.playerIds.filter(id => id !== pid), rosterBuckets: { ...t.rosterBuckets, active: (t.rosterBuckets.active ?? []).filter(id => id !== pid) } });
    const league = { ...base, players, teams, freeAgentIds: [...base.freeAgentIds, pid], userTeamId: team.id };

    const info = freeAgentInfo(league, pid as never)!;
    const market = info.marketSalary;
    const appeal = teamAppeal(league, team.id);
    const threshold = acceptanceThreshold(info, appeal, 0);
    console.log(`market=${market}/yr × ${info.desiredYears}y; appeal=${appeal.toFixed(2)}; threshold total=${threshold}`);

    // Lowball: 60% of market/yr.
    const low = resolveUserOffer(league, pid as never, { years: info.desiredYears, salaryPerYear: Math.round(market * 0.6) });
    console.log(`lowball (60%): ${low.outcome} — ${low.message}`);
    // The lowball must NOT land the player with the user (he rejects or signs elsewhere).
    expect(low.outcome).not.toBe('signed');

    // Market+: 105% of market/yr.
    const fair = resolveUserOffer(league, pid as never, { years: info.desiredYears, salaryPerYear: Math.round(market * 1.05) });
    console.log(`market+ (105%): ${fair.outcome}`);
    expect(fair.outcome).toBe('signed');
  });
});
