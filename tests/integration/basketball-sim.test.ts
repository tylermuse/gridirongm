/**
 * Basketball sim distribution test.
 *
 * Sim a large batch of possessions with synthetic average-rated lineups and
 * assert the aggregate stats look like NBA averages.
 *
 * Calibration targets (2024-25 NBA):
 *   - Points per game: 100-125 per team
 *   - FG%: 44-48%
 *   - 3PT%: 35-40% (and ~38-44% of FGAs are threes)
 *   - FT%: 75-82%
 *   - Rebounds per team: 40-48
 *   - Assists per team: 22-28
 *   - Turnovers per team: 12-16
 *   - Possessions per game: ~100 per team
 *
 * These ranges are intentionally loose. The point is to catch "shooting 60%"
 * or "scoring 70 points per game" regressions, not to bicker over decimals.
 *
 * If a future change breaks these ranges, the shot model + tuning constants
 * need a look before the change ships.
 */

import { describe, it, expect } from 'vitest';
import {
  createRng,
  simPossession,
  type SimLineup,
  type StatEvent,
} from '@bs/sport-basketball/sim';
import {
  emptyBasketballStats,
  addBasketballStats,
  type BasketballPlayer,
  type BasketballRatings,
  type BasketballPosition,
  type BasketballStats,
} from '@bs/sport-basketball/types';
import type { PlayerId } from '@bs/core/adapter';

// ---------------------------------------------------------------------------
// Synthetic player builders
// ---------------------------------------------------------------------------

function avgRatings(position: BasketballPosition): BasketballRatings {
  // 70 is the "league-average" baseline our shot model is calibrated against
  const base = 70;
  // Position-specific tweaks so guards shoot more threes, bigs rebound more, etc.
  const isGuard = position === 'PG' || position === 'SG';
  const isWing = position === 'SF';
  const isBig = position === 'PF' || position === 'C';
  return {
    overall: 70,
    height: isBig ? 82 : isWing ? 79 : 75,
    wingspan: isBig ? 86 : isWing ? 82 : 77,
    speed: isGuard ? 76 : isBig ? 64 : 72,
    strength: isBig ? 80 : isGuard ? 65 : 72,
    vertical: isBig ? 70 : 75,
    threePoint: isGuard ? 72 : isWing ? 70 : isBig ? 58 : base,
    midRange: 70,
    finishing: isBig ? 78 : isGuard ? 68 : 72,
    freeThrow: 75,
    postScoring: isBig ? 72 : 55,
    handles: isGuard ? 78 : isBig ? 55 : 68,
    passing: isGuard ? 75 : 65,
    perimeterDefense: isGuard ? 72 : isBig ? 60 : 70,
    interiorDefense: isBig ? 78 : isWing ? 65 : 58,
    rebounding: isBig ? 78 : isWing ? 65 : 55,
    steal: isGuard ? 68 : 60,
    block: isBig ? 72 : isWing ? 58 : 50,
    basketballIQ: 70,
    intangibles: 70,
  };
}

let nextId = 0;
function makePlayer(position: BasketballPosition): BasketballPlayer {
  const id = `p${nextId++}` as PlayerId;
  return {
    id,
    firstName: 'Player',
    lastName: String(nextId),
    birthDate: '2000-01-01',
    age: 26,
    nationality: 'US',
    kind: 'standard',
    ratings: avgRatings(position),
    seasonStats: emptyBasketballStats(),
    careerStats: emptyBasketballStats(),
    contract: null,
    rosterSlot: null,
    injury: null,
    development: {
      potential: 75,
      currentTrajectory: 'plateau',
      seasonsAtCurrentTrajectory: 1,
    },
    sportData: {
      position,
      starTier: 'starter',
      yearsInLeague: 4,
      birdRights: 'none',
      isTwoWay: false,
      shootingHand: 'right',
    },
  };
}

function makeLineup(): SimLineup {
  return {
    players: [
      makePlayer('PG'),
      makePlayer('SG'),
      makePlayer('SF'),
      makePlayer('PF'),
      makePlayer('C'),
    ] as const,
  };
}

// ---------------------------------------------------------------------------
// Stat aggregation helpers
// ---------------------------------------------------------------------------

function applyEvents(
  events: StatEvent[],
  playerStats: Map<PlayerId, BasketballStats>,
): void {
  for (const e of events) {
    const cur = playerStats.get(e.playerId) ?? emptyBasketballStats();
    const updated = addBasketballStats(cur, { [e.field]: e.delta ?? 1 } as Partial<BasketballStats>);
    playerStats.set(e.playerId, updated);
  }
}

function sumTeam(lineup: SimLineup, playerStats: Map<PlayerId, BasketballStats>): BasketballStats {
  let total = emptyBasketballStats();
  for (const p of lineup.players) {
    const s = playerStats.get(p.id);
    if (s) total = addBasketballStats(total, s);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('basketball sim — single-possession stat distributions', () => {
  it('produces NBA-realistic per-game stats over a simulated season for one team', () => {
    const offense = makeLineup();
    const defense = makeLineup();
    const playerStats = new Map<PlayerId, BasketballStats>();
    const rng = createRng('test-season-2026');

    // Sim 8200 offensive possessions = 100 possessions/game × 82 games
    // (Defense gets the other 100 per game, but we're not tracking those
    // for this team in this simplified harness — we'd double-count by
    // looking at both sides. Instead we focus on the offensive team here.)
    const POSSESSIONS = 100 * 82;
    for (let i = 0; i < POSSESSIONS; i++) {
      const result = simPossession(offense, defense, rng);
      applyEvents(result.events, playerStats);
    }

    const teamSeason = sumTeam(offense, playerStats);
    const games = 82;
    const ppg = teamSeason.points / games;
    const fgPct = teamSeason.fieldGoalsMade / teamSeason.fieldGoalsAttempted;
    const tpPct = teamSeason.threePointsMade / teamSeason.threePointsAttempted;
    const ftPct = teamSeason.freeThrowsMade / teamSeason.freeThrowsAttempted;
    const tpRate = teamSeason.threePointsAttempted / teamSeason.fieldGoalsAttempted;
    const apg = teamSeason.assists / games;
    const topg = teamSeason.turnovers / games;
    const orbPerGame = teamSeason.offensiveRebounds / games;

    // Log for debugging — useful when tuning fails
    // eslint-disable-next-line no-console
    console.log('Simulated per-game stats:', {
      ppg: ppg.toFixed(1),
      fgPct: (fgPct * 100).toFixed(1) + '%',
      tpPct: (tpPct * 100).toFixed(1) + '%',
      ftPct: (ftPct * 100).toFixed(1) + '%',
      tpRate: (tpRate * 100).toFixed(1) + '%',
      apg: apg.toFixed(1),
      topg: topg.toFixed(1),
      orbPerGame: orbPerGame.toFixed(1),
    });

    // Points per game — generous range
    expect(ppg).toBeGreaterThan(95);
    expect(ppg).toBeLessThan(125);

    // FG% in NBA-realistic range
    expect(fgPct).toBeGreaterThan(0.42);
    expect(fgPct).toBeLessThan(0.50);

    // 3PT% in realistic range
    expect(tpPct).toBeGreaterThan(0.32);
    expect(tpPct).toBeLessThan(0.42);

    // 3PT shot share of FGAs
    expect(tpRate).toBeGreaterThan(0.30);
    expect(tpRate).toBeLessThan(0.48);

    // FT% — generous range, 75-rated FT shooters average ~80%
    expect(ftPct).toBeGreaterThan(0.70);
    expect(ftPct).toBeLessThan(0.85);

    // Assists per game — NBA avg ~25
    expect(apg).toBeGreaterThan(18);
    expect(apg).toBeLessThan(32);

    // Turnovers per game — NBA avg ~14
    expect(topg).toBeGreaterThan(10);
    expect(topg).toBeLessThan(18);

    // Offensive rebounds per game — NBA avg ~10-12
    expect(orbPerGame).toBeGreaterThan(8);
    expect(orbPerGame).toBeLessThan(16);
  });

  it('is deterministic for the same seed', () => {
    const lineup1 = makeLineup();
    const lineup2 = makeLineup();
    const rng1 = createRng('determinism-check');
    const rng2 = createRng('determinism-check');

    const stats1 = new Map<PlayerId, BasketballStats>();
    const stats2 = new Map<PlayerId, BasketballStats>();

    for (let i = 0; i < 1000; i++) {
      const r1 = simPossession(lineup1, lineup2, rng1);
      const r2 = simPossession(lineup1, lineup2, rng2);
      applyEvents(r1.events, stats1);
      applyEvents(r2.events, stats2);
    }

    const team1 = sumTeam(lineup1, stats1);
    const team2 = sumTeam(lineup1, stats2);
    expect(team1.points).toBe(team2.points);
    expect(team1.fieldGoalsMade).toBe(team2.fieldGoalsMade);
    expect(team1.fieldGoalsAttempted).toBe(team2.fieldGoalsAttempted);
    expect(team1.assists).toBe(team2.assists);
  });

  it('different seeds produce different results', () => {
    const lineup1 = makeLineup();
    const lineup2 = makeLineup();
    const rng1 = createRng('seed-a');
    const rng2 = createRng('seed-b');

    const stats1 = new Map<PlayerId, BasketballStats>();
    const stats2 = new Map<PlayerId, BasketballStats>();

    for (let i = 0; i < 1000; i++) {
      const r1 = simPossession(lineup1, lineup2, rng1);
      const r2 = simPossession(lineup1, lineup2, rng2);
      applyEvents(r1.events, stats1);
      applyEvents(r2.events, stats2);
    }

    const team1 = sumTeam(lineup1, stats1);
    const team2 = sumTeam(lineup1, stats2);
    // Vanishingly unlikely they produce identical points totals
    expect(team1.points).not.toBe(team2.points);
  });
});
