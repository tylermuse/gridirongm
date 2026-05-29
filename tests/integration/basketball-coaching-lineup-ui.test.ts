/**
 * Coaching system + lineup model + UI metadata tests.
 *
 * Validates:
 *   - buildDefault picks best player at each position as starter
 *   - validate catches missing starters + duplicates + position mismatches
 *   - Coaching schemes resolve to multipliers with sensible ranges
 *   - PDC effect bonuses young players, no effect on vets
 *   - ATC effect reduces injury rate for high-rated trainers
 *   - UI metadata exports valid rating fields + stat columns + position groups
 *   - describeLineup renders 3 groups (starters/bench/backups)
 */

import { describe, it, expect } from 'vitest';
import {
  buildDefaultBasketballLineup,
  validateBasketballLineup,
  basketballLineupModel,
  basketballCoachingSystem,
  BASKETBALL_HC_SCHEMES,
  resolveBasketballSchemeEffect,
  resolveBasketballPDCEffect,
  resolveBasketballATCEffect,
  listBasketballSchemes,
  basketballUiMetadata,
  describeBasketballLineup,
  generateBasketballPlayer,
  type BasketballLineup,
} from '@bs/sport-basketball';

// ---------------------------------------------------------------------------
// Lineup model
// ---------------------------------------------------------------------------

describe('basketball lineup model — buildDefault', () => {
  it('picks the highest-OVR player at each position as starter', () => {
    const roster = [
      generateBasketballPlayer({ position: 'PG', targetOverall: 88 }), // star PG
      generateBasketballPlayer({ position: 'PG', targetOverall: 75 }), // backup
      generateBasketballPlayer({ position: 'SG', targetOverall: 80 }),
      generateBasketballPlayer({ position: 'SF', targetOverall: 78 }),
      generateBasketballPlayer({ position: 'PF', targetOverall: 82 }),
      generateBasketballPlayer({ position: 'C', targetOverall: 79 }),
    ];
    const lineup = buildDefaultBasketballLineup(roster);

    // PG starter should be the 88-rated player
    const pgStarter = roster.find(p => p.id === lineup.starters[0])!;
    expect(pgStarter.sportData.position).toBe('PG');
    expect(pgStarter.ratings.overall).toBeGreaterThan(85);

    // Each starter at the right slot index
    const slotPositions = ['PG', 'SG', 'SF', 'PF', 'C'];
    for (let i = 0; i < 5; i++) {
      const starter = roster.find(p => p.id === lineup.starters[i])!;
      expect(starter.sportData.position).toBe(slotPositions[i]);
    }
  });

  it('puts second-best at each position as backup', () => {
    const roster = [
      generateBasketballPlayer({ position: 'PG', targetOverall: 85 }), // starter
      generateBasketballPlayer({ position: 'PG', targetOverall: 75 }), // backup
      generateBasketballPlayer({ position: 'PG', targetOverall: 65 }), // bench
      generateBasketballPlayer({ position: 'SG', targetOverall: 78 }),
      generateBasketballPlayer({ position: 'SF', targetOverall: 76 }),
      generateBasketballPlayer({ position: 'PF', targetOverall: 80 }),
      generateBasketballPlayer({ position: 'C', targetOverall: 79 }),
    ];
    const lineup = buildDefaultBasketballLineup(roster);
    // PG backup should NOT be the starter
    expect(lineup.backupsByPosition.PG).not.toBe(lineup.starters[0]);
    expect(lineup.backupsByPosition.PG).not.toBeNull();
  });

  it('puts remaining players on the bench sorted by OVR descending', () => {
    const roster = [
      generateBasketballPlayer({ position: 'PG', targetOverall: 80 }),
      generateBasketballPlayer({ position: 'SG', targetOverall: 78 }),
      generateBasketballPlayer({ position: 'SF', targetOverall: 76 }),
      generateBasketballPlayer({ position: 'PF', targetOverall: 75 }),
      generateBasketballPlayer({ position: 'C', targetOverall: 74 }),
      // bench
      generateBasketballPlayer({ position: 'SG', targetOverall: 70 }),
      generateBasketballPlayer({ position: 'SF', targetOverall: 65 }),
      generateBasketballPlayer({ position: 'PG', targetOverall: 60 }),
    ];
    const lineup = buildDefaultBasketballLineup(roster);
    // Bench in OVR descending order
    const benchOvrs = lineup.bench.map(id => roster.find(p => p.id === id)!.ratings.overall);
    for (let i = 1; i < benchOvrs.length; i++) {
      expect(benchOvrs[i]).toBeLessThanOrEqual(benchOvrs[i - 1]);
    }
  });

  it('leaves starter slot empty when no player at that position', () => {
    const roster = [
      generateBasketballPlayer({ position: 'PG', targetOverall: 80 }),
      generateBasketballPlayer({ position: 'SG', targetOverall: 78 }),
      generateBasketballPlayer({ position: 'SF', targetOverall: 76 }),
      generateBasketballPlayer({ position: 'PF', targetOverall: 75 }),
      // No C
    ];
    const lineup = buildDefaultBasketballLineup(roster);
    expect(lineup.starters[4]).toBe(''); // C slot empty
  });
});

describe('basketball lineup model — validate', () => {
  function makeFullRoster() {
    return [
      generateBasketballPlayer({ position: 'PG', targetOverall: 80 }),
      generateBasketballPlayer({ position: 'PG', targetOverall: 70 }),
      generateBasketballPlayer({ position: 'SG', targetOverall: 78 }),
      generateBasketballPlayer({ position: 'SG', targetOverall: 70 }),
      generateBasketballPlayer({ position: 'SF', targetOverall: 76 }),
      generateBasketballPlayer({ position: 'SF', targetOverall: 70 }),
      generateBasketballPlayer({ position: 'PF', targetOverall: 75 }),
      generateBasketballPlayer({ position: 'PF', targetOverall: 70 }),
      generateBasketballPlayer({ position: 'C', targetOverall: 74 }),
      generateBasketballPlayer({ position: 'C', targetOverall: 70 }),
    ];
  }

  it('approves a buildDefault lineup as valid', () => {
    const roster = makeFullRoster();
    const lineup = buildDefaultBasketballLineup(roster);
    const result = validateBasketballLineup(lineup, roster);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('flags missing starters', () => {
    const roster = makeFullRoster();
    const lineup = buildDefaultBasketballLineup(roster);
    // Erase the C starter
    const broken: BasketballLineup = {
      ...lineup,
      starters: [lineup.starters[0], lineup.starters[1], lineup.starters[2], lineup.starters[3], '' as typeof lineup.starters[4]],
    };
    const result = validateBasketballLineup(broken, roster);
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.code === 'LINEUP_MISSING_STARTER')).toBe(true);
  });

  it('flags a starter that also appears on the bench', () => {
    const roster = makeFullRoster();
    const lineup = buildDefaultBasketballLineup(roster);
    const broken: BasketballLineup = {
      ...lineup,
      bench: [lineup.starters[0], ...lineup.bench],
    };
    const result = validateBasketballLineup(broken, roster);
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.code === 'LINEUP_BENCH_OVERLAPS_STARTER')).toBe(true);
  });

  it('flags backup that equals starter', () => {
    const roster = makeFullRoster();
    const lineup = buildDefaultBasketballLineup(roster);
    const broken: BasketballLineup = {
      ...lineup,
      backupsByPosition: { ...lineup.backupsByPosition, PG: lineup.starters[0] },
    };
    const result = validateBasketballLineup(broken, roster);
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.code === 'LINEUP_BACKUP_IS_STARTER')).toBe(true);
  });

  it('warns when starter position doesn\'t match slot position', () => {
    const roster = makeFullRoster();
    const lineup = buildDefaultBasketballLineup(roster);
    // Put a C in the PG slot (small-ball nightmare)
    const cPlayer = roster.find(p => p.sportData.position === 'C')!;
    const realPg = lineup.starters[0];
    const broken: BasketballLineup = {
      ...lineup,
      starters: [cPlayer.id, lineup.starters[1], lineup.starters[2], lineup.starters[3], lineup.starters[4]],
      // Move the old PG to bench so they're not on the roster twice
      bench: lineup.bench.filter(id => id !== cPlayer.id).concat(realPg),
      // Remove the C from backups since they're now the PG
      backupsByPosition: { ...lineup.backupsByPosition, C: null },
      // Find a new C starter from the roster
    };
    // Replace the C-slot starter with another available C
    const otherC = roster.find(p => p.sportData.position === 'C' && p.id !== cPlayer.id && p.id !== lineup.starters[4])
      ?? roster.find(p => p.id === lineup.starters[4])!;
    broken.starters[4] = otherC.id;
    broken.bench = broken.bench.filter(id => id !== otherC.id);

    const result = validateBasketballLineup(broken, roster);
    // Position mismatch is a WARNING, not a violation
    expect(result.warnings.some(w => w.code === 'LINEUP_POSITION_MISMATCH')).toBe(true);
  });
});

describe('basketball lineup model — adapter wrapper', () => {
  it('basketballLineupModel.kind is "rotation"', () => {
    expect(basketballLineupModel.kind).toBe('rotation');
  });

  it('basketballLineupModel.buildDefault produces a lineup', () => {
    const roster = [
      generateBasketballPlayer({ position: 'PG' }),
      generateBasketballPlayer({ position: 'SG' }),
      generateBasketballPlayer({ position: 'SF' }),
      generateBasketballPlayer({ position: 'PF' }),
      generateBasketballPlayer({ position: 'C' }),
    ];
    const lineup = basketballLineupModel.buildDefault(roster);
    expect(lineup.starters).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// Coaching system
// ---------------------------------------------------------------------------

describe('basketball coaching system', () => {
  it('exposes the expected roles and schemes', () => {
    expect(basketballCoachingSystem.roles).toContain('HC');
    expect(basketballCoachingSystem.roles).toContain('AC');
    expect(basketballCoachingSystem.roles).toContain('PDC');
    expect(basketballCoachingSystem.roles).toContain('ATC');
    expect(basketballCoachingSystem.schemes.HC.length).toBeGreaterThan(0);
    expect(basketballCoachingSystem.maxStaffSize).toBeGreaterThan(0);
  });

  it('every HC scheme resolves to an effect with sensible multipliers', () => {
    for (const scheme of BASKETBALL_HC_SCHEMES) {
      const effect = resolveBasketballSchemeEffect(scheme);
      expect(effect.paceMultiplier).toBeGreaterThan(0.7);
      expect(effect.paceMultiplier).toBeLessThan(1.3);
      expect(effect.threePointAttemptMultiplier).toBeGreaterThan(0.6);
      expect(effect.threePointAttemptMultiplier).toBeLessThan(1.5);
      expect(effect.description.length).toBeGreaterThan(10);
    }
  });

  it('five_out heavily favors threes and faster pace', () => {
    const fiveOut = resolveBasketballSchemeEffect('five_out');
    const triangle = resolveBasketballSchemeEffect('triangle');
    expect(fiveOut.threePointAttemptMultiplier).toBeGreaterThan(triangle.threePointAttemptMultiplier);
    expect(fiveOut.paceMultiplier).toBeGreaterThan(triangle.paceMultiplier);
  });

  it('triangle prefers post-up offense over threes', () => {
    const triangle = resolveBasketballSchemeEffect('triangle');
    expect(triangle.postAttemptMultiplier).toBeGreaterThan(1.0);
    expect(triangle.threePointAttemptMultiplier).toBeLessThan(1.0);
  });

  it('PDC bonuses young players, has no effect on vets', () => {
    expect(resolveBasketballPDCEffect(85, 21)).toBeGreaterThan(1.0);
    expect(resolveBasketballPDCEffect(50, 21)).toBe(1.0);
    expect(resolveBasketballPDCEffect(85, 32)).toBe(1.0);
  });

  it('ATC reduces injury rate for high-rated trainers', () => {
    const goodATC = resolveBasketballATCEffect(90);
    const badATC = resolveBasketballATCEffect(50);
    expect(goodATC).toBeLessThan(1.0);
    expect(badATC).toBeGreaterThan(1.0);
    // Floor: never below 60%
    expect(resolveBasketballATCEffect(99)).toBeGreaterThanOrEqual(0.6);
  });

  it('listBasketballSchemes returns all schemes with effects', () => {
    const all = listBasketballSchemes();
    expect(all).toHaveLength(BASKETBALL_HC_SCHEMES.length);
    for (const entry of all) {
      expect(entry.effect.description.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// UI metadata
// ---------------------------------------------------------------------------

describe('basketball UI metadata', () => {
  it('exposes rating fields with key/label/group', () => {
    expect(basketballUiMetadata.ratingFields.length).toBeGreaterThan(10);
    for (const f of basketballUiMetadata.ratingFields) {
      expect(f.key).toBeTruthy();
      expect(f.label).toBeTruthy();
      expect(f.group).toBeTruthy();
    }
  });

  it('exposes stat columns with valid format values', () => {
    expect(basketballUiMetadata.statColumns.length).toBeGreaterThan(8);
    const validFormats = new Set(['integer', 'decimal', 'percent', 'time']);
    for (const c of basketballUiMetadata.statColumns) {
      expect(validFormats.has(c.format)).toBe(true);
      expect(typeof c.higherIsBetter).toBe('boolean');
    }
  });

  it('turnovers and fouls are marked higherIsBetter=false', () => {
    const to = basketballUiMetadata.statColumns.find(c => c.key === 'turnovers')!;
    const pf = basketballUiMetadata.statColumns.find(c => c.key === 'fouls')!;
    expect(to.higherIsBetter).toBe(false);
    expect(pf.higherIsBetter).toBe(false);
  });

  it('position groups cover all five positions exactly once', () => {
    const seen = new Set<string>();
    for (const group of basketballUiMetadata.positionGroups) {
      for (const p of group.positions) {
        expect(seen.has(p), `${p} listed in multiple groups`).toBe(false);
        seen.add(p);
      }
    }
    expect(seen.size).toBe(5);
  });

  it('describeBasketballLineup renders starters, bench, and backups groups', () => {
    const roster = [
      generateBasketballPlayer({ position: 'PG' }),
      generateBasketballPlayer({ position: 'SG' }),
      generateBasketballPlayer({ position: 'SF' }),
      generateBasketballPlayer({ position: 'PF' }),
      generateBasketballPlayer({ position: 'C' }),
      generateBasketballPlayer({ position: 'PG' }),
      generateBasketballPlayer({ position: 'SG' }),
    ];
    const lineup = buildDefaultBasketballLineup(roster);
    const desc = describeBasketballLineup(lineup);
    expect(desc.groups).toHaveLength(3);
    expect(desc.groups[0].label).toBe('Starters');
    expect(desc.groups[0].slots).toHaveLength(5);
    expect(desc.groups[0].slots.every(s => s.isStarter)).toBe(true);
    expect(desc.groups[1].label).toBe('Bench');
    expect(desc.groups[2].label).toBe('Position Backups');
  });

  it('describeLineup via the adapter UI object works too', () => {
    const roster = [
      generateBasketballPlayer({ position: 'PG' }),
      generateBasketballPlayer({ position: 'SG' }),
      generateBasketballPlayer({ position: 'SF' }),
      generateBasketballPlayer({ position: 'PF' }),
      generateBasketballPlayer({ position: 'C' }),
    ];
    const lineup = buildDefaultBasketballLineup(roster);
    const desc = basketballUiMetadata.describeLineup(lineup);
    expect(desc.groups[0].slots[0].playerId).toBe(lineup.starters[0]);
  });
});
