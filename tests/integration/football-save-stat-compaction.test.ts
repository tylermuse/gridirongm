/**
 * Compact stat lines in the Football save (saveStatCompaction.ts).
 *
 * Saves reached 90MB+ in IndexedDB because every PlayerStats object was
 * written with all of its fields, and 62% of a nine-season save was fields
 * whose value is 0. The save on disk now leaves those out; loading puts them
 * back before anything else sees the state.
 *
 * What must hold:
 *  - a league saved and loaded again is the league that was saved;
 *  - a save from before this change (every field written) loads the same;
 *  - every way a save gets into the store ends with full stat lines: the
 *    autosave, a save slot, a native-save import (the cloud restore is the
 *    same write-then-reload and is covered in football-cloud-autosave.test.ts);
 *  - migrations run on a compact save exactly as on a full one;
 *  - the things that read the raw autosave string still work.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getItem, setItem, flushPendingWrites } from '@bs/core/storage';
import { emptyStats } from '@/types';
import { loadNativeSaveIntoApp } from '@/lib/data/leagueImport';
import { compactSaveStats, expandSaveStats, parseSave, serializeSave } from '@/lib/engine/saveStatCompaction';
import { flushToStorage, retrySaveLoad, useGameStore, whenSaveLoadSettles } from '@/lib/engine/store';

const AUTOSAVE_KEY = 'gridiron-gm-autosave';
const STAT_KEYS = Object.keys(emptyStats());

type Line = Record<string, unknown>;
interface SavedPlayer {
  id: string;
  mood?: number;
  stats: Line;
  careerStats: Line;
  previousSeasonStats?: Line;
  seasonLog?: { season: number; teamId: string; stats: Line }[];
}
interface SavedState {
  season: number;
  phase: string;
  userTeamId: string;
  teams: { id: string; abbreviation: string }[];
  players: SavedPlayer[];
}
interface Envelope { state: SavedState; version: number }

const game = () => useGameStore.getState();

/** What the persist middleware hands the storage layer for the current league. */
function envelope(): Envelope {
  const { partialize, version } = useGameStore.persist.getOptions();
  return { state: partialize!(game()), version } as unknown as Envelope;
}

/** The persisted part of the league in memory, as plain data. */
const persisted = (): SavedState => JSON.parse(JSON.stringify(envelope().state));

/** The save as it was written before this change: every stat field present. */
const fullFieldSave = (version = 36): string => JSON.stringify({ ...envelope(), version });

function statLines(state: SavedState): Line[] {
  return state.players.flatMap(p => [
    p.stats,
    p.careerStats,
    ...(p.previousSeasonStats ? [p.previousSeasonStats] : []),
    ...(p.seasonLog ?? []).map(e => e.stats),
  ]);
}

function expectFullStatLines(state: SavedState): void {
  const lines = statLines(state);
  expect(lines.length).toBeGreaterThan(state.players.length);
  const incomplete = lines.filter(line => STAT_KEYS.some(k => typeof line[k] !== 'number'));
  expect(incomplete.length).toBe(0);
}

/** Where two leagues first differ, or null when they are the same. Used in
 *  place of toEqual on whole leagues: a mismatch there spends minutes
 *  building a diff of two multi-megabyte objects. */
function firstDifference(actual: unknown, expected: unknown, path = 'state'): string | null {
  if (Object.is(actual, expected)) return null;
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
  if (!isObj(actual) || !isObj(expected) || Array.isArray(actual) !== Array.isArray(expected)) {
    return `${path}: ${JSON.stringify(actual)?.slice(0, 80)} instead of ${JSON.stringify(expected)?.slice(0, 80)}`;
  }
  const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
  for (const key of keys) {
    if (!(key in actual)) return `${path}.${key}: missing`;
    if (!(key in expected)) return `${path}.${key}: unexpected`;
    const found = firstDifference(actual[key], expected[key], `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

function expectSameLeague(actual: SavedState, expected: SavedState, label = ''): void {
  expect(firstDifference(actual, expected), label).toBeNull();
}

/** Reload the league from the autosave key, as a page load does. */
async function reload(): Promise<SavedState> {
  const playersBefore = game().players;
  expect(await retrySaveLoad()).toBe('ready');
  expect(game().players).not.toBe(playersBefore); // came from disk, not memory
  return persisted();
}

async function newLeague(): Promise<void> {
  await whenSaveLoadSettles();
  // The generated league (no roster file): the fetch failure is expected.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await game().newLeague('');
  vi.mocked(console.error).mockRestore();
}

/** Re-signing, free agency and the draft, through to the next preseason. */
function finishOffseason(): void {
  if (game().phase === 'playoffs') game().advanceToResigning();
  game().passOnResigningBatch(game().resigningPlayers.map(r => r.playerId));
  game().advanceToFreeAgency();
  for (let guard = 0; game().phase === 'freeAgency' && guard < 40; guard++) game().advanceFAWeek();
  if (game().phase !== 'draft') game().advanceToDraft();
  game().simToEndDraft({ skipAdvance: true });
  game().startNewSeason();
}

/** Play whole seasons (every game, the playoffs, the offseason) the way the
 *  buttons do. A generated league starts in its first offseason, which is
 *  finished first and not counted. */
function playSeasons(count: number): void {
  vi.stubGlobal('alert', () => {});
  if (game().phase !== 'preseason' && game().phase !== 'regular') finishOffseason();
  for (let n = 0; n < count; n++) {
    if (game().phase === 'preseason') { game().autoCutToRosterLimit(); game().skipPreseason(); }
    for (let guard = 0; game().phase === 'regular' && guard < 40; guard++) game().simWeek();
    if (game().phase === 'regular') game().advanceToPlayoffs();
    game().simAllPlayoffGames();
    finishOffseason();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('compacting and expanding stat lines', () => {
  const full = (over: Line = {}): Line => ({ ...emptyStats(), ...over });

  it('leaves out zero stat fields in all four places and puts them back', () => {
    const save = {
      version: 37,
      state: {
        teams: [{ id: 't1' }],
        players: [{
          id: 'p1',
          ratings: { speed: 0 },
          stats: full({ gamesPlayed: 3, tackles: 11 }),
          careerStats: full({ gamesPlayed: 40, tackles: 190, sacks: 2.5 }),
          previousSeasonStats: full({ gamesPlayed: 17 }),
          seasonLog: [
            { season: 2025, teamId: 't1', stats: full({ gamesPlayed: 17, tackles: 88 }) },
            { season: 2026, teamId: 't0', stats: full() },
          ],
        }],
      },
    };
    const before = structuredClone(save);
    const compact = compactSaveStats(save);
    expect(save).toEqual(before); // the league in memory is not touched

    const p = compact.state.players[0];
    expect(p.stats).toEqual({ gamesPlayed: 3, tackles: 11 });
    expect(p.careerStats).toEqual({ gamesPlayed: 40, tackles: 190, sacks: 2.5 });
    expect(p.previousSeasonStats).toEqual({ gamesPlayed: 17 });
    expect(p.seasonLog).toEqual([
      { season: 2025, teamId: 't1', stats: { gamesPlayed: 17, tackles: 88 } },
      { season: 2026, teamId: 't0', stats: {} },
    ]);
    expect(p.ratings).toEqual({ speed: 0 }); // only stat lines are compacted

    expect(parseSave(serializeSave(save))).toEqual(before);
  });

  it('keeps anything that is not a zero-valued stat field exactly as it was', () => {
    const odd = full({ passYards: null, rushYards: -4, sacks: 0.5, customTally: 0, note: '' });
    const save = { state: { teams: [], players: [{ id: 'p', stats: odd, careerStats: full() }] }, version: 37 };
    const compact = compactSaveStats(save).state.players[0];
    expect(compact.stats).toEqual({ passYards: null, rushYards: -4, sacks: 0.5, customTally: 0, note: '' });
    expect(parseSave(serializeSave(save))).toEqual(save);
  });

  it('expanding a save that already has every field changes nothing', () => {
    const save = { state: { teams: [], players: [{ id: 'p', stats: full({ snaps: 9 }), careerStats: full() }] }, version: 36 };
    const expanded = expandSaveStats(structuredClone(save));
    expect(expanded).toEqual(save);
    expect(Object.keys(expanded.state.players[0].stats)).toEqual(STAT_KEYS);
  });

  it('leaves a player without the optional stat lines without them', () => {
    const save = { state: { teams: [], players: [{ id: 'p', stats: full(), careerStats: full() }] }, version: 37 };
    const back = parseSave<typeof save>(serializeSave(save));
    expect(back.state.players[0]).not.toHaveProperty('previousSeasonStats');
    expect(back.state.players[0]).not.toHaveProperty('seasonLog');
  });

  it('does not trip on shapes it does not know', () => {
    for (const value of [null, 7, 'x', [], {}, { state: null }, { state: { players: 'none' } }, { state: { players: [null, 3, { stats: [1, 2] }] } }]) {
      expect(expandSaveStats(structuredClone(value))).toEqual(value);
      expect(compactSaveStats(value)).toEqual(value);
    }
    // A bare state with no envelope (the oldest saves) is handled too.
    const bare = { teams: [], players: [{ id: 'p', stats: full({ snaps: 1 }), careerStats: full() }] };
    expect(compactSaveStats(bare).players[0].stats).toEqual({ snaps: 1 });
    expect(parseSave(serializeSave(bare))).toEqual(bare);
  });
});

describe('a fresh league', () => {
  it('is written compact and loads back as the league that was saved', async () => {
    await newLeague();
    const before = persisted();
    expectFullStatLines(before);

    await flushToStorage();
    const onDisk = (await getItem(AUTOSAVE_KEY))!;
    const written = JSON.parse(onDisk) as Envelope;
    expect(written.version).toBe(37);
    // No zero-valued stat field is on disk, and nothing but those is missing.
    expect(statLines(written.state).some(line => STAT_KEYS.some(k => line[k] === 0))).toBe(false);
    expectSameLeague(parseSave<Envelope>(onDisk).state, before);
    expect(onDisk.length).toBeLessThan(fullFieldSave().length * 0.5);

    const after = await reload();
    expectFullStatLines(after);
    expectSameLeague(after, before);
  });

  it('still reads as a league to everything that parses the raw autosave', async () => {
    // GameApp's checkSave and the sidebar's slot list read these fields from
    // the string as stored, with no expansion.
    const raw = JSON.parse((await getItem(AUTOSAVE_KEY))!);
    const state = raw.state ?? raw;
    const team = state.teams.find((t: { id: string }) => t.id === state.userTeamId);
    expect(team.abbreviation).toBe(game().teams.find(t => t.id === game().userTeamId)!.abbreviation);
    expect(state.season).toBe(game().season);
    expect(state.phase).toBe(game().phase);
    expect(typeof team.record.wins).toBe('number');

    // The save-wipe guard (rosterCount in @bs/core/storage) still sees a
    // roster in a compact save and refuses to put an empty league over it.
    const blocked = vi.spyOn(console, 'error').mockImplementation(() => {});
    const stored = await getItem(AUTOSAVE_KEY);
    await setItem(AUTOSAVE_KEY, JSON.stringify({ state: { teams: [], players: [] }, version: 37 }));
    expect(blocked).toHaveBeenCalledWith(expect.stringContaining('save-wipe guard'));
    expect(await getItem(AUTOSAVE_KEY)).toBe(stored);
  });
});

describe('a save written before this change', () => {
  it('loads as the same league, and is compact the next time it is written', async () => {
    await newLeague();
    playSeasons(1);
    const before = persisted();
    const old = fullFieldSave(36);

    await newLeague(); // something else in memory
    await setItem(AUTOSAVE_KEY, old);
    const after = await reload();
    expectSameLeague(after, before);
    expectFullStatLines(after);

    // Loading an older version makes the persist middleware save the migrated
    // league; that write is the compact form.
    await flushPendingWrites();
    const rewritten = (await getItem(AUTOSAVE_KEY))!;
    expect(JSON.parse(rewritten).version).toBe(37);
    expect(rewritten.length).toBeLessThan(old.length * 0.6);
    expectSameLeague(parseSave<Envelope>(rewritten).state, before);
  }, 60_000);

  it('loads from a save slot, full-field or compact', async () => {
    const { saveToSlot, loadFromSlot } = game();
    const before = persisted();
    const old = fullFieldSave(36);

    // Slot written by the new code: a byte copy of the compact autosave.
    await flushToStorage();
    await saveToSlot(4);
    expect(await getItem('gridiron-gm-save-4')).toBe(await getItem(AUTOSAVE_KEY));
    // Slot written before the change.
    await setItem('gridiron-gm-save-5', old);

    for (const slot of [4, 5]) {
      await newLeague();
      await flushToStorage();
      await loadFromSlot(slot); // copies the slot over the autosave, then reloads the page
      const after = await reload();
      expectSameLeague(after, before, `slot ${slot}`);
      expectFullStatLines(after);
    }
  }, 60_000);

  it('loads through the native-save import, full-field or compact', async () => {
    const before = persisted();
    const exports = [fullFieldSave(36), serializeSave(envelope())];
    for (const exported of exports) {
      await newLeague();
      await flushToStorage();
      await loadNativeSaveIntoApp(JSON.parse(exported));
      const after = await reload();
      expectSameLeague(after, before);
      expectFullStatLines(after);
    }
  }, 60_000);
});

describe('migrations on a compact save', () => {
  it('run from an old version and end with the same league as on a full-field save', async () => {
    await newLeague();
    playSeasons(1);
    // Age the save: an old version number, and without fields the migrations
    // add (v4 gives every player a mood, v3 the trade-popup setting).
    const aged = (serialized: string): string => {
      const save = JSON.parse(serialized);
      save.version = 2;
      delete save.state.suppressTradePopups;
      for (const p of save.state.players) delete p.mood;
      return JSON.stringify(save);
    };
    const loadAged = async (serialized: string): Promise<SavedState> => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      await setItem(AUTOSAVE_KEY, aged(serialized));
      const state = await reload();
      await flushPendingWrites();
      vi.mocked(Math.random).mockRestore();
      return state;
    };

    const compact = serializeSave(envelope());
    const full = fullFieldSave();
    expect(compact.length).toBeLessThan(full.length * 0.6);

    const fromFull = await loadAged(full);
    const fromCompact = await loadAged(compact);

    expect(fromCompact.players.every(p => typeof p.mood === 'number')).toBe(true);
    expect((fromCompact as unknown as { suppressTradePopups: boolean }).suppressTradePopups).toBe(false);
    expectFullStatLines(fromCompact);
    expectSameLeague(fromCompact, fromFull);
  }, 60_000);
});

describe('a league with several seasons of history', () => {
  it('is less than half the size on disk and still loads back exactly', async () => {
    await newLeague();
    const fresh = { full: fullFieldSave().length, compact: serializeSave(envelope()).length };
    playSeasons(4);
    const before = persisted();
    expect(before.players.some(p => (p.seasonLog?.length ?? 0) >= 4)).toBe(true);

    const full = fullFieldSave().length;
    await flushToStorage();
    const onDisk = (await getItem(AUTOSAVE_KEY))!;
    expect(onDisk.length).toBeLessThan(full * 0.5);
    // Growth per season is cut by more than half as well.
    expect((onDisk.length - fresh.compact) / 4).toBeLessThan(((full - fresh.full) / 4) * 0.5);

    const after = await reload();
    expectSameLeague(after, before);
    expectFullStatLines(after);
  }, 120_000);
});
