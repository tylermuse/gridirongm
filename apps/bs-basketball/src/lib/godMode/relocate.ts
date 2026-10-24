/**
 * God Mode: relocate / rebrand a franchise (parity 3.4, contained slice).
 *
 * Rename, re-city, and recolor any team without changing the league's size.
 * (Adding teams — 31/32 — is the separate offseason expansion flow in
 * lib/expansion.) Pure; God-Mode-gated.
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
