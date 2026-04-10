/**
 * Client-side helper that POSTs the user's current GM stats to /api/gm/sync.
 * Fire-and-forget — silently fails if the user isn't logged in or the
 * service isn't configured.
 *
 * Called by the store at end-of-season transitions.
 */

import type { LeagueState } from '@/types';
import { computeClassDraftScore, classScoreToGrade } from './draftScore';

export interface GmSyncPayload {
  season: number;
  teamId: string;
  teamName: string;
  teamAbbreviation: string;
  wins: number;
  losses: number;
  madePlayoffs: boolean;
  wonChampionship: boolean;
  draftGrade?: string;
  draftScore?: number;
}

/** Build a sync payload from the current league state. */
export function buildGmSyncPayload(state: LeagueState): GmSyncPayload | null {
  const userTeam = state.teams.find(t => t.id === state.userTeamId);
  if (!userTeam) return null;

  // Did the user make the playoffs this season?
  const madePlayoffs = !!state.playoffSeeds && (
    state.playoffSeeds.AC.includes(userTeam.id) ||
    state.playoffSeeds.NC.includes(userTeam.id)
  );

  // Did they win the championship?
  const wonChampionship = state.champions.some(c =>
    c.season === state.season && c.teamId === userTeam.id,
  );

  // Compute draft score for this season's class (only if they have draft results)
  const userPicks = state.draftResults.filter(d => d.teamId === userTeam.id);
  let draftScore: number | undefined;
  let draftGrade: string | undefined;
  if (userPicks.length > 0) {
    draftScore = computeClassDraftScore(userPicks, state.players);
    draftGrade = classScoreToGrade(draftScore, userPicks.length);
  }

  return {
    season: state.season,
    teamId: userTeam.id,
    teamName: `${userTeam.city} ${userTeam.name}`,
    teamAbbreviation: userTeam.abbreviation,
    wins: userTeam.record.wins,
    losses: userTeam.record.losses,
    madePlayoffs,
    wonChampionship,
    draftGrade,
    draftScore,
  };
}

/** POST to the sync endpoint. Fire-and-forget — never throws. */
export function syncGmStats(payload: GmSyncPayload): void {
  // Use fetch with keepalive so it survives page navigation
  try {
    fetch('/api/gm/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => { /* silent */ });
  } catch {
    /* silent */
  }
}
