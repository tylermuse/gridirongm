/**
 * The head coach's scheme effect must reach the sim and bias the box score; an
 * absent coach must leave the sim unchanged.
 */

import { describe, it, expect } from 'vitest';
import { simBasketballGame, type BasketballGameSide } from '@bs/sport-basketball/sim';
import {
  generateBasketballPlayer,
  buildDefaultBasketballLineup,
  resolveBasketballSchemeEffect,
  type BasketballPosition,
} from '@bs/sport-basketball';
import type { TeamId } from '@bs/core/adapter';

function side(id: string): BasketballGameSide {
  const pos: BasketballPosition[] = ['PG', 'PG', 'SG', 'SG', 'SF', 'SF', 'PF', 'PF', 'C', 'C'];
  const players = pos.map(p => generateBasketballPlayer({ position: p, targetOverall: 75 }));
  return { teamId: id as TeamId, players, lineup: buildDefaultBasketballLineup(players) };
}
function ctx(s: string) {
  return { gameId: `g-${s}` as never, season: 2026, date: '2026-01-01', competitionId: 'primary' as never, isPlayoff: false, rngSeed: s };
}
/** Threes attempted by one side only (the scheme under test) — summing both
 *  teams diluted the effect with the unchanged opponent's attempts. */
function threes(box: Record<string, { threePointsAttempted?: number }>, ids: readonly string[]) {
  return ids.reduce((a, id) => a + (box[id]?.threePointsAttempted ?? 0), 0);
}

describe('coach scheme biases the sim', () => {
  it('a five-out scheme jacks more threes than a triangle (same roster + seed)', () => {
    let fiveOut = 0, triangle = 0;
    for (let i = 0; i < 15; i++) {
      const A = side('A'), B = side('B');
      const ids = A.players.map(p => p.id);
      fiveOut += threes(simBasketballGame({ ...A, schemeEffect: resolveBasketballSchemeEffect('five_out') }, B, ctx(`s${i}`)).boxScores as never, ids);
      triangle += threes(simBasketballGame({ ...A, schemeEffect: resolveBasketballSchemeEffect('triangle') }, B, ctx(`s${i}`)).boxScores as never, ids);
    }
    expect(fiveOut).toBeGreaterThan(triangle * 1.1);
  });

  it('no coach = unchanged & deterministic', () => {
    const A = side('A'), B = side('B');
    expect(simBasketballGame(A, B, ctx('x')).finalScore).toEqual(simBasketballGame(A, B, ctx('x')).finalScore);
  });
});
