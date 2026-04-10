import type { Player, DraftSelection } from '@/types';

/**
 * Computes per-class draft score for the GM leaderboard.
 *
 * Formula:
 *   +2  Player drafted becomes a starter on the team's opening day roster
 *   +3  Pro Bowl (lifetime, any season)
 *   +5  All-Pro (lifetime, any season)
 *   +2  Round 3+ AND becomes a starter (value bonus)
 *   -1  Top-50 pick AND never starts a game (bust penalty)
 *
 * Returns the total score for the entire draft class (one row in
 * `gm_career_stats.draft_score_total`).
 */
export function computeClassDraftScore(
  picks: DraftSelection[],
  players: Player[],
): number {
  let score = 0;
  for (const pick of picks) {
    const player = players.find(p => p.id === pick.playerId);
    if (!player) continue;

    // Did the player ever start a game? Use seasonLog or stats as a proxy.
    const careerGames = player.seasonLog
      ? player.seasonLog.reduce((s, sl) => s + (sl.stats.gamesPlayed ?? 0), 0)
      : (player.stats.gamesPlayed ?? 0);
    const isStarter = careerGames > 0; // simplified — any games played means started somewhere

    // Pro Bowl / All-Pro counts
    const awards = player.awards ?? [];
    const proBowls = awards.filter(a => a.award.toLowerCase().includes('pro bowl')).length;
    const allPros = awards.filter(a => a.award.toLowerCase().includes('all-pro')).length;

    if (isStarter) score += 2;
    score += proBowls * 3;
    score += allPros * 5;

    // Value bonus: round 3+ starter
    if (pick.round >= 3 && isStarter) score += 2;

    // Bust penalty: top-50 pick who never starts
    if (pick.overallPick <= 50 && !isStarter) score -= 1;
  }
  return Math.round(score * 10) / 10;
}

/**
 * Letter grade from a class draft score.
 * Calibrated against typical class scores (12-30 picks per draft).
 */
export function classScoreToGrade(score: number, picksCount: number): string {
  if (picksCount === 0) return 'N/A';
  const avgPerPick = score / picksCount;
  if (avgPerPick >= 6) return 'A+';
  if (avgPerPick >= 5) return 'A';
  if (avgPerPick >= 4) return 'A-';
  if (avgPerPick >= 3) return 'B+';
  if (avgPerPick >= 2.2) return 'B';
  if (avgPerPick >= 1.5) return 'B-';
  if (avgPerPick >= 0.8) return 'C+';
  if (avgPerPick >= 0.2) return 'C';
  return 'C-';
}
