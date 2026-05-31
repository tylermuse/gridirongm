/**
 * Regression: played games must keep their dayOfSeason, and the phase must
 * advance off 'preseason' (parity-audit bugs B1 + B2).
 *
 * B1: spreading the sim result onto the scheduled game dropped
 *     sportData.dayOfSeason, so the news feed read "Day 0".
 * B2: currentPhase stayed 'preseason' forever because nothing advanced it.
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import type { BaseGameResult } from '@bs/core/adapter';
import type { BasketballStats } from '@bs/sport-basketball';

function dayOf(g: BaseGameResult<BasketballStats>): number | undefined {
  return (g.sportData as { dayOfSeason?: number } | undefined)?.dayOfSeason;
}

describe('sim preserves dayOfSeason + advances phase', () => {
  it('keeps a real dayOfSeason on every played game and flips to regular_season', () => {
    let league = createNewBasketballLeague({ rngSeed: 'dayofseason' });
    expect(league.currentPhase).toBe('preseason');

    for (let i = 0; i < 10; i++) {
      const r = simNextDay(league);
      if (!r) break;
      league = r.league;
    }

    // Phase advanced (B2).
    expect(league.currentPhase).toBe('regular_season');

    // Every played game has a finite, non-negative dayOfSeason (B1) — none reset to undefined.
    const played = league.games.filter(g => g.status === 'played');
    expect(played.length).toBeGreaterThan(0);
    for (const g of played) {
      const d = dayOf(g);
      expect(typeof d).toBe('number');
      expect(Number.isFinite(d)).toBe(true);
      expect(d).toBeGreaterThanOrEqual(0);
    }
  });
});
