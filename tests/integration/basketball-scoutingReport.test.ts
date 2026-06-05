/**
 * Draft scouting report (parity 2.1): a deep, deterministic report with combine
 * measurables, a dev curve, character, archetype, and a grade. Scouted reports
 * use the true ceiling; unscouted ones project and say so.
 */

import { describe, it, expect } from 'vitest';
import { generateBasketballDraftClass } from '@bs/sport-basketball';
import { buildScoutingReport } from '@/../apps/bs-basketball/src/lib/scouting/scoutingReport';

describe('buildScoutingReport', () => {
  const prospect = generateBasketballDraftClass(2027, 1)[0];

  it('produces a full, deterministic report', () => {
    const a = buildScoutingReport(prospect, { season: 2027, scouted: false });
    const b = buildScoutingReport(prospect, { season: 2027, scouted: false });
    expect(a).toEqual(b);

    expect(a.grade).toMatch(/^[ABCD][+-]?$/);
    expect(a.gradeColor).toMatch(/^#/);
    expect(a.archetype.length).toBeGreaterThan(0);
    expect(a.measurables).toHaveLength(5);
    expect(a.devCurve).toHaveLength(5);
    expect(a.keyRatings).toHaveLength(5);
    expect(a.character.grade).toMatch(/^[ABCD]$/);

    // Dev curve starts at the current overall and climbs toward the ceiling.
    expect(a.devCurve[0].projected).toBe(prospect.ratings.overall);
    expect(a.devCurve[4].projected).toBeGreaterThanOrEqual(a.devCurve[0].projected);
    expect(a.devCurve[4].age).toBe(prospect.age + 4);
  });

  it('uses the true ceiling once scouted; projects (and says so) otherwise', () => {
    const scouted = buildScoutingReport(prospect, { season: 2027, scouted: true });
    expect(scouted.ceiling).toBe(prospect.development.potential);
    expect(scouted.ceilingNote).toContain('Confirmed');

    const unscouted = buildScoutingReport(prospect, { season: 2027, scouted: false });
    expect(unscouted.ceilingNote).toContain('scout to confirm');
  });
});
