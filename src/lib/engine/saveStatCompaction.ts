/**
 * Compact stat lines on disk.
 *
 * A PlayerStats object has every field, and most of them are 0 for most
 * players (a kicker has no tackles, a retired guard has no passing line in any
 * of his seasons). Written out in full, those zeros were 62% of a nine-season
 * save and the reason a long league reached 90MB+ in IndexedDB.
 *
 * So the save on disk leaves out every stat field whose value is 0, and
 * loading puts them back. In memory nothing changes: every stat object the
 * rest of the app sees still has every field, as a number.
 *
 *   write: store → compactSaveStats → JSON.stringify → IndexedDB / cloud
 *   load:  IndexedDB → JSON.parse → expandSaveStats → migrate → store
 *
 * Covered: `stats`, `careerStats`, `previousSeasonStats` and every
 * `seasonLog[].stats` of each entry in `state.players`. Box scores
 * (`schedule[].playerStats`) were already partial and are left alone.
 *
 * Every way a save reaches the store goes through the persist middleware's
 * `storage.getItem` (save slots, the native-save import and the cloud restore
 * all write the autosave key and reload), which is where expandSaveStats runs.
 * It is safe on a save from before this change: a stat line that already has
 * every field comes back the same.
 */

import { emptyStats } from '@/types';

/** The fields a stat line always carries in memory, in canonical order. */
const STAT_KEYS = Object.keys(emptyStats());
const STAT_KEY_SET: ReadonlySet<string> = new Set(STAT_KEYS);

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A copy of a stat line without its zero-valued stat fields. Anything that
 *  is not a known stat field, or not exactly 0, is kept as it is. */
function compactStatLine(line: Json): Json {
  const out: Json = {};
  for (const key in line) {
    const value = line[key];
    if (value !== 0 || !STAT_KEY_SET.has(key)) out[key] = value;
  }
  return out;
}

/** A full stat line: every stat field present (0 where the save had none),
 *  plus whatever else the saved line carried. */
function expandStatLine(line: Json): Json {
  const out = emptyStats() as unknown as Json;
  for (const key in line) out[key] = line[key];
  return out;
}

function compactPlayer(player: unknown): unknown {
  if (!isObject(player)) return player;
  const out: Json = { ...player };
  if (isObject(player.stats)) out.stats = compactStatLine(player.stats);
  if (isObject(player.careerStats)) out.careerStats = compactStatLine(player.careerStats);
  if (isObject(player.previousSeasonStats)) out.previousSeasonStats = compactStatLine(player.previousSeasonStats);
  if (Array.isArray(player.seasonLog)) {
    out.seasonLog = player.seasonLog.map((entry: unknown) =>
      isObject(entry) && isObject(entry.stats) ? { ...entry, stats: compactStatLine(entry.stats) } : entry,
    );
  }
  return out;
}

function expandPlayer(player: unknown): void {
  if (!isObject(player)) return;
  if (isObject(player.stats)) player.stats = expandStatLine(player.stats);
  if (isObject(player.careerStats)) player.careerStats = expandStatLine(player.careerStats);
  if (isObject(player.previousSeasonStats)) player.previousSeasonStats = expandStatLine(player.previousSeasonStats);
  if (Array.isArray(player.seasonLog)) {
    for (const entry of player.seasonLog as unknown[]) {
      if (isObject(entry) && isObject(entry.stats)) entry.stats = expandStatLine(entry.stats);
    }
  }
}

/** The league state inside a save: `{ state, version }` from the persist
 *  middleware, or (very old saves) the bare state. */
function stateOf(save: unknown): Json | null {
  if (!isObject(save)) return null;
  return isObject(save.state) ? save.state : save;
}

/**
 * The save as it goes to disk: the same envelope with every player's stat
 * lines compacted. Does not touch its argument; everything but the players'
 * stat lines is shared with it, so this is cheap enough to run on each write.
 */
export function compactSaveStats<T>(save: T): T {
  if (!isObject(save)) return save;
  const state = stateOf(save);
  if (!state || !Array.isArray(state.players)) return save;
  const compactState = { ...state, players: state.players.map(compactPlayer) };
  return (state === save ? compactState : { ...save, state: compactState }) as T;
}

/**
 * Put back the stat fields compactSaveStats left out, in place, on a freshly
 * parsed save. Run this on every save read from disk or the cloud before any
 * other code looks at it. A no-op on anything that is not a save.
 */
export function expandSaveStats<T>(save: T): T {
  const state = stateOf(save);
  if (state && Array.isArray(state.players)) {
    for (const player of state.players as unknown[]) expandPlayer(player);
  }
  return save;
}

/** Serialize a save for disk or the cloud, with compact stat lines. */
export function serializeSave(save: unknown): string {
  return JSON.stringify(compactSaveStats(save));
}

/** Parse a serialized save (compact or from before this format) back into the
 *  full in-memory shape. */
export function parseSave<T = unknown>(serialized: string): T {
  return expandSaveStats(JSON.parse(serialized) as T);
}
