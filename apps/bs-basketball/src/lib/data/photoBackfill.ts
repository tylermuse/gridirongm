/**
 * Player-photo backfill.
 *
 * BUG-31 wired `imgURL` from BBGM imports through to PlayerAvatar — but only
 * future imports got the field stamped. Tyler's existing save (imported before
 * the fix landed) still showed the team-tinted initials badge for every NBA
 * player, even though the bundled NBA roster file has photo URLs for all of
 * them.
 *
 * This module fetches the bundled BBGM_NBA_Roster_2026_Updated.json on demand
 * and patches missing `photoUrl` fields on rostered players + FAs + draftees by
 * matching on first+last name. It's idempotent — once every player has a
 * photoUrl (or we've made one pass and the league is flagged), it short-
 * circuits — so it's safe to run on every hydrate.
 */

import type { BasketballLeagueState } from '@/lib/persistence/db';
import type { BasketballPlayer } from '@bs/sport-basketball';

const NBA_FILE = '/rosters/BBGM_NBA_Roster_2026_Updated.json';

interface BbgmPlayerLite {
  firstName?: string;
  lastName?: string;
  imgURL?: string;
}

/** Returns true if the league needs a photo backfill: it has rostered players
 *  with no photoUrl, and we haven't already attempted the patch this save. */
function needsBackfill(league: BasketballLeagueState): boolean {
  const sd = (league.sportData ?? {}) as { photoBackfillDone?: boolean };
  if (sd.photoBackfillDone) return false;
  // Sample the first ~30 players. If at least one has a photo, the import was
  // post-fix; if NONE do, run the backfill.
  let checked = 0;
  let withPhoto = 0;
  for (const id of Object.keys(league.players)) {
    const p = (league.players as Record<string, BasketballPlayer>)[id] as BasketballPlayer;
    if (!p.rosterSlot) continue;
    checked++;
    if ((p.sportData as { photoUrl?: string }).photoUrl) withPhoto++;
    if (checked >= 30) break;
  }
  return checked > 0 && withPhoto === 0;
}

/**
 * Try to patch missing photoUrl fields from the bundled NBA roster JSON.
 * Returns a new league if anything changed, the input otherwise. Errors are
 * swallowed (network blip, file moved) — backfill is best-effort. */
export async function backfillPlayerPhotos(
  league: BasketballLeagueState,
): Promise<BasketballLeagueState> {
  if (typeof window === 'undefined') return league;
  if (!needsBackfill(league)) return league;

  let photoByName: Map<string, string>;
  try {
    const res = await fetch(NBA_FILE);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const file = (await res.json()) as { players?: BbgmPlayerLite[] };
    photoByName = new Map();
    for (const bp of file.players ?? []) {
      if (!bp.imgURL || !bp.firstName || !bp.lastName) continue;
      photoByName.set(`${bp.firstName} ${bp.lastName}`.toLowerCase(), bp.imgURL);
    }
  } catch (err) {
    console.warn('[bs-hoops] photo backfill: failed to fetch roster file', err);
    // Flag the league so we don't keep retrying every navigation.
    return {
      ...league,
      sportData: {
        ...(league.sportData ?? {}),
        photoBackfillDone: true,
      },
    } as BasketballLeagueState;
  }

  const players = { ...league.players } as Record<string, BasketballPlayer>;
  let patched = 0;
  for (const id of Object.keys(players)) {
    const p = players[id] as BasketballPlayer;
    if ((p.sportData as { photoUrl?: string }).photoUrl) continue;
    const url = photoByName.get(`${p.firstName} ${p.lastName}`.toLowerCase());
    if (!url) continue;
    players[id] = {
      ...p,
      sportData: { ...p.sportData, photoUrl: url },
    } as BasketballPlayer;
    patched++;
  }

  return {
    ...league,
    players,
    sportData: {
      ...(league.sportData ?? {}),
      photoBackfillDone: true,
    },
  } as BasketballLeagueState;
}
