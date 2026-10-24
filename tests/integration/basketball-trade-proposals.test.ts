/**
 * AI-initiated trade proposals (persisted inbox): generated during regular-season
 * sim days, capped, expiring, closed after the deadline; accept executes a real
 * cap-legal trade, decline marks it, and a counter yields either acceptance or
 * exactly one AI counteroffer.
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import { TRADE_DEADLINE_DAY } from '@/../apps/bs-basketball/src/lib/sim/simRange';
import { getTransactions } from '@/../apps/bs-basketball/src/lib/transactions';
import {
  getTradeProposals,
  getPendingProposals,
  acceptTradeProposal,
  declineTradeProposal,
  counterTradeProposal,
  proposalToDeal,
  refreshTradeProposals,
  MAX_PENDING_PROPOSALS,
  PROPOSAL_TTL_DAYS,
  type TradeProposal,
} from '@/../apps/bs-basketball/src/lib/trade/proposals';
import { evaluateTrade as evalTrade } from '@/../apps/bs-basketball/src/lib/trade';
import type { PlayerId, TeamId } from '@bs/core/adapter';

type League = ReturnType<typeof createNewBasketballLeague>;

function simDays(league: League, days: number, onDay?: (l: League) => void): League {
  let l = league;
  for (let i = 0; i < days; i++) {
    const r = simNextDay(l);
    if (!r) break;
    l = r.league;
    onDay?.(l);
  }
  return l;
}

function base(): League {
  const l = createNewBasketballLeague({ rngSeed: 'proposals' });
  return { ...l, userTeamId: l.teams[0].id };
}

describe('AI trade proposals', () => {
  let maxPending = 0;
  const league60 = simDays(base(), 60, l => {
    maxPending = Math.max(maxPending, getPendingProposals(l).length);
  });
  const all = getTradeProposals(league60);

  it('generates proposals during the regular season, capped', () => {
    expect(all.length).toBeGreaterThan(0);
    expect(maxPending).toBeLessThanOrEqual(MAX_PENDING_PROPOSALS);
    for (const p of all) {
      expect(p.fromTeamId).not.toBe(league60.userTeamId);
      expect(p.expiresDay - p.createdDay).toBeLessThanOrEqual(PROPOSAL_TTL_DAYS);
      expect(p.aiWants.playerIds.length + p.aiWants.pickIds.length).toBeGreaterThan(0);
      expect(p.aiGives.playerIds.length + p.aiGives.pickIds.length).toBeGreaterThan(0);
      expect(p.rationale.length).toBeGreaterThan(0);
    }
  });

  it('expires stale proposals', () => {
    const day = league60.currentTick;
    expect(all.some(p => p.status === 'expired')).toBe(true);
    for (const p of all) {
      if (p.status === 'pending') expect(p.expiresDay).toBeGreaterThanOrEqual(day);
    }
  });

  it('never generates after the trade deadline', () => {
    // Jump the calendar past the deadline and keep simming.
    let l = league60;
    while (l.currentTick <= TRADE_DEADLINE_DAY) {
      const r = simNextDay(l);
      if (!r) break;
      l = r.league;
    }
    l = simDays(l, 10);
    const props = getTradeProposals(l);
    expect(props.every(p => p.createdDay <= TRADE_DEADLINE_DAY)).toBe(true);
    expect(getPendingProposals(l)).toHaveLength(0);
    // And the daily refresh is a no-op for spectators.
    const spect = { ...l, userTeamId: null };
    expect(refreshTradeProposals(spect)).toBe(spect);
  });

  it('is deterministic for the same save', () => {
    const start = base();
    const a = getTradeProposals(simDays(start, 40));
    const b = getTradeProposals(simDays(start, 40));
    expect(a.map(p => p.id)).toEqual(b.map(p => p.id));
  });

  /** Latest league state (in the 60-day run) that has a pending proposal. */
  function withPending(): { league: League; prop: TradeProposal } {
    let found: { league: League; prop: TradeProposal } | null = null;
    simDays(base(), 60, l => {
      if (!found) {
        const p = getPendingProposals(l)[0];
        if (p) found = { league: l, prop: p };
      }
    });
    expect(found).toBeTruthy();
    return found!;
  }

  it('accepting executes a valid, cap-legal trade', () => {
    const { league, prop } = withPending();
    const uid = league.userTeamId!;
    const d = proposalToDeal(prop);
    const sides = [
      { teamId: uid, playerIds: d.giveIds as PlayerId[], pickIds: d.givePickIds ?? [] },
      { teamId: prop.fromTeamId as TeamId, playerIds: d.getIds as PlayerId[], pickIds: d.getPickIds ?? [] },
    ];
    expect(evalTrade(league, sides).legal).toBe(true);
    const txBefore = getTransactions(league).filter(t => t.kind === 'trade').length;

    const res = acceptTradeProposal(league, prop.id);
    expect(res.ok).toBe(true);
    const user = res.league.teams.find(t => t.id === uid)!;
    const ai = res.league.teams.find(t => t.id === prop.fromTeamId)!;
    for (const id of prop.aiGives.playerIds) expect(user.playerIds).toContain(id);
    for (const id of prop.aiWants.playerIds) expect(ai.playerIds).toContain(id);
    for (const id of prop.aiGives.playerIds) expect(res.league.players[id].rosterSlot?.teamId).toBe(uid);
    expect(getTransactions(res.league).filter(t => t.kind === 'trade').length).toBe(txBefore + 1);
    expect(getTradeProposals(res.league).find(p => p.id === prop.id)!.status).toBe('accepted');
    // Accepting twice is a no-op.
    expect(acceptTradeProposal(res.league, prop.id).ok).toBe(false);
  });

  it('declining marks the proposal', () => {
    const { league, prop } = withPending();
    const res = declineTradeProposal(league, prop.id);
    expect(res.ok).toBe(true);
    expect(getTradeProposals(res.league).find(p => p.id === prop.id)!.status).toBe('declined');
    expect(res.league.teams).toBe(league.teams);
  });

  it('a counter yields acceptance or exactly one counteroffer', () => {
    const { league, prop } = withPending();
    const uid = league.userTeamId!;
    const d = proposalToDeal(prop);
    // Greedy edit: ask them to throw in their cheapest extra player too.
    const ai = league.teams.find(t => t.id === prop.fromTeamId)!;
    const extra = ai.playerIds
      .filter(id => !d.getIds.includes(id))
      .map(id => league.players[id])
      .sort((a, b) => a.ratings.overall - b.ratings.overall)[0];
    const edited = { ...d, getIds: [...d.getIds, extra.id] };
    const res = counterTradeProposal(league, prop.id, edited);
    if (res.outcome === 'rejected') {
      // Illegal edit (salary matching) leaves the original untouched OR AI walked away.
      const st = getTradeProposals(res.league).find(p => p.id === prop.id)!.status;
      expect(['pending', 'declined']).toContain(st);
      return;
    }
    expect(['accepted', 'countered']).toContain(res.outcome);
    const orig = getTradeProposals(res.league).find(p => p.id === prop.id)!;
    if (res.outcome === 'accepted') {
      expect(orig.status).toBe('accepted');
      expect(res.league.teams.find(t => t.id === uid)!.playerIds).toContain(extra.id);
    } else {
      expect(orig.status).toBe('countered');
      const counters = getTradeProposals(res.league).filter(p => p.counterOf === prop.id);
      expect(counters).toHaveLength(1);
      const c = counters[0];
      expect(c.status).toBe('pending');
      // The AI's counter is one it would accept — accepting executes.
      const acc = acceptTradeProposal(res.league, c.id);
      expect(acc.ok).toBe(true);
      // And a counter can't be re-countered.
      expect(counterTradeProposal(res.league, c.id, proposalToDeal(c)).ok).toBe(false);
    }
  });

  it('a counter the AI values is accepted outright', () => {
    const { league, prop } = withPending();
    // Re-submitting their own package (minus nothing) is acceptable to them.
    const res = counterTradeProposal(league, prop.id, proposalToDeal(prop));
    expect(res.outcome).toBe('accepted');
  });

  it('old saves without the field load and tick fine', () => {
    const l = base();
    const sd = { ...(l.sportData as Record<string, unknown>) };
    delete sd.tradeProposals;
    const r = simNextDay({ ...l, sportData: sd });
    expect(r).toBeTruthy();
    expect(Array.isArray(getTradeProposals(r!.league))).toBe(true);
  });
});
