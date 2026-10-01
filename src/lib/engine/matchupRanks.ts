import type { Player, Team } from '@/types';

/**
 * Pre-matchup team-rank metrics shown on the Game Preview card before kickoff
 * (yo46363's 3-vote board request). Pure + read-only: it reuses the exact
 * aggregates from the Standings page (record.pointsFor / pointsAgainst) and the
 * Stats page (per-team player passing / rushing yards ÷ games played), so ranks
 * match those pages. No engine or save changes.
 */
export interface MatchupMetric {
  key: string;
  label: string;
  /** When true a lower value ranks better (e.g. points allowed). */
  lowerIsBetter?: boolean;
  value: (t: Team) => number;
  fmt: (v: number) => string;
}

/**
 * Build the four ranked pre-matchup categories: points/game, passing yards/game,
 * rushing yards/game, and points allowed/game. Passing and rushing are split so
 * each is its own ranked column (the card previously showed a single combined
 * Yds/G + point differential).
 */
export function buildMatchupMetrics(players: Player[]): MatchupMetric[] {
  const gp = (t: Team) => Math.max(1, t.record.wins + t.record.losses + t.record.ties);

  const passYards = new Map<string, number>();
  const rushYards = new Map<string, number>();
  for (const p of players) {
    if (!p.teamId) continue;
    passYards.set(p.teamId, (passYards.get(p.teamId) ?? 0) + (p.stats.passYards ?? 0));
    rushYards.set(p.teamId, (rushYards.get(p.teamId) ?? 0) + (p.stats.rushYards ?? 0));
  }

  return [
    { key: 'ppg', label: 'PPG', value: t => t.record.pointsFor / gp(t), fmt: v => v.toFixed(1) },
    { key: 'passypg', label: 'Pass Y/G', value: t => (passYards.get(t.id) ?? 0) / gp(t), fmt: v => v.toFixed(0) },
    { key: 'rushypg', label: 'Rush Y/G', value: t => (rushYards.get(t.id) ?? 0) / gp(t), fmt: v => v.toFixed(0) },
    { key: 'pa', label: 'Pts Allowed', lowerIsBetter: true, value: t => t.record.pointsAgainst / gp(t), fmt: v => v.toFixed(1) },
  ];
}

/**
 * 1-based league rank of `team` among `teams` for metric `m`. A team ranks Nth
 * when N-1 other teams have a strictly better value; ties share the higher rank.
 */
export function rankForMetric(team: Team, m: MatchupMetric, teams: Team[]): number {
  const mine = m.value(team);
  let better = 0;
  for (const o of teams) {
    if (o.id === team.id) continue;
    const ov = m.value(o);
    if (m.lowerIsBetter ? ov < mine : ov > mine) better++;
  }
  return better + 1;
}
