/**
 * Global GM leaderboard sync payload (parity 3.3): derives the completed-season
 * payload and excludes God-Mode / spectator / imported saves (decision D3).
 */

import { describe, it, expect } from 'vitest';
import { buildGmSyncPayload } from '@/../apps/bs-basketball/src/lib/gm/gmSync';
import { setGodMode } from '@/../apps/bs-basketball/src/lib/godMode/godMode';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import { initializePlayoffs, simPlayoffDay, getBracket, isRegularSeasonComplete } from '@/../apps/bs-basketball/src/lib/playoffs';

type League = ReturnType<typeof createNewBasketballLeague>;
function reg(l: League): League { let g = 0; while (!isRegularSeasonComplete(l) && g < 500) { const r = simNextDay(l); if (!r) break; l = r.league as League; g++; } return l; }
function po(l: League): League { let c = initializePlayoffs(l) as League, g = 0; while (!getBracket(c)!.complete && g < 200) { const r = simPlayoffDay(c); if (!r) break; c = r.league as League; g++; } return c; }

describe('buildGmSyncPayload', () => {
  // A finished season with a crowned champion.
  const finished = po(reg(createNewBasketballLeague({ rngSeed: 'gm-sync' }))) as League;
  const champId = getBracket(finished)!.championTeamId!;

  it('derives the payload for the managed team, flagging champion + playoffs', () => {
    const league = { ...finished, userTeamId: champId };
    const p = buildGmSyncPayload(league)!;
    expect(p).not.toBeNull();
    expect(p.teamId).toBe(champId);
    expect(p.wonChampionship).toBe(true);
    expect(p.madePlayoffs).toBe(true);
    expect(p.season).toBe(league.currentSeason);
    expect(p.wins + p.losses).toBeLessThanOrEqual(82);
  });

  it('excludes spectator, God Mode, and imported saves', () => {
    expect(buildGmSyncPayload({ ...finished, userTeamId: null })).toBeNull(); // spectator
    expect(buildGmSyncPayload(setGodMode({ ...finished, userTeamId: champId }, true))).toBeNull(); // god mode
    const imported = { ...finished, userTeamId: champId, sportData: { ...(finished.sportData as object), imported: true } };
    expect(buildGmSyncPayload(imported)).toBeNull(); // imported roster
  });

  it('stays excluded after God Mode is toggled back off (sticky)', () => {
    const used = setGodMode({ ...finished, userTeamId: champId }, true);
    const off = setGodMode(used, false);
    expect(buildGmSyncPayload(off)).toBeNull();
  });
});
