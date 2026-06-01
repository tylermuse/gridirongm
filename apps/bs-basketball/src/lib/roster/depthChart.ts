/**
 * Per-position depth chart + roster role tags (parity audit #21).
 *
 * The roster table groups by starter/bench; this gives the other lens football
 * has — for each position, the ordered depth (starter → backups), a thin/ok/deep
 * health read, and a role tag per player (starter / rotation / reserve / two-way).
 * Two-way is a derived designation for young end-of-bench players. Pure
 * derivation off the roster + chosen starters; nothing persisted.
 */

import type { BasketballPlayer, BasketballPosition } from '@bs/sport-basketball';

export const POSITIONS: BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C'];

export type RosterRole = 'starter' | 'rotation' | 'reserve' | 'two_way';

export const ROLE_LABEL: Record<RosterRole, string> = {
  starter: 'Starter',
  rotation: 'Rotation',
  reserve: 'Reserve',
  two_way: 'Two-way',
};

export const ROLE_COLOR: Record<RosterRole, string> = {
  starter: '#f59e0b',
  rotation: '#10b981',
  reserve: '#64748b',
  two_way: '#8b5cf6',
};

export interface DepthEntry { player: BasketballPlayer; role: RosterRole; isStarter: boolean }
export interface PositionDepth { position: BasketballPosition; entries: DepthEntry[]; health: 'thin' | 'ok' | 'deep' }

/**
 * Role per player, by team OVR rank: the 5 starters are 'starter', the next
 * tier is 'rotation', the rest are 'reserve' — except young (age ≤ 23) reserves,
 * who are flagged 'two_way'.
 */
export function rosterRoles(roster: BasketballPlayer[], starterIds: string[]): Map<string, RosterRole> {
  const roles = new Map<string, RosterRole>();
  const starters = new Set(starterIds.filter(Boolean));
  const ranked = [...roster].sort((a, b) => b.ratings.overall - a.ratings.overall);
  let rotationLeft = Math.max(0, Math.min(4, ranked.length - starters.size)); // ~9-man rotation
  for (const p of ranked) {
    if (starters.has(p.id)) { roles.set(p.id, 'starter'); continue; }
    if (rotationLeft > 0) { roles.set(p.id, 'rotation'); rotationLeft--; continue; }
    roles.set(p.id, p.age <= 23 ? 'two_way' : 'reserve');
  }
  return roles;
}

/** Ordered depth at each position (starter first, then backups by OVR). */
export function depthChart(roster: BasketballPlayer[], starterIds: string[]): PositionDepth[] {
  const roles = rosterRoles(roster, starterIds);
  const starters = new Set(starterIds.filter(Boolean));

  return POSITIONS.map(position => {
    const atPos = roster.filter(p => p.sportData.position === position);
    const entries: DepthEntry[] = atPos
      .map(player => ({ player, role: roles.get(player.id) ?? 'reserve', isStarter: starters.has(player.id) }))
      .sort((a, b) => {
        if (a.isStarter !== b.isStarter) return a.isStarter ? -1 : 1;
        return b.player.ratings.overall - a.player.ratings.overall;
      });
    const health: PositionDepth['health'] = atPos.length <= 1 ? 'thin' : atPos.length === 2 ? 'ok' : 'deep';
    return { position, entries, health };
  });
}
