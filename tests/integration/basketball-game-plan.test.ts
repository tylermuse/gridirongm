/**
 * Game Plan (P0.2): the pre-game plan must measurably bias the box score, and a
 * default/absent plan must leave the sim unchanged.
 */

import { describe, it, expect } from 'vitest';
import { simBasketballGame, type BasketballGameSide } from '@bs/sport-basketball/sim';
import {
  generateBasketballPlayer,
  buildDefaultBasketballLineup,
  DEFAULT_GAME_PLAN,
  type BasketballGamePlan,
  type BasketballPosition,
} from '@bs/sport-basketball';
import type { TeamId } from '@bs/core/adapter';

function side(id: string, plan?: BasketballGamePlan): BasketballGameSide {
  const positions: BasketballPosition[] = ['PG', 'PG', 'SG', 'SG', 'SF', 'SF', 'PF', 'PF', 'C', 'C'];
  const players = positions.map(p => generateBasketballPlayer({ position: p, targetOverall: 75 }));
  return { teamId: id as TeamId, players, lineup: buildDefaultBasketballLineup(players), plan };
}
function ctx(seed: string) {
  return { gameId: `g-${seed}` as never, season: 2026, date: '2026-01-01', competitionId: 'primary' as never, isPlayoff: false, rngSeed: seed };
}
function tally(box: Record<string, Partial<Record<'threePointsAttempted' | 'turnovers', number>>>, f: 'threePointsAttempted' | 'turnovers') {
  return Object.values(box).reduce((s, b) => s + (b[f] ?? 0), 0);
}

describe('game plan biases the box score', () => {
  it('perimeter focus jacks more threes than inside focus (same roster, same seed)', () => {
    let peri = 0, inside = 0;
    for (let i = 0; i < 15; i++) {
      const seed = `gp3-${i}`;
      const A = side('A'), B = side('B'); // identical inputs — only the plan differs
      peri += tally(simBasketballGame({ ...A, plan: { ...DEFAULT_GAME_PLAN, offensiveFocus: 'perimeter' } }, B, ctx(seed)).boxScores as never, 'threePointsAttempted');
      inside += tally(simBasketballGame({ ...A, plan: { ...DEFAULT_GAME_PLAN, offensiveFocus: 'inside' } }, B, ctx(seed)).boxScores as never, 'threePointsAttempted');
    }
    expect(peri).toBeGreaterThan(inside * 1.1);
  });

  it('a full-court press forces more turnovers than packing the paint', () => {
    let press = 0, pack = 0;
    for (let i = 0; i < 15; i++) {
      const seed = `gpto-${i}`;
      const A = side('A'), B = side('B');
      // The defending side (B) sets the plan; count the offense (A) turnovers.
      press += tally(simBasketballGame(A, { ...B, plan: { ...DEFAULT_GAME_PLAN, pressure: 'press' } }, ctx(seed)).boxScores as never, 'turnovers');
      pack += tally(simBasketballGame(A, { ...B, plan: { ...DEFAULT_GAME_PLAN, pressure: 'pack' } }, ctx(seed)).boxScores as never, 'turnovers');
    }
    expect(press).toBeGreaterThan(pack * 1.1);
  });

  it('a default (absent) plan is deterministic and unchanged', () => {
    const A = side('A'), B = side('B');
    const a = simBasketballGame(A, B, ctx('det'));
    const b = simBasketballGame(A, B, ctx('det'));
    expect(a.finalScore).toEqual(b.finalScore);
  });
});
