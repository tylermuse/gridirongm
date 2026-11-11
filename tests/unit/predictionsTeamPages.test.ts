import { describe, it, expect } from 'vitest';
import snapshot from '@/lib/data/predictions/nfl-latest.json';
import { teamSlug } from '@/lib/mockDraft/engine';
import { getMockDraftData } from '@/lib/mockDraft/serverData';
import type { NflOdds } from '@/lib/predictions/nflOdds';

const odds = snapshot as unknown as NflOdds;

describe('/predictions/[team] data', () => {
  it('uses the same 32 slugs as the mock draft team pages (and the sitemap)', () => {
    const oddsSlugs = odds.teams.map(teamSlug).sort();
    expect(new Set(oddsSlugs).size).toBe(32);
    expect(oddsSlugs).toEqual(getMockDraftData().teams.map(teamSlug).sort());
    // Abbreviations line up too, for logos and the /rosters/2026/[abbrev] links.
    expect(odds.teams.map((t) => t.abbrev).sort()).toEqual(getMockDraftData().teams.map((t) => t.abbrev).sort());
  });

  it('carries a full schedule with a win chance on every game still to play', () => {
    const games = odds.games ?? [];
    expect(games.length).toBe(272);
    for (const t of odds.teams) expect(games.filter((g) => g.home === t.abbrev || g.away === t.abbrev)).toHaveLength(17);
    for (const g of games) {
      if (g.done) expect(g.homeWinProb).toBeNull();
      else expect(g.homeWinProb).toBeGreaterThan(0);
    }
  });
});
