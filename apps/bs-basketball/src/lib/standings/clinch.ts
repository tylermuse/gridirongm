/**
 * Clinch / elimination markers (spec P2.4 / 2.6).
 *
 * NBA-style standings tags computed from each team's guaranteed floor (current
 * wins, can't drop) vs. rivals' ceiling (current wins + games remaining):
 *   z — best record in conference (home court throughout)
 *   y — clinched division
 *   x — clinched a playoff / play-in spot (top 10 of conference)
 *   e — eliminated from the play-in field
 * Pure derivation off team records + the schedule; nothing persisted.
 */

import type { BasketballTeam } from '@bs/sport-basketball';
import type { BaseGameResult, BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;
type GameResult = BaseGameResult<BasketballStats>;

export type ClinchMark = 'z' | 'y' | 'x' | 'e' | null;

export const CLINCH_LEGEND: { mark: Exclude<ClinchMark, null>; label: string; color: string }[] = [
  { mark: 'z', label: 'Top seed', color: '#fbbf24' },
  { mark: 'y', label: 'Clinched division', color: '#10b981' },
  { mark: 'x', label: 'Clinched play-in spot', color: '#3b82f6' },
  { mark: 'e', label: 'Eliminated', color: '#ef4444' },
];

const PLAYIN_FIELD = 10; // top 10 of each conference reach the play-in

function conf(t: BasketballTeam): string { return (t.sportData as { conference: string }).conference; }
function div(t: BasketballTeam): string { return (t.sportData as { division: string }).division; }

export function clinchMarks(league: LeagueState): Map<string, ClinchMark> {
  const teams = league.teams as BasketballTeam[];
  const marks = new Map<string, ClinchMark>();

  // Games remaining per team (scheduled games still on the calendar).
  const remaining = new Map<string, number>();
  for (const t of teams) remaining.set(t.id, 0);
  for (const g of league.games as GameResult[]) {
    if (g.status !== 'scheduled') continue;
    remaining.set(g.homeTeamId, (remaining.get(g.homeTeamId) ?? 0) + 1);
    remaining.set(g.awayTeamId, (remaining.get(g.awayTeamId) ?? 0) + 1);
  }
  const maxWins = (t: BasketballTeam) => t.record.wins + (remaining.get(t.id) ?? 0);

  for (const t of teams) {
    const confTeams = teams.filter(o => conf(o) === conf(t) && o.id !== t.id);
    const divTeams = teams.filter(o => div(o) === div(t) && o.id !== t.id);

    // How many conf rivals could still finish strictly above t's floor.
    const canPass = confTeams.filter(o => maxWins(o) > t.record.wins).length;
    // How many conf rivals are already guaranteed above t's ceiling.
    const lockedAbove = confTeams.filter(o => o.record.wins > maxWins(t)).length;

    let mark: ClinchMark = null;
    if (lockedAbove >= PLAYIN_FIELD) mark = 'e';
    else if (confTeams.every(o => maxWins(o) < t.record.wins)) mark = 'z';
    else if (divTeams.every(o => maxWins(o) < t.record.wins)) mark = 'y';
    else if (canPass < PLAYIN_FIELD) mark = 'x';

    marks.set(t.id, mark);
  }
  return marks;
}
