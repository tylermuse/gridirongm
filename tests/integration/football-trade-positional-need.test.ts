/**
 * Trade positional-need multiplier (§1.4, yo46363).
 *
 * A team stacked at a position values it less; a team in need values it more —
 * so the Dolphins (deep at LB) and the Rams (thin at LB) no longer value the same
 * linebacker identically.
 */

import { describe, it, expect } from 'vitest';
import { positionalNeedMultiplier, playerTradeValueForTeam, playerTradeValue } from '@/lib/engine/store';
import type { Player, Team } from '@/types';

function P(id: string, position: string, overall: number): Player {
  return {
    id,
    position,
    subPosition: position,
    age: 26,
    potential: overall,
    ratings: { overall },
    contract: { yearsLeft: 3 },
  } as unknown as Player;
}
function T(id: string, roster: string[]): Team {
  return { id, roster } as unknown as Team;
}

// Four teams, descending LB strength: A stacked (85/84), D thin (60).
const players = [
  P('a1', 'LB', 85), P('a2', 'LB', 84),
  P('b1', 'LB', 75),
  P('c1', 'LB', 70),
  P('d1', 'LB', 60),
];
const byId = new Map(players.map(p => [p.id, p]));
const teams = [T('A', ['a1', 'a2']), T('B', ['b1']), T('C', ['c1']), T('D', ['d1'])];
const [A, , , D] = teams;

describe('positionalNeedMultiplier', () => {
  it('is lower for a stacked team and higher for a needy team', () => {
    const stacked = positionalNeedMultiplier(A, 'LB', teams, byId);
    const needy = positionalNeedMultiplier(D, 'LB', teams, byId);
    expect(stacked).toBeCloseTo(0.85, 2);
    expect(needy).toBeCloseTo(1.25, 2);
    expect(stacked).toBeLessThan(needy);
  });

  it('makes a needy team value a linebacker more than a stacked one', () => {
    const lb = P('trade-lb', 'LB', 80);
    const base = playerTradeValue(lb);
    const forNeedy = playerTradeValueForTeam(lb, D, teams, byId);
    const forStacked = playerTradeValueForTeam(lb, A, teams, byId);
    expect(forNeedy).toBeGreaterThan(forStacked);
    expect(forNeedy).toBeGreaterThan(base); // needy pays a premium
    expect(forStacked).toBeLessThan(base); // stacked discounts
  });
});
