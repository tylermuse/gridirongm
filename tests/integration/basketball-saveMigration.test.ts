/**
 * Save-schema migration (parity 4.3): old/versionless saves get stamped to the
 * current version on load; current saves pass through untouched.
 */

import { describe, it, expect } from 'vitest';
import { migrateSave, CURRENT_SAVE_VERSION } from '@/../apps/bs-basketball/src/lib/persistence/migrations';
import type { BasketballLeagueState } from '@/../apps/bs-basketball/src/lib/persistence/db';

function fakeSave(version: number | undefined): BasketballLeagueState {
  return { saveVersion: version, displayName: 'x', teams: [], players: {} } as unknown as BasketballLeagueState;
}

describe('migrateSave', () => {
  it('stamps a versionless save up to the current version', () => {
    const { state, migrated } = migrateSave(fakeSave(undefined));
    expect(migrated).toBe(true);
    expect(state.saveVersion).toBe(CURRENT_SAVE_VERSION);
  });

  it('is a no-op for a current-version save', () => {
    const { state, migrated } = migrateSave(fakeSave(CURRENT_SAVE_VERSION));
    expect(migrated).toBe(false);
    expect(state.saveVersion).toBe(CURRENT_SAVE_VERSION);
  });

  it('is idempotent', () => {
    const once = migrateSave(fakeSave(undefined)).state;
    const twice = migrateSave(once);
    expect(twice.migrated).toBe(false);
    expect(twice.state.saveVersion).toBe(CURRENT_SAVE_VERSION);
  });
});
