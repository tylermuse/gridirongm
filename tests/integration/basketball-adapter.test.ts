/**
 * Adapter assembly tests.
 *
 * Validates that basketballAdapter:
 *   - satisfies the full SportAdapter<BasketballRatings, BasketballStats,
 *     BasketballPosition, BasketballLineup> contract at the type level
 *   - exposes the expected identity (sportId, displayName, brandName)
 *   - has all required capability sub-systems wired up
 *   - calendar phases cover the full tick range
 *   - generatePlayer + statsEngine roundtrip correctly via the adapter
 */

import { describe, it, expect } from 'vitest';
import {
  basketballAdapter,
  basketballRosterRules,
  basketballSeasonCalendar,
  basketballCompetitions,
} from '@bs/sport-basketball';
import type {
  SportAdapter,
} from '@bs/core/adapter';
import type {
  BasketballRatings,
  BasketballStats,
  BasketballPosition,
  BasketballLineup,
} from '@bs/sport-basketball';

// ---------------------------------------------------------------------------
// Type-level assertion — must compile, nothing to "run"
// ---------------------------------------------------------------------------

const _typecheck: SportAdapter<
  BasketballRatings,
  BasketballStats,
  BasketballPosition,
  BasketballLineup
> = basketballAdapter;
void _typecheck;

// ---------------------------------------------------------------------------
// Runtime assertions
// ---------------------------------------------------------------------------

describe('basketballAdapter — identity', () => {
  it('has the right sportId and brand', () => {
    expect(basketballAdapter.sportId).toBe('basketball');
    expect(basketballAdapter.displayName).toBe('BS Hoops');
    expect(basketballAdapter.brandName).toBe('BS Hoops');
  });

  it('exposes all 5 positions', () => {
    expect([...basketballAdapter.positions]).toEqual(['PG', 'SG', 'SF', 'PF', 'C']);
  });

  it('declares standard player kind only', () => {
    expect([...basketballAdapter.playerKinds]).toEqual(['standard']);
  });
});

describe('basketballAdapter — capabilities are present', () => {
  it('wires up every required sub-system', () => {
    expect(basketballAdapter.rosterRules).toBeDefined();
    expect(basketballAdapter.seasonCalendar).toBeDefined();
    expect(basketballAdapter.competitions).toBeDefined();
    expect(basketballAdapter.playerGen).toBeDefined();
    expect(basketballAdapter.statsEngine).toBeDefined();
    expect(basketballAdapter.simEngine).toBeDefined();
    expect(basketballAdapter.scheduleGenerator).toBeDefined();
    expect(basketballAdapter.draftSystem).toBeDefined();
    expect(basketballAdapter.developmentSystem).toBeDefined();
    expect(basketballAdapter.tradeValuator).toBeDefined();
    expect(basketballAdapter.awards).toBeDefined();
    expect(basketballAdapter.ui).toBeDefined();
    expect(basketballAdapter.lineupModel).toBeDefined();
    expect(basketballAdapter.coachingSystem).toBeDefined();
    expect(basketballAdapter.capRules).toBeDefined();
  });

  it('omits optional capabilities not implemented in v1', () => {
    expect(basketballAdapter.liveSim).toBeUndefined();
    expect(basketballAdapter.promotionRelegation).toBeUndefined();
  });
});

describe('basketballAdapter — RosterRules', () => {
  it('has 3 buckets (active, two_way, inactive)', () => {
    const names = basketballRosterRules.buckets.map(b => b.name);
    expect(names).toContain('active');
    expect(names).toContain('two_way');
    expect(names).toContain('inactive');
  });

  it('active roster size = 15', () => {
    expect(basketballRosterRules.activeRosterSize).toBe(15);
  });

  it('every position has a min/max constraint', () => {
    for (const pos of ['PG', 'SG', 'SF', 'PF', 'C'] as BasketballPosition[]) {
      expect(basketballRosterRules.positionLimits[pos]).toBeDefined();
    }
  });
});

describe('basketballAdapter — SeasonCalendar', () => {
  it('describes ticks across all phases', () => {
    expect(basketballSeasonCalendar.describeTick(10)).toMatch(/Preseason/);
    expect(basketballSeasonCalendar.describeTick(100)).toMatch(/Regular Season/);
    expect(basketballSeasonCalendar.describeTick(220)).toMatch(/Playoffs/);
    expect(basketballSeasonCalendar.describeTick(280)).toMatch(/Offseason/);
  });

  it('phaseForTick returns the right phase name', () => {
    expect(basketballSeasonCalendar.phaseForTick(10)).toBe('preseason');
    expect(basketballSeasonCalendar.phaseForTick(100)).toBe('regular_season');
    expect(basketballSeasonCalendar.phaseForTick(220)).toBe('playoffs');
    expect(basketballSeasonCalendar.phaseForTick(280)).toBe('offseason');
  });

  it('ticksPerSeason matches the last phase endTick', () => {
    const lastPhase = basketballSeasonCalendar.phases[basketballSeasonCalendar.phases.length - 1];
    expect(basketballSeasonCalendar.ticksPerSeason).toBe(lastPhase.endTick);
  });
});

describe('basketballAdapter — Competitions', () => {
  it('exposes a primary competition', () => {
    expect(basketballCompetitions.length).toBeGreaterThan(0);
    const primary = basketballCompetitions.find(c => c.id === 'primary');
    expect(primary).toBeDefined();
    expect(primary!.entryRule).toBe('all_league');
    expect(primary!.weight).toBe(1.0);
  });
});

describe('basketballAdapter — playerGen + statsEngine roundtrip', () => {
  it('generatePlayer via the adapter returns a basketball player', () => {
    const p = basketballAdapter.playerGen.generatePlayer({ position: 'PG', targetOverall: 75 });
    expect(p.ratings.overall).toBeGreaterThan(70);
    expect(p.ratings.overall).toBeLessThan(80);
  });

  it('statsEngine.empty + accumulate works', () => {
    const empty = basketballAdapter.statsEngine.empty();
    expect(empty.points).toBe(0);
    const merged = basketballAdapter.statsEngine.accumulate(empty, { points: 25, assists: 5 });
    expect(merged.points).toBe(25);
    expect(merged.assists).toBe(5);
  });

  it('statsEngine.derived returns standard NBA derived numbers', () => {
    const stats = basketballAdapter.statsEngine.accumulate(
      basketballAdapter.statsEngine.empty(),
      {
        gamesPlayed: 50, points: 1000, assists: 250, totalRebounds: 400, steals: 75,
        blocks: 50, turnovers: 150, minutes: 1800, fieldGoalsMade: 400,
        fieldGoalsAttempted: 800, threePointsMade: 80, threePointsAttempted: 200,
        freeThrowsMade: 120, freeThrowsAttempted: 150, trueShootingAttempts: 866,
      },
    );
    const derived = basketballAdapter.statsEngine.derived(stats);
    expect(derived.ppg).toBe(20);
    expect(derived.apg).toBe(5);
    expect(derived.rpg).toBe(8);
    expect(derived.fgPct).toBe(0.5);
  });

  it('statsEngine.format displays percentages and integers correctly', () => {
    expect(basketballAdapter.statsEngine.format('fgPct', 0.456)).toBe('45.6%');
    expect(basketballAdapter.statsEngine.format('fieldGoalsMade', 287.7)).toBe('288');
    expect(basketballAdapter.statsEngine.format('points', 23.456)).toBe('23.5');
  });
});

describe('basketballAdapter — awards definitions', () => {
  it('exposes the 7 NBA-style awards', () => {
    const ids = basketballAdapter.awards.definitions.map(d => d.id);
    expect(ids).toContain('mvp');
    expect(ids).toContain('dpoy');
    expect(ids).toContain('roy');
    expect(ids).toContain('sixth_man');
    expect(ids).toContain('mip');
    expect(ids).toContain('coy');
    expect(ids).toContain('finals_mvp');
  });
});

describe('basketballAdapter — draft system', () => {
  it('declares 2 rounds with mixed lottery + reverse-standings order', () => {
    expect(basketballAdapter.draftSystem.rounds).toBe(2);
    expect(basketballAdapter.draftSystem.orderRule).toBe('mixed_lottery_then_reverse');
    expect(basketballAdapter.draftSystem.draftPhase).toBe('offseason_early');
  });

  it('pickValue is monotonically decreasing', () => {
    const pick1 = basketballAdapter.draftSystem.pickValue(
      { season: 2026, round: 1, originalTeamId: 'X' as never, currentTeamId: 'X' as never }, [],
    );
    const pick2 = basketballAdapter.draftSystem.pickValue(
      { season: 2026, round: 2, originalTeamId: 'X' as never, currentTeamId: 'X' as never }, [],
    );
    expect(pick1).toBeGreaterThan(pick2);
  });
});

describe('basketballAdapter — capRules', () => {
  it('currentCap returns a positive number', () => {
    expect(basketballAdapter.capRules!.currentCap(2026)).toBeGreaterThan(100_000_000);
  });
});

describe('basketballAdapter — tradeValuator', () => {
  it('supports trade, free_agency_sign, and release movements', () => {
    expect(basketballAdapter.tradeValuator.supportedMovementTypes).toContain('trade');
    expect(basketballAdapter.tradeValuator.supportedMovementTypes).toContain('free_agency_sign');
    expect(basketballAdapter.tradeValuator.supportedMovementTypes).toContain('release');
  });
});
