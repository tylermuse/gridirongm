/**
 * Global GM leaderboard sync (parity 3.3, Phase A).
 *
 * Client-side: derives a season payload from league state and fires it at the
 * `/api/gm/sync` route. Fire-and-forget — never throws, silently no-ops when
 * the user is logged out or Supabase is unconfigured. Mirrors football's
 * `gmSync.ts`, with NBA exclusion rules (D3): God Mode (current OR ever-used),
 * spectator, and imported-roster leagues do not count toward the global board.
 */

import { isGodMode, godModeEverUsed } from '../godMode/godMode';
import { getBracket } from '../playoffs';
import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats, BasketballTeam } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

interface LeagueSportData {
  imported?: boolean;
  [key: string]: unknown;
}

export interface GmSyncPayload {
  season: number;
  teamId: string;
  teamName: string;
  teamAbbreviation: string;
  wins: number;
  losses: number;
  madePlayoffs: boolean;
  wonChampionship: boolean;
}

/**
 * Build a sync payload for the just-completed season, or null if this save is
 * excluded from the global board (God Mode / spectator / imported roster, or
 * no user team).
 */
export function buildGmSyncPayload(league: LeagueState): GmSyncPayload | null {
  if (isGodMode(league) || godModeEverUsed(league)) return null;
  if ((league.sportData as LeagueSportData | undefined)?.imported) return null;
  if (!league.userTeamId) return null; // spectator

  const team = league.teams.find(t => t.id === league.userTeamId) as BasketballTeam | undefined;
  if (!team) return null;

  const bracket = getBracket(league);
  const madePlayoffs = !!bracket && (bracket.seeds.Eastern.includes(team.id) || bracket.seeds.Western.includes(team.id));
  const wonChampionship = !!bracket && bracket.championTeamId === team.id;

  return {
    season: league.currentSeason,
    teamId: team.id,
    teamName: `${team.city} ${team.name}`,
    teamAbbreviation: team.abbreviation,
    wins: team.record.wins,
    losses: team.record.losses,
    madePlayoffs,
    wonChampionship,
  };
}

/** POST the payload to the sync endpoint. Fire-and-forget — never throws. */
export function syncGmStats(payload: GmSyncPayload): void {
  try {
    fetch('/api/gm/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => { /* silent — logged-out or unconfigured */ });
  } catch {
    /* silent */
  }
}
