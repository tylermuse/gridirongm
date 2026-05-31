/**
 * Dashboard achievements / trophy case (parity audit #17).
 *
 * Derived live from league state — no persistence, so it works on every save.
 * Each badge is either a one-shot unlock or a 0/N progress track.
 */

import { getBracket } from '@/lib/playoffs';
import { getTransactions } from '@/lib/transactions';
import { teamCap } from '@/lib/dashboard/summary';
import { regularSeasonStatsByPlayer } from '@/lib/stats/seasonStats';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';
import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export interface Achievement {
  icon: string;
  label: string;
  desc: string;
  unlocked: boolean;
  /** Progress badges show "n / max". */
  progress?: number;
  max?: number;
}

function titleCount(league: LeagueState, teamId: string): number {
  let n = 0;
  for (const entry of Object.values(league.seasonHistory ?? {})) {
    if ((entry as { champion?: string | null }).champion === teamId) n++;
  }
  const bracket = getBracket(league);
  if (bracket?.complete && bracket.championTeamId === teamId) n++; // current, pre-rollover
  return n;
}

function winStreak(team: BasketballTeam): number {
  const streak = team.record.streak ?? [];
  let n = 0;
  for (let i = streak.length - 1; i >= 0; i--) {
    if (streak[i] === 'W') n++; else break;
  }
  return n;
}

export function computeAchievements(league: LeagueState, team: BasketballTeam): Achievement[] {
  const titles = titleCount(league, team.id);
  const trades = getTransactions(league).filter(
    t => t.kind === 'trade' && t.season === league.currentSeason && t.teamIds.includes(team.id),
  ).length;
  const streak = winStreak(team);
  const cap = teamCap(league, team);

  // Top scorer on the roster (per game).
  const statsMap = regularSeasonStatsByPlayer(league);
  let topPpg = 0;
  for (const id of team.playerIds) {
    const s = statsMap.get(id as never) as BasketballStats | undefined;
    if (s && s.gamesPlayed > 0) topPpg = Math.max(topPpg, s.points / s.gamesPlayed);
  }

  // League-best defense (lowest opp PPG, min games).
  const oppPpg = (t: BasketballTeam) => {
    const gp = t.record.wins + t.record.losses + (t.record.otherResults ?? 0);
    return gp >= 10 ? t.record.pointsAgainst / gp : Infinity;
  };
  const bestDef = Math.min(...(league.teams as BasketballTeam[]).map(oppPpg));
  const isLockdown = isFinite(bestDef) && oppPpg(team) === bestDef;

  // Stars: rostered players in the league's top 15 by OVR (All-NBA proxy).
  const allByOvr = Object.values(league.players as Record<string, BasketballPlayer>)
    .filter(p => p.rosterSlot)
    .sort((a, b) => b.ratings.overall - a.ratings.overall)
    .slice(0, 15)
    .map(p => p.id);
  const stars = team.playerIds.filter(id => allByOvr.includes(id)).length;

  return [
    { icon: '🏆', label: 'Champion', desc: 'Win the Finals.', unlocked: titles >= 1 },
    { icon: '🏗️', label: 'Dynasty Builder', desc: 'Win 3 titles.', unlocked: titles >= 3, progress: Math.min(titles, 3), max: 3 },
    { icon: '🤝', label: 'Trade Master', desc: 'Make 5 trades in a season.', unlocked: trades >= 5, progress: Math.min(trades, 5), max: 5 },
    { icon: '🔥', label: 'On Fire', desc: 'Win 10 in a row.', unlocked: streak >= 10, progress: Math.min(streak, 10), max: 10 },
    { icon: '💰', label: 'Cap Wizard', desc: 'Stay under the cap.', unlocked: !cap.isOverCap },
    { icon: '📊', label: 'Stat Stacker', desc: 'Roster a 30-PPG scorer.', unlocked: topPpg >= 30 },
    { icon: '🛡️', label: 'Lockdown', desc: 'Lead the league in defense.', unlocked: isLockdown },
    { icon: '🌟', label: 'All-Star Factory', desc: 'Roster 3 top-15 players.', unlocked: stars >= 3, progress: Math.min(stars, 3), max: 3 },
  ];
}
