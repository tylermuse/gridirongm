/**
 * Draft grade utilities — shared between draft page and draft recap.
 *
 * Grades evaluate picks relative to realistic expectations for each round,
 * factoring in both current OVR and development potential.
 */

/** Expected OVR range for each round (1-indexed). Accounts for the fact that
 *  rookies are raw — even 1st-rounders typically start in the 55-70 OVR range. */
const ROUND_EXPECTATIONS: Record<number, { expected: number; sigma: number }> = {
  1: { expected: 62, sigma: 6 },
  2: { expected: 56, sigma: 5 },
  3: { expected: 52, sigma: 5 },
  4: { expected: 48, sigma: 5 },
  5: { expected: 45, sigma: 4 },
  6: { expected: 42, sigma: 4 },
  7: { expected: 40, sigma: 4 },
};

function getRoundFromPick(overallPick: number, totalPicks: number): number {
  const teamsCount = Math.round(totalPicks / 7);
  return Math.min(7, Math.max(1, Math.ceil(overallPick / teamsCount)));
}

/** Letter grade for a single draft pick. Combines OVR vs round expectation
 *  with a potential bonus — high-potential picks in later rounds grade better. */
export function pickGrade(overallPick: number, totalPicks: number, playerOvr: number, playerPotential?: number): string {
  const round = getRoundFromPick(overallPick, totalPicks);
  const { expected, sigma } = ROUND_EXPECTATIONS[round] ?? { expected: 40, sigma: 4 };

  // How many standard deviations above/below expected?
  const ovrDelta = (playerOvr - expected) / sigma;

  // Potential bonus: only significant for truly high-potential picks
  const pot = playerPotential ?? 50;
  const potBonus = Math.max(0, (pot - 65) / 40); // 0 at pot=65, ~0.5 at pot=85

  const score = ovrDelta + potBonus;

  // Distribution target: ~10% A, ~25% B+/B, ~25% B-/C+, ~25% C/C-, ~15% D/F
  if (score >= 2.0) return 'A+';
  if (score >= 1.4) return 'A';
  if (score >= 0.8) return 'B+';
  if (score >= 0.3) return 'B';
  if (score >= -0.2) return 'B-';
  if (score >= -0.7) return 'C+';
  if (score >= -1.2) return 'C';
  if (score >= -1.8) return 'C-';
  if (score >= -2.5) return 'D';
  return 'F';
}

/** Backward-compatible overload without potential. */
export function expectedOvrForPick(overallPick: number, totalPicks: number): number {
  const round = getRoundFromPick(overallPick, totalPicks);
  return ROUND_EXPECTATIONS[round]?.expected ?? 40;
}

/** Numeric value for a letter grade (for averaging). */
export function gradeValue(grade: string): number {
  const map: Record<string, number> = {
    'A+': 12, 'A': 11, 'B+': 10, 'B': 9, 'B-': 8,
    'C+': 7, 'C': 6, 'C-': 5, 'D': 3, 'F': 1,
  };
  return map[grade] ?? 5;
}

/** CSS color class for a letter grade. */
export function gradeColor(grade: string): string {
  if (grade.startsWith('A')) return 'text-green-600';
  if (grade === 'B+' || grade === 'B') return 'text-blue-600';
  if (grade === 'B-' || grade === 'C+') return 'text-amber-600';
  return 'text-red-600';
}

/** BG color class for a letter grade (used in grade circles). */
export function gradeBgColor(grade: string): string {
  if (grade.startsWith('A')) return 'bg-green-600';
  if (grade === 'B+' || grade === 'B') return 'bg-blue-600';
  if (grade === 'B-' || grade === 'C+') return 'bg-amber-600';
  return 'bg-red-600';
}

/** Overall team draft grade from average grade value. */
export function teamDraftGrade(avgVal: number): string {
  if (avgVal >= 10.5) return 'A+';
  if (avgVal >= 9.5) return 'A';
  if (avgVal >= 8.5) return 'B+';
  if (avgVal >= 7.5) return 'B';
  if (avgVal >= 6.5) return 'B-';
  if (avgVal >= 5.5) return 'C+';
  if (avgVal >= 4.5) return 'C';
  if (avgVal >= 3.5) return 'C-';
  return 'D';
}
