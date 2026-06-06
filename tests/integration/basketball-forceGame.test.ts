/**
 * God Mode force game outcome (parity 3.1d): forces the user's next game to a
 * win/loss, recording a consistent result (records + box score that sums).
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { setGodMode } from '@/../apps/bs-basketball/src/lib/godMode/godMode';
import { forceUserGameResult } from '@/../apps/bs-basketball/src/lib/godMode/forceGame';
import type { TeamId } from '@bs/core/adapter';
import type { BaseGameResult } from '@bs/core/adapter';
import type { BasketballStats } from '@bs/sport-basketball';

function gameDay(g: BaseGameResult<BasketballStats>): number {
  return (g.sportData as { dayOfSeason?: number } | undefined)?.dayOfSeason ?? 0;
}
const boxPoints = (g: BaseGameResult<BasketballStats>, teamPlayerIds: string[]) =>
  teamPlayerIds.reduce((s, id) => s + ((g.boxScores[id]?.points as number) ?? 0), 0);

describe('forceUserGameResult', () => {
  it('is a no-op without God Mode', () => {
    const league = { ...createNewBasketballLeague({ rngSeed: 'force' }), userTeamId: null };
    expect(forceUserGameResult(league, true)).toBeNull();
  });

  it('forces a win: records bump and the box score sums to the final score', () => {
    const base = createNewBasketballLeague({ rngSeed: 'force-win' });
    const uid = base.teams[0].id as TeamId;
    const league = setGodMode({ ...base, userTeamId: uid }, true);

    const userTeam = league.teams.find(t => t.id === uid)!;
    const beforeWins = userTeam.record.wins;

    const after = forceUserGameResult(league, true)!;
    expect(after).not.toBeNull();

    const played = (after.games as BaseGameResult<BasketballStats>[])
      .filter(g => g.status === 'played' && (g.homeTeamId === uid || g.awayTeamId === uid))
      .sort((a, b) => gameDay(b) - gameDay(a))[0];
    expect(played.finalScore).not.toBeNull();

    // User won.
    const userHome = played.homeTeamId === uid;
    const us = userHome ? played.finalScore!.home : played.finalScore!.away;
    const them = userHome ? played.finalScore!.away : played.finalScore!.home;
    expect(us).toBeGreaterThan(them);

    // Record bumped by exactly one win.
    const afterTeam = after.teams.find(t => t.id === uid)!;
    expect(afterTeam.record.wins).toBe(beforeWins + 1);
    expect(afterTeam.record.streak[afterTeam.record.streak.length - 1]).toBe('W');

    // Box scores sum to the final score for both teams.
    const homeIds = after.teams.find(t => t.id === played.homeTeamId)!.playerIds as string[];
    const awayIds = after.teams.find(t => t.id === played.awayTeamId)!.playerIds as string[];
    expect(boxPoints(played, homeIds)).toBe(played.finalScore!.home);
    expect(boxPoints(played, awayIds)).toBe(played.finalScore!.away);
  });

  it('forces a loss', () => {
    const base = createNewBasketballLeague({ rngSeed: 'force-loss' });
    const uid = base.teams[0].id as TeamId;
    const league = setGodMode({ ...base, userTeamId: uid }, true);
    const after = forceUserGameResult(league, false)!;
    const afterTeam = after.teams.find(t => t.id === uid)!;
    expect(afterTeam.record.losses).toBe(base.teams[0].record.losses + 1);
  });
});
