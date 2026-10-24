/**
 * Live viewer play log: the engine's possession log must replay to EXACTLY the
 * saved box score and final score, survive only on the user's recent games,
 * and narrate real misses/boards/assists (not the old box-score synthesis).
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import { eventsFromPlayLog, hasPlayLog } from '@/../apps/bs-basketball/src/lib/live/fromPlayLog';
import { PLAY_LOG_KEEP } from '@/../apps/bs-basketball/src/lib/live/trimPlayLogs';
import { computeEventBeats } from '@/../apps/bs-basketball/src/lib/live/beats';
import { computeMoments } from '@/../apps/bs-basketball/src/lib/live/moments';
import { winProbability } from '@/../apps/bs-basketball/src/lib/live/winProbability';
import type { BasketballPlayer, BasketballStats } from '@bs/sport-basketball';

const CODE_TO_FIELD: Record<string, keyof BasketballStats> = {
  pts: 'points', fgm: 'fieldGoalsMade', fga: 'fieldGoalsAttempted', '3pm': 'threePointsMade',
  '3pa': 'threePointsAttempted', ftm: 'freeThrowsMade', fta: 'freeThrowsAttempted', ast: 'assists',
  to: 'turnovers', orb: 'offensiveRebounds', drb: 'defensiveRebounds', reb: 'totalRebounds',
  stl: 'steals', blk: 'blocks', pf: 'personalFouls',
};

function seasonDays(days: number) {
  let league = createNewBasketballLeague({ rngSeed: 'live-log' });
  league = { ...league, userTeamId: league.teams[0].id };
  for (let i = 0; i < days; i++) { const r = simNextDay(league); if (!r) break; league = r.league; }
  return league;
}

describe('live play log', () => {
  const league = seasonDays(30);
  const uid = league.userTeamId!;
  const played = league.games.filter(g => g.status === 'played');
  const mine = played.filter(g => g.homeTeamId === uid || g.awayTeamId === uid);
  const logged = played.filter(g => hasPlayLog(g.sportData));

  it('keeps logs only on the user\'s most recent games', () => {
    expect(mine.length).toBeGreaterThan(PLAY_LOG_KEEP);
    expect(logged.length).toBe(PLAY_LOG_KEEP);
    for (const g of logged) expect(g.homeTeamId === uid || g.awayTeamId === uid).toBe(true);
  });

  it('replays to the exact final score and box score', () => {
    const teamAbbr = (id: string) => league.teams.find(t => t.id === id)!.abbreviation;
    for (const g of logged) {
      const events = eventsFromPlayLog(
        (g.sportData as { playLog: never }).playLog,
        league.players as Record<string, BasketballPlayer>,
        teamAbbr(g.homeTeamId), teamAbbr(g.awayTeamId),
      );
      const last = events[events.length - 1];
      expect({ home: last.home, away: last.away }).toEqual(g.finalScore);

      const acc: Record<string, Record<string, number>> = {};
      for (const e of events) for (const [pid, code, d] of e.stats ?? []) {
        const f = CODE_TO_FIELD[code];
        (acc[pid] ??= {})[f] = (acc[pid][f] ?? 0) + d;
      }
      for (const [pid, box] of Object.entries(g.boxScores)) {
        for (const f of Object.values(CODE_TO_FIELD)) {
          expect(acc[pid]?.[f] ?? 0, `${g.id} ${pid} ${f}`).toBe((box as Partial<BasketballStats>)[f] ?? 0);
        }
      }

      // Moments: a handful of banners per game, not one per play.
      const moments = computeMoments(events, computeEventBeats(events, 'H', 'A'), 'H', 'A');
      const chips = moments.filter(m => m.chip).length;
      expect(chips).toBeGreaterThan(0);
      expect(chips).toBeLessThan(events.length * 0.2);

      // Real narration: misses and rebounds exist, score never goes backwards.
      expect(events.some(e => e.kind === 'miss')).toBe(true);
      expect(events.some(e => e.kind === 'rebound')).toBe(true);
      for (let i = 1; i < events.length; i++) {
        expect(events[i].home).toBeGreaterThanOrEqual(events[i - 1].home);
        expect(events[i].away).toBeGreaterThanOrEqual(events[i - 1].away);
      }
    }
  });

  it('win probability is sane', () => {
    expect(winProbability(0, 2880)).toBeGreaterThan(0.5); // home edge at tip
    expect(winProbability(10, 60)).toBeGreaterThan(0.97);
    expect(winProbability(-10, 60)).toBeLessThan(0.03);
    expect(winProbability(3, 0)).toBe(1);
    expect(winProbability(-1, 0)).toBe(0);
  });
});
