/**
 * News feed variety (parity 1.4): trades surface as dated feed items and the
 * streak items are capped so they don't drown the feed.
 */

import { describe, it, expect } from 'vitest';
import { buildFeed } from '@/../apps/bs-basketball/src/lib/feed/buildFeed';
import { appendTransaction } from '@/../apps/bs-basketball/src/lib/transactions/transactions';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simThroughDay } from '@/../apps/bs-basketball/src/lib/sim/simRange';
import type { BasketballLeagueState } from '@/../apps/bs-basketball/src/lib/persistence/db';
import type { TeamId } from '@bs/core/adapter';

describe('news feed variety', () => {
  it('surfaces trades as dated feed items', () => {
    const fresh = createNewBasketballLeague({ rngSeed: 'feed-trade' });
    const base = simThroughDay(fresh, 20).league;
    const tA = base.teams[0].id as TeamId;
    const tB = base.teams[1].id as TeamId;
    const withTrade = appendTransaction(base, {
      kind: 'trade',
      season: base.currentSeason,
      teamIds: [tA, tB],
      summary: 'Blockbuster: stars swap cities',
      detail: 'A for B',
    }) as BasketballLeagueState;

    const feed = buildFeed(withTrade);
    const trade = feed.find(i => i.kind === 'trade');
    expect(trade).toBeDefined();
    expect(trade!.headline).toBe('Blockbuster: stars swap cities');
    expect(trade!.day).toBe(base.currentTick);
  });

  it('caps streak items so they do not dominate', () => {
    const fresh = createNewBasketballLeague({ rngSeed: 'feed-streak' });
    const league = simThroughDay(fresh, 60).league as BasketballLeagueState;
    const streaks = buildFeed(league).filter(i => i.kind === 'streak');
    expect(streaks.length).toBeLessThanOrEqual(3);
  });
});
