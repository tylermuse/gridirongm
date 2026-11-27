/**
 * Draft pick trade values (the "~N" next to every pick on the Trades page, and
 * what the AI weighs picks at).
 *
 * The chart used to be one exponential, 3000 * e^(-0.065 * (n - 1)). That kept
 * pick #1 at 1.8x pick #10, but it collapsed everything after round 1: #64 ≈ 50,
 * #96 ≈ 6, #128 ≈ 1 and rounds 5-7 ≈ 0, so a whole year of day-3 picks was
 * worth less than a 59 OVR backup. Player values are tuned so that "50s max at
 * a 5th-rounder, 60s max at a 3rd-rounder".
 */

import { describe, expect, it } from 'vitest';
import { pickTradeValue, playerTradeValue } from '@/lib/engine/store';
import type { DraftPick, Player, Position } from '@/types';
import { makeFixtureTeams } from '../integration/_helpers';

/** 224 picks in draft order, so pickTradeValue reads the exact overall slot. */
const order = Array.from({ length: 224 }, (_, i) => `pick-${i + 1}`);
const pickAt = (overall: number): DraftPick => ({
  id: `pick-${overall}`,
  year: 2029,
  round: Math.ceil(overall / 32),
  originalTeamId: 'team-0',
  ownerTeamId: 'team-0',
});
const value = (overall: number) => pickTradeValue(pickAt(overall), [], order);

function player(position: Position, overall: number, age: number, yearsLeft = 3): Player {
  return {
    id: `p-${position}-${overall}-${age}`,
    position,
    age,
    potential: overall,
    ratings: { overall },
    contract: { salary: 2, yearsLeft, guaranteed: 1, totalYears: yearsLeft },
  } as unknown as Player;
}

describe('draft pick value chart', () => {
  it('keeps round 1 steep: #1 is 3000 and about 1.8x pick #10', () => {
    expect(value(1)).toBe(3000);
    expect(value(1) / value(10)).toBeGreaterThanOrEqual(1.75);
    expect(value(10)).toBeGreaterThan(value(32) * 2.5);
  });

  it('falls with every pick, from #1 to #224', () => {
    for (let n = 2; n <= 224; n++) expect(value(n)).toBeLessThanOrEqual(value(n - 1));
    expect(value(224)).toBeLessThan(value(193));
  });

  it('later rounds keep real value (roughly the Jimmy Johnson chart)', () => {
    expect(value(32)).toBeGreaterThanOrEqual(450);   // end of round 1
    expect(value(64)).toBeGreaterThanOrEqual(150);   // end of round 2
    expect(value(96)).toBeGreaterThanOrEqual(75);    // end of round 3
    expect(value(128)).toBeGreaterThanOrEqual(35);   // end of round 4
    expect(value(160)).toBeGreaterThanOrEqual(20);   // end of round 5
    expect(value(224)).toBeGreaterThanOrEqual(5);    // last pick
    // ...without a late 1st catching up to the top of the draft.
    expect(value(32)).toBeLessThan(value(1) / 4);
  });

  it('lines up with player values: 50s around a 5th, 60s around a 3rd', () => {
    // 59 OVR backup ≈ a 5th-rounder, not more than a 4th.
    const backup = playerTradeValue(player('LB', 59, 28));
    expect(backup).toBeGreaterThanOrEqual(value(160));
    expect(backup).toBeLessThan(value(112));
    // A 3rd-rounder buys a depth starter in his low 60s (the reported case:
    // 61-62 OVR receivers on the Trades page), not a 70+ OVR starter.
    expect(value(96)).toBeGreaterThanOrEqual(playerTradeValue(player('WR', 61, 27)));
    expect(value(65)).toBeLessThan(playerTradeValue(player('WR', 70, 26)));
  });

  it('estimates the slot from the record when the draft order is not set yet', () => {
    const teams = makeFixtureTeams(32);
    // team-0 has the best record in its division (13 wins), so its picks land
    // late in each round; its future 3rd-rounder must not read as ~0.
    const thirdRounder: DraftPick = { id: 'future-r3', year: 2030, round: 3, originalTeamId: 'team-0', ownerTeamId: 'team-0' };
    expect(pickTradeValue(thirdRounder, teams)).toBeGreaterThanOrEqual(75);
    const seventh: DraftPick = { ...thirdRounder, id: 'future-r7', round: 7 };
    expect(pickTradeValue(seventh, teams)).toBeGreaterThan(0);
  });
});
