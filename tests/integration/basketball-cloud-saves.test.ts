/**
 * Hoops cloud saves: the gzip+base64 encoding must round-trip a real league
 * exactly and shrink it enough to upload, and sync must stay a no-op while
 * the user hasn't opted in.
 */

import { describe, it, expect } from 'vitest';
import { createNewBasketballLeague } from '@/../apps/bs-basketball/src/lib/league/createLeague';
import { simNextDay } from '@/../apps/bs-basketball/src/lib/sim/runSimDay';
import { encodeSave, decodeSave, scheduleLeagueCloudPush, leagueSlot } from '@/../apps/bs-basketball/src/lib/persistence/cloud';
import { isCloudSyncEnabled } from '@bs/core/supabase/cloud-saves';

describe('hoops cloud saves', () => {
  let league = createNewBasketballLeague({ rngSeed: 'cloud' });
  for (let i = 0; i < 20; i++) { const r = simNextDay(league); if (!r) break; league = r.league; }
  const json = JSON.stringify(league);

  it('round-trips a league exactly and compresses it ≥5x', async () => {
    const enc = await encodeSave(json);
    expect(enc.startsWith('gz1:')).toBe(true);
    expect(enc.length).toBeLessThan(json.length / 5);
    expect(await decodeSave(enc)).toBe(json);
  });

  it('decodes legacy raw JSON payloads unchanged', async () => {
    expect(await decodeSave('{"a":1}')).toBe('{"a":1}');
  });

  it('is a no-op when sync is off', () => {
    expect(isCloudSyncEnabled()).toBe(false);
    expect(() => scheduleLeagueCloudPush(json, { id: league.id, displayName: 'x', currentSeason: 2026, currentPhase: 'regular_season', updatedAt: 0 })).not.toThrow();
    expect(leagueSlot(league.id)).toBe(`bs-hoops:${league.id}`);
  });
});
