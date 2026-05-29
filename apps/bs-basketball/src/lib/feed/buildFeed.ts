/**
 * buildFeed — derive a list of "league moments" from current league state.
 *
 * Pure function: no stored state, no side effects. Recomputed on every render
 * from league.games + league.players + team records. The NewsFeed component
 * renders the result; clicking an item deep-links into a game or opens a
 * player modal.
 *
 * Heuristics:
 *   - big_game       winner scored 130+ or won by 25+
 *   - career_night   a box score with 35+ pts, or a triple-double
 *   - streak         a team on a 5+ game win or loss streak
 *   - upset          winner beat a current top-3 conference team it trails
 *   - schedule_notice "{N} games today" — scheduled games on the next day
 */

import type { BasketballLeagueState } from '@/lib/persistence/db';
import type {
  BasketballPlayer,
  BasketballStats,
  BasketballTeam,
} from '@bs/sport-basketball';
import type { BaseGameResult } from '@bs/core/adapter';

type GameResult = BaseGameResult<BasketballStats>;

export type FeedKind =
  | 'big_game'
  | 'career_night'
  | 'streak'
  | 'upset'
  | 'schedule_notice';

export interface FeedItem {
  id: string;
  kind: FeedKind;
  icon: string;
  headline: string;
  /** Day-of-season this moment belongs to. Drives sort + the timestamp chip. */
  day: number;
  /** Deep-link target — a played game. */
  gameId?: string;
  /** Player this moment is about — opens the PlayerModal. */
  playerId?: string;
}

const ICONS: Record<FeedKind, string> = {
  big_game: '🔥',
  career_night: '🎯',
  streak: '📈',
  upset: '🚨',
  schedule_notice: '📅',
};

function gameDay(g: GameResult): number {
  return (g.sportData as { dayOfSeason?: number } | undefined)?.dayOfSeason ?? 0;
}

/** Trailing run of an identical result char (e.g. 'W'), oldest-first array. */
function trailingRun(streak: string[]): { char: string; len: number } {
  if (streak.length === 0) return { char: '', len: 0 };
  const char = streak[streak.length - 1];
  let len = 0;
  for (let i = streak.length - 1; i >= 0 && streak[i] === char; i--) len++;
  return { char, len };
}

export function buildFeed(league: BasketballLeagueState | null): FeedItem[] {
  if (!league) return [];

  const teams = league.teams as BasketballTeam[];
  const teamById = new Map(teams.map(t => [t.id, t]));
  const players = league.players as Record<string, BasketballPlayer>;
  const games = league.games as GameResult[];

  // Current conference ranking (best record first) for upset detection.
  const confRank = new Map<string, number>();
  for (const conf of ['Eastern', 'Western'] as const) {
    teams
      .filter(t => (t.sportData as { conference: string }).conference === conf)
      .sort((a, b) => {
        if (b.record.wins !== a.record.wins) return b.record.wins - a.record.wins;
        if (a.record.losses !== b.record.losses) return a.record.losses - b.record.losses;
        return (b.record.pointsFor - b.record.pointsAgainst) - (a.record.pointsFor - a.record.pointsAgainst);
      })
      .forEach((t, i) => confRank.set(t.id, i + 1));
  }

  const items: FeedItem[] = [];

  // ── schedule notice: games on the next scheduled day ──
  let nextDay = Infinity;
  for (const g of games) {
    if (g.status !== 'scheduled') continue;
    const d = gameDay(g);
    if (d > 0 && d < nextDay) nextDay = d;
  }
  if (isFinite(nextDay)) {
    const count = games.filter(g => g.status === 'scheduled' && gameDay(g) === nextDay).length;
    if (count > 0) {
      items.push({
        id: `schedule-${nextDay}`,
        kind: 'schedule_notice',
        icon: ICONS.schedule_notice,
        headline: `${count} ${count === 1 ? 'game' : 'games'} on the slate for Day ${nextDay}`,
        // Future day → sorts above played moments.
        day: nextDay + 0.5,
      });
    }
  }

  // ── per-game moments ──
  const played = games.filter(g => g.status === 'played' && g.finalScore);
  for (const g of played) {
    const home = teamById.get(g.homeTeamId);
    const away = teamById.get(g.awayTeamId);
    if (!home || !away) continue;
    const { home: hs, away: as } = g.finalScore!;
    const homeWon = hs > as;
    const winner = homeWon ? home : away;
    const loser = homeWon ? away : home;
    const wScore = homeWon ? hs : as;
    const lScore = homeWon ? as : hs;
    const day = gameDay(g);

    // big game
    if (wScore >= 130 || wScore - lScore >= 25) {
      items.push({
        id: `big-${g.id}`,
        kind: 'big_game',
        icon: ICONS.big_game,
        headline: `${winner.city} ${winner.name} blew past ${loser.city} ${loser.name}, ${wScore}–${lScore}`,
        day,
        gameId: g.id,
      });
    }

    // upset: winner trails loser in conference standings AND loser is top-3
    const wRank = confRank.get(winner.id);
    const lRank = confRank.get(loser.id);
    const sameConf =
      (winner.sportData as { conference: string }).conference ===
      (loser.sportData as { conference: string }).conference;
    if (sameConf && wRank && lRank && lRank <= 3 && wRank > lRank) {
      items.push({
        id: `upset-${g.id}`,
        kind: 'upset',
        icon: ICONS.upset,
        headline: `${winner.city} ${winner.name} stunned #${lRank} ${loser.city} ${loser.name}, ${wScore}–${lScore}`,
        day,
        gameId: g.id,
      });
    }

    // career nights
    for (const [pid, line] of Object.entries(g.boxScores)) {
      const pts = line.points ?? 0;
      const reb = line.totalRebounds ?? 0;
      const ast = line.assists ?? 0;
      const tripleDouble = pts >= 10 && reb >= 10 && ast >= 10;
      if (pts >= 35 || tripleDouble) {
        const p = players[pid];
        if (!p) continue;
        const oppTeam = p.rosterSlot?.teamId === g.homeTeamId ? away : home;
        items.push({
          id: `career-${g.id}-${pid}`,
          kind: 'career_night',
          icon: ICONS.career_night,
          headline: tripleDouble
            ? `${p.firstName} ${p.lastName} posted a ${pts}/${reb}/${ast} triple-double on ${oppTeam.name}`
            : `${p.firstName} ${p.lastName} dropped ${pts}/${reb}/${ast} on ${oppTeam.name}`,
          day,
          gameId: g.id,
          playerId: pid,
        });
      }
    }
  }

  // ── streaks (team-level, from current record) ──
  for (const t of teams) {
    const { char, len } = trailingRun(t.record.streak);
    if (len >= 5 && (char === 'W' || char === 'L')) {
      items.push({
        id: `streak-${t.id}`,
        kind: 'streak',
        icon: ICONS.streak,
        headline:
          char === 'W'
            ? `${t.city} ${t.name} are riding a ${len}-game win streak`
            : `${t.city} ${t.name} have dropped ${len} straight`,
        day: league.currentTick,
      });
    }
  }

  // recency desc, then de-prioritize schedule ties; cap at 20
  items.sort((a, b) => b.day - a.day);
  return items.slice(0, 20);
}
