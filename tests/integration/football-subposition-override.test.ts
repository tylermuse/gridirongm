import { describe, it, expect } from 'vitest';
import {
  isValidSubPositionForPosition,
  backfillTeamSubPositions,
  classifyTeamSubPositions,
} from '@/types';

/**
 * §1.2 — manual sub-position pin (OT↔OG). subPosition is normally
 * ratings-derived and re-backfilled on every load/roster mutation, so the
 * regression we guard against is the pin getting clobbered. These cover the
 * pure classify/backfill layer the store action drives.
 */

type Roster = Parameters<typeof backfillTeamSubPositions>[0];

const ratings = (o: Partial<Record<string, number>> = {}) => ({
  passRush: 40, speed: 40, tackling: 40, coverage: 40,
  strength: 60, agility: 40, blocking: 60, awareness: 50, ...o,
});

// Five OL with distinct athleticism so classification is deterministic:
// a,b are the most athletic (→ OT), c is the smart interior pivot (→ C),
// d,e are interior bodies (→ OG).
const mkOL = (): Roster => ([
  { id: 'a', position: 'OL', ratings: ratings({ agility: 80, speed: 70, blocking: 70 }) },
  { id: 'b', position: 'OL', ratings: ratings({ agility: 78, speed: 68, blocking: 70 }) },
  { id: 'c', position: 'OL', ratings: ratings({ agility: 30, speed: 30, blocking: 80, awareness: 90 }) },
  { id: 'd', position: 'OL', ratings: ratings({ agility: 35, speed: 35, blocking: 65, awareness: 55 }) },
  { id: 'e', position: 'OL', ratings: ratings({ agility: 36, speed: 34, blocking: 64, awareness: 52 }) },
]);

describe('subPositionOverride', () => {
  it('only allows sub-positions inside the broad-position cluster', () => {
    expect(isValidSubPositionForPosition('OL', 'OT')).toBe(true);
    expect(isValidSubPositionForPosition('OL', 'OG')).toBe(true);
    expect(isValidSubPositionForPosition('OL', 'EDGE')).toBe(false);
    expect(isValidSubPositionForPosition('DL', 'EDGE')).toBe(true);
    expect(isValidSubPositionForPosition('QB', 'OT')).toBe(false);
  });

  it('classifies an interior lineman as OG by default (no pin)', () => {
    const ol = mkOL();
    backfillTeamSubPositions(ol);
    expect(ol.find(p => p.id === 'd')!.subPosition).toBe('OG');
  });

  it('a pin forces OT and SURVIVES a second backfill (save/load + roster move)', () => {
    const ol = mkOL();
    const d = ol.find(p => p.id === 'd')!;
    d.subPositionOverride = 'OT';
    backfillTeamSubPositions(ol);
    expect(d.subPosition).toBe('OT');
    // Re-running backfill is what every load / roster mutation does — the pin
    // must not be clobbered.
    backfillTeamSubPositions(ol);
    expect(d.subPosition).toBe('OT');
  });

  it('classify pins the override out of the proportional split', () => {
    const ol = mkOL();
    ol.find(p => p.id === 'e')!.subPositionOverride = 'OT';
    expect(classifyTeamSubPositions(ol).get('e')).toBe('OT');
  });

  it('clearing the pin reverts to the ratings-derived sub-position', () => {
    const ol = mkOL();
    const d = ol.find(p => p.id === 'd')!;
    d.subPositionOverride = 'OT';
    backfillTeamSubPositions(ol);
    expect(d.subPosition).toBe('OT');
    d.subPositionOverride = undefined;
    backfillTeamSubPositions(ol);
    expect(d.subPosition).toBe('OG');
  });
});
