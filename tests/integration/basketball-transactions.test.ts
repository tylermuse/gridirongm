/**
 * Phase 2E-3 — Transaction log integration tests.
 *
 * Every roster move appends a newest-first entry tagged with the teams involved:
 * trades, FA signings, releases, and draft picks.
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import {
  initializePlayoffs, simPlayoffDay, getBracket, isRegularSeasonComplete,
} from '@/../apps/bs-basketball/src/lib/playoffs';
import { enterOffseason } from '@/../apps/bs-basketball/src/lib/season';
import { autoPickCurrent } from '@/../apps/bs-basketball/src/lib/draft';
import { executeTrade } from '@/../apps/bs-basketball/src/lib/trade';
import { resolveUserOffer, releasePlayer, freeAgentPool } from '@/../apps/bs-basketball/src/lib/freeAgency';
import { getTransactions } from '@/../apps/bs-basketball/src/lib/transactions';
import type { BasketballPlayer } from '@bs/sport-basketball';
import type { PlayerId } from '@bs/core/adapter';

describe('transaction log', () => {
  it('logs a trade with both teams', () => {
    const league = createNewBasketballLeague({ rngSeed: 'txn-trade' });
    const a = league.teams[0];
    const b = league.teams[1];
    const sides = [
      { teamId: a.id, playerIds: [a.playerIds[0]] as PlayerId[] },
      { teamId: b.id, playerIds: [b.playerIds[0]] as PlayerId[] },
    ];
    const after = executeTrade(league, sides);
    const txns = getTransactions(after);
    expect(txns).toHaveLength(1);
    expect(txns[0].kind).toBe('trade');
    expect(txns[0].teamIds).toEqual(expect.arrayContaining([a.id, b.id]));
  });

  it('logs a draft pick', () => {
    let league = createNewBasketballLeague({ rngSeed: 'txn-draft' });
    // Get to a completed season so a draft exists.
    let g = 0;
    while (!isRegularSeasonComplete(league) && g++ < 400) { const r = simNextDay(league); if (!r) break; league = r.league; }
    league = initializePlayoffs(league); g = 0;
    while (!getBracket(league)!.complete && g++ < 200) { const r = simPlayoffDay(league); if (!r) break; league = r.league; }
    league = enterOffseason(league);
    const before = getTransactions(league).length;
    league = autoPickCurrent(league);
    const txns = getTransactions(league);
    expect(txns.length).toBe(before + 1);
    expect(txns[0].kind).toBe('draft');
  });

  it('logs signings and releases newest-first', () => {
    let league = createNewBasketballLeague({ rngSeed: 'txn-fa' });
    const team = league.teams[0];
    league = { ...league, userTeamId: team.id };
    // Open a roster spot (logs a release), then sign a FA (logs a signing).
    const worst = [...team.playerIds].sort(
      (x, y) => (league.players[x] as BasketballPlayer).ratings.overall - (league.players[y] as BasketballPlayer).ratings.overall,
    )[0] as PlayerId;
    league = releasePlayer(league, worst);
    expect(getTransactions(league)[0].kind).toBe('release');

    const target = freeAgentPool(league)[0];
    const res = resolveUserOffer(league, target.player.id, {
      years: Math.max(1, target.desiredYears),
      salaryPerYear: target.marketSalary * 3,
    });
    expect(res.outcome).toBe('signed');
    const txns = getTransactions(res.league);
    // Newest first: signing on top, release beneath.
    expect(txns[0].kind).toBe('signing');
    expect(txns[1].kind).toBe('release');
    expect(txns[0].teamIds).toContain(team.id);
  });
});
