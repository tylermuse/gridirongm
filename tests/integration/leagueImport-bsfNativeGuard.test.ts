/**
 * Guard against silently crashing the FBGM importer when someone tries to
 * URL-import a BS Football native save export.
 *
 * The native save shape is `{ state: {...}, version: N }` (produced by
 * Save/Load → Export). The FBGM raw shape is `{ teams, players,
 * gameAttributes, draftPicks }` (produced by Football GM's Tools →
 * Import/Export → Export). Feeding native-save JSON to convertFbgmLeague
 * crashes at `league.teams.map(...)` with "Cannot read properties of
 * undefined (reading 'map')", which surfaces as the generic "Failed to
 * load league file. Check the URL and try again." — leaving the user
 * (somedude4759 5/27 attempting the FSL-2 community save) with no
 * actionable signal about what went wrong.
 */

import { describe, it, expect } from 'vitest';
import { looksLikeBsfNativeSave, loadNativeSaveIntoApp } from '@/lib/data/leagueImport';
import { getItem } from '@bs/core/storage';

describe('looksLikeBsfNativeSave', () => {
  it('detects the BS native save export shape ({state, version})', () => {
    expect(looksLikeBsfNativeSave({ state: { teams: [], players: [] }, version: 33 })).toBe(true);
  });

  it('does not flag an FBGM raw roster as native save', () => {
    expect(looksLikeBsfNativeSave({ teams: [], players: [], gameAttributes: { season: 2026 } })).toBe(false);
  });

  it('does not flag arbitrary objects', () => {
    expect(looksLikeBsfNativeSave({})).toBe(false);
    expect(looksLikeBsfNativeSave({ foo: 'bar' })).toBe(false);
  });

  it('does not flag null / non-objects', () => {
    expect(looksLikeBsfNativeSave(null)).toBe(false);
    expect(looksLikeBsfNativeSave(undefined)).toBe(false);
    expect(looksLikeBsfNativeSave('string')).toBe(false);
    expect(looksLikeBsfNativeSave(42)).toBe(false);
  });

  it('does not flag a file that happens to have a state field but is otherwise FBGM-shaped', () => {
    expect(looksLikeBsfNativeSave({ teams: [], state: 'something', version: 1 })).toBe(false);
  });
});

describe('loadNativeSaveIntoApp (§1.3 auto-route)', () => {
  it('persists the native save as the live autosave + returns season/team meta', async () => {
    const save = {
      state: {
        season: 2104,
        userTeamId: 'A',
        teams: [{ id: 'A', abbreviation: 'PHX', name: 'Suns' }],
      },
      version: 33,
    };
    const meta = await loadNativeSaveIntoApp(save);
    expect(meta.season).toBe(2104);
    expect(meta.teamAbbr).toBe('PHX');
    expect(meta.teamName).toBe('Suns');
    // It writes the exact blob to the autosave key the persist middleware reads.
    const stored = await getItem('gridiron-gm-autosave');
    expect(stored).toBe(JSON.stringify(save));
  });

  it('returns empty meta when the save has no userTeam yet (still persists)', async () => {
    const save = { state: { season: 1, teams: [] }, version: 30 };
    const meta = await loadNativeSaveIntoApp(save);
    expect(meta.season).toBe(1);
    expect(meta.teamAbbr).toBeUndefined();
  });

  it('rejects a non-native value rather than corrupting the autosave', async () => {
    await expect(loadNativeSaveIntoApp({ teams: [], players: [] })).rejects.toThrow();
  });
});
