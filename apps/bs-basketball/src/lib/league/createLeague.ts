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
import { CURRENT_SAVE_VERSION } from '../persistence/migrations';

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

  for (const template of templates) {
    const teamId = `team-${template.abbreviation.toLowerCase()}-${uuid().slice(0, 8)}` as TeamId;

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
        sportData: { ...p.sportData, acquiredVia: 'initial', acquiredSeason: season },
      };
      rosterPlayers.push(playerWithSlot);
      players[p.id] = playerWithSlot;
    }

    teams.push(makeBasketballTeam({
      id: teamId,
      template,
      playerIds: rosterPlayers.map(p => p.id),
    }));
  }

  return assembleLeague({ teams, players, season, displayName, rngSeed: opts.rngSeed });
}

// ===========================================================================
// Reusable team + league assembly (shared by generate + import paths)
// ===========================================================================

/** Build a zeroed-out BasketballTeam shell from a template. Coaches are
 *  attached later in assembleLeague so both the procedural-generate path and
 *  the league-import path produce identical team shape. */
export function makeBasketballTeam(opts: {
  id: TeamId;
  template: Pick<BasketballTeamTemplate, 'city' | 'name' | 'abbreviation' | 'primaryColor' | 'secondaryColor' | 'conference' | 'division'>;
  playerIds: PlayerId[];
  /** Optional display overrides (the import path carries real-team colors/logo). */
  primaryColor?: string;
  secondaryColor?: string;
  logoUrl?: string;
}): BasketballTeam {
  const { template } = opts;
  return {
    id: opts.id,
    city: template.city,
    name: template.name,
    abbreviation: template.abbreviation,
    primaryColor: opts.primaryColor ?? template.primaryColor,
    secondaryColor: opts.secondaryColor ?? template.secondaryColor,
    ...(opts.logoUrl ? { logoUrl: opts.logoUrl } : {}),
    playerIds: opts.playerIds,
    rosterBuckets: {
      active: opts.playerIds,
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
    coachIds: [],
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
}

export interface AssembleLeagueOptions {
  /** Fully-formed teams (coachIds may be empty — a head coach is generated here). */
  teams: BasketballTeam[];
  /** Player lookup keyed by id. */
  players: Record<PlayerId, BasketballPlayer>;
  /** Free agents not on any roster (import path supplies real veteran FAs). */
  freeAgentIds?: PlayerId[];
  season: number;
  displayName?: string;
  rngSeed?: string;
}

/**
 * Turn a set of teams + players into a ready-to-persist BaseLeagueState:
 * generates a head coach per team, builds the 82-game schedule, wires the
 * single 'primary' competition, and stamps league metadata. Both the
 * procedural-generate path (createNewBasketballLeague) and the league-import
 * path call this so league shape stays identical.
 */
export function assembleLeague(
  opts: AssembleLeagueOptions,
): BaseLeagueState<BasketballRatings, BasketballStats> {
  const { players, season } = opts;
  const displayName = opts.displayName ?? 'BS Hoops';

  if (opts.teams.length !== 30) {
    throw new Error(`Need 30 teams to assemble a league; got ${opts.teams.length}`);
  }

  // Each team gets a head coach (scheme + ratings drive fit + future effects).
  const coaches: Record<CoachId, BaseCoach> = {};
  const teams: BasketballTeam[] = opts.teams.map(team => {
    const headCoach = generateHeadCoach(team.id);
    coaches[headCoach.id] = headCoach;
    return { ...team, coachIds: [headCoach.id] };
  });

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
    freeAgentIds: opts.freeAgentIds ?? [],
    coaches,
    competitions: [competition],
    games: scheduledGames,
    seasonHistory: {},
    userTeamId: null,
    saveVersion: CURRENT_SAVE_VERSION,
    sportData: { lastSeenChangelog: CHANGELOG_VERSION },
  };

  return state;
}
