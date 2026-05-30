/**
 * Season rollover (Phases 2D-3 + 2D-4): offseason → draft → next season.
 *
 * The rollover is a two-step offseason so the draft (2D-4) can sit in the
 * middle:
 *   1. `enterOffseason` — age + retire the league, generate the draft class,
 *      and set up the draft order. Phase becomes 'offseason'; the class is the
 *      draft pool, NOT auto-assigned.
 *   2. (the user runs the /draft board — see lib/draft)
 *   3. `startNextSeason` — normalize rosters to a legal size (waive the excess
 *      created by draft picks → free agency; emergency-fill anyone short),
 *      regenerate the schedule, reset standings, increment the season, clear the
 *      draft + bracket, and record the champion.
 *
 * `advanceToNextSeason` runs all three with the draft auto-picked — a "sim the
 * whole offseason" shortcut used by tests and an optional skip-the-draft path.
 *
 * Notes: players carry `contract: null` until drafted (rookie scale) in v1, so
 * the roadmap's "expire contracts" is a no-op — retirements + draft-overflow
 * waivers are the roster churn. Previous-season games are replaced, not archived
 * (league history is 2E-4).
 */

import {
  developBasketballPlayer,
  shouldBasketballPlayerRetire,
  generateBasketballDraftClass,
  generateBasketballSchedule,
  generateBasketballPlayer,
  addBasketballStats,
  emptyBasketballStats,
  perGame,
  type BasketballPlayer,
  type BasketballPosition,
  type BasketballTeam,
} from '@bs/sport-basketball';
import type { BaseLeagueState, PlayerId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import { getBracket } from '../playoffs';
import { setupDraft, getDraft, autoPickUntilUser } from '../draft';
import { computeSeasonAwards } from '../awards';
import { buildSeasonHistoryEntry } from '../history';
import { applySeasonApproval } from '../approval';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

const TARGET_ROSTER = 15;
const MIN_LEGAL_ROSTER = 13;
const DRAFT_CLASS_SIZE = 60;

interface LeagueSportData {
  draft?: unknown;
  playoffs?: unknown;
  [key: string]: unknown;
}

/** Positions cycled through when generating emergency roster filler. */
const ROSTER_FILL_POSITIONS: BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C'];

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** True once a champion exists for the current season — the rollover gate. */
export function canAdvanceSeason(league: LeagueState): boolean {
  return !!getBracket(league)?.complete;
}

// ===========================================================================
// Step 1 — enter the offseason: age, retire, set up the draft
// ===========================================================================

export function enterOffseason(input: LeagueState): LeagueState {
  // End-of-season approval swing for the user team (may fire the GM, which
  // clears userTeamId). Done first, while record + bracket are intact.
  const league = applySeasonApproval(input).league;
  const nextSeason = league.currentSeason + 1;

  // Snapshot the finished season into history + accumulate career stats — both
  // done BEFORE aging, so they reflect the season just played.
  const historyEntry = buildSeasonHistoryEntry(league);
  const seasonStats = computeSeasonAwards(league)?.seasonStats;

  // Develop everyone; drop retirees (the schedule is replaced later, so nothing
  // references them once the season starts).
  const players: Record<string, BasketballPlayer> = {};
  const retired = new Set<PlayerId>();
  for (const [id, raw] of Object.entries(league.players)) {
    const p = raw as BasketballPlayer;
    const stats = seasonStats?.get(id as PlayerId) ?? emptyBasketballStats();

    // Snapshot pre-aging ratings + a year-by-year log entry (Phase 2E-1).
    const pg = perGame(stats);
    const prevLog = p.sportData.seasonLog ?? [];
    const seasonLog = stats.gamesPlayed > 0
      ? [...prevLog, {
          season: league.currentSeason,
          age: p.age,
          overall: p.ratings.overall,
          gamesPlayed: stats.gamesPlayed,
          ppg: round1(pg.points ?? 0),
          rpg: round1(pg.totalRebounds ?? 0),
          apg: round1(pg.assists ?? 0),
        }]
      : prevLog;

    const snapshot: BasketballPlayer = {
      ...p,
      careerStats: addBasketballStats(p.careerStats, stats),
      sportData: { ...p.sportData, prevRatings: p.ratings, seasonLog },
    };

    const developed = developBasketballPlayer(snapshot, nextSeason);
    if (shouldBasketballPlayerRetire(developed)) {
      retired.add(id as PlayerId);
      continue;
    }
    players[id] = developed;
  }

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

  // Generate the draft class — the pool, not auto-assigned.
  const draftClass = generateBasketballDraftClass(nextSeason, DRAFT_CLASS_SIZE);
  const poolIds: PlayerId[] = [];
  for (const p of draftClass) {
    players[p.id] = p;
    poolIds.push(p.id);
  }

  // Draft order is computed off the just-finished standings + playoff field.
  const interim: LeagueState = { ...league, players, teams };
  const draft = setupDraft(interim, nextSeason, poolIds);

  return {
    ...interim,
    currentPhase: 'offseason',
    seasonHistory: { ...league.seasonHistory, [league.currentSeason]: historyEntry },
    sportData: { ...(league.sportData as LeagueSportData), draft },
  };
}

// ===========================================================================
// Step 3 — start the next season: normalize rosters, regenerate, reset
// ===========================================================================

export function startNextSeason(league: LeagueState): LeagueState {
  const draft = getDraft(league);
  if (!draft || !draft.complete) {
    throw new Error('The draft must be complete before starting the season.');
  }
  const season = draft.season;

  const players = { ...league.players } as Record<string, BasketballPlayer>;
  const ovr = (id: string) => (players[id]?.ratings.overall ?? 0);
  // Track each waived player's last team so the free-agency UI can show it.
  const freeAgentLastTeam: Record<string, typeof league.teams[number]['id']> = {};

  const teams: BasketballTeam[] = league.teams.map(t => {
    let ids = [...t.playerIds];

    // Draft picks can push a roster over the cap — waive the weakest to 15.
    if (ids.length > TARGET_ROSTER) {
      ids.sort((a, b) => ovr(b) - ovr(a));
      const waived = ids.slice(TARGET_ROSTER);
      for (const id of waived) {
        players[id] = { ...players[id], rosterSlot: null };
        freeAgentLastTeam[id] = t.id;
      }
      ids = ids.slice(0, TARGET_ROSTER);
    }

    // Anyone short of the legal minimum gets fresh bodies.
    while (ids.length < MIN_LEGAL_ROSTER) {
      const pos = ROSTER_FILL_POSITIONS[ids.length % ROSTER_FILL_POSITIONS.length];
      const filler = generateBasketballPlayer({ position: pos, targetOverall: 62, age: 22 });
      players[filler.id] = filler;
      ids.push(filler.id);
    }

    // Re-index every kept player's roster slot.
    ids.forEach((id, idx) => {
      players[id] = { ...players[id], rosterSlot: { teamId: t.id, bucket: 'active', index: idx } };
    });

    return {
      ...t,
      playerIds: ids,
      rosterBuckets: { ...t.rosterBuckets, active: ids, two_way: [], inactive: [] },
      record: { wins: 0, losses: 0, otherResults: 0, pointsFor: 0, pointsAgainst: 0, streak: [] },
    } as BasketballTeam;
  });

  const freeAgentIds: PlayerId[] = (Object.keys(players) as PlayerId[]).filter(
    id => !players[id].rosterSlot,
  );

  const games = generateBasketballSchedule(teams, { season });

  const competitions = league.competitions.map((c, i) =>
    i === 0
      ? {
          ...c,
          standings: teams.map((t, idx) => ({
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
  delete sportData.draft;
  delete sportData.playoffs;
  sportData.freeAgentLastTeam = freeAgentLastTeam;

  // Season history was recorded in enterOffseason (before aging) — don't
  // overwrite it here.
  return {
    ...league,
    currentSeason: season,
    currentPhase: 'preseason',
    currentTick: 1,
    teams,
    players,
    freeAgentIds,
    competitions,
    games,
    sportData,
  };
}

// ===========================================================================
// Convenience — run the whole offseason with the draft auto-picked
// ===========================================================================

export function advanceToNextSeason(league: LeagueState): LeagueState {
  const offseason = enterOffseason(league);
  // userTeamId null → never matches a pick → auto-pick all 60.
  const drafted = autoPickUntilUser(offseason, null);
  return startNextSeason(drafted);
}
