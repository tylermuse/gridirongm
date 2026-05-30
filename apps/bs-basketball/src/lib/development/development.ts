/**
 * Player development helpers (Phase 2E-1).
 *
 * Reads the snapshots captured at rollover (`sportData.prevRatings`,
 * `sportData.seasonLog`) to surface a trajectory description and the rating
 * deltas from the last offseason's aging.
 */

import type { BasketballPlayer, BasketballRatings } from '@bs/sport-basketball';

const TRACKED: { key: keyof BasketballRatings; label: string }[] = [
  { key: 'overall', label: 'Overall' },
  { key: 'threePoint', label: '3PT' },
  { key: 'midRange', label: 'Mid-range' },
  { key: 'finishing', label: 'Finishing' },
  { key: 'postScoring', label: 'Post' },
  { key: 'passing', label: 'Passing' },
  { key: 'handles', label: 'Handles' },
  { key: 'perimeterDefense', label: 'Perimeter D' },
  { key: 'interiorDefense', label: 'Interior D' },
  { key: 'rebounding', label: 'Rebounding' },
  { key: 'steal', label: 'Steal' },
  { key: 'block', label: 'Block' },
  { key: 'speed', label: 'Speed' },
  { key: 'vertical', label: 'Vertical' },
  { key: 'strength', label: 'Strength' },
  { key: 'basketballIQ', label: 'IQ' },
];

export interface RatingDelta {
  label: string;
  prev: number;
  current: number;
  delta: number;
}

/** Rating changes from the last offseason (current vs the pre-aging snapshot),
 *  non-zero only, largest swing first. Empty until the player has rolled over once. */
export function ratingDeltas(player: BasketballPlayer): RatingDelta[] {
  const prev = player.sportData.prevRatings;
  if (!prev) return [];
  const cur = player.ratings;
  return TRACKED.map(t => {
    const p = prev[t.key] as number;
    const c = cur[t.key] as number;
    return { label: t.label, prev: p, current: c, delta: c - p };
  })
    .filter(d => d.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

const TRAJ_DESC: Record<string, string> = {
  breakout: 'Taking a major leap — developing faster than expected.',
  rising: 'On the rise — improving year over year.',
  plateau: 'Settled in around their established level.',
  declining: 'Past their peak — gradually declining.',
  cliff: 'Falling off sharply — age is catching up fast.',
};

export function trajectoryDescription(trajectory: string): string {
  return TRAJ_DESC[trajectory] ?? '';
}
