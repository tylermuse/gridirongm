import type { Player, Team } from '@/types';

/** Return the players on a team's ACTIVE 53-man roster, excluding practice
 *  squad (and eventually IR). Single source of truth for cap-count checks
 *  across the UI + store — don't filter by `p.teamId === team.id` in isolation
 *  because PS players keep their teamId.
 *
 *  `players` is the full league players array; we intersect with team.roster
 *  (which is maintained as the active-53 id list by the store). */
export function getActiveRoster(team: Team, players: Player[]): Player[] {
  const activeIds = new Set(team.roster);
  return players.filter(p => activeIds.has(p.id) && !p.retired);
}

/** Convenience: active-53 count only. Prefer over `team.roster.length` when
 *  the caller needs to refer to the "real" roster size that drives signing
 *  and trade capacity — makes the intent explicit and absorbs future tiers
 *  (IR) in one place. */
export function getActiveRosterCount(team: Team): number {
  return team.roster.length;
}
