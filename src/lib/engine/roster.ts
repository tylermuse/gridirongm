import type { Player, Team } from '@/types';

/** Return the players on a team's ACTIVE 53-man roster, excluding practice
 *  squad and IR. Single source of truth for cap-count checks across the UI
 *  + store — don't filter by `p.teamId === team.id` in isolation because
 *  both PS and IR players keep their teamId.
 *
 *  `players` is the full league players array; we intersect with team.roster
 *  (which is maintained as the active-53 id list by the store; PS and IR
 *  players are moved out of team.roster when placed). */
export function getActiveRoster(team: Team, players: Player[]): Player[] {
  const activeIds = new Set(team.roster);
  return players.filter(p => activeIds.has(p.id) && !p.retired);
}

/** Convenience: active-53 count only. team.roster is already maintained to
 *  exclude PS + IR, so its length IS the active count. */
export function getActiveRosterCount(team: Team): number {
  return team.roster.length;
}
