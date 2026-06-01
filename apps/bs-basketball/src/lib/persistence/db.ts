/**
 * IndexedDB persistence for BS Hoops leagues, via Dexie.
 *
 * Schema:
 *   leagues — full BaseLeagueState blobs, keyed by id. The id is a UUID
 *             generated at league creation; we keep a denormalized
 *             updatedAt for the load-screen list.
 *
 * Why Dexie + IndexedDB: the league state is large (30 teams × 15 players ×
 * ratings + 1230 game results), much bigger than what we'd want sitting in
 * localStorage. Dexie gives us a clean async API.
 *
 * Why no Supabase yet: 2C-2a ships local-only. Cloud sync arrives in a
 * later slice; the JSON blob shape is straightforward to mirror over.
 */

import Dexie, { type Table } from 'dexie';
import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import { repairRosterPositions } from './repair';

// ===========================================================================
// Types
// ===========================================================================

export type BasketballLeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export interface LeagueSaveRow {
  id: string;
  displayName: string;
  currentSeason: number;
  currentPhase: string;
  teamCount: number;
  playerCount: number;
  updatedAt: number;
  /** JSON-serialized full league state. */
  state: string;
}

/** Summary fields for the load-screen list — avoids deserializing the full
 *  state blob until the user picks one. */
export interface LeagueSaveMeta {
  id: string;
  displayName: string;
  currentSeason: number;
  currentPhase: string;
  teamCount: number;
  playerCount: number;
  updatedAt: number;
}

// ===========================================================================
// Dexie schema
// ===========================================================================

class BasketballDb extends Dexie {
  leagues!: Table<LeagueSaveRow, string>;

  constructor() {
    super('bs-hoops');
    this.version(1).stores({
      // id is the primary key; updatedAt indexed for "Continue" (most recent).
      leagues: 'id, updatedAt, currentSeason',
    });
  }
}

// Singleton — module-scoped so all callers share the same connection.
let _db: BasketballDb | null = null;
function db(): BasketballDb {
  if (!_db) _db = new BasketballDb();
  return _db;
}

// ===========================================================================
// Public API
// ===========================================================================

/** Persist a league. New leagues create a row; existing leagues overwrite. */
export async function saveLeague(state: BasketballLeagueState): Promise<void> {
  const row: LeagueSaveRow = {
    id: state.id,
    displayName: state.displayName,
    currentSeason: state.currentSeason,
    currentPhase: state.currentPhase,
    teamCount: state.teams.length,
    playerCount: Object.keys(state.players).length,
    updatedAt: Date.now(),
    state: JSON.stringify(state),
  };
  await db().leagues.put(row);
}

/** Load a single league by id. Returns null if it doesn't exist or fails to parse. */
export async function loadLeague(id: string): Promise<BasketballLeagueState | null> {
  const row = await db().leagues.get(id);
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.state) as BasketballLeagueState;
    // Heal any save left with a position at 0 players by an older waiver bug —
    // idempotent, so it's a no-op for healthy saves.
    const { state, repaired } = repairRosterPositions(parsed);
    if (repaired) console.warn('[bs-hoops] repaired roster positions on load for', id);
    return state;
  } catch (err) {
    console.error('[bs-hoops] failed to parse league save:', err);
    return null;
  }
}

/** List all saved leagues, most-recent first. Returns metadata only. */
export async function listLeagues(): Promise<LeagueSaveMeta[]> {
  const rows = await db().leagues.orderBy('updatedAt').reverse().toArray();
  return rows.map(({ state: _state, ...meta }) => meta);
}

/** Most recent save — for the "Continue" button shortcut. */
export async function mostRecentLeague(): Promise<LeagueSaveMeta | null> {
  const all = await listLeagues();
  return all[0] ?? null;
}

/** Delete a single league. */
export async function deleteLeague(id: string): Promise<void> {
  await db().leagues.delete(id);
}

/** Rename a saved league (updates the stored displayName + the row meta). */
export async function renameLeague(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const row = await db().leagues.get(id);
  if (!row) return;
  let state = row.state;
  try {
    const parsed = JSON.parse(row.state) as BasketballLeagueState;
    parsed.displayName = trimmed;
    state = JSON.stringify(parsed);
  } catch { /* keep original state blob if it won't parse */ }
  await db().leagues.put({ ...row, displayName: trimmed, state });
}

/** Nuke all saves. Used by the settings page (later 2C slice). */
export async function clearAllLeagues(): Promise<void> {
  await db().leagues.clear();
}
