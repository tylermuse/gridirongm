/**
 * Play-by-play synthesis (broadcast viewer 2.2 / P3.1): events carry an icon
 * kind + points, scoring events sum to the real final, and the running score
 * lands exactly on the box score's final.
 */
import { describe, it, expect } from 'vitest';
import { synthesizePlayByPlay } from '@/../apps/bs-basketball/src/lib/live/playByPlay';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';

describe('play-by-play', () => {
  it('produces iconified events that end on the real final', () => {
    let league = createNewBasketballLeague({ rngSeed: 'pbp' });
    league = simNextDay(league)!.league;
    const game = league.games.find(g => g.status === 'played' && g.finalScore)!;
    const home = league.teams.find(t => t.id === game.homeTeamId) as BasketballTeam;
    const away = league.teams.find(t => t.id === game.awayTeamId) as BasketballTeam;

    const events = synthesizePlayByPlay(game, home, away, league.players as Record<string, BasketballPlayer>);
    expect(events.length).toBeGreaterThan(0);

    const VALID = new Set(['make3', 'make2', 'ft', 'block', 'steal', 'turnover', 'rebound']);
    for (const e of events) {
      expect(VALID.has(e.kind)).toBe(true);
      if (e.scoring) expect(e.points).toBeGreaterThan(0); else expect(e.points).toBe(0);
    }
    // make3 events award 3, ft award 1.
    for (const e of events) {
      if (e.kind === 'make3') expect(e.points).toBe(3);
      if (e.kind === 'ft') expect(e.points).toBe(1);
    }

    // Running score ends exactly on the final.
    const final = events[events.length - 1];
    expect(final.home).toBe(game.finalScore!.home);
    expect(final.away).toBe(game.finalScore!.away);
  });
});
