/**
 * Save-schema migrations (parity 4.3).
 *
 * Each persisted league carries a `saveVersion`. On load we step it forward
 * through any registered migrations up to CURRENT_SAVE_VERSION, so schema
 * changes don't break older saves. This replaces relying on ad-hoc repair
 * shims as the only forward-compat mechanism (repair still runs for data
 * healing; migrations are for deliberate schema bumps).
 *
 * To add a migration: bump CURRENT_SAVE_VERSION and register a function under
 * the version it migrates FROM (e.g. MIGRATIONS[1] turns a v1 save into v2).
 */

import type { BasketballLeagueState } from './db';

/** Bump this when the persisted shape changes; register the migration below. */
export const CURRENT_SAVE_VERSION = 1;

type Migration = (state: BasketballLeagueState) => BasketballLeagueState;

/** Keyed by the version a save is migrating FROM. */
const MIGRATIONS: Record<number, Migration> = {
  // 1: (s) => ({ ...s, /* shape changes for v1 → v2 */ }),
};

/** Step a parsed save up to CURRENT_SAVE_VERSION. Idempotent for current saves. */
export function migrateSave(state: BasketballLeagueState): { state: BasketballLeagueState; migrated: boolean } {
  let v = state.saveVersion ?? 0;
  let s = state;
  let migrated = false;
  while (v < CURRENT_SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (step) s = step(s);
    v += 1;
    migrated = true;
  }
  if (s.saveVersion !== CURRENT_SAVE_VERSION) {
    s = { ...s, saveVersion: CURRENT_SAVE_VERSION };
    migrated = true;
  }
  return { state: s, migrated };
}
