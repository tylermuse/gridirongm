import type { ScoringPlay } from '@/types';

/**
 * Short, human-readable play-type tag for a scoring play, derived from its
 * point value and description. Lets the Box Score's scoring summary explain
 * *why* a total is what it is (e.g. a team on 8 got a TD + two-point, a team
 * on 5 got a FG + safety) instead of showing a bare number that looks like a
 * bug. Presentational only — the point value itself comes from ScoringPlay.points.
 */
export function scoringPlayTypeLabel(sp: Pick<ScoringPlay, 'points' | 'description'>): string {
  const d = (sp.description ?? '').toLowerCase();
  if (d.includes('safety')) return 'SAF';
  if (d.includes('two-point') || d.includes('two point') || d.includes('2-pt') || d.includes('2pt')) return '2PT';
  switch (sp.points) {
    case 8: return 'TD+2';
    case 7:
    case 6: return 'TD';
    case 3: return 'FG';
    case 2: return d.includes('field goal') ? 'FG' : 'SAF';
    case 1: return 'XP';
    default: return `${sp.points}PT`;
  }
}
