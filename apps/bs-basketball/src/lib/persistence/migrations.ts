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
import type { BasketballPlayer } from '@bs/sport-basketball';
import { consensus2026Rank, consensus2026Value } from '../data/draft2026';

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
  // One-off normalization (version-independent): old imports were named "NBA YYYY".
  if (typeof s.displayName === 'string' && /^NBA \d{4}$/.test(s.displayName)) {
    s = { ...s, displayName: s.displayName.replace(/^NBA /, 'BS Hoops ') };
    migrated = true;
  }

  // Lift consensus-board draft prospects to their big-board rating in saves made
  // before they were on the board (the consensus value is otherwise only stamped
  // at import). Only touches prospects in the active draft pool, never rostered
  // players, and only raises (never lowers).
  const draft = (s.sportData as { draft?: { poolIds?: string[] } } | undefined)?.draft;
  if (draft?.poolIds?.length) {
    const players = { ...s.players } as Record<string, BasketballPlayer>;
    let changed = false;
    for (const id of draft.poolIds) {
      const p = players[id];
      if (!p) continue;
      const rank = consensus2026Rank(`${p.firstName} ${p.lastName}`);
      if (!rank) continue;
      const v = consensus2026Value(rank);
      const curPot = p.development?.potential ?? 0;
      // Stamp the consensus rank so the AI auto-pick anchors to the board
      // (BUG-19) — older saves predate the field even when the ratings lifted.
      const needsProjection = p.sportData.draftProjection !== rank;
      if (p.ratings.overall < v.overall || curPot < v.potential || needsProjection) {
        players[id] = {
          ...p,
          ratings: { ...p.ratings, overall: Math.max(p.ratings.overall, v.overall) },
          development: { ...p.development, potential: Math.max(curPot, v.potential) },
          sportData: { ...p.sportData, draftProjection: rank },
        };
        changed = true;
      }
    }
    if (changed) { s = { ...s, players }; migrated = true; }
  }
  return { state: s, migrated };
}
