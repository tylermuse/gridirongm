/**
 * Editorial dashboard derivations (parity audit #23).
 *
 * Magazine-style "league pulse" widgets — By the Numbers (statistical callouts)
 * and Star Watch (player spotlight + MVP race). Everything is derived from
 * games + box scores at render time; nothing is persisted, so it works on any
 * save and never goes stale.
 */

import { regularSeasonStatsByPlayer, statsForPlayer } from '../stats/seasonStats';
import type { BasketballPlayer, BasketballTeam, BasketballStats } from '@bs/sport-basketball';
import type { BaseGameResult, BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;
type GameResult = BaseGameResult<BasketballStats>;

function isPlayoff(g: GameResult): boolean {
  return !!(g.sportData as { isPlayoff?: boolean } | undefined)?.isPlayoff;
}
function dayOf(g: GameResult): number {
  return (g.sportData as { dayOfSeason?: number } | undefined)?.dayOfSeason ?? 0;
}

export interface NumberCallout { value: string; label: string }

/** A handful of punchy season callouts for the user team + the league. */
export function byTheNumbers(league: LeagueState, team: BasketballTeam): NumberCallout[] {
  const played = (league.games as GameResult[]).filter(g => g.status === 'played' && !isPlayoff(g) && g.finalScore);
  const out: NumberCallout[] = [];

  // User team win/loss streak (from most-recent games backward).
  const mine = played
    .filter(g => g.homeTeamId === team.id || g.awayTeamId === team.id)
    .sort((a, b) => dayOf(b) - dayOf(a));
  if (mine.length) {
    const won = (g: GameResult) => {
      const isHome = g.homeTeamId === team.id;
      const s = g.finalScore!;
      return isHome ? s.home > s.away : s.away > s.home;
    };
    const first = won(mine[0]);
    let n = 0;
    for (const g of mine) { if (won(g) === first) n++; else break; }
    out.push({ value: `${first ? 'W' : 'L'}${n}`, label: first ? 'Win streak' : 'Skid' });
  }

  // League's biggest blowout + highest-scoring night.
  let biggestMargin = -1, blowoutLabel = '';
  let highestTotal = -1, highTotalLabel = '';
  const abbr = (id: string) => (league.teams as BasketballTeam[]).find(t => t.id === id)?.abbreviation ?? '—';
  for (const g of played) {
    const s = g.finalScore!;
    const margin = Math.abs(s.home - s.away);
    if (margin > biggestMargin) {
      biggestMargin = margin;
      const winner = s.home > s.away ? g.homeTeamId : g.awayTeamId;
      const loser = s.home > s.away ? g.awayTeamId : g.homeTeamId;
      blowoutLabel = `${abbr(winner)} over ${abbr(loser)}`;
    }
    const total = s.home + s.away;
    if (total > highestTotal) {
      highestTotal = total;
      highTotalLabel = `${abbr(g.awayTeamId)} @ ${abbr(g.homeTeamId)}`;
    }
  }
  if (biggestMargin >= 0) out.push({ value: `+${biggestMargin}`, label: `Biggest blowout · ${blowoutLabel}` });
  if (highestTotal >= 0) out.push({ value: `${highestTotal}`, label: `Highest-scoring night · ${highTotalLabel}` });

  // League scoring average leader.
  const lead = scoringLeaders(league, 1)[0];
  if (lead) out.push({ value: lead.ppg.toFixed(1), label: `Scoring leader · ${lead.name}` });

  return out;
}

export interface ScorerLine { id: string; name: string; teamAbbr: string; ppg: number }

/** League scoring leaders (PPG), minimum a few games to qualify. */
export function scoringLeaders(league: LeagueState, limit = 5): ScorerLine[] {
  const stats = regularSeasonStatsByPlayer(league);
  const players = league.players as Record<string, BasketballPlayer>;
  const teams = league.teams as BasketballTeam[];
  const minGp = Math.min(5, Math.max(1, Math.floor(((teams[0]?.record.wins ?? 0) + (teams[0]?.record.losses ?? 0)) / 3)));
  const rows: ScorerLine[] = [];
  for (const [pid, s] of stats) {
    if (s.gamesPlayed < minGp) continue;
    const p = players[pid as string];
    if (!p) continue;
    const teamAbbr = teams.find(t => t.id === p.rosterSlot?.teamId)?.abbreviation ?? '—';
    rows.push({ id: p.id, name: `${p.firstName[0]}. ${p.lastName}`, teamAbbr, ppg: s.points / s.gamesPlayed });
  }
  return rows.sort((a, b) => b.ppg - a.ppg).slice(0, limit);
}

export interface TeamStar {
  id: string;
  name: string;
  position: string;
  ppg: number; rpg: number; apg: number;
}

/** The user team's leading scorer with a full averages line. */
export function teamStar(league: LeagueState, team: BasketballTeam): TeamStar | null {
  const stats = regularSeasonStatsByPlayer(league);
  const players = league.players as Record<string, BasketballPlayer>;
  let best: TeamStar | null = null;
  for (const id of team.playerIds) {
    const p = players[id];
    if (!p) continue;
    const s = statsForPlayer(stats, id);
    if (s.gamesPlayed === 0) continue;
    const ppg = s.points / s.gamesPlayed;
    if (!best || ppg > best.ppg) {
      best = {
        id: p.id,
        name: `${p.firstName} ${p.lastName}`,
        position: p.sportData.position,
        ppg,
        rpg: s.totalRebounds / s.gamesPlayed,
        apg: s.assists / s.gamesPlayed,
      };
    }
  }
  return best;
}
