/**
 * Shared Power Score helper — single source of truth for both the standalone
 * `/power-rankings` rich card view AND the compact `/stats` "Power" tab so the
 * two views always agree on numbers.
 *
 * Formula (preserved from the original /power-rankings page so existing saves
 * see stable rankings):
 *   winPct * 100 + pointDiff / 10 + recentForm * 2
 *
 * Where recentForm = wins in last 5 games (from `team.record.streak`). The
 * three terms have intentionally different scales so the standings ordering
 * stays dominated by record but recent form / blowout differentials nudge
 * teams up and down the board sensibly.
 */

import type { BasketballTeam } from '@bs/sport-basketball';

export function powerScore(team: BasketballTeam): number {
  const games = team.record.wins + team.record.losses;
  const winPct = games > 0 ? team.record.wins / games : 0.5;
  const pointDiff = team.record.pointsFor - team.record.pointsAgainst;
  const recentForm = (team.record.streak ?? []).slice(-5).filter(c => c === 'W').length;
  return winPct * 100 + pointDiff / 10 + recentForm * 2;
}
