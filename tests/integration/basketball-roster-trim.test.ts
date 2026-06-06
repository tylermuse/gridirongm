/**
 * Roster trim values upside, not just current overall — so a freshly-drafted
 * raw rookie (low OVR, high potential) isn't auto-waived to free agency. Bug:
 * "the players I draft aren't on my roster."
 */

import { describe, it, expect } from 'vitest';
import { selectRosterWaivers, keepValueOf } from '@/../apps/bs-basketball/src/lib/season/advanceSeason';
import type { BasketballPosition } from '@bs/sport-basketball';

const POS_FLOOR: Record<BasketballPosition, number> = { PG: 2, SG: 2, SF: 2, PF: 2, C: 2 };

// 16-man roster: a raw stud rookie + a fringe vet share PG (4 PGs, so a cut
// there stays above the floor); the rest are solid role players.
const ROSTER: Record<string, { overall: number; potential: number; pos: BasketballPosition }> = {
  rookie: { overall: 55, potential: 88, pos: 'PG' }, // keepValue 79
  vet:    { overall: 60, potential: 60, pos: 'PG' }, // keepValue 60  ← weakest
  pg3:    { overall: 74, potential: 74, pos: 'PG' },
  pg4:    { overall: 73, potential: 73, pos: 'PG' },
  sg1: { overall: 75, potential: 75, pos: 'SG' }, sg2: { overall: 72, potential: 72, pos: 'SG' }, sg3: { overall: 70, potential: 70, pos: 'SG' },
  sf1: { overall: 76, potential: 76, pos: 'SF' }, sf2: { overall: 71, potential: 71, pos: 'SF' }, sf3: { overall: 70, potential: 70, pos: 'SF' },
  pf1: { overall: 77, potential: 77, pos: 'PF' }, pf2: { overall: 72, potential: 72, pos: 'PF' }, pf3: { overall: 70, potential: 70, pos: 'PF' },
  c1:  { overall: 78, potential: 78, pos: 'C' },  c2:  { overall: 71, potential: 71, pos: 'C' },  c3:  { overall: 70, potential: 70, pos: 'C' },
};
const ids = Object.keys(ROSTER);
const position = (id: string) => ROSTER[id].pos;

describe('selectRosterWaivers', () => {
  it('keepValueOf values potential over a raw overall', () => {
    expect(keepValueOf(55, 88)).toBe(79); // rookie: round(88*0.9)=79 > 55
    expect(keepValueOf(60, 60)).toBe(60); // vet: no upside
  });

  it('keeps the high-upside rookie and waives the fringe vet', () => {
    const waived = selectRosterWaivers(ids, {
      value: id => keepValueOf(ROSTER[id].overall, ROSTER[id].potential),
      position, target: 15, posFloor: POS_FLOOR,
    });
    expect(waived.size).toBe(1);
    expect(waived.has('vet')).toBe(true);
    expect(waived.has('rookie')).toBe(false);
  });

  it('regression: an overall-only trim would have waived the rookie instead', () => {
    const waived = selectRosterWaivers(ids, {
      value: id => ROSTER[id].overall, // the old (buggy) behavior
      position, target: 15, posFloor: POS_FLOOR,
    });
    expect(waived.has('rookie')).toBe(true); // 55 OVR was the first cut
  });
});
