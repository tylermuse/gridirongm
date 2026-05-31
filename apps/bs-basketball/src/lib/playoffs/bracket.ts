/**
 * Playoff bracket generation + simulation (Phase 2D-1).
 *
 * `initializePlayoffs` runs once the regular season is complete: it seeds both
 * conferences, builds the full series tree (round-1 matchups populated, later
 * rounds left as empty slots), stamps the bracket onto `league.sportData` and
 * flips `currentPhase` to 'playoffs'.
 *
 * `simPlayoffDay` advances one "day": it plays the next game of every active
 * (both-teams-known, not-yet-decided) series, updates series win counts,
 * resolves finished series, and feeds winners into the next round. When the
 * Finals resolve it records the champion on `competitions[0].history`.
 *
 * Playoff games are injected into `league.games` with `sportData.isPlayoff =
 * true` and `dayOfSeason` past the 170-day regular season, so the existing
 * /game box-score view works unchanged. Playoff games do NOT touch
 * `team.record` — regular-season standings stay intact for re-seeding and
 * next-season draft order.
 */

import {
  basketballAdapter,
  buildDefaultBasketballLineup,
  type BasketballPlayer,
  type BasketballTeam,
} from '@bs/sport-basketball';
import type {
  BaseGameResult,
  BaseLeagueState,
  CompetitionId,
  GameContext,
  GameId,
  PlayerId,
  TeamId,
  TeamSnapshot,
} from '@bs/core/adapter';
import type {
  BasketballRatings,
  BasketballStats,
} from '@bs/sport-basketball';
import { seedConferences } from './seeding';
import type { PlayoffBracket, PlayoffSeedInfo, PlayoffSeries } from './types';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;
type GameResult = BaseGameResult<BasketballStats>;

/** Regular season spans days 1-170 (see scheduleGenerator SEASON_DAYS). */
const REGULAR_SEASON_DAYS = 170;
/** NBA 2-2-1-1-1 home court: the higher seed (teamA) hosts games 1, 2, 5, 7. */
const HOME_A_GAMES = new Set([1, 2, 5, 7]);
const SERIES_WINS_NEEDED = 4;

interface LeagueSportData {
  playoffs?: PlayoffBracket;
  [key: string]: unknown;
}

// ===========================================================================
// Accessors
// ===========================================================================

export function getBracket(league: LeagueState): PlayoffBracket | null {
  return (league.sportData as LeagueSportData | undefined)?.playoffs ?? null;
}

/** True once every regular-season game has been played. */
export function isRegularSeasonComplete(league: LeagueState): boolean {
  return !league.games.some(g => g.status === 'scheduled');
}

// ===========================================================================
// Initialization
// ===========================================================================

export function initializePlayoffs(league: LeagueState): LeagueState {
  if (getBracket(league)) return league; // already initialized
  const { Eastern, Western, seedInfo } = seedConferences(league);

  const rounds: PlayoffSeries[][] = [[], [], [], []];
  const playIn: PlayoffSeries[] = [];

  // Build each conference's bracket. Round-1 vertical order is 1v8 / 4v5 /
  // 3v6 / 2v7 so that semiA = (1v8, 4v5) and semiB = (3v6, 2v7), and the 1 and
  // 2 seeds can only meet in the conference finals.
  for (const conf of ['Eastern', 'Western'] as const) {
    const seeds = conf === 'Eastern' ? Eastern : Western;
    const prefix = conf === 'Eastern' ? 'E' : 'W';

    const cf: PlayoffSeries = blankSeries(`${prefix}-CF`, 3, 'Conference Finals', conf);
    const sfA: PlayoffSeries = blankSeries(`${prefix}-SF-A`, 2, 'Conference Semis', conf);
    const sfB: PlayoffSeries = blankSeries(`${prefix}-SF-B`, 2, 'Conference Semis', conf);
    sfA.next = { seriesId: cf.id, slot: 'A' };
    sfB.next = { seriesId: cf.id, slot: 'B' };

    // Round-1 matchups: [highSeed, lowSeed] by seed number. The 7 and 8 seeds
    // come from the play-in, so those slots start TBD.
    const r1Defs: { hi: number; lo: number; next: { seriesId: string; slot: 'A' | 'B' } }[] = [
      { hi: 1, lo: 8, next: { seriesId: sfA.id, slot: 'A' } },
      { hi: 4, lo: 5, next: { seriesId: sfA.id, slot: 'B' } },
      { hi: 3, lo: 6, next: { seriesId: sfB.id, slot: 'A' } },
      { hi: 2, lo: 7, next: { seriesId: sfB.id, slot: 'B' } },
    ];

    r1Defs.forEach((d, i) => {
      const s = blankSeries(`${prefix}-R1-${i + 1}`, 1, 'First Round', conf);
      s.teamA = seeds[d.hi - 1] ?? null;
      s.seedA = d.hi;
      const fromPlayIn = d.lo >= 7; // 7 or 8 seed — decided by the play-in
      s.teamB = fromPlayIn ? null : seeds[d.lo - 1] ?? null;
      s.seedB = fromPlayIn ? null : d.lo;
      s.next = d.next;
      rounds[0].push(s);
    });

    rounds[1].push(sfA, sfB);
    rounds[2].push(cf);

    // Play-in: 7v8 (winner is the 7 seed) and 9v10 (loser is out); the 7/8
    // loser then meets the 9/10 winner for the 8 seed. All single games.
    const piA = blankSeries(`${prefix}-PI-A`, 0, '7/8 · winner is #7', conf);
    piA.winsNeeded = 1;
    piA.teamA = seeds[6] ?? null; piA.seedA = 7;
    piA.teamB = seeds[7] ?? null; piA.seedB = 8;
    piA.next = { seriesId: `${prefix}-R1-4`, slot: 'B' }; // winner → 2v7 as the 7
    piA.feedsSeed = 7;
    piA.loserNext = { seriesId: `${prefix}-PI-C`, slot: 'A' };

    const piB = blankSeries(`${prefix}-PI-B`, 0, '9/10 · loser out', conf);
    piB.winsNeeded = 1;
    piB.teamA = seeds[8] ?? null; piB.seedA = 9;
    piB.teamB = seeds[9] ?? null; piB.seedB = 10;
    piB.next = { seriesId: `${prefix}-PI-C`, slot: 'B' }; // winner → 8-seed game
    piB.loserNext = null;

    const piC = blankSeries(`${prefix}-PI-C`, 0, '8 seed · winner in', conf);
    piC.winsNeeded = 1;
    piC.next = { seriesId: `${prefix}-R1-1`, slot: 'B' }; // winner → 1v8 as the 8
    piC.feedsSeed = 8;
    piC.loserNext = null;

    playIn.push(piA, piB, piC);
  }

  // Finals: conference champions, home court by record.
  const finals = blankSeries('FINALS', 4, 'Finals', 'Finals');
  rounds[3].push(finals);
  // Wire conference finals winners into the Finals slots.
  for (const conf of ['Eastern', 'Western'] as const) {
    const prefix = conf === 'Eastern' ? 'E' : 'W';
    const cf = rounds[2].find(s => s.id === `${prefix}-CF`)!;
    cf.next = { seriesId: 'FINALS', slot: conf === 'Eastern' ? 'A' : 'B' };
  }

  const bracket: PlayoffBracket = {
    season: league.currentSeason,
    playIn,
    rounds,
    seeds: { Eastern, Western },
    seedInfo,
    dayIndex: 0,
    championTeamId: null,
    runnerUpTeamId: null,
    complete: false,
  };

  // Normalize the play-in + round-1 series so teamA is the home-court (higher) seed.
  for (const s of playIn) normalizeSeries(s, bracket);
  for (const s of rounds[0]) normalizeSeries(s, bracket);

  return {
    ...league,
    currentPhase: 'playoffs',
    currentTick: REGULAR_SEASON_DAYS + 31, // tick 201 — start of the playoff window
    sportData: { ...(league.sportData as LeagueSportData), playoffs: bracket },
  };
}

// ===========================================================================
// Simulation
// ===========================================================================

export interface SimPlayoffDayResult {
  league: LeagueState;
  day: number;
  gamesSimmed: number;
  champion: TeamId | null;
}

export function simPlayoffDay(league: LeagueState): SimPlayoffDayResult | null {
  const existing = getBracket(league);
  if (!existing || existing.complete) return null;

  // Deep clone the bracket (plain data) so we can mutate freely.
  const bracket: PlayoffBracket = JSON.parse(JSON.stringify(existing));
  const allSeries = [...bracket.rounds.flat(), ...(bracket.playIn ?? [])];
  const seriesById = new Map(allSeries.map(s => [s.id, s]));

  const active = allSeries.filter(
    s => s.teamA && s.teamB && !s.winnerTeamId,
  );
  if (active.length === 0) return null;

  const teamById = new Map(league.teams.map(t => [t.id, t as BasketballTeam]));
  const playerMap = league.players as Record<string, BasketballPlayer>;

  const day = bracket.dayIndex + 1;
  const dayOfSeason = REGULAR_SEASON_DAYS + day;
  const newGames: GameResult[] = [];

  for (const series of active) {
    const gameNum = series.winsA + series.winsB + 1;
    const teamAHome = HOME_A_GAMES.has(gameNum);
    const homeId = teamAHome ? series.teamA! : series.teamB!;
    const awayId = teamAHome ? series.teamB! : series.teamA!;
    const home = teamById.get(homeId);
    const away = teamById.get(awayId);
    if (!home || !away) continue;

    const gameId = `${bracket.season}-bball-po-${series.id}-g${gameNum}` as GameId;
    const ctx: GameContext = {
      season: bracket.season,
      tick: dayOfSeason,
      competitionId: 'primary' as CompetitionId,
      isPlayoff: true,
      homeAdvantage: 2.5,
      rngSeed: `${gameId}-${bracket.season}`,
    };

    const result = basketballAdapter.simEngine.simGame(
      buildSnapshot(home, playerMap),
      buildSnapshot(away, playerMap),
      ctx,
    );
    const final = result.finalScore ?? { home: 0, away: 0 };

    const played: GameResult = {
      ...result,
      id: gameId,
      season: bracket.season,
      competitionId: 'primary' as CompetitionId,
      date: '',
      homeTeamId: homeId,
      awayTeamId: awayId,
      status: 'played',
      sportData: {
        dayOfSeason,
        isPlayoff: true,
        round: series.round,
        roundName: series.roundName,
        seriesId: series.id,
        gameInSeries: gameNum,
      },
    };
    newGames.push(played);
    series.gameIds.push(gameId);

    // Credit the series win to the team that won the game.
    const homeWon = final.home > final.away;
    const winnerId = homeWon ? homeId : awayId;
    if (winnerId === series.teamA) series.winsA += 1;
    else series.winsB += 1;
  }

  // Resolve finished series and advance winners (and play-in losers) onward.
  for (const series of active) {
    if (series.winnerTeamId) continue;
    const winsNeeded = series.winsNeeded ?? SERIES_WINS_NEEDED;
    let winnerId: TeamId | null = null;
    if (series.winsA >= winsNeeded) winnerId = series.teamA;
    else if (series.winsB >= winsNeeded) winnerId = series.teamB;
    if (!winnerId) continue;

    series.winnerTeamId = winnerId;
    const loserId = winnerId === series.teamA ? series.teamB : series.teamA;

    // Play-in: the winner takes a fixed bracket seed (7 or 8) into the main draw.
    if (series.feedsSeed != null && bracket.seedInfo[winnerId]) {
      bracket.seedInfo[winnerId].seed = series.feedsSeed;
    }

    if (series.next) {
      const nextSeries = seriesById.get(series.next.seriesId);
      if (nextSeries) {
        if (series.next.slot === 'A') nextSeries.teamA = winnerId;
        else nextSeries.teamB = winnerId;
        normalizeSeries(nextSeries, bracket);
      }
    } else if (series.round === 4) {
      // Finals resolved — crown the champion.
      bracket.championTeamId = winnerId;
      bracket.runnerUpTeamId =
        winnerId === series.teamA ? series.teamB : series.teamA;
      bracket.complete = true;
    }

    // Play-in loser drops to the 8-seed game (if any); otherwise eliminated.
    if (series.loserNext && loserId) {
      const dropSeries = seriesById.get(series.loserNext.seriesId);
      if (dropSeries) {
        if (series.loserNext.slot === 'A') dropSeries.teamA = loserId;
        else dropSeries.teamB = loserId;
        normalizeSeries(dropSeries, bracket);
      }
    }
  }

  bracket.dayIndex = day;

  // Record champion on the primary competition's history.
  const competitions = league.competitions.map(c => ({ ...c }));
  if (bracket.complete && bracket.championTeamId && competitions[0]) {
    const history = competitions[0].history.filter(h => h.season !== bracket.season);
    history.push({
      season: bracket.season,
      champion: bracket.championTeamId,
      runnerUp: bracket.runnerUpTeamId ?? undefined,
    });
    competitions[0] = { ...competitions[0], history };
  }

  const updatedLeague: LeagueState = {
    ...league,
    games: [...league.games, ...newGames],
    competitions,
    currentTick: Math.min(REGULAR_SEASON_DAYS + 30 + day, 250),
    sportData: { ...(league.sportData as LeagueSportData), playoffs: bracket },
  };

  return {
    league: updatedLeague,
    day,
    gamesSimmed: newGames.length,
    champion: bracket.complete ? bracket.championTeamId : null,
  };
}

/** Lowest round number among series still in progress (both teams known, no
 *  winner). Returns Infinity when nothing is active. */
function currentPlayoffRound(bracket: PlayoffBracket | null): number {
  if (!bracket) return Infinity;
  let min = Infinity;
  for (const s of [...bracket.rounds.flat(), ...(bracket.playIn ?? [])]) {
    if (s.teamA && s.teamB && !s.winnerTeamId) min = Math.min(min, s.round);
  }
  return min;
}

export interface SimPlayoffBatchResult {
  league: LeagueState;
  gamesSimmed: number;
  champion: TeamId | null;
}

/** Sim playoff days until the current round resolves (then stop) or a champion
 *  is crowned. */
export function simPlayoffRound(league: LeagueState): SimPlayoffBatchResult | null {
  const startRound = currentPlayoffRound(getBracket(league));
  if (!isFinite(startRound)) return null;
  let l = league;
  let gamesSimmed = 0;
  let champion: TeamId | null = null;
  for (let guard = 0; guard < 80; guard++) {
    const r = simPlayoffDay(l);
    if (!r) break;
    l = r.league;
    gamesSimmed += r.gamesSimmed;
    champion = r.champion ?? champion;
    const b = getBracket(l);
    if (!b || b.complete) break;
    if (currentPlayoffRound(b) > startRound) break; // advanced to the next round
  }
  return gamesSimmed === 0 ? null : { league: l, gamesSimmed, champion };
}

/** Sim the entire postseason to a champion. */
export function simAllPlayoffs(league: LeagueState): SimPlayoffBatchResult | null {
  let l = league;
  let gamesSimmed = 0;
  let champion: TeamId | null = null;
  for (let guard = 0; guard < 160; guard++) {
    const r = simPlayoffDay(l);
    if (!r) break;
    l = r.league;
    gamesSimmed += r.gamesSimmed;
    champion = r.champion ?? champion;
    if (getBracket(l)?.complete) break;
  }
  return gamesSimmed === 0 ? null : { league: l, gamesSimmed, champion };
}

// ===========================================================================
// Helpers
// ===========================================================================

function blankSeries(
  id: string,
  round: number,
  roundName: string,
  conference: PlayoffSeries['conference'],
): PlayoffSeries {
  return {
    id,
    round,
    roundName,
    conference,
    teamA: null,
    teamB: null,
    seedA: null,
    seedB: null,
    winsA: 0,
    winsB: 0,
    winnerTeamId: null,
    gameIds: [],
    next: null,
  };
}

/** Once both teams are known, order the slots so teamA is the home-court side
 *  (better seed within a conference; better record for the cross-conf Finals). */
function normalizeSeries(s: PlayoffSeries, bracket: PlayoffBracket): void {
  if (!s.teamA || !s.teamB) {
    // Still fill in seed labels for whichever side is known.
    s.seedA = s.teamA ? bracket.seedInfo[s.teamA]?.seed ?? null : null;
    s.seedB = s.teamB ? bracket.seedInfo[s.teamB]?.seed ?? null : null;
    return;
  }
  const home = higherSeed(s.teamA, s.teamB, bracket.seedInfo);
  if (home === s.teamB) {
    const t = s.teamA;
    s.teamA = s.teamB;
    s.teamB = t;
  }
  s.seedA = bracket.seedInfo[s.teamA]?.seed ?? null;
  s.seedB = bracket.seedInfo[s.teamB]?.seed ?? null;
}

/** Pick the higher-seeded team. Same conference → lower seed number wins.
 *  Cross-conference (Finals) → better regular-season record, then point diff. */
function higherSeed(
  a: TeamId,
  b: TeamId,
  info: Record<string, PlayoffSeedInfo>,
): TeamId {
  const ia = info[a];
  const ib = info[b];
  if (!ia) return b;
  if (!ib) return a;
  if (ia.conference === ib.conference) {
    return ia.seed <= ib.seed ? a : b;
  }
  if (ia.wins !== ib.wins) return ia.wins > ib.wins ? a : b;
  return ia.pointDiff >= ib.pointDiff ? a : b;
}

function buildSnapshot(
  team: BasketballTeam,
  playerMap: Record<string, BasketballPlayer>,
): TeamSnapshot<BasketballRatings, BasketballStats> {
  const players = team.playerIds
    .map((pid: PlayerId) => playerMap[pid])
    .filter((p): p is BasketballPlayer => !!p);
  const lineup = buildDefaultBasketballLineup(players);
  return { team, availablePlayers: players, lineup, coach: null };
}
