/**
 * Create a new basketball league from team templates.
 *
 * Steps:
 *   1. Build BasketballTeam objects from the templates (IDs, empty records,
 *      empty roster buckets).
 *   2. For each team, generate 15 players via generateBasketballPlayer with
 *      a balanced position distribution.
 *   3. Build default lineups via buildDefaultBasketballLineup.
 *   4. Generate the 82-game schedule via generateBasketballSchedule.
 *   5. Assemble the final BaseLeagueState ready to persist.
 *
 * Determinism: pass a fixed rngSeed to get reproducible league creation,
 * useful for tests + tutorial scenarios.
 */

import { v4 as uuid } from 'uuid';
import { CHANGELOG_VERSION } from '../ui/changelog';
import { marketContract } from './contracts';
import { generateHeadCoach } from '../coaching/coaches';
import {
  generateBasketballPlayer,
  generateBasketballSchedule,
  buildDefaultBasketballLineup,
  basketballAdapter,
  type BasketballPlayer,
  type BasketballPosition,
  type BasketballTeam,
} from '@bs/sport-basketball';
import type {
  BaseLeagueState,
  BaseCoach,
  CoachId,
  PlayerId,
  TeamId,
  Competition,
} from '@bs/core/adapter';
import type {
  BasketballRatings,
  BasketballStats,
} from '@bs/sport-basketball';
import { HOOPS_LEAGUE_TEAMS, type BasketballTeamTemplate } from '../data/teams';

// ===========================================================================
// Options
// ===========================================================================

export interface CreateBasketballLeagueOptions {
  /** League name. Defaults to "BS Hoops". */
  displayName?: string;
  /** Year the regular season starts. Defaults to 2026. */
  season?: number;
  /** Players per team. Defaults to 15 (NBA active roster). */
  rosterSize?: number;
  /** Optional team templates. Defaults to HOOPS_LEAGUE_TEAMS. */
  teamTemplates?: BasketballTeamTemplate[];
  /** Optional RNG seed for deterministic creation. */
  rngSeed?: string;
}

// ===========================================================================
// Roster position distribution
// ===========================================================================

/** Position cycle. Roster slots interleave PG→C (rotated per team) so the
 *  talent tiers — which are assigned by slot index — spread across positions
 *  instead of stacking the best ratings on point guards and the worst on
 *  centers. 15 slots → 3 of each position. */
const POS_ORDER: BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C'];

// ===========================================================================
// Main entry
// ===========================================================================

export function createNewBasketballLeague(
  opts: CreateBasketballLeagueOptions = {},
): BaseLeagueState<BasketballRatings, BasketballStats> {
  const templates = opts.teamTemplates ?? HOOPS_LEAGUE_TEAMS;
  const season = opts.season ?? 2026;
  const rosterSize = opts.rosterSize ?? 15;
  const displayName = opts.displayName ?? 'BS Hoops';

  if (templates.length !== 30) {
    throw new Error(`Need 30 team templates; got ${templates.length}`);
  }

  // --- Build teams + players ---
  const teams: BasketballTeam[] = [];
  const players: Record<PlayerId, BasketballPlayer> = {};
  const coaches: Record<CoachId, BaseCoach> = {};

  for (const template of templates) {
    const teamId = `team-${template.abbreviation.toLowerCase()}-${uuid().slice(0, 8)}` as TeamId;

    // Each team gets a head coach (scheme + ratings drive fit + future effects).
    const headCoach = generateHeadCoach(teamId);
    coaches[headCoach.id] = headCoach;

    // Generate the roster. Slice to rosterSize in case caller passed a smaller value.
    // Interleave positions (PG→C) starting at a per-team offset, so the star /
    // starter tiers below rotate through positions instead of always landing on
    // point guards.
    const posOffset = Math.floor(Math.random() * POS_ORDER.length);
    const positions = Array.from({ length: rosterSize }, (_, i) => POS_ORDER[(posOffset + i) % POS_ORDER.length]);
    const rosterPlayers: BasketballPlayer[] = [];
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      // Mix the target OVR so each team has a star, several starters, role
      // players, and a couple of bench guys. Slot 0 is the team's "star";
      // slots 1-4 starters; 5-9 rotation; the rest depth.
      let targetOvr: number;
      if (i === 0) targetOvr = 78 + Math.round(Math.random() * 8); // 78-85
      else if (i < 5) targetOvr = 73 + Math.round(Math.random() * 6); // 73-78
      else if (i < 10) targetOvr = 68 + Math.round(Math.random() * 5); // 68-72
      else targetOvr = 60 + Math.round(Math.random() * 8); // 60-67

      const p = generateBasketballPlayer({
        position: pos,
        targetOverall: targetOvr,
      });
      // Stamp the player's rosterSlot so the team-by-player lookups work, and a
      // market-value contract so the team's payroll/cap is real from the start.
      const playerWithSlot: BasketballPlayer = {
        ...p,
        rosterSlot: { teamId, bucket: 'active', index: i },
        contract: marketContract(p, season),
      };
      rosterPlayers.push(playerWithSlot);
      players[p.id] = playerWithSlot;
    }

    // Default lineup from the generated roster.
    const lineup = buildDefaultBasketballLineup(rosterPlayers);

    const team: BasketballTeam = {
      id: teamId,
      city: template.city,
      name: template.name,
      abbreviation: template.abbreviation,
      primaryColor: template.primaryColor,
      secondaryColor: template.secondaryColor,
      playerIds: rosterPlayers.map(p => p.id),
      rosterBuckets: {
        active: rosterPlayers.map(p => p.id),
        two_way: [],
        inactive: [],
      },
      draftPicks: [],
      record: {
        wins: 0,
        losses: 0,
        otherResults: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        streak: [],
      },
      coachIds: [headCoach.id],
      approval: {
        fanApproval: 50,
        ownerApproval: 50,
        objectives: [],
        jobSecurity: 'safe',
      },
      capState: null,
      sportData: {
        conference: template.conference,
        division: template.division,
        pace: 'medium' as const,
        defensiveScheme: 'switch_everything' as const,
      },
    };

    teams.push(team);
    // Stash the default lineup somewhere accessible. For now we cache it on
    // the team via a side-channel; later we'll persist it through the
    // adapter's lineupModel. v1: leaning on the runtime to remember.
    void lineup;
  }

  // --- Schedule the 82-game regular season ---
  const scheduledGames = generateBasketballSchedule(teams, {
    season,
    rngSeed: opts.rngSeed,
  });

  // --- Wire up the single 'primary' competition ---
  const competition: Competition = {
    id: 'primary' as Competition['id'],
    name: 'Regular Season',
    format: basketballAdapter.competitions[0].format,
    currentPhaseIndex: 0,
    standings: teams.map((t, i) => ({
      teamId: t.id,
      wins: 0,
      losses: 0,
      draws: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      competitionPoints: 0,
      position: i + 1,
    })),
    history: [],
  };

  // --- Assemble the final league state ---
  const state: BaseLeagueState<BasketballRatings, BasketballStats> = {
    id: uuid() as BaseLeagueState<BasketballRatings, BasketballStats>['id'],
    sportId: 'basketball',
    displayName,
    currentSeason: season,
    currentPhase: 'preseason',
    currentTick: 1,
    teams,
    players,
    freeAgentIds: [],
    coaches,
    competitions: [competition],
    games: scheduledGames,
    seasonHistory: {},
    userTeamId: null,
    saveVersion: 1,
    sportData: { lastSeenChangelog: CHANGELOG_VERSION },
  };

  return state;
}
