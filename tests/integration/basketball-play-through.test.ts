/**
 * Play-through / load management (P2.1): suiting up through a day-to-day injury
 * clears it now but elevates re-injury risk for a window; majors can't be
 * played through; and the elevated-risk multiplier raises the roll rate.
 */
import { describe, it, expect } from 'vitest';
import {
  playThroughInjury, getInjuries, getPlayThrough, isPlayingThrough, isInjuredOn,
  rollGameInjuries, canPlayThrough, type InjuryMap, type PlayThroughMap,
} from '@/../apps/bs-basketball/src/lib/injuries';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import type { BaseGameResult } from '@bs/core/adapter';
import type { BasketballStats } from '@bs/sport-basketball';

type GameResult = BaseGameResult<BasketballStats>;

function leagueWithInjury(severity: 'day_to_day' | 'major') {
  const base = createNewBasketballLeague({ rngSeed: 'pt' });
  const pid = base.teams[0].playerIds[0];
  const injuries: InjuryMap = {
    [pid]: { playerId: pid as never, bodyPart: 'ankle', severity, occurredDay: 10, returnDay: severity === 'major' ? 40 : 13 },
  };
  return { league: { ...base, sportData: { ...base.sportData, injuries } }, pid };
}

function gameMinutes(ids: string[]): GameResult {
  const boxScores: Record<string, Partial<BasketballStats>> = {};
  for (const id of ids) boxScores[id] = { minutes: 36 };
  return { id: 'g', season: 2026, competitionId: 'c', date: '', homeTeamId: 'h' as never, awayTeamId: 'a' as never, status: 'played', finalScore: { home: 1, away: 0 }, boxScores: boxScores as never, sportData: {} } as GameResult;
}

describe('play through', () => {
  it('clears a day-to-day injury and flags elevated risk', () => {
    const { league, pid } = leagueWithInjury('day_to_day');
    expect(canPlayThrough(getInjuries(league)[pid])).toBe(true);
    expect(isInjuredOn(getInjuries(league), pid, 11)).toBe(true);

    const after = playThroughInjury(league, pid, 11);
    expect(isInjuredOn(getInjuries(after), pid, 11)).toBe(false); // available now
    expect(isPlayingThrough(getPlayThrough(after), pid, 11)).toBe(true); // but flagged
    expect(isPlayingThrough(getPlayThrough(after), pid, 99)).toBe(false); // window expires
  });

  it('refuses to play through a major injury', () => {
    const { league, pid } = leagueWithInjury('major');
    expect(canPlayThrough(getInjuries(league)[pid])).toBe(false);
    const after = playThroughInjury(league, pid, 11);
    expect(isInjuredOn(getInjuries(after), pid, 11)).toBe(true); // still out
  });

  it('elevated risk raises the injury rate vs baseline', () => {
    // Roll the same large cohort with and without the play-through flag.
    const ids = Array.from({ length: 400 }, (_, i) => `p${i}`);
    const game = gameMinutes(ids);
    const baseline = rollGameInjuries({}, game, 5, 2026);
    const pt: PlayThroughMap = Object.fromEntries(ids.map(id => [id, { until: 20 }]));
    const elevated = rollGameInjuries({}, game, 5, 2026, pt);
    expect(Object.keys(elevated).length).toBeGreaterThan(Object.keys(baseline).length);
  });
});
