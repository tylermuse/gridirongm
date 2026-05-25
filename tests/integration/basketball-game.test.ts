/**
 * Full-game integration tests for the basketball sim.
 *
 * Validates that simBasketballGame produces realistic full-game outputs:
 *   - Final scores in NBA-realistic ranges
 *   - Box scores allocate stats across players who actually played
 *   - Games are deterministic on seed
 *   - Starters play more minutes than bench
 *   - Overtime triggers correctly on tied games
 *
 * Builds on the per-possession tests in basketball-sim.test.ts. Those
 * verified per-possession stat distributions; this verifies the game-level
 * orchestration on top.
 */

import { describe, it, expect } from 'vitest';
import {
  simBasketballGame,
  type BasketballGameSide,
} from '@bs/sport-basketball/sim';
import {
  emptyBasketballStats,
  type BasketballPlayer,
  type BasketballRatings,
  type BasketballPosition,
  type BasketballLineup,
} from '@bs/sport-basketball/types';
import type { PlayerId, TeamId, GameId, CompetitionId } from '@bs/core/adapter';

// ---------------------------------------------------------------------------
// Synthetic team builders — extends what basketball-sim.test.ts does
// ---------------------------------------------------------------------------

function avgRatings(position: BasketballPosition): BasketballRatings {
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
    threePoint: isGuard ? 72 : isWing ? 70 : isBig ? 58 : 70,
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

let nextPlayerId = 0;
function makePlayer(position: BasketballPosition, prefix: string): BasketballPlayer {
  const id = `${prefix}-${nextPlayerId++}` as PlayerId;
  return {
    id,
    firstName: 'Player',
    lastName: String(nextPlayerId),
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

/** Build a team with 10 players (5 starters + 5 bench), one per position
 *  for each unit. */
function makeTeam(prefix: string, pace: 'fast' | 'medium' | 'slow' = 'medium'): BasketballGameSide {
  const positions: BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C'];
  const starters = positions.map(p => makePlayer(p, `${prefix}-s`));
  const bench = positions.map(p => makePlayer(p, `${prefix}-b`));
  const players = [...starters, ...bench];

  const lineup: BasketballLineup = {
    starters: starters.map(p => p.id) as [PlayerId, PlayerId, PlayerId, PlayerId, PlayerId],
    bench: bench.map(p => p.id),
    backupsByPosition: {
      PG: bench[0].id,
      SG: bench[1].id,
      SF: bench[2].id,
      PF: bench[3].id,
      C: bench[4].id,
    },
    pace,
  };

  return {
    teamId: `${prefix}-team` as TeamId,
    players,
    lineup,
  };
}

function makeGameContext(seed: string): {
  gameId: GameId;
  season: number;
  date: string;
  competitionId: CompetitionId;
  isPlayoff: boolean;
  rngSeed: string;
} {
  return {
    gameId: `game-${seed}` as GameId,
    season: 2026,
    date: '2026-10-22',
    competitionId: 'primary' as CompetitionId,
    isPlayoff: false,
    rngSeed: seed,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('basketball sim — full game', () => {
  it('produces an NBA-realistic final score for one game', () => {
    const home = makeTeam('home');
    const away = makeTeam('away');
    const result = simBasketballGame(home, away, makeGameContext('game-1'));

    expect(result.status).toBe('played');
    expect(result.finalScore).not.toBeNull();
    const { home: h, away: a } = result.finalScore!;

    // NBA-realistic range per team — regulation only would be ~95-125, OT
    // can push higher. Lower bound generous for low-pace games.
    expect(h).toBeGreaterThan(75);
    expect(h).toBeLessThan(160);
    expect(a).toBeGreaterThan(75);
    expect(a).toBeLessThan(160);
  });

  it('allocates box-score stats across multiple players', () => {
    const home = makeTeam('home');
    const away = makeTeam('away');
    const result = simBasketballGame(home, away, makeGameContext('game-2'));

    // Both teams should have all 10 players in the box (since bench rotation
    // is wired up, every player gets minutes)
    let totalPlayersWithStats = 0;
    let starterMins = 0;
    let benchMins = 0;
    let starterCount = 0;
    let benchCount = 0;

    for (const player of [...home.players, ...away.players]) {
      const box = result.boxScores[player.id];
      if (!box) continue;
      totalPlayersWithStats++;

      const isStarter =
        home.lineup.starters.includes(player.id) ||
        away.lineup.starters.includes(player.id);
      if (isStarter) {
        starterMins += box.minutes ?? 0;
        starterCount++;
      } else {
        benchMins += box.minutes ?? 0;
        benchCount++;
      }
    }

    // Every player should have a box-score line
    expect(totalPlayersWithStats).toBe(20); // 10 per team

    // Starters average more minutes than bench (rotation is 4:2 in favor)
    const avgStarterMins = starterMins / starterCount;
    const avgBenchMins = benchMins / benchCount;
    expect(avgStarterMins).toBeGreaterThan(avgBenchMins);

    // Sanity: starter minutes in NBA range (~28-36)
    expect(avgStarterMins).toBeGreaterThan(20);
    expect(avgStarterMins).toBeLessThan(45);
  });

  it('is deterministic on same seed', () => {
    const home1 = makeTeam('home');
    const away1 = makeTeam('away');
    const r1 = simBasketballGame(home1, away1, makeGameContext('det-seed'));

    // Reset the ID counter so we can rebuild identical teams
    nextPlayerId = 0;
    const home2 = makeTeam('home');
    const away2 = makeTeam('away');
    const r2 = simBasketballGame(home2, away2, makeGameContext('det-seed'));

    expect(r1.finalScore?.home).toBe(r2.finalScore?.home);
    expect(r1.finalScore?.away).toBe(r2.finalScore?.away);
  });

  it('quarter scores sum to the final score (regulation)', () => {
    const home = makeTeam('home');
    const away = makeTeam('away');
    const result = simBasketballGame(home, away, makeGameContext('quarter-sum'));
    const gameData = result.sportData as { quarterScores: { home: number; away: number }[] };

    const homeSum = gameData.quarterScores.reduce((s, q) => s + q.home, 0);
    const awaySum = gameData.quarterScores.reduce((s, q) => s + q.away, 0);
    expect(homeSum).toBe(result.finalScore!.home);
    expect(awaySum).toBe(result.finalScore!.away);
  });

  it('over many games, the OT pathway triggers at least once', () => {
    // Run 400 games with different seeds. The sim doesn't model strategic
    // late-game fouling to extend tied games, so the natural tie rate is
    // lower than NBA's ~6% — but with 400 trials we should still see
    // multiple OTs.
    //
    // If this test ever fails, the v2 sim should add late-game pressure
    // mechanics (intentional fouls when trailing, contested-shot rate
    // spikes in the last 2 minutes) to push the OT rate up.
    let otCount = 0;
    for (let i = 0; i < 400; i++) {
      nextPlayerId = 0;
      const home = makeTeam('home');
      const away = makeTeam('away');
      const r = simBasketballGame(home, away, makeGameContext(`ot-search-${i}`));
      const data = r.sportData as { wentToOvertime: boolean };
      if (data.wentToOvertime) otCount++;
    }
    expect(otCount).toBeGreaterThan(0);
  });

  it('biggestLead is non-negative and consistent with the final margin', () => {
    const home = makeTeam('home');
    const away = makeTeam('away');
    const result = simBasketballGame(home, away, makeGameContext('lead-check'));
    const data = result.sportData as { biggestLead: { team: 'home' | 'away'; points: number } };

    expect(data.biggestLead.points).toBeGreaterThanOrEqual(0);
    // The biggest lead at any point should be >= the final margin (since
    // the final margin is a snapshot at end of game)
    const finalMargin = Math.abs(result.finalScore!.home - result.finalScore!.away);
    expect(data.biggestLead.points).toBeGreaterThanOrEqual(finalMargin);
  });

  it('reports a realistic possession count', () => {
    const home = makeTeam('home');
    const away = makeTeam('away');
    const result = simBasketballGame(home, away, makeGameContext('pace-check'));
    const data = result.sportData as { totalPossessions: number };

    // NBA games have ~95-110 possessions per team = 190-220 total
    // (allowing for OT, the upper bound goes higher; tolerate a wider range)
    expect(data.totalPossessions).toBeGreaterThan(150);
    expect(data.totalPossessions).toBeLessThan(280);
  });
});
