/**
 * Draft grade utilities — shared between draft page and draft recap.
 */

/** Expected OVR for a given pick position (mirrors talent curve in generateDraftClass). */
export function expectedOvrForPick(overallPick: number, totalPicks: number): number {
  const progress = (overallPick - 1) / Math.max(1, totalPicks - 1);
  return Math.round(78 - progress * 45);
}

/** Letter grade for a single draft pick based on OVR vs expected. */
export function pickGrade(overallPick: number, totalPicks: number, playerOvr: number): string {
  const expected = expectedOvrForPick(overallPick, totalPicks);
  const delta = playerOvr - expected;
  if (delta >= 12) return 'A+';
  if (delta >= 7) return 'A';
  if (delta >= 3) return 'B+';
  if (delta >= -2) return 'B';
  if (delta >= -6) return 'B-';
  if (delta >= -10) return 'C+';
  if (delta >= -14) return 'C';
  if (delta >= -18) return 'C-';
  return 'D';
}

/** Numeric value for a letter grade (for averaging). */
export function gradeValue(grade: string): number {
  const map: Record<string, number> = {
    'A+': 12, 'A': 11, 'B+': 10, 'B': 9, 'B-': 8,
    'C+': 7, 'C': 6, 'C-': 5, 'D': 3,
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
