/**
 * Re-sign negotiation variance (daily spec §1.3).
 *
 * A strong offer to a CONTENT player used to be a deterministic lock (accept
 * chance 1.0 + a "pay at/above asking → always accept" override). That killed
 * the drama of negotiation. Now a content player accepts ~92% of the time and
 * otherwise holds out for a small sweetener (never walks at ≥95% satisfaction),
 * while unhappy/angry players still re-sign for certain if you pay their price.
 */

import { describe, it, expect } from 'vitest';
import { processOffer, type NegotiationState } from '@/lib/engine/negotiation';

function state(overrides: Partial<NegotiationState> = {}): NegotiationState {
  return {
    playerId: 'p1',
    playerName: 'Test Player',
    position: 'QB',
    playerOverall: 82,
    playerAge: 27,
    playerMood: 70, // content
    askingSalary: 10,
    askingYears: 3,
    currentOfferSalary: 0,
    currentOfferYears: 0,
    round: 0,
    maxRounds: 5,
    patience: 100,
    messages: [],
    outcome: 'pending',
    ...overrides,
  };
}

describe('negotiation variance — content players (§1.3)', () => {
  it('a strong offer is very likely but NOT a guaranteed lock, and they never walk', () => {
    // $1M over asking, full term → satisfaction ~1.07 (≥ 0.95).
    let accepted = 0;
    let held = 0;
    let walked = 0;
    const N = 600;
    for (let i = 0; i < N; i++) {
      const r = processOffer(state(), 11, 3);
      if (r.outcome === 'accepted') accepted++;
      else if (r.outcome === 'rejected') walked++;
      else held++;
    }
    expect(walked).toBe(0); // content players don't walk at ≥95% satisfaction
    expect(held).toBeGreaterThan(0); // some hold out — no longer deterministic
    expect(accepted / N).toBeGreaterThan(0.83);
    expect(accepted / N).toBeLessThan(0.99);
  });

  it('the hold-out is a SMALL sweetener (a bit more term or ≤$0.6M), not a walk', () => {
    const holds: NegotiationState[] = [];
    for (let i = 0; i < 800 && holds.length < 6; i++) {
      const r = processOffer(state(), 11, 3); // offered term == asking term → salary-bump path
      if (r.outcome === 'pending') holds.push(r);
    }
    expect(holds.length).toBeGreaterThan(0);
    for (const h of holds) {
      const yearBump = h.askingYears > 3;
      const smallSalaryBump = h.askingSalary > 11 && h.askingSalary <= 11.6;
      expect(yearBump || smallSalaryBump).toBe(true);
    }
  });
});

describe('overpay lever preserved (§1.3)', () => {
  it('paying at/above asking still always re-signs an UNHAPPY player', () => {
    let accepted = 0;
    const N = 200;
    for (let i = 0; i < N; i++) {
      const r = processOffer(state({ playerMood: 40 }), 11, 3); // unhappy, at/above asking
      if (r.outcome === 'accepted') accepted++;
    }
    expect(accepted).toBe(N);
  });

  it('an angry player paid at/above asking still re-signs (no round-0 refusal escape)', () => {
    // Angry round-0 refusal has a 30% chance BEFORE the satisfaction block, so
    // it's not 100%, but among those who get past it, the overpay lock holds.
    let accepted = 0;
    let refusedEarly = 0;
    const N = 300;
    for (let i = 0; i < N; i++) {
      const r = processOffer(state({ playerMood: 20 }), 11, 3);
      if (r.outcome === 'accepted') accepted++;
      else if (r.outcome === 'rejected') refusedEarly++;
    }
    // Everyone who isn't an early hard-refusal accepts (overpay lock); no counters.
    expect(accepted + refusedEarly).toBe(N);
    expect(accepted).toBeGreaterThan(0);
  });
});
