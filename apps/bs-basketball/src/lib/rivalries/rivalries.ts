/**
 * Rivalries (parity 3.2).
 *
 * A rivalry beat is a notable head-to-head between division opponents — a
 * nailbiter, an overtime classic, or a lopsided statement. Pure derivation off
 * played games (works for any league, generated or imported); the news feed and
 * The Show surface them. No persisted state.
 */

import type { BaseGameResult, BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats, BasketballTeam } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;
type GameResult = BaseGameResult<BasketballStats>;

export type RivalryKind = 'thriller' | 'overtime' | 'statement';

export interface RivalryEvent {
  id: string;
  day: number;
  kind: RivalryKind;
  homeTeamId: string;
  awayTeamId: string;
  gameId: string;
  headline: string;
}

function gameDay(g: GameResult): number {
  return (g.sportData as { dayOfSeason?: number } | undefined)?.dayOfSeason ?? 0;
}
function isOvertime(g: GameResult): boolean {
  return ((g.sportData as { quarterScores?: unknown[] } | undefined)?.quarterScores?.length ?? 4) > 4;
}
function division(t: BasketballTeam): string {
  return (t.sportData as { division: string }).division;
}

/** Notable division head-to-heads, newest first. */
export function buildRivalryEvents(league: LeagueState | null): RivalryEvent[] {
  if (!league) return [];
  const teamById = new Map((league.teams as BasketballTeam[]).map(t => [t.id as string, t]));
  const out: RivalryEvent[] = [];

  for (const g of league.games as GameResult[]) {
    if (g.status !== 'played' || !g.finalScore) continue;
    const home = teamById.get(g.homeTeamId);
    const away = teamById.get(g.awayTeamId);
    if (!home || !away || division(home) !== division(away)) continue;

    const margin = Math.abs(g.finalScore.home - g.finalScore.away);
    const ot = isOvertime(g);
    let kind: RivalryKind;
    if (ot) kind = 'overtime';
    else if (margin <= 4) kind = 'thriller';
    else if (margin >= 22) kind = 'statement';
    else continue; // ordinary division game — not a beat

    const homeWon = g.finalScore.home > g.finalScore.away;
    const winner = homeWon ? home : away;
    const loser = homeWon ? away : home;
    const ws = Math.max(g.finalScore.home, g.finalScore.away);
    const ls = Math.min(g.finalScore.home, g.finalScore.away);
    const headline =
      kind === 'overtime' ? `Division OT classic: ${winner.city} outlast ${loser.city} ${ws}–${ls}`
      : kind === 'thriller' ? `Division nailbiter: ${winner.city} edge ${loser.city} ${ws}–${ls}`
      : `Division statement: ${winner.city} rout ${loser.city} ${ws}–${ls}`;

    out.push({
      id: `rivalry-${g.id}`, day: gameDay(g), kind,
      homeTeamId: home.id, awayTeamId: away.id, gameId: g.id, headline,
    });
  }

  out.sort((a, b) => b.day - a.day);
  return out.slice(0, 30);
}
