/**
 * Team leaders + league-rank context (spec 2.3 + 2.0).
 *
 * Per-category team leaders (with an Age·OVR·POT meta line) and the league rank
 * of a team's headline stats (PPG, Opp PPG, differential) among all 30 teams.
 * Pure derivation from box scores + records; nothing persisted.
 */

import { regularSeasonStatsByPlayer } from '../stats/seasonStats';
import type { BasketballPlayer, BasketballTeam, BasketballStats } from '@bs/sport-basketball';
import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export interface RankedStat { value: number; rank: number; of: number }

function teamPpg(t: BasketballTeam): number {
  const gp = t.record.wins + t.record.losses + (t.record.otherResults ?? 0);
  return gp > 0 ? t.record.pointsFor / gp : 0;
}
function teamOppPpg(t: BasketballTeam): number {
  const gp = t.record.wins + t.record.losses + (t.record.otherResults ?? 0);
  return gp > 0 ? t.record.pointsAgainst / gp : 0;
}

/** 1 = best. `lowerIsBetter` ranks ascending (used for points allowed). */
function rankOf(values: number[], value: number, lowerIsBetter = false): number {
  const sorted = [...values].sort((a, b) => (lowerIsBetter ? a - b : b - a));
  return sorted.indexOf(value) + 1;
}

export interface TeamStatRanks { ppg: RankedStat; oppPpg: RankedStat; diff: RankedStat }

export function teamStatRanks(league: LeagueState, team: BasketballTeam): TeamStatRanks {
  const teams = league.teams as BasketballTeam[];
  const of = teams.length;
  const ppgs = teams.map(teamPpg);
  const oppPpgs = teams.map(teamOppPpg);
  const diffs = teams.map(t => teamPpg(t) - teamOppPpg(t));
  const ppg = teamPpg(team), oppPpg = teamOppPpg(team), diff = ppg - oppPpg;
  return {
    ppg: { value: ppg, rank: rankOf(ppgs, ppg), of },
    oppPpg: { value: oppPpg, rank: rankOf(oppPpgs, oppPpg, true), of },
    diff: { value: diff, rank: rankOf(diffs, diff), of },
  };
}

export interface LeaderLine {
  category: string;
  player: BasketballPlayer;
  value: number;
  unit: string;
  meta: string;
}

function metaOf(p: BasketballPlayer): string {
  const pot = p.development?.potential ?? p.ratings.overall;
  return `Age ${p.age} · OVR ${p.ratings.overall} · POT ${pot}`;
}

/** The user team's leader in each headline category, with a meta line. */
export function teamLeaders(league: LeagueState, team: BasketballTeam): LeaderLine[] {
  const stats = regularSeasonStatsByPlayer(league);
  const players = league.players as Record<string, BasketballPlayer>;
  const roster = team.playerIds.map(id => players[id]).filter((p): p is BasketballPlayer => !!p);

  const best = (perGame: (s: BasketballStats) => number): { player: BasketballPlayer; value: number } | null => {
    let top: { player: BasketballPlayer; value: number } | null = null;
    for (const p of roster) {
      const s = stats.get(p.id as never);
      if (!s || s.gamesPlayed === 0) continue;
      const v = perGame(s);
      if (!top || v > top.value) top = { player: p, value: v };
    }
    return top;
  };

  const out: LeaderLine[] = [];
  const add = (category: string, unit: string, pick: (s: BasketballStats) => number) => {
    const b = best(pick);
    if (b) out.push({ category, player: b.player, value: b.value, unit, meta: metaOf(b.player) });
  };
  add('Points', 'PPG', s => s.points / s.gamesPlayed);
  add('Rebounds', 'RPG', s => s.totalRebounds / s.gamesPlayed);
  add('Assists', 'APG', s => s.assists / s.gamesPlayed);
  add('Defense', 'STK', s => (s.steals + s.blocks) / s.gamesPlayed);
  return out;
}
