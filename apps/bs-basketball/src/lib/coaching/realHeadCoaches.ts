/**
 * Real current head coaches for the live NBA roster file.
 *
 * apps/bs-basketball/scripts/weekly_roster_update.py writes a BS-only
 * `bsCoaches` block into BBGM_NBA_Roster_2026_Updated.json from ESPN's core
 * API (one head coach per team, keyed by the file's team abbreviation).
 * leagueFromImport() seeds every team's staff (ensureCoachingStaff), then
 * applyRealHeadCoaches() renames each team's HC to the real person and makes
 * his age / hire season plausible from ESPN's `experience` (completed seasons
 * as an NBA head coach).
 *
 * Only head coaches are real — the player-development assistant stays
 * auto-generated, and so do the HC's ratings and scheme (we have no basis for
 * rating real people). Files without `bsCoaches` and existing saves are
 * untouched: this only runs at league creation.
 */

import type { BaseCoach, BaseLeagueState, TeamId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import { getHeadCoach, withCoachData } from './coaches';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

export interface RealHeadCoachEntry {
  /** "First Last" as ESPN lists it. */
  name: string;
  /** Completed seasons as an NBA head coach (0 = first year). */
  experience: number;
  /** Age at the season start, when ESPN has a date of birth. */
  age?: number;
}

/** Validate the raw `bsCoaches` block from a roster file; keys upper-cased. */
export function realHeadCoachesFromFile(raw: unknown): Record<string, RealHeadCoachEntry> {
  const out: Record<string, RealHeadCoachEntry> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [abbrev, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const e = v as { name?: unknown; experience?: unknown; age?: unknown };
    if (typeof e.name !== 'string' || !e.name.trim()) continue;
    const entry: RealHeadCoachEntry = {
      name: e.name.trim(),
      experience: typeof e.experience === 'number' && e.experience >= 0 ? Math.floor(e.experience) : 0,
    };
    if (typeof e.age === 'number' && e.age >= 25 && e.age <= 90) entry.age = Math.floor(e.age);
    out[abbrev.toUpperCase()] = entry;
  }
  return out;
}

/** Overlay the real head coach of every team in `byTeamId` onto the league's staff. */
export function applyRealHeadCoaches<L extends LeagueState>(
  league: L,
  byTeamId: Record<TeamId, RealHeadCoachEntry> | null | undefined,
): L {
  if (!byTeamId || Object.keys(byTeamId).length === 0 || !league.coaches) return league;
  const coaches = { ...(league.coaches as Record<string, BaseCoach>) };
  let changed = false;
  for (const team of league.teams) {
    const entry = byTeamId[team.id];
    if (!entry) continue;
    const hc = getHeadCoach(league, team.id);
    if (!hc) continue;
    const parts = entry.name.split(' ');
    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ') || parts[0];
    // A head coach is rarely younger than ~35, and has been one for `experience` years.
    const age = entry.age ?? Math.max(hc.age, 36 + entry.experience);
    coaches[hc.id] = withCoachData(
      { ...hc, firstName, lastName, age },
      // ESPN gives career HC seasons, not tenure here; treating it as tenure is
      // right for most coaches and never invents stints elsewhere.
      { hiredSeason: league.currentSeason - entry.experience, real: true },
    );
    changed = true;
  }
  return changed ? { ...league, coaches } : league;
}
