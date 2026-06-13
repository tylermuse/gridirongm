/**
 * Trade finder / incoming offers (#6): every surfaced deal must be a legal trade
 * both sides accept (it's validated through the real evaluateTrade engine).
 */
import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { findDealsForPlayer, incomingOffers, type DealSuggestion } from '@/../apps/bs-basketball/src/lib/trade/finder';
import { isExecutable, evaluateTrade, type TradeSideInput } from '@/../apps/bs-basketball/src/lib/trade';
import type { BasketballPlayer } from '@bs/sport-basketball';

function executable(l: ReturnType<typeof createNewBasketballLeague>, d: DealSuggestion): boolean {
  const sides: TradeSideInput[] = [
    { teamId: l.userTeamId as TradeSideInput['teamId'], playerIds: d.giveIds as TradeSideInput['playerIds'], pickIds: d.givePickIds ?? [] },
    { teamId: d.partnerTeamId as TradeSideInput['teamId'], playerIds: d.getIds as TradeSideInput['playerIds'], pickIds: d.getPickIds ?? [] },
  ];
  return isExecutable(evaluateTrade(l, sides), sides);
}

describe('trade finder', () => {
  it('only surfaces legal, mutually-accepted deals', () => {
    let l = createNewBasketballLeague({ rngSeed: 'trade-finder' });
    l = { ...l, userTeamId: l.teams[0].id };
    const mid = l.teams[0].playerIds
      .map(id => (l.players as Record<string, BasketballPlayer>)[id])
      .sort((a, b) => b.ratings.overall - a.ratings.overall)[5];
    const deals = [...findDealsForPlayer(l, mid.id), ...incomingOffers(l)];
    expect(deals.length).toBeGreaterThan(0);
    for (const d of deals) expect(executable(l, d)).toBe(true);
  });
});
