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
  resolveBasketballPDCEffect,
  basketballMarketSalary,
  basketballFirstApron,
  type BasketballPlayer,
  type BasketballPosition,
  type BasketballTeam,
} from '@bs/sport-basketball';
import type { BaseLeagueState, PlayerId } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';
import { getBracket } from '../playoffs';
import { marketContract, hasContractForSeason } from '../league/contracts';
import { getHeadCoach } from '../coaching/coaches';
import { setupDraft, getDraft, autoPickUntilUser } from '../draft';
import { computeSeasonAwards } from '../awards';
import { buildSeasonHistoryEntry } from '../history';
import { applySeasonApproval } from '../approval';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

const TARGET_ROSTER = 15;
const MIN_LEGAL_ROSTER = 13;
const DRAFT_CLASS_SIZE = 60;

/** Minimum players to keep at each position when waiving roster overflow. Stops
 *  the OVR-only cut from stripping a team of every center (low-OVR role players
 *  were always the first to go), which left teams unable to field a lineup. */
const POS_FLOOR: Record<BasketballPosition, number> = { PG: 2, SG: 2, SF: 2, PF: 2, C: 2 };

/** "Keep value" for roster trims — values upside, not just current overall, so
 *  freshly-drafted raw rookies (low OVR, high potential) aren't auto-waived. */
export function keepValueOf(overall: number, potential: number): number {
  return Math.max(overall, Math.round((potential ?? 0) * 0.9));
}

/**
 * Choose which ids to waive to get a roster down to `target`, cutting lowest
 * keep-value first but never dropping a position below its floor. Pure.
 */
export function selectRosterWaivers(
  ids: string[],
  opts: {
    value: (id: string) => number;
    position: (id: string) => BasketballPosition | null;
    target: number;
    posFloor: Record<BasketballPosition, number>;
  },
): Set<string> {
  const { value, position, target, posFloor } = opts;
  if (ids.length <= target) return new Set();
  const posCount: Record<BasketballPosition, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
  for (const id of ids) { const p = position(id); if (p) posCount[p]++; }
  const worstFirst = [...ids].sort((a, b) => value(a) - value(b));
  const waived = new Set<string>();
  for (const id of worstFirst) {
    if (ids.length - waived.size <= target) break;
    const pos = position(id);
    if (pos && posCount[pos] <= posFloor[pos]) continue; // protect the floor
    waived.add(id);
    if (pos) posCount[pos]--;
  }
  return waived;
}

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

  // Each team's head-coach development rating drives how fast its young players
  // grow over the offseason (parity: coaching matters for the rebuild loop).
  const teamDevRating = new Map<string, number>();
  for (const t of league.teams) {
    const hc = getHeadCoach(league, t.id);
    if (hc) teamDevRating.set(t.id, hc.ratings.development);
  }

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
    const effTotal = stats.points + stats.totalRebounds + stats.assists + stats.steals + stats.blocks
      - (stats.fieldGoalsAttempted - stats.fieldGoalsMade)
      - (stats.freeThrowsAttempted - stats.freeThrowsMade)
      - stats.turnovers;
    const seasonLog = stats.gamesPlayed > 0
      ? [...prevLog, {
          season: league.currentSeason,
          age: p.age,
          overall: p.ratings.overall,
          gamesPlayed: stats.gamesPlayed,
          ppg: round1(pg.points ?? 0),
          rpg: round1(pg.totalRebounds ?? 0),
          apg: round1(pg.assists ?? 0),
          per: round1(effTotal / stats.gamesPlayed),
        }]
      : prevLog;

    const snapshot: BasketballPlayer = {
      ...p,
      careerStats: addBasketballStats(p.careerStats, stats),
      sportData: { ...p.sportData, prevRatings: p.ratings, seasonLog },
    };

    const devRating = p.rosterSlot?.teamId ? teamDevRating.get(p.rosterSlot.teamId) : undefined;
    const developmentMultiplier = devRating != null
      ? resolveBasketballPDCEffect(devRating, p.age)
      : undefined;
    const developed = developBasketballPlayer(snapshot, nextSeason, { developmentMultiplier });
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

  // Flag the user's expiring players (no deal for next season) for the forced
  // re-sign step. Any they don't re-sign walk to free agency at season start.
  const pendingResign: PlayerId[] = [];
  if (league.userTeamId) {
    const ut = teams.find(t => t.id === league.userTeamId);
    for (const id of ut?.playerIds ?? []) {
      const p = players[id];
      if (p && !hasContractForSeason(p, nextSeason)) pendingResign.push(id as PlayerId);
    }
  }

  return {
    ...interim,
    currentPhase: 'offseason',
    seasonHistory: { ...league.seasonHistory, [league.currentSeason]: historyEntry },
    sportData: { ...(league.sportData as LeagueSportData), draft, pendingResign },
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
  // Trim by *keep value*, not raw current overall — rookies enter deliberately
  // raw (low OVR, upside in potential), so sorting on overall alone waives every
  // pick you just made. Valuing potential keeps high-upside young players (and
  // the projects you drafted) over fringe veterans.
  const keepValue = (id: string) => {
    const p = players[id];
    if (!p) return 0;
    return keepValueOf(p.ratings.overall, p.development?.potential ?? 0);
  };
  // Track each waived player's last team so the free-agency UI can show it.
  const freeAgentLastTeam: Record<string, typeof league.teams[number]['id']> = {};

  const posOf = (id: string): BasketballPosition | null => players[id]?.sportData.position ?? null;

  // Expiring players who reach free agency. The user's expiring players walk
  // unless they re-signed them; AI teams keep their keepers (stars + prospects)
  // and let their lower-value expiring players test the market — that's what
  // actually stocks the free-agent pool. Done before the trim so the roster-fill
  // backfills any holes.
  const userTeamId = league.userTeamId;
  // AI re-signs its best expiring players in value order until payroll reaches the
  // first apron (teams won't blow past it for role players) or the roster fills;
  // everyone else — and any sub-replacement scrub — walks to free agency. This is
  // cap-driven, so with realistic salaries good teams shed real rotation players.
  const AI_BUDGET = basketballFirstApron(season);
  const AI_MIN_KEEP = 58;          // keep-value below this always walks
  const salaryNext = (id: string) => {
    const yr = players[id]?.contract?.years.find(y => y.season === season);
    return yr ? yr.baseSalary + yr.proratedBonus : 0;
  };
  const walk = new Set<string>();
  for (const t of league.teams) {
    const ids = t.playerIds as string[];
    const expiring = ids.filter(id => !hasContractForSeason(players[id], season));
    if (t.id === userTeamId) {
      for (const id of expiring) walk.add(id); // user decides; un-re-signed walk
      continue;
    }
    // Payroll already committed for next season (multi-year deals).
    let committed = ids.reduce((s, id) => s + salaryNext(id), 0);
    let kept = ids.length - expiring.length;
    for (const id of [...expiring].sort((a, b) => keepValue(b) - keepValue(a))) { // best first
      const ask = basketballMarketSalary(players[id], { season });
      if (keepValue(id) >= AI_MIN_KEEP && committed + ask <= AI_BUDGET && kept < TARGET_ROSTER) {
        committed += ask; kept++;            // re-sign (contract written in the loop below)
      } else {
        walk.add(id);
      }
    }
    // Don't fall below a legal roster — un-walk the best walked players if needed.
    if (kept < MIN_LEGAL_ROSTER) {
      for (const id of [...expiring].filter(id => walk.has(id)).sort((a, b) => keepValue(b) - keepValue(a))) {
        if (kept >= MIN_LEGAL_ROSTER) break;
        walk.delete(id); kept++;
      }
    }
  }

  const teams: BasketballTeam[] = league.teams.map(t => {
    let ids = [...t.playerIds];

    if (ids.some(id => walk.has(id))) {
      for (const id of ids) {
        if (walk.has(id)) { players[id] = { ...players[id], rosterSlot: null }; freeAgentLastTeam[id] = t.id; }
      }
      ids = ids.filter(id => !walk.has(id));
    }

    // Draft picks can push a roster over the cap — waive the lowest keep-value
    // players to 15, but never cut a position below its floor.
    if (ids.length > TARGET_ROSTER) {
      const waived = selectRosterWaivers(ids, {
        value: keepValue,
        position: posOf,
        target: TARGET_ROSTER,
        posFloor: POS_FLOOR,
      });
      for (const id of waived) {
        players[id] = { ...players[id], rosterSlot: null };
        freeAgentLastTeam[id] = t.id;
      }
      ids = ids.filter(id => !waived.has(id));
    }

    // Anyone short of the legal minimum gets fresh bodies.
    while (ids.length < MIN_LEGAL_ROSTER) {
      const pos = ROSTER_FILL_POSITIONS[ids.length % ROSTER_FILL_POSITIONS.length];
      const filler = generateBasketballPlayer({ position: pos, targetOverall: 62, age: 22 });
      players[filler.id] = filler;
      ids.push(filler.id);
    }

    // Guarantee at least one player at every position (belt-and-suspenders for
    // rosters that arrived here already missing one). Only fills while there's
    // room under the cap — a full roster missing a position is repaired on load.
    const posAfter: Record<BasketballPosition, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
    for (const id of ids) { const p = posOf(id); if (p) posAfter[p]++; }
    for (const pos of ROSTER_FILL_POSITIONS) {
      while (posAfter[pos] < 1 && ids.length < TARGET_ROSTER) {
        const filler = generateBasketballPlayer({ position: pos, targetOverall: 62, age: 22 });
        players[filler.id] = filler;
        ids.push(filler.id);
        posAfter[pos]++;
      }
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

  // Re-sign any still-rostered player whose deal expired (the keepers that didn't
  // walk, above) at market value — otherwise the contract silently vanishes
  // (player sits at $0) and the team's payroll drifts down every year.
  for (const t of teams) {
    for (const id of t.playerIds) {
      const p = players[id];
      if (p && !hasContractForSeason(p, season)) {
        players[id] = { ...p, contract: marketContract(p, season) };
      }
    }
  }

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
  delete sportData.pendingResign; // re-sign decisions resolved for this offseason
  delete sportData.injuries; // everyone starts the new season healthy
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
