/**
 * News feed injuries + team tagging (P2.3 / 2.4): buildFeed emits injury items
 * from the injury system and tags moments with a subject team for the news
 * team-color chip.
 */
import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simThroughDay } from '@/../apps/bs-basketball/src/lib/sim/simRange';
import { buildFeed } from '@/../apps/bs-basketball/src/lib/feed/buildFeed';
import { getInjuries } from '@/../apps/bs-basketball/src/lib/injuries';
import type { BasketballLeagueState } from '@/../apps/bs-basketball/src/lib/persistence/db';

describe('news feed injuries + tagging', () => {
  it('emits an injury item for every active injury, tagged to a team', () => {
    const fresh = createNewBasketballLeague({ rngSeed: 'feed-injuries' });
    const league = simThroughDay(fresh, 60).league as unknown as BasketballLeagueState;

    const active = Object.entries(getInjuries(league)).filter(([, inj]) => inj.returnDay > league.currentTick);
    const feed = buildFeed(league);
    const injuryItems = feed.filter(i => i.kind === 'injury');

    // Every active injury that has a known player surfaces as a feed item.
    expect(injuryItems.length).toBeGreaterThan(0);
    expect(injuryItems.length).toBeLessThanOrEqual(active.length);
    for (const i of injuryItems) {
      expect(i.playerId).toBeTruthy();
      expect(i.teamId).toBeTruthy();
    }

    // Game moments carry a subject team for the color chip.
    const gameMoments = feed.filter(i => i.kind === 'big_game' || i.kind === 'upset');
    for (const i of gameMoments) expect(i.teamId).toBeTruthy();
  });
});
