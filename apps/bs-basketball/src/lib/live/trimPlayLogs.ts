/**
 * The sim engine attaches a possession-by-possession `playLog` to every game's
 * sportData (~20KB each). Only the user's own games are ever watched live or
 * replayed, so we keep the log on the user's most recent games and strip it
 * everywhere else before the league is saved — a full season of logs for all
 * 1,230 games would add ~25MB to every save.
 */

import type { BaseGameResult } from '@bs/core/adapter';
import type { BasketballStats } from '@bs/sport-basketball';

type GameResult = BaseGameResult<BasketballStats>;

/** How many of the user's played games keep a replayable log. */
export const PLAY_LOG_KEEP = 10;

function hasLog(g: GameResult): boolean {
  return !!(g.sportData as { playLog?: unknown } | undefined)?.playLog;
}

function stripLog(g: GameResult): GameResult {
  const rest = { ...((g.sportData as Record<string, unknown>) ?? {}) };
  delete rest.playLog;
  return { ...g, sportData: rest };
}

/**
 * Return `games` with play logs removed from every game except the user's
 * `keep` most recently played ones. Returns the same array when nothing
 * changes (cheap no-op for the common case).
 */
export function trimPlayLogs<G extends GameResult>(games: G[], userTeamId: string | null | undefined, keep = PLAY_LOG_KEEP): G[] {
  const keepIds = new Set<string>();
  if (userTeamId) {
    const mine: { idx: number; key: string }[] = [];
    games.forEach((g, idx) => {
      if (g.status === 'played' && hasLog(g) && (g.homeTeamId === userTeamId || g.awayTeamId === userTeamId)) {
        const day = (g.sportData as { dayOfSeason?: number } | undefined)?.dayOfSeason ?? 0;
        mine.push({ idx, key: `${g.season}-${String(day).padStart(4, '0')}-${idx}` });
      }
    });
    mine.sort((a, b) => b.key.localeCompare(a.key));
    for (const m of mine.slice(0, keep)) keepIds.add(games[m.idx].id);
  }
  let changed = false;
  const out = games.map(g => {
    if (!hasLog(g) || keepIds.has(g.id)) return g;
    changed = true;
    return stripLog(g) as G;
  });
  return changed ? out : games;
}
