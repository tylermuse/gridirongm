/**
 * Shared last-season stat-line helpers — one source of truth for the production
 * line shown in the Re-sign window (FEAT-23), Free Agency (FEAT-8), and the
 * player quick-view modal (FEAT-15), so they stay consistent.
 */

import type { BasketballPlayer } from '@bs/sport-basketball';

export interface SeasonLogLine {
  season: number;
  gamesPlayed: number;
  ppg: number;
  rpg: number;
  apg: number;
  per?: number;
}

/** The player's most recent logged season with games played, or null. */
export function lastSeasonLog(player: BasketballPlayer): SeasonLogLine | null {
  const log = player.sportData.seasonLog;
  const last = log && log.length ? log[log.length - 1] : null;
  return last && last.gamesPlayed ? last : null;
}

/** Per-game efficiency (NBA "PER" proxy), falling back to a box estimate. */
export function lineEfficiency(s: SeasonLogLine): number {
  return s.per ?? Math.round((s.ppg + s.rpg + s.apg) * 10) / 10;
}

/** Compact production line: "21.4 / 4.0 / 5.1 · 70 GP · 18.2 PER", or null when
 *  the player has no logged season. */
export function lastSeasonStatLine(player: BasketballPlayer): string | null {
  const s = lastSeasonLog(player);
  if (!s) return null;
  return `${s.ppg} / ${s.rpg} / ${s.apg} · ${s.gamesPlayed} GP · ${lineEfficiency(s)} PER`;
}
