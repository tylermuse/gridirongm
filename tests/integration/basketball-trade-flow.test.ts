/**
 * Phase 2D-6 — Trade flow integration tests.
 *
 * Evaluation comes from the engine; these guard the app wrapper: a fair swap is
 * legal + accepted and executes (rosters swap, slots update, transaction logged),
 * while a lopsided one is rejected and not executable.
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { evaluateTrade, executeTrade, isExecutable } from '@/../apps/bs-basketball/src/lib/trade';
import type { BasketballPlayer } from '@bs/sport-basketball';
import type { PlayerId, TeamId } from '@bs/core/adapter';

function freshLeague() {
  return createNewBasketballLeague({ rngSeed: 'trade-test' });
}

/** Find a player on `teamId` whose OVR is closest to `targetOvr`. */
function playerNearOvr(league: ReturnType<typeof freshLeague>, teamId: TeamId, targetOvr: number) {
  const team = league.teams.find(t => t.id === teamId)!;
  return team.playerIds
    .map(id => league.players[id] as BasketballPlayer)
    .sort((a, b) => Math.abs(a.ratings.overall - targetOvr) - Math.abs(b.ratings.overall - targetOvr))[0];
}

describe('trade evaluation + execution', () => {
  it('accepts and executes a balanced one-for-one swap', () => {
    const league = freshLeague();
    const a = league.teams[0].id;
    const b = league.teams[1].id;
    const aPlayers = league.teams[0].playerIds as PlayerId[];
    const bPlayers = league.teams[1].playerIds as PlayerId[];

    // Find any 1-for-1 swap BOTH AIs accept (similar value exists across rosters).
    // Search on allAccept (not isExecutable, which only gates the CPU partner) so
    // the found pair is mutually fair — otherwise the search could land on a
    // partner-accepts-but-user-rejects pair and the allAccept assertion below
    // would spuriously fail depending on global RNG ordering.
    let sides: { teamId: TeamId; playerIds: PlayerId[] }[] | null = null;
    let pa: PlayerId | null = null;
    let pb: PlayerId | null = null;
    outer: for (const ida of aPlayers) {
      for (const idb of bPlayers) {
        const candidate = [
          { teamId: a, playerIds: [ida] },
          { teamId: b, playerIds: [idb] },
        ];
        const ev = evaluateTrade(league, candidate);
        if (ev.legal && ev.allAccept && isExecutable(ev, candidate)) {
          sides = candidate; pa = ida; pb = idb;
          break outer;
        }
      }
    }
    expect(sides).toBeTruthy();

    const evalr = evaluateTrade(league, sides!);
    expect(evalr.legal).toBe(true);
    expect(evalr.allAccept).toBe(true);
    expect(evalr.perTeam).toHaveLength(2);

    const after = executeTrade(league, sides!);
    // Players swapped teams.
    expect((after.players[pa!] as BasketballPlayer).rosterSlot?.teamId).toBe(b);
    expect((after.players[pb!] as BasketballPlayer).rosterSlot?.teamId).toBe(a);
    expect(after.teams.find(t => t.id === b)!.playerIds).toContain(pa);
    expect(after.teams.find(t => t.id === a)!.playerIds).toContain(pb);
    expect(after.teams.find(t => t.id === a)!.playerIds).not.toContain(pa);
    // Roster sizes unchanged.
    expect(after.teams.find(t => t.id === a)!.playerIds.length).toBe(league.teams[0].playerIds.length);
    // Transaction logged.
    const txns = (after.sportData as { transactions?: unknown[] }).transactions ?? [];
    expect(txns.length).toBe(1);
  });

  it('rejects a lopsided deal where the CPU partner would hemorrhage value', () => {
    const league = freshLeague();
    const a = league.teams[0].id; // sides[0] is the user
    const b = league.teams[1].id; // the CPU partner
    // The user (A) tries to rob the CPU (B): sends a scrub, wants B's star. Only
    // the partner's acceptance gates executability (BUG-36 — the user is allowed
    // to overpay themselves), so a deal that guts the PARTNER must not execute.
    const scrub = playerNearOvr(league, a, 60);  // a weak player the user has
    const star = playerNearOvr(league, b, 99);   // the CPU's best player
    const sides = [
      { teamId: a, playerIds: [scrub.id] as PlayerId[] },
      { teamId: b, playerIds: [star.id] as PlayerId[] },
    ];

    const evalr = evaluateTrade(league, sides);
    // Team B hemorrhages value → its AI rejects → the deal isn't executable.
    const bOutcome = evalr.perTeam.find(t => t.teamId === b)!;
    expect(bOutcome.willAccept).toBe(false);
    expect(evalr.allAccept).toBe(false);
    expect(isExecutable(evalr, sides)).toBe(false);
  });

  it('is not executable with an empty side', () => {
    const league = freshLeague();
    const a = league.teams[0].id;
    const b = league.teams[1].id;
    const pa = playerNearOvr(league, a, 72);
    const sides = [
      { teamId: a, playerIds: [pa.id] as PlayerId[] },
      { teamId: b, playerIds: [] as PlayerId[] },
    ];
    const evalr = evaluateTrade(league, sides);
    expect(isExecutable(evalr, sides)).toBe(false);
  });
});
