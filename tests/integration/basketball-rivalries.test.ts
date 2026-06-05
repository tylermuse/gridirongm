/**
 * Rivalries (parity 3.2): notable division head-to-heads become rivalry beats,
 * and they reach the news feed.
 */

import { describe, it, expect } from 'vitest';
import { buildRivalryEvents } from '@/../apps/bs-basketball/src/lib/rivalries/rivalries';
import { buildFeed } from '@/../apps/bs-basketball/src/lib/feed/buildFeed';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simThroughDay } from '@/../apps/bs-basketball/src/lib/sim/simRange';
import type { BasketballLeagueState } from '@/../apps/bs-basketball/src/lib/persistence/db';
import type { BasketballTeam } from '@bs/sport-basketball';

describe('rivalries', () => {
  it('only flags division opponents, and surfaces close/OT beats in the news', () => {
    const league = simThroughDay(createNewBasketballLeague({ rngSeed: 'rivalry' }), 80).league as BasketballLeagueState;
    const events = buildRivalryEvents(league);
    expect(events.length).toBeGreaterThan(0);

    const divOf = new Map((league.teams as BasketballTeam[]).map(t => [t.id, (t.sportData as { division: string }).division]));
    for (const e of events) {
      // Both teams share a division.
      expect(divOf.get(e.homeTeamId)).toBe(divOf.get(e.awayTeamId));
      expect(['thriller', 'overtime', 'statement']).toContain(e.kind);
    }

    // Close/OT beats reach the feed as rivalry items (blowouts are left to big_game).
    const feedRivalries = buildFeed(league).filter(i => i.kind === 'rivalry');
    if (events.some(e => e.kind !== 'statement')) {
      expect(feedRivalries.length).toBeGreaterThan(0);
    }
    expect(buildFeed(league).find(i => i.kind === 'rivalry' && i.headline.includes('rout'))).toBeUndefined();
  });
});
