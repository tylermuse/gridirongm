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
import { getDraft } from '../draft';
import { buildDraftRecap } from '../draft/recap';
import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats, BasketballTeam } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

interface DraftGrade { score: number; grade: string }
interface LeagueSportData {
  imported?: boolean;
  /** User draft grade keyed by the season the rookies enter (set at
   *  startNextSeason; ridden along on that season's end-of-season sync). */
  draftGradeBySeason?: Record<number, DraftGrade>;
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
  draftScore?: number;
  draftGrade?: string;
}

/**
 * The user's draft grade for the class just drafted, keyed to the season those
 * rookies enter (draft.season). Average pick value-vs-slot (steals positive),
 * letter-graded. Null if the draft isn't complete or the user made no picks.
 * Call at startNextSeason and stash on sportData.draftGradeBySeason.
 */
export function computeUserDraftGrade(league: LeagueState): { season: number; score: number; grade: string } | null {
  const draft = getDraft(league);
  if (!draft || !draft.complete) return null;
  const recap = buildDraftRecap(league);
  if (!recap || recap.userPicks.length === 0) return null;
  const avg = recap.userPicks.reduce((s, p) => s + p.delta, 0) / recap.userPicks.length;
  const score = Math.round(avg * 10) / 10;
  const grade = avg >= 6 ? 'A' : avg >= 3 ? 'B' : avg >= 0 ? 'C' : 'D';
  return { season: draft.season, score, grade };
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
  const draft = (league.sportData as LeagueSportData | undefined)?.draftGradeBySeason?.[league.currentSeason];

  return {
    season: league.currentSeason,
    teamId: team.id,
    teamName: `${team.city} ${team.name}`,
    teamAbbreviation: team.abbreviation,
    wins: team.record.wins,
    losses: team.record.losses,
    madePlayoffs,
    wonChampionship,
    ...(draft ? { draftScore: draft.score, draftGrade: draft.grade } : {}),
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
