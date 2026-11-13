/**
 * /live exhibitions: an uploaded Football GM league is loaded in memory to
 * play one game between any two teams, without ever touching the player's
 * saved franchise or writing the game into a season.
 */
import { describe, it, expect, vi } from 'vitest';
import { getItem as idbGetItem } from '@bs/core/storage';
import { useGameStore, flushToStorage, areSavesSuspended, whenSaveLoadSettles } from '@/lib/engine/store';
import {
  startExhibition, getExhibition, rematchExhibition, isExhibitionGameId,
  stashUploadForSeason, takeStashedUpload, PENDING_UPLOAD_KEY,
} from '@/lib/engine/exhibition';
import { buildExport } from './_fbgmExportFixture';

const AUTOSAVE_KEY = 'gridiron-gm-autosave';
const UPLOAD = { ...buildExport(), bsSource: 'upload' as const };
const UPLOAD_URL = 'blob:test/uploaded-league';

describe('exhibition sandbox', () => {
  it('plays an uploaded league without touching the saved franchise', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => UPLOAD, text: async () => JSON.stringify(UPLOAD) })));
    await whenSaveLoadSettles();

    // The player's real franchise, saved.
    await useGameStore.getState().newLeague('T05', UPLOAD_URL, 'regular');
    await flushToStorage();
    const savedBefore = await idbGetItem(AUTOSAVE_KEY);
    expect(savedBefore).toBeTruthy();
    const realUserTeam = useGameStore.getState().userTeamId;

    // Exhibition: T03 hosts T17.
    const id = await startExhibition({ leagueUrl: UPLOAD_URL, homeAbbr: 'T03', awayAbbr: 'T17', fileName: 'league.json.gz' });
    expect(isExhibitionGameId(id)).toBe(true);
    expect(areSavesSuspended()).toBe(true);

    const s = useGameStore.getState();
    const ex = getExhibition()!;
    expect(s.teams.find(t => t.id === ex.homeTeamId)!.abbreviation).toBe('T03');
    expect(s.teams.find(t => t.id === ex.awayTeamId)!.abbreviation).toBe('T17');
    expect(s.userTeamId).toBe(ex.homeTeamId);
    expect(s.userTeamId).not.toBe(realUserTeam);
    // The exhibition game is not on any schedule.
    expect(s.schedule.some(g => g.id === id)).toBe(false);

    // Nothing the exhibition does reaches storage: the store changed, the save didn't.
    useGameStore.getState().simWeek();
    await flushToStorage();
    await new Promise(r => setTimeout(r, 50));
    expect(await idbGetItem(AUTOSAVE_KEY)).toBe(savedBefore);

    // Run it back: same matchup, fresh game id.
    const again = rematchExhibition()!;
    expect(again).not.toBe(id);
    expect(getExhibition()).toMatchObject({ homeTeamId: ex.homeTeamId, awayTeamId: ex.awayTeamId });
    vi.unstubAllGlobals();
  });

  it('rejects a team playing itself', async () => {
    await expect(startExhibition({ leagueUrl: UPLOAD_URL, homeAbbr: 'T01', awayAbbr: 'T01' })).rejects.toThrow();
  });

  it('hands the uploaded league to the new-league screen exactly once', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify(UPLOAD) })));
    await stashUploadForSeason();
    const json = await takeStashedUpload();
    expect(JSON.parse(json!).teams).toHaveLength(32);
    expect(await idbGetItem(PENDING_UPLOAD_KEY)).toBeNull();
    expect(await takeStashedUpload()).toBeNull();
    vi.unstubAllGlobals();
  });
});
