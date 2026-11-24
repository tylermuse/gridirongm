import type { Player } from '@/types';
import { playerAvailable } from './simulate';

/** Players counted toward a team's headline "Avg OVR" — roughly a depth
 *  chart's worth of starters, so the figure isn't dragged down by deep
 *  backups. */
export const TEAM_OVR_STARTER_POOL = 22;

/**
 * Canonical team "Avg OVR" shown across the UI (team page, team roster modal,
 * trade summaries). Starter-weighted: the top 22 available (non-retired,
 * non-injured) players by overall, rounded to a whole number. Every screen
 * that shows a single team OVR reads it through this helper so the figure
 * never disagrees from one screen to the next.
 *
 * `roster` is any list of a team's players; retired and injured players are
 * filtered out here, so callers may pass a full roster.
 */
export function calcTeamOvr(roster: Player[]): number {
  const pool = roster
    .filter(p => !p.retired && playerAvailable(p))
    .sort((a, b) => b.ratings.overall - a.ratings.overall)
    .slice(0, TEAM_OVR_STARTER_POOL);
  if (pool.length === 0) return 0;
  return Math.round(pool.reduce((sum, p) => sum + p.ratings.overall, 0) / pool.length);
}
