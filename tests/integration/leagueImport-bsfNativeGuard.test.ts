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
import { looksLikeBsfNativeSave } from '@/lib/data/leagueImport';

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
