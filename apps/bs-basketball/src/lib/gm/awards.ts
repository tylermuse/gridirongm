/**
 * GM award nominees (parity 3.3 Phase B). Pure derivation from season-history
 * rows so it's testable and shared between the nominees + finalize routes.
 *
 * v1 categories — both computable from records alone:
 *   - gm_of_year   : best win% that season
 *   - best_rebuild : biggest win improvement vs the prior season
 * (best_draft is reserved in the schema but needs draft data we don't sync yet.)
 */

export type AwardType = 'gm_of_year' | 'best_rebuild';

export const AWARD_TYPES: AwardType[] = ['gm_of_year', 'best_rebuild'];

export const AWARD_LABELS: Record<AwardType, string> = {
  gm_of_year: 'GM of the Year',
  best_rebuild: 'Best Rebuild',
};

export const AWARD_BLURB: Record<AwardType, string> = {
  gm_of_year: 'Best record this season.',
  best_rebuild: 'Biggest win jump from last season.',
};

export interface SeasonStatRow { userId: string; wins: number; losses: number }

export interface Nominee {
  userId: string;
  /** win% for gm_of_year, win-delta for best_rebuild. */
  value: number;
}

/** Top-3 nominees per category. `priorWinsByUser` is each user's prior-season win total. */
export function deriveNominees(
  seasonRows: SeasonStatRow[],
  priorWinsByUser: Map<string, number>,
): Record<AwardType, Nominee[]> {
  const gmOfYear: Nominee[] = seasonRows
    .filter(r => r.wins + r.losses > 0)
    .map(r => ({ userId: r.userId, value: r.wins / (r.wins + r.losses) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  const bestRebuild: Nominee[] = seasonRows
    .filter(r => priorWinsByUser.has(r.userId))
    .map(r => ({ userId: r.userId, value: r.wins - (priorWinsByUser.get(r.userId) ?? 0) }))
    .filter(n => n.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  return { gm_of_year: gmOfYear, best_rebuild: bestRebuild };
}
