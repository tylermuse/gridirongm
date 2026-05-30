/**
 * Season rollover (Phase 2D-3): offseason → next season.
 *
 * Runs once the playoffs crown a champion. In one atomic step it ages the whole
 * league, retires the old guard, refills rosters, and lays down a fresh
 * regular season so the game can be played indefinitely.
 *
 * Steps (mirrors the roadmap, adapted to the real data model):
 *   1. Develop every player (aging + ratings drift) via the engine.
 *   2. Retire players the engine flags; prune them from rosters and the player
 *      map (we replace the schedule below, so nothing references them anymore).
 *   3. Generate the next draft class (60 age-19 prospects).
 *   4. Backfill rosters to a legal size from that class, worst-record team first
 *      (a stand-in auto-draft until the 2D-4 draft UI lands); leftover prospects
 *      become free agents. Safety-fill with fresh bodies if a class runs dry.
 *   5. Increment the season, regenerate the schedule, reset standings/records,
 *      clear the playoff bracket, and record the champion in season history.
 *
 * Note: players carry `contract: null` in v1, so the roadmap's "resolve expiring
 * contracts" has nothing to act on yet — retirements are the only roster churn.
 * The previous season's games are replaced (not archived); league history is
 * Phase 2E-4.
 */

import {
  developBasketballPlayer,
  shouldBasketballPlayerRetire,
  generateBasketballDraftClass,
  generateBasketballSchedule,
  generateBasketballPlayer,
  type BasketballPlayer,
  type BasketballPosition,
  type BasketballTeam,
} from '@bs/sport-basketball';
import type {
  BaseLeagueState,
  PlayerId,
} from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import { getBracket } from '../playoffs';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

const TARGET_ROSTER = 15;
const MIN_LEGAL_ROSTER = 13;

interface LeagueSportData {
  playoffs?: unknown;
  [key: string]: unknown;
}

/** True once a champion exists for the current season — the rollover gate. */
export function canAdvanceSeason(league: LeagueState): boolean {
  return !!getBracket(league)?.complete;
}

export function advanceToNextSeason(league: LeagueState): LeagueState {
  const prevSeason = league.currentSeason;
  const nextSeason = prevSeason + 1;
  const champion = getBracket(league)?.championTeamId ?? null;

  // --- 1 & 2: develop everyone, collect retirements ---
  const players: Record<string, BasketballPlayer> = {};
  const retired = new Set<PlayerId>();
  for (const [id, raw] of Object.entries(league.players)) {
    const developed = developBasketballPlayer(raw as BasketballPlayer, nextSeason);
    if (shouldBasketballPlayerRetire(developed)) {
      retired.add(id as PlayerId);
      continue; // prune — dropped from the player map entirely
    }
    players[id] = developed;
  }

  // --- Strip retired players from every roster bucket ---
  const teams: BasketballTeam[] = league.teams.map(t => {
    const buckets: Record<string, PlayerId[]> = {};
    for (const [name, ids] of Object.entries(t.rosterBuckets)) {
      buckets[name] = ids.filter(pid => !retired.has(pid));
    }
    return {
      ...t,
      playerIds: t.playerIds.filter(pid => !retired.has(pid)),
      rosterBuckets: buckets,
    } as BasketballTeam;
  });

  // --- 3: next draft class ---
  const draftClass = generateBasketballDraftClass(nextSeason, 60);
  for (const p of draftClass) players[p.id] = p;

  // --- 4: backfill rosters, worst record first, best prospect first ---
  const available = [...draftClass].sort((a, b) => b.ratings.overall - a.ratings.overall);
  let nextProspect = 0;
  const draftOrder = [...teams].sort((a, b) => a.record.wins - b.record.wins);

  function signToTeam(team: BasketballTeam, player: BasketballPlayer): void {
    const index = team.playerIds.length;
    players[player.id] = {
      ...players[player.id],
      rosterSlot: { teamId: team.id, bucket: 'active', index },
    };
    team.playerIds.push(player.id);
    (team.rosterBuckets.active ??= []).push(player.id);
  }

  for (const team of draftOrder) {
    while (team.playerIds.length < TARGET_ROSTER && nextProspect < available.length) {
      signToTeam(team, available[nextProspect++]);
    }
    // Safety net: if the class ran dry, generate fresh bodies to stay legal.
    while (team.playerIds.length < MIN_LEGAL_ROSTER) {
      const pos = ROSTER_FILL_POSITIONS[team.playerIds.length % ROSTER_FILL_POSITIONS.length];
      const filler = generateBasketballPlayer({ position: pos, targetOverall: 62, age: 22 });
      players[filler.id] = filler;
      signToTeam(team, filler);
    }
  }

  // --- Free agents: every unsigned, non-retired player ---
  const freeAgentIds: PlayerId[] = (Object.keys(players) as PlayerId[]).filter(
    id => !players[id].rosterSlot,
  );

  // --- 5: fresh season — reset records, regenerate schedule, clear bracket ---
  const resetTeams: BasketballTeam[] = teams.map(t => ({
    ...t,
    record: { wins: 0, losses: 0, otherResults: 0, pointsFor: 0, pointsAgainst: 0, streak: [] },
  }));

  const games = generateBasketballSchedule(resetTeams, { season: nextSeason });

  const competitions = league.competitions.map((c, i) =>
    i === 0
      ? {
          ...c,
          standings: resetTeams.map((t, idx) => ({
            teamId: t.id,
            wins: 0,
            losses: 0,
            draws: 0,
            pointsFor: 0,
            pointsAgainst: 0,
            competitionPoints: 0,
            position: idx + 1,
          })),
        }
      : c,
  );

  const sportData = { ...(league.sportData as LeagueSportData) };
  delete sportData.playoffs;

  return {
    ...league,
    currentSeason: nextSeason,
    currentPhase: 'preseason',
    currentTick: 1,
    teams: resetTeams,
    players,
    freeAgentIds,
    competitions,
    games,
    seasonHistory: {
      ...league.seasonHistory,
      [prevSeason]: { champion },
    },
    sportData,
  };
}

/** Positions cycled through when generating emergency roster filler. */
const ROSTER_FILL_POSITIONS: BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C'];
