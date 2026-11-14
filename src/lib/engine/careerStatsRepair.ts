/**
 * Career totals that fell behind the seasons they are made of.
 *
 * Until this fix, a game the user played or watched live (commitLiveGame) was
 * added to `player.stats` but not to `player.careerStats`. Saves made before
 * it therefore hold career lines that are short by every live game, mostly for
 * the user's own team, and the player modal and player page show those lines.
 *
 * What a save does still hold is every season the career is made of:
 * `seasonLog[].stats` for the finished ones and `stats` for the one being
 * played, and only games ever write to those. So a career total can never
 * truly be below their sum, and that sum is used as a floor: each career stat
 * that is below it is raised to it. A career stat already at or above the
 * floor is left alone (it can be higher: a season with no log entry, or
 * history from before the log existed).
 *
 * One thing this cannot put right: yardage a player lost in his live games (a
 * quarterback's kneel-downs). The missing games left that career stat above
 * its seasons, not below, which looks the same as extra history, so it stays
 * a few yards high, as it was before the repair.
 *
 * Runs on every save as it is read from disk, after expandSaveStats and before
 * migrate. It only ever raises a number, and running it again on its own
 * output changes nothing, so it needs no save version of its own.
 */

import { emptyStats } from '@/types';

const STAT_KEYS = Object.keys(emptyStats());

/** Stats are whole numbers or half sacks, so sums are exact; this only keeps a
 *  stray float from counting as a shortfall. */
const EPSILON = 1e-9;

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Raise each of the player's career stats to the sum of his seasons where it
 *  is below it. */
function repairPlayer(player: unknown, currentSeason: unknown): void {
  if (!isObject(player) || !isObject(player.careerStats)) return;

  const lines: Json[] = [];
  let currentSeasonLogged = false;
  if (Array.isArray(player.seasonLog)) {
    for (const entry of player.seasonLog as unknown[]) {
      if (!isObject(entry) || !isObject(entry.stats)) continue;
      if (entry.season === currentSeason) currentSeasonLogged = true;
      lines.push(entry.stats);
    }
  }
  // `stats` is the season in progress until rollover moves it into the log.
  // If the log already has this season, do not count it twice.
  if (!currentSeasonLogged && isObject(player.stats)) lines.push(player.stats);
  if (lines.length === 0) return;

  const career = player.careerStats;
  let repaired: Json | null = null;
  for (const key of STAT_KEYS) {
    let floor = 0;
    for (const line of lines) floor += num(line[key]);
    if (floor > num(career[key]) + EPSILON) {
      repaired ??= { ...career };
      repaired[key] = floor;
    }
  }
  if (repaired) player.careerStats = repaired;
}

/**
 * Repair the career lines of a freshly parsed save, in place. Takes the
 * persist envelope `{ state, version }` or (very old saves) the bare state,
 * and is a no-op on anything that is not a save.
 */
export function repairSaveCareerStats<T>(save: T): T {
  if (!isObject(save)) return save;
  const state = isObject(save.state) ? save.state : save;
  if (!Array.isArray(state.players)) return save;
  for (const player of state.players as unknown[]) repairPlayer(player, state.season);
  return save;
}
