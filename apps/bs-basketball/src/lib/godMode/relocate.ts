/**
 * God Mode: relocate / rebrand a franchise (parity 3.4, contained slice).
 *
 * A true 31/32-team expansion draft is deferred — the 30-team count is baked
 * into the schedule generator (its conference/division circulant graph), the
 * playoff bracket (8 seeds per conference, 14-team lottery), and conference
 * validation, so adding a team is a large, invasive rework. This delivers the
 * realistic franchise-churn flavor safely: rename, re-city, and recolor any team
 * while keeping the league at 30 (no invariants touched). Pure; God-Mode-gated.
 */

import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats, BasketballTeam } from '@bs/sport-basketball';
import { isGodMode } from './godMode';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export interface FranchiseEdit {
  city?: string;
  name?: string;
  abbreviation?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

function clean(s: string | undefined, max: number): string | undefined {
  if (typeof s !== 'string') return undefined;
  const t = s.trim().slice(0, max);
  return t.length ? t : undefined;
}

/** Apply an identity edit to one franchise. No-op unless God Mode is on. Pure. */
export function relocateTeam(league: LeagueState, teamId: string, edit: FranchiseEdit): LeagueState {
  if (!isGodMode(league)) return league;
  const teams = league.teams as BasketballTeam[];
  if (!teams.some(t => t.id === teamId)) return league;

  const city = clean(edit.city, 24);
  const name = clean(edit.name, 24);
  const abbrev = clean(edit.abbreviation, 4);
  const primary = clean(edit.primaryColor, 9);
  const secondary = clean(edit.secondaryColor, 9);

  const nextTeams = teams.map(t => t.id !== teamId ? t : {
    ...t,
    city: city ?? t.city,
    name: name ?? t.name,
    abbreviation: abbrev ? abbrev.toUpperCase() : t.abbreviation,
    primaryColor: primary ?? t.primaryColor,
    secondaryColor: secondary ?? t.secondaryColor,
  });

  const sd = league.sportData as { godModeEverUsed?: boolean };
  return { ...league, teams: nextTeams, sportData: { ...sd, godModeEverUsed: true } };
}
