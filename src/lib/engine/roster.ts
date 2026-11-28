import { getCapHit, type Player, type Position, type Team } from '@/types';

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

/**
 * Move a team's injured-reserve players back onto its active roster.
 *
 * IR ends with the season: the rollover clears every player's `onIR` flag and
 * injury, so the ids have to leave `team.injuredReserve` and rejoin
 * `team.roster` in the same step. When they did not, the player was stranded:
 * still on the team by `teamId` (so the Roster page listed him as a healthy,
 * active player) but in no roster list, so everything that counts the active
 * roster from `team.roster` (the Free Agency position breakdown, the roster
 * limit, payroll, the depth chart) left him out.
 *
 * Returning players rejoin the roster, the depth chart (sorted by OVR) and the
 * payroll (their cap hit was taken out when they went on IR). Ids that no
 * longer belong to the team (traded, released, retired) are dropped.
 *
 * `onlyCleared`: leave players whose `onIR` flag is still set where they are.
 * Used to repair saves mid-season without activating anyone early.
 */
export function returnInjuredReserveToRoster(
  team: Team,
  players: Player[],
  opts: { onlyCleared?: boolean } = {},
): { team: Team; returnedIds: string[] } {
  const irIds = team.injuredReserve ?? [];
  if (irIds.length === 0) return { team, returnedIds: [] };

  const byId = new Map(players.map(p => [p.id, p]));
  const placed = new Set([...team.roster, ...(team.practiceSquad ?? [])]);
  const stillOnIR: string[] = [];
  const returning: Player[] = [];
  for (const id of irIds) {
    const p = byId.get(id);
    if (!p || p.retired || p.teamId !== team.id) continue; // gone: drop the id
    if (placed.has(id)) continue; // already counted elsewhere: drop the duplicate
    if (opts.onlyCleared && p.onIR) { stillOnIR.push(id); continue; }
    placed.add(id);
    returning.push(p);
  }
  if (returning.length === 0 && stillOnIR.length === irIds.length) return { team, returnedIds: [] };

  const depthChart = { ...team.depthChart };
  const ovr = (id: string) => byId.get(id)?.ratings.overall ?? 0;
  for (const p of returning) {
    const pos = p.position as Position;
    const ids = (depthChart[pos] ?? []).filter(id => id !== p.id);
    depthChart[pos] = [...ids, p.id].sort((a, b) => ovr(b) - ovr(a));
  }
  const capHits = returning.reduce((sum, p) => sum + getCapHit(p.contract), 0);
  return {
    team: {
      ...team,
      roster: [...team.roster, ...returning.map(p => p.id)],
      injuredReserve: stillOnIR,
      depthChart,
      totalPayroll: Math.round((team.totalPayroll + capHits) * 10) / 10,
    },
    returnedIds: returning.map(p => p.id),
  };
}
