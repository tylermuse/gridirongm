import type { Team } from '@/types';

/**
 * Teams that would hire a just-fired GM: the league's worst records — the
 * clubs most likely to be changing GMs — excluding the team that fired them.
 * CPU teams don't track owner approval, so record is the signal. Deterministic
 * (point differential, then id, break ties) so the list doesn't reshuffle
 * between renders.
 */
export function getGmJobOpenings(teams: Team[], firedFromTeamId: string, count = 5): Team[] {
  const winPct = (t: Team) => {
    const gp = t.record.wins + t.record.losses + (t.record.ties ?? 0);
    return gp > 0 ? (t.record.wins + 0.5 * (t.record.ties ?? 0)) / gp : 0.5;
  };
  const pointDiff = (t: Team) => (t.record.pointsFor ?? 0) - (t.record.pointsAgainst ?? 0);
  return teams
    .filter(t => t.id !== firedFromTeamId)
    .sort((a, b) => winPct(a) - winPct(b) || pointDiff(a) - pointDiff(b) || a.id.localeCompare(b.id))
    .slice(0, count);
}
