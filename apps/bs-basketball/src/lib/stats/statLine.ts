/**
 * Shared last-season stat-line helpers — one source of truth for the production
 * line shown in the Re-sign window (FEAT-23), Free Agency (FEAT-8), and the
 * player quick-view modal (FEAT-15), so they stay consistent.
 */

import { perGame, type BasketballPlayer } from '@bs/sport-basketball';

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

/** Career per-game line "12.4/4.0/3.1" from careerStats, or null if the player
 *  has never logged a game — the fallback when there's no per-season log entry
 *  (a free agent who sat unsigned all year, or an imported vet). BUG-27. */
export function careerPerGameLine(player: BasketballPlayer): { ppg: number; text: string } | null {
  const cs = player.careerStats;
  if (!cs || cs.gamesPlayed <= 0) return null;
  const pg = perGame(cs);
  const r1 = (n: number | undefined) => Math.round((n ?? 0) * 10) / 10;
  return { ppg: r1(pg.points), text: `${r1(pg.points)}/${r1(pg.totalRebounds)}/${r1(pg.assists)}` };
}
