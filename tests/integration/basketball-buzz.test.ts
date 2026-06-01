/**
 * Social-media sim (#14): the Hoops Buzz timeline is derived from league
 * moments + transactions and must be non-empty after games are played,
 * newest-first, and fully deterministic across rebuilds (no persisted state,
 * no RNG — persona/engagement are hashed off the source event id).
 */
import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simThroughDay } from '@/../apps/bs-basketball/src/lib/sim/simRange';
import { buildBuzz } from '@/../apps/bs-basketball/src/lib/social/buzz';
import type { BasketballLeagueState } from '@/../apps/bs-basketball/src/lib/persistence/db';

describe('hoops buzz', () => {
  it('produces a newest-first, deterministic timeline after games', () => {
    const fresh = createNewBasketballLeague({ rngSeed: 'buzz' });
    const league = simThroughDay(fresh, 40).league as unknown as BasketballLeagueState;

    const a = buildBuzz(league);
    expect(a.length).toBeGreaterThan(0);
    // Sorted newest-first by day.
    for (let i = 1; i < a.length; i++) expect(a[i - 1].day).toBeGreaterThanOrEqual(a[i].day);
    // Every post is well-formed.
    for (const p of a) {
      expect(p.body).toBeTruthy();
      expect(p.handle.startsWith('@')).toBe(true);
      expect(p.likes).toBeGreaterThanOrEqual(0);
    }

    // Deterministic: same league → identical timeline (ids + bodies + counts).
    const b = buildBuzz(league);
    expect(b.map(p => `${p.id}|${p.body}|${p.likes}`)).toEqual(a.map(p => `${p.id}|${p.body}|${p.likes}`));
  });

  it('returns nothing for a brand-new league with no games', () => {
    const fresh = createNewBasketballLeague({ rngSeed: 'buzz-empty' }) as unknown as BasketballLeagueState;
    expect(buildBuzz(fresh)).toHaveLength(0);
  });
});
