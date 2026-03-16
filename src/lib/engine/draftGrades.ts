/**
 * Draft grade utilities — shared between draft page and draft recap.
 *
 * Grades evaluate picks relative to realistic expectations for each round,
 * factoring in both current OVR and development potential.
 */

/** Expected OVR for each round — calibrated to actual draft class output.
 *  Draft class talent curve: top picks ~75-82, mid ~55-65, late ~40-50.
 *  Sigma controls how forgiving the grade is — smaller = stricter. */
const ROUND_EXPECTATIONS: Record<number, { expected: number; sigma: number }> = {
  1: { expected: 72, sigma: 4 },
  2: { expected: 65, sigma: 4 },
  3: { expected: 60, sigma: 4 },
  4: { expected: 55, sigma: 4 },
  5: { expected: 50, sigma: 3 },
  6: { expected: 46, sigma: 3 },
  7: { expected: 42, sigma: 3 },
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

  // Strict grading: A is rare, C is common, D/F for bad picks
  if (score >= 2.5) return 'A+';
  if (score >= 1.8) return 'A';
  if (score >= 1.0) return 'B+';
  if (score >= 0.4) return 'B';
  if (score >= -0.1) return 'B-';
  if (score >= -0.6) return 'C+';
  if (score >= -1.0) return 'C';
  if (score >= -1.5) return 'C-';
  if (score >= -2.0) return 'D';
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
