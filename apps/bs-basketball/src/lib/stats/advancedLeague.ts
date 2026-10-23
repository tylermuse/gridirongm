/**
 * League-context wrapper around the pure formulas in `./advanced`.
 *
 * USG% needs the player's team totals and PER needs the league baseline, so
 * this builds both once from box-score aggregation and hands back a per-player
 * advanced line + per-team ratings.
 */

import type { BasketballPlayer, BasketballStats, BasketballRatings } from '@bs/sport-basketball';
import type { BaseLeagueState, PlayerId, TeamId } from '@bs/core/adapter';
import { regularSeasonStatsByPlayer } from './seasonStats';
import { regularSeasonStatsByTeam, type TeamSeasonAggregate } from './teamSeasonStats';
import {
  tsPct, efgPct, plusMinusPerGame, usgPct, perLite, leagueGameScorePerMinute,
  teamRatings, type TeamRatings,
} from './advanced';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export interface AdvancedLine {
  ts: number;
  efg: number;
  plusMinus: number;
  plusMinusPg: number;
  usg: number;
  per: number;
}

export interface AdvancedContext {
  playerStats: Map<PlayerId, BasketballStats>;
  teamStats: Map<TeamId, TeamSeasonAggregate>;
  leagueGsPerMin: number;
  /** Advanced line for any player-stat total (team = player's current team). */
  forPlayer: (playerId: string, stats?: BasketballStats) => AdvancedLine;
  teamRatings: Map<TeamId, TeamRatings>;
}

export function buildAdvancedContext(league: LeagueState): AdvancedContext {
  const playerStats = regularSeasonStatsByPlayer(league);
  const teamStats = regularSeasonStatsByTeam(league);
  const leagueGsPerMin = leagueGameScorePerMinute(playerStats.values());
  const ratings = new Map<TeamId, TeamRatings>();
  for (const [tid, agg] of teamStats) ratings.set(tid, teamRatings(agg.off, agg.def, agg.gp));

  const forPlayer = (playerId: string, stats?: BasketballStats): AdvancedLine => {
    const s = stats ?? playerStats.get(playerId as PlayerId);
    if (!s) return { ts: 0, efg: 0, plusMinus: 0, plusMinusPg: 0, usg: 0, per: 0 };
    const p = league.players[playerId as PlayerId] as BasketballPlayer | undefined;
    const team = p?.rosterSlot?.teamId ? teamStats.get(p.rosterSlot.teamId) : undefined;
    return {
      ts: tsPct(s),
      efg: efgPct(s),
      plusMinus: s.plusMinus,
      plusMinusPg: plusMinusPerGame(s),
      usg: team ? usgPct(s, team.off) : 0,
      per: perLite(s, leagueGsPerMin),
    };
  };

  return { playerStats, teamStats, leagueGsPerMin, forPlayer, teamRatings: ratings };
}
