/**
 * Exhibition mode (/live): upload a Football GM league, pick any two teams,
 * and watch them play one game in the 3D sim.
 *
 * The uploaded league is loaded into the game store in memory only: saves are
 * suspended for the rest of the page load (suspendSavesForExhibition), so the
 * player's real franchise in IndexedDB is never touched, and the game result
 * is never committed to a season. Reloading the page brings their own league
 * back. The current matchup lives here, outside the store, so it is never
 * persisted either.
 *
 * "Play a full season with this league" stashes the uploaded JSON under
 * PENDING_UPLOAD_KEY and sends the player to /?import=fbgm, where the normal
 * new-league flow (which backs up an existing franchise to a free save slot
 * first) picks it up.
 */
import { useSyncExternalStore } from 'react';
import { getItem as idbGetItem, setItem as idbSetItem, removeItem as idbRemoveItem } from '@bs/core/storage';
import { useGameStore, suspendSavesForExhibition, whenSaveLoadSettles } from './store';

export interface Exhibition {
  /** Game id for /game/[id]. Never in the schedule. */
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  /** blob: URL of the uploaded league JSON, for "run it back" and the season hand-off. */
  leagueUrl: string;
  fileName: string | null;
}

/** IndexedDB key holding an uploaded league JSON on its way from /live to the new-league screen. */
export const PENDING_UPLOAD_KEY = 'bsfb-pending-fbgm-upload';

let current: Exhibition | null = null;
const listeners = new Set<() => void>();

function setCurrent(next: Exhibition | null): void {
  current = next;
  listeners.forEach(l => l());
}

export function getExhibition(): Exhibition | null {
  return current;
}

/** The exhibition being played on this page load, if any. */
export function useExhibition(): Exhibition | null {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => current,
    () => null,
  );
}

export function isExhibitionGameId(id: string): boolean {
  return id.startsWith('exhibition-');
}

/**
 * Load the uploaded league into memory (saves suspended) and set up one game:
 * `homeAbbr` hosts `awayAbbr`, the player coaching the home side. Returns the
 * game id to open at /game/[id].
 */
export async function startExhibition(opts: {
  leagueUrl: string;
  homeAbbr: string;
  awayAbbr: string;
  fileName?: string | null;
}): Promise<string> {
  if (opts.homeAbbr === opts.awayAbbr) throw new Error('Pick two different teams.');
  // Let the real autosave finish loading first, so it can't land on top of
  // the exhibition league; then stop all writes for this page load.
  await whenSaveLoadSettles();
  suspendSavesForExhibition();
  await useGameStore.getState().newLeague(opts.homeAbbr, opts.leagueUrl, 'regular', false, { source: 'exhibition' });
  const { teams } = useGameStore.getState();
  const home = teams.find(t => t.abbreviation === opts.homeAbbr);
  const away = teams.find(t => t.abbreviation === opts.awayAbbr);
  if (!home || !away) throw new Error('Could not find those teams in the league file.');
  const id = `exhibition-${Date.now().toString(36)}`;
  setCurrent({ id, homeTeamId: home.id, awayTeamId: away.id, leagueUrl: opts.leagueUrl, fileName: opts.fileName ?? null });
  return id;
}

/** Same matchup again as a fresh game (new id, so the game page starts over). */
export function rematchExhibition(): string | null {
  if (!current) return null;
  const id = `exhibition-${Date.now().toString(36)}`;
  setCurrent({ ...current, id });
  return id;
}

/** Keep the uploaded league for the new-league screen (see PENDING_UPLOAD_KEY). */
export async function stashUploadForSeason(): Promise<void> {
  if (!current) return;
  const json = await (await fetch(current.leagueUrl)).text();
  await idbSetItem(PENDING_UPLOAD_KEY, json);
}

/** Take (and clear) a league stashed by stashUploadForSeason. */
export async function takeStashedUpload(): Promise<string | null> {
  try {
    const json = await idbGetItem(PENDING_UPLOAD_KEY);
    if (json) await idbRemoveItem(PENDING_UPLOAD_KEY);
    return json;
  } catch {
    return null;
  }
}
