/**
 * Last-season stat line — the source the roster table falls back to when the
 * current season has no games yet (BUG-24), so a new GM can read an inherited
 * roster on day 1 instead of a column of "—".
 */

import { describe, it, expect } from 'vitest';
import { lastSeasonLog, lastSeasonStatLine } from '@/../apps/bs-basketball/src/lib/stats/statLine';
import type { BasketballPlayer, PlayerSeasonLogEntry } from '@bs/sport-basketball';

const mk = (seasonLog: PlayerSeasonLogEntry[]) =>
  ({ sportData: { seasonLog } } as unknown as BasketballPlayer);

describe('last-season stat line (BUG-24 roster fallback)', () => {
  it('returns the most recent logged season with games', () => {
    const p = mk([
      { season: 2024, age: 24, overall: 76, gamesPlayed: 70, ppg: 12.0, rpg: 4.0, apg: 3.0, per: 14 },
      { season: 2025, age: 25, overall: 79, gamesPlayed: 65, ppg: 18.4, rpg: 5.1, apg: 4.0, per: 18 },
    ]);
    const last = lastSeasonLog(p)!;
    expect(last.season).toBe(2025);
    expect([last.ppg, last.rpg, last.apg]).toEqual([18.4, 5.1, 4.0]);
    expect(lastSeasonStatLine(p)).toContain('18.4 / 5.1 / 4');
  });

  it('returns null for a player with no logged season (rookie / fresh import)', () => {
    expect(lastSeasonLog(mk([]))).toBeNull();
    expect(lastSeasonStatLine(mk([]))).toBeNull();
  });
});
