/**
 * BUG-20: an imported league's inaugural draft runs the FULL offseason —
 * Draft → Re-sign → Free Agency — instead of tipping straight into the season.
 * The "skip" finishes the inaugural draft in place (no year roll), and the
 * re-sign cap projection targets the draft season (currentSeason for inaugural,
 * currentSeason + 1 for a normal offseason).
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { nextAction } from '@/../apps/bs-basketball/src/lib/ui/nextAction';
import { resignProjection } from '@/../apps/bs-basketball/src/lib/roster/resignProjection';
import type { BasketballTeam } from '@bs/sport-basketball';

const base = createNewBasketballLeague({ rngSeed: 'inaugural-flow' });

/** Attach a complete draft (inaugural or not) and a ≤15-man user roster so the
 *  "skip to season" secondary is offered (it's hidden when over the limit). */
function withDraft(inaugural: boolean, season: number) {
  const teams = base.teams.map((t, i) =>
    i === 0 ? { ...t, playerIds: t.playerIds.slice(0, 15) } : t,
  );
  return {
    ...base,
    teams,
    userTeamId: teams[0].id,
    sportData: {
      ...(base.sportData as object),
      draft: {
        season,
        picks: [],
        poolIds: [],
        currentPick: 0,
        complete: true,
        lotteryRevealed: true,
        inaugural,
      },
    },
  };
}

describe('inaugural full offseason flow (BUG-20)', () => {
  it('routes the inaugural draft through Re-sign; skip finishes in place (no year roll)', () => {
    const action = nextAction(withDraft(true, base.currentSeason));
    expect(action.primary).toBe('goReSign');
    const skip = action.secondary?.find(s => s.label.toLowerCase().includes('skip'));
    expect(skip?.key).toBe('finishInaugural');
  });

  it('a normal offseason draft still rolls the year on skip', () => {
    const action = nextAction(withDraft(false, base.currentSeason + 1));
    expect(action.primary).toBe('goReSign');
    const skip = action.secondary?.find(s => s.label.toLowerCase().includes('skip'));
    expect(skip?.key).toBe('startNextSeason');
  });

  it('re-sign projection targets the draft season', () => {
    const team = base.teams[0] as BasketballTeam;
    // Inaugural tips into the current season (no roll).
    expect(resignProjection(withDraft(true, base.currentSeason), team, {}).nextSeason).toBe(base.currentSeason);
    // Normal offseason commits next-season dollars.
    expect(resignProjection(withDraft(false, base.currentSeason + 1), team, {}).nextSeason).toBe(base.currentSeason + 1);
  });
});
