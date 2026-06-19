/**
 * BUG-22 — meeting an agent's exact counter must be a deterministic accept.
 *
 * Reported by Tyler 2026-06-17 (Cowork chat) on a Trae Young negotiation:
 * agent countered 3yr · $26.2M/yr · $78.6M total, slider set to identical
 * numbers, "Projected Accept" read 80%, and submitting got re-countered with
 * the same terms instead of closing. Only offering MORE than the displayed
 * counter would finally land the deal.
 *
 * Root cause: `negotiateOffer` rounded the counter perYear to the nearest
 * $100K (`Math.round(...)`). Whenever `targetTotal / years` fell in the lower
 * half of a $100K bucket, the rounded counter total landed below the actual
 * `winBar`, so `userTotal >= winBar` failed even at the displayed match.
 *
 * Fix: round the counter UP (`Math.ceil`) so the counter always totals at
 * least `targetTotal`. Matching the displayed counter then closes the deal.
 *
 * Plus: the `acceptanceProbability` display was capped at 0.99, so a winning
 * offer would read 99% / "Projected Accept" never snapped to 100%, making
 * the deterministic gate look like a probabilistic roll. Snap to 1.0 when
 * `userTotal >= threshold`.
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import {
  freeAgentInfo,
  negotiateOffer,
  acceptanceThreshold,
  acceptanceProbability,
  teamAppeal,
} from '@/../apps/bs-basketball/src/lib/freeAgency';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';
import type { PlayerId } from '@bs/core/adapter';

describe('BUG-22: meeting the agent counter closes the deal deterministically', () => {
  function leagueWithMidPlayerAsFa(seed: string) {
    const base = createNewBasketballLeague({ rngSeed: seed });
    const team = base.teams[0] as BasketballTeam;
    // Pick a mid-OVR player so the threshold sits in a meaningful range
    // (low enough to attract counters, high enough that rounding matters).
    const sorted = [...team.playerIds].sort(
      (a, b) => (base.players[b] as BasketballPlayer).ratings.overall - (base.players[a] as BasketballPlayer).ratings.overall,
    );
    const pid = sorted[3];
    const players = { ...base.players } as Record<string, BasketballPlayer>;
    players[pid] = { ...players[pid], rosterSlot: null, contract: null };
    const teams = base.teams.map(t =>
      t.id !== team.id
        ? t
        : {
            ...t,
            playerIds: t.playerIds.filter(id => id !== pid),
            rosterBuckets: {
              ...t.rosterBuckets,
              active: (t.rosterBuckets.active ?? []).filter(id => id !== pid),
            },
          },
    );
    const league = { ...base, players, teams, freeAgentIds: [...base.freeAgentIds, pid], userTeamId: team.id };
    return { league, team, pid: pid as PlayerId };
  }

  it('an offer that exactly matches the agent counter signs (no infinite re-counter)', () => {
    const { league, pid } = leagueWithMidPlayerAsFa('bug22-counter-match');
    const info = freeAgentInfo(league, pid)!;

    // First offer: deliberately low so the agent counters.
    const lowOffer = {
      years: info.desiredYears,
      salaryPerYear: Math.round(info.marketSalary * 0.7 / 100_000) * 100_000,
    };
    const first = negotiateOffer(league, pid, lowOffer);
    expect(first.kind).toBe('counter');
    if (first.kind !== 'counter') return; // type narrow for TS

    // Match the counter exactly — what the "Meet their ask" button does.
    const matchOffer = { years: first.counter.years, salaryPerYear: first.counter.salaryPerYear };
    const second = negotiateOffer(league, pid, matchOffer);

    expect(
      second.kind,
      `Matching counter ${first.counter.years}yr · $${first.counter.salaryPerYear / 1_000_000}M/yr ` +
        `($${first.counter.total / 1_000_000}M total) should have signed, but got: ${JSON.stringify(second)}`,
    ).toBe('resolved');
    if (second.kind === 'resolved') {
      expect(second.result.outcome).toBe('signed');
    }
  });

  it('acceptanceProbability snaps to 1.0 when the offer crosses the threshold (not 0.99)', () => {
    const { league, pid } = leagueWithMidPlayerAsFa('bug22-prob-snap');
    const info = freeAgentInfo(league, pid)!;
    const appeal = teamAppeal(league, league.userTeamId!);
    const threshold = acceptanceThreshold(info, appeal, 0);

    // Offer exactly at threshold — would have been 0.8 (the buggy 80% display).
    const atThresholdPerYear = Math.ceil(threshold / info.desiredYears / 100_000) * 100_000;
    const atThresholdOffer = { years: info.desiredYears, salaryPerYear: atThresholdPerYear };
    expect(acceptanceProbability(info, atThresholdOffer, 0, appeal)).toBe(1);

    // Offer well above threshold — was clamped at 0.99 before the fix.
    const overOffer = { years: info.desiredYears, salaryPerYear: atThresholdPerYear * 2 };
    expect(acceptanceProbability(info, overOffer, 0, appeal)).toBe(1);

    // Below threshold still reads as < 1 (decay curve preserved).
    const belowOffer = { years: info.desiredYears, salaryPerYear: Math.round(atThresholdPerYear * 0.85) };
    const belowProb = acceptanceProbability(info, belowOffer, 0, appeal);
    expect(belowProb).toBeLessThan(1);
    expect(belowProb).toBeGreaterThan(0);
  });
});
