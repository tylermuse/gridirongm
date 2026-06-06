/**
 * Team Spotlight show (P1.2 + 2.1): a weekly two-persona episode derived from
 * the feed + MVP race. Non-empty after games, deterministic, every story has a
 * category + a real two-voice exchange, and the week advances with the calendar.
 */
import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simThroughDay } from '@/../apps/bs-basketball/src/lib/sim/simRange';
import { buildSpotlight, SPOTLIGHT_HOSTS } from '@/../apps/bs-basketball/src/lib/show/spotlight';
import type { BasketballLeagueState } from '@/../apps/bs-basketball/src/lib/persistence/db';

describe('team spotlight', () => {
  it('builds a deterministic two-voice episode after games', () => {
    const fresh = createNewBasketballLeague({ rngSeed: 'spotlight' });
    const league = { ...simThroughDay(fresh, 40).league, userTeamId: fresh.teams[0].id } as unknown as BasketballLeagueState;

    const ep = buildSpotlight(league);
    expect(ep).not.toBeNull();
    expect(ep!.stories.length).toBeGreaterThan(0);
    expect(ep!.week).toBeGreaterThanOrEqual(1);

    for (const s of ep!.stories) {
      expect(s.category).toBeTruthy();
      expect(s.headline).toBeTruthy();
      expect(s.exchanges.length).toBeGreaterThan(0);
      // Commentator exchanges map to a named host; player/fan are bubble variants.
      for (const ex of s.exchanges) {
        if (ex.voice === 'analyst' || ex.voice === 'take') expect(SPOTLIGHT_HOSTS[ex.voice]).toBeDefined();
        else expect(['player', 'fan']).toContain(ex.voice);
      }
    }
    // At least one analyst and one take voice across the episode.
    const voices = new Set(ep!.stories.flatMap(s => s.exchanges.map(e => e.voice)));
    expect(voices.has('analyst')).toBe(true);
    expect(voices.has('take')).toBe(true);

    // Deterministic.
    const again = buildSpotlight(league);
    expect(again!.stories.map(s => s.headline)).toEqual(ep!.stories.map(s => s.headline));
  });

  it('returns null before any games are played', () => {
    const fresh = createNewBasketballLeague({ rngSeed: 'spotlight-empty' }) as unknown as BasketballLeagueState;
    expect(buildSpotlight(fresh)).toBeNull();
  });

  it('always leads with the user team (parity 1.3), even on a quiet night', () => {
    const fresh = createNewBasketballLeague({ rngSeed: 'spotlight-lead' });
    const played = new Set<string>();
    const base = simThroughDay(fresh, 40).league;
    for (const g of base.games) {
      if (g.status === 'played') { played.add(g.homeTeamId); played.add(g.awayTeamId); }
    }
    const userTeam = base.teams.find(t => played.has(t.id))!;
    const league = { ...base, userTeamId: userTeam.id } as unknown as BasketballLeagueState;

    const ep = buildSpotlight(league);
    expect(ep!.stories.length).toBeGreaterThan(1);
    expect(ep!.stories[0].category).toBe('Your Team');
    expect(ep!.stories[0].headline).toContain(userTeam.city);
  });
});
