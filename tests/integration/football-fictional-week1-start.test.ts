/**
 * Homepage "Fictional league" choice (Tyler 11/14): a generated league starts
 * at Week 1 of the regular season, not in the re-signing phase. 56% of new
 * players who started in the offseason never simmed a week.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@bs/core/analytics/track', () => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/engine/gmSync', () => ({ buildGmSyncPayload: () => null, syncGmStats: vi.fn() }));

import { trackEvent } from '@bs/core/analytics/track';
import { useGameStore } from '@/lib/engine/store';

const st = () => useGameStore.getState();

describe('generated league, Week 1 start', () => {
  it('opens in the regular season with 0-0 records, no re-signings and no 2026 picks', async () => {
    vi.mocked(trackEvent).mockClear();
    await st().newLeague('DAL', undefined, 'regular', false, { entry: 'home_fictional' });
    const s = st();
    expect(s.phase).toBe('regular');
    expect(s.week).toBe(1);
    expect(s.resigningPlayers).toEqual([]);
    for (const t of s.teams) {
      expect(t.record.wins + t.record.losses).toBe(0);
      expect(t.draftPicks.some(pk => pk.year === 2026)).toBe(false);
      expect(t.draftPicks.some(pk => pk.year === 2027)).toBe(true);
    }
    const created = vi.mocked(trackEvent).mock.calls.find(c => c[0] === 'league_created');
    expect(created?.[1]).toMatchObject({ source: 'generated', start_mode: 'regular', entry: 'home_fictional' });
  });

  it('can sim the first week straight away', async () => {
    await st().newLeague('DAL', undefined, 'regular');
    st().simWeek();
    const s = st();
    expect(s.week).toBe(2);
    const played = s.schedule.filter(g => g.played && g.week === 1).length;
    expect(played).toBeGreaterThan(0);
  });

  it('still starts in the re-signing phase when offseason is asked for', async () => {
    await st().newLeague('DAL');
    expect(st().phase).toBe('resigning');
  });
});
