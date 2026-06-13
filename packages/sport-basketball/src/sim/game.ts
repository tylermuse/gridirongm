/**
 * Full-game loop. Wraps simPossession into a complete basketball game.
 *
 * v1 design:
 *   - 4 quarters × 12 minutes (720s each) + 5-minute overtime if tied
 *   - ~95-105 possessions per team depending on pace
 *   - Two-unit rotation: 5 starters + first 5 bench, alternating in 4:2
 *     possession stints (starters play ~67% of game, bench ~33%) →
 *     starters average ~32 min, bench rotation ~16 min
 *   - Pace setting drives average possession length:
 *       fast = 12s, medium = 14.5s, slow = 17s
 *   - Plus/minus tracked per player based on score delta during their court time
 *   - Per-player minutes tracked from possession seconds
 *
 * v1 simplifications (deferred to v2):
 *   - No fatigue model (rotation is purely time-based, not exertion-based)
 *   - No foul-out (players keep playing past 6 fouls)
 *   - No clock-aware shot selection (no buzzer-beater fade-aways)
 *   - No coaching adjustments mid-game (no momentum changes, no defensive
 *     scheme switches based on game state)
 *   - Bench beyond the first 5 doesn't see the floor in v1
 *   - No starter/bench performance gap modeling (chemistry, role players)
 *
 * Test contract:
 *   - simBasketballGame is the only public entry point
 *   - Deterministic on seed
 *   - Returns BaseGameResult<BasketballStats> with full per-player box scores
 */

import type {
  BaseGameResult,
  PlayerId,
  TeamId,
  GameId,
  CompetitionId,
} from '@bs/core/adapter';
import type {
  BasketballPlayer,
  BasketballStats,
  BasketballLineup,
  BasketballGamePlan,
} from '../types';
import { emptyBasketballStats, addBasketballStats } from '../types';
import type { CoachSchemeEffect } from '../coachingSystem';
import { createRng, type Rng } from './rng';
import { simPossession, type SimLineup, type StatEvent } from './possession';

// ===========================================================================
// Public types
// ===========================================================================

/** One side of a basketball game — the team identity plus the players +
 *  lineup that defines who's available and who starts. */
export interface BasketballGameSide {
  teamId: TeamId;
  /** All players potentially available to play. Must include everyone
   *  referenced by `lineup.starters` and `lineup.bench`. */
  players: BasketballPlayer[];
  lineup: BasketballLineup;
  /** Pre-game plan. Absent = neutral (the sim runs exactly as before). */
  plan?: BasketballGamePlan;
  /** Head coach's scheme effect. Absent = neutral. */
  schemeEffect?: CoachSchemeEffect;
}

export interface BasketballGameContext {
  gameId: GameId;
  season: number;
  /** ISO date string. */
  date: string;
  competitionId: CompetitionId;
  /** Playoff games slightly increase home court advantage and reduce
   *  pace (tighter D, fewer transition possessions). */
  isPlayoff: boolean;
  /** RNG seed for reproducibility. */
  rngSeed: string;
}

export interface BasketballGameSettings {
  /** Length of a regulation quarter in seconds. Default 720 (12 min). */
  quarterLengthSeconds: number;
  /** Number of quarters in regulation. Default 4. */
  numQuarters: number;
  /** Length of an overtime period in seconds. Default 300 (5 min). */
  overtimeLengthSeconds: number;
  /** Home court advantage — additive points to home final score in
   *  expectation. Default 2.5; playoff games default 3.5. */
  homeAdvantage: number;
  /** Hard cap on overtime periods to prevent infinite loops in
   *  degenerate ties. Default 5. */
  maxOvertimes: number;
}

const DEFAULT_SETTINGS: BasketballGameSettings = {
  quarterLengthSeconds: 720,
  numQuarters: 4,
  overtimeLengthSeconds: 300,
  homeAdvantage: 2.5,
  maxOvertimes: 5,
};

/** Basketball-specific game data stuffed into BaseGameResult.sportData. */
export interface BasketballGameData {
  pace: 'fast' | 'medium' | 'slow';
  totalPossessions: number;
  /** How many quarters were played (4 for regulation, 5+ for overtime). */
  periodsPlayed: number;
  /** Whether the game went to overtime. */
  wentToOvertime: boolean;
  /** Per-quarter score breakdown. */
  quarterScores: { home: number; away: number }[];
  /** Largest lead by either team at any point. */
  biggestLead: { team: 'home' | 'away'; points: number };
}

// ===========================================================================
// Pace tuning
// ===========================================================================

const PACE_AVG_POSSESSION_SECONDS: Record<'fast' | 'medium' | 'slow', number> = {
  fast: 12.0,
  medium: 14.5,
  slow: 17.0,
};

/** A side's effective pace — the game plan overrides the lineup pace when set. */
function sidePace(side: BasketballGameSide): 'fast' | 'medium' | 'slow' {
  const p = side.plan?.pace;
  if (p === 'slow') return 'slow';
  if (p === 'fast') return 'fast';
  if (p === 'balanced') return 'medium';
  return side.lineup.pace;
}

/** Combined pace of a game — average of both teams' pace settings. */
function gamePace(home: BasketballGameSide, away: BasketballGameSide): 'fast' | 'medium' | 'slow' {
  const order = { slow: 0, medium: 1, fast: 2 };
  const reverse = ['slow', 'medium', 'fast'] as const;
  const avg = Math.round((order[sidePace(home)] + order[sidePace(away)]) / 2);
  return reverse[avg];
}

// ===========================================================================
// Substitution rotation
// ===========================================================================

/** v1 substitution: alternate between starter unit (4 possessions) and
 *  bench unit (2 possessions). Repeats throughout the game.
 *  Starters get ~67% of court time → ~32 min over a 48-min game. */
const STARTER_STINT = 4;
const BENCH_STINT = 2;

/** Stint length for a unit, leaned by the game plan's rotation setting:
 *  'starters' rides the starters (longer starter stints, shorter bench),
 *  'bench' spreads minutes. Neutral (4/2) when unset. */
function stintLength(side: BasketballGameSide, unit: 'starters' | 'bench'): number {
  const r = side.plan?.rotation;
  if (unit === 'starters') return r === 'starters' ? 6 : r === 'bench' ? 3 : STARTER_STINT;
  return r === 'starters' ? 1 : r === 'bench' ? 2 : BENCH_STINT;
}

/** Build the active 5-man SimLineup for a team given which unit is on
 *  the floor. Falls back to starters if the bench doesn't have 5 players. */
function buildActiveLineup(
  side: BasketballGameSide,
  unit: 'starters' | 'bench',
  playerById: Map<PlayerId, BasketballPlayer>,
): SimLineup {
  if (unit === 'starters') {
    const arr = side.lineup.starters.map(id => playerById.get(id)!);
    // TS can't prove a .map() result is a 5-tuple even though the source
    // is — cast through unknown.
    return {
      players: arr as unknown as readonly [
        BasketballPlayer, BasketballPlayer, BasketballPlayer, BasketballPlayer, BasketballPlayer,
      ],
      plan: side.plan,
      schemeEffect: side.schemeEffect,
    };
  }
  // Bench unit: first 5 in bench list. If bench has fewer than 5, mix in
  // starters as fallback to maintain a 5-man lineup. (Rare in practice
  // since NBA teams have 12-15 active players.)
  const benchIds = side.lineup.bench.slice(0, 5);
  while (benchIds.length < 5) {
    // Fall back to starters in original position order
    const fallback = side.lineup.starters[benchIds.length];
    if (!benchIds.includes(fallback)) benchIds.push(fallback);
    else break; // safety
  }
  const arr = benchIds.slice(0, 5).map(id => playerById.get(id)!);
  return {
    players: arr as unknown as readonly [
      BasketballPlayer, BasketballPlayer, BasketballPlayer, BasketballPlayer, BasketballPlayer,
    ],
    plan: side.plan,
      schemeEffect: side.schemeEffect,
  };
}

// ===========================================================================
// Main entry
// ===========================================================================

export function simBasketballGame(
  home: BasketballGameSide,
  away: BasketballGameSide,
  context: BasketballGameContext,
  settingsOverride?: Partial<BasketballGameSettings>,
): BaseGameResult<BasketballStats> {
  const settings: BasketballGameSettings = {
    ...DEFAULT_SETTINGS,
    ...(context.isPlayoff ? { homeAdvantage: 3.5 } : {}),
    ...settingsOverride,
  };
  const rng = createRng(context.rngSeed);

  // Fast player lookup by ID
  const homePlayerById = buildPlayerMap(home.players);
  const awayPlayerById = buildPlayerMap(away.players);

  // Pre-allocate stat accumulators
  const boxScores = new Map<PlayerId, BasketballStats>();
  const minutesPlayed = new Map<PlayerId, number>();

  let homeScore = 0;
  let awayScore = 0;
  const quarterScores: { home: number; away: number }[] = [];

  let biggestLead: { team: 'home' | 'away'; points: number } = { team: 'home', points: 0 };
  const trackLead = (h: number, a: number) => {
    const diff = h - a;
    if (diff > biggestLead.points) biggestLead = { team: 'home', points: diff };
    if (-diff > biggestLead.points) biggestLead = { team: 'away', points: -diff };
  };

  // Pace + possession-length tuning
  const pace = gamePace(home, away);
  // Coach scheme nudges tempo on top of the discrete pace tier — a faster scheme
  // shortens possessions (→ more of them). Neutral (1.0) when neither has a coach.
  const schemePaceMult = ((home.schemeEffect?.paceMultiplier ?? 1) + (away.schemeEffect?.paceMultiplier ?? 1)) / 2;
  const avgPossessionSeconds = PACE_AVG_POSSESSION_SECONDS[pace] / schemePaceMult;

  // Track which unit is on the floor for each team, plus stint progress
  let homeUnit: 'starters' | 'bench' = 'starters';
  let awayUnit: 'starters' | 'bench' = 'starters';
  let homeStintRemaining = stintLength(home, 'starters');
  let awayStintRemaining = stintLength(away, 'starters');

  let totalPossessions = 0;

  // ------------------------------------------------------------------
  // Regulation
  // ------------------------------------------------------------------
  for (let quarter = 1; quarter <= settings.numQuarters; quarter++) {
    const quarterStart = { home: homeScore, away: awayScore };
    let secondsRemaining = settings.quarterLengthSeconds;

    // Possession arrow: in NBA, alternates between halves. v1 simplification:
    // home starts Q1, away starts Q2, home starts Q3, away starts Q4.
    let offenseIsHome = (quarter % 2 === 1);

    while (secondsRemaining > 0) {
      const offense = offenseIsHome ? home : away;
      const defense = offenseIsHome ? away : home;
      const offenseById = offenseIsHome ? homePlayerById : awayPlayerById;
      const defenseById = offenseIsHome ? awayPlayerById : homePlayerById;

      // Build lineups for the active units
      const offUnit = offenseIsHome ? homeUnit : awayUnit;
      const defUnit = offenseIsHome ? awayUnit : homeUnit;
      const offLineup = buildActiveLineup(offense, offUnit, offenseById);
      const defLineup = buildActiveLineup(defense, defUnit, defenseById);

      // Sim a possession
      const result = simPossession(offLineup, defLineup, rng);

      // Clamp seconds if we'd overshoot the clock
      const secondsUsed = Math.min(result.secondsElapsed, secondsRemaining);
      secondsRemaining -= secondsUsed;

      // Accumulate stats for all 10 players on the floor (minutes + plus/minus)
      const offEffectivePoints = result.pointsScored;
      const defEffectivePoints = 0; // defense doesn't score on this possession in v1
      const pointsDelta = offEffectivePoints - defEffectivePoints;
      for (const p of offLineup.players) {
        incMinutes(minutesPlayed, p.id, secondsUsed);
        addPlusMinus(boxScores, p.id, pointsDelta);
      }
      for (const p of defLineup.players) {
        incMinutes(minutesPlayed, p.id, secondsUsed);
        addPlusMinus(boxScores, p.id, -pointsDelta);
      }

      // Apply stat events
      for (const e of result.events) applyStatEvent(boxScores, e);

      // Update score
      if (offenseIsHome) homeScore += result.pointsScored;
      else awayScore += result.pointsScored;
      trackLead(homeScore, awayScore);

      // Flip possession if needed
      if (result.possessionFlipsToDefense) offenseIsHome = !offenseIsHome;

      // Substitution check — decrement stint for the offensive team
      if (offenseIsHome) {
        homeStintRemaining--;
        if (homeStintRemaining <= 0) {
          homeUnit = (homeUnit === 'starters') ? 'bench' : 'starters';
          homeStintRemaining = stintLength(home, homeUnit);
        }
      } else {
        awayStintRemaining--;
        if (awayStintRemaining <= 0) {
          awayUnit = (awayUnit === 'starters') ? 'bench' : 'starters';
          awayStintRemaining = stintLength(away, awayUnit);
        }
      }

      totalPossessions++;

      // Safety: don't let degenerate cases run forever
      if (totalPossessions > 600) {
        secondsRemaining = 0;
        break;
      }

      // If the average possession length means we'd run negative seconds
      // ~half the time, end the quarter when remaining < half avg.
      if (secondsRemaining < avgPossessionSeconds * 0.5) break;
    }

    quarterScores.push({
      home: homeScore - quarterStart.home,
      away: awayScore - quarterStart.away,
    });
  }

  // Apply home court advantage to expectation:
  // Distribute the homeAdvantage over the game by giving home a small
  // points boost at the end if the model didn't naturally produce it.
  // This is a simple v1 approach — a more realistic model would adjust
  // each possession's shot quality slightly. Skip if game already has
  // a wide margin (HCA doesn't matter then).
  // For v1, leave the raw sim score and skip explicit HCA adjustment —
  // we'll add per-possession HCA in v2 once we have more sim data to
  // calibrate against. The settings field stays for documentation.

  // ------------------------------------------------------------------
  // Overtime
  // ------------------------------------------------------------------
  let overtimePeriods = 0;
  while (homeScore === awayScore && overtimePeriods < settings.maxOvertimes) {
    overtimePeriods++;
    const otStart = { home: homeScore, away: awayScore };
    let secondsRemaining = settings.overtimeLengthSeconds;
    // Possession arrow alternates each OT
    let offenseIsHome = overtimePeriods % 2 === 1;

    while (secondsRemaining > 0) {
      const offense = offenseIsHome ? home : away;
      const defense = offenseIsHome ? away : home;
      const offenseById = offenseIsHome ? homePlayerById : awayPlayerById;
      const defenseById = offenseIsHome ? awayPlayerById : homePlayerById;
      const offUnit = offenseIsHome ? homeUnit : awayUnit;
      const defUnit = offenseIsHome ? awayUnit : homeUnit;
      const offLineup = buildActiveLineup(offense, offUnit, offenseById);
      const defLineup = buildActiveLineup(defense, defUnit, defenseById);

      const result = simPossession(offLineup, defLineup, rng);
      const secondsUsed = Math.min(result.secondsElapsed, secondsRemaining);
      secondsRemaining -= secondsUsed;

      for (const p of offLineup.players) {
        incMinutes(minutesPlayed, p.id, secondsUsed);
        addPlusMinus(boxScores, p.id, result.pointsScored);
      }
      for (const p of defLineup.players) {
        incMinutes(minutesPlayed, p.id, secondsUsed);
        addPlusMinus(boxScores, p.id, -result.pointsScored);
      }

      for (const e of result.events) applyStatEvent(boxScores, e);

      if (offenseIsHome) homeScore += result.pointsScored;
      else awayScore += result.pointsScored;
      trackLead(homeScore, awayScore);

      if (result.possessionFlipsToDefense) offenseIsHome = !offenseIsHome;
      totalPossessions++;

      if (secondsRemaining < avgPossessionSeconds * 0.5) break;
    }

    quarterScores.push({
      home: homeScore - otStart.home,
      away: awayScore - otStart.away,
    });
  }

  // ------------------------------------------------------------------
  // Realistic per-player minutes. The two-unit rotation gives everyone in a unit
  // identical court time (every starter ~33, every bench guy ~15). Reshape the
  // recorded minutes WITHIN each tier by player rating — stars play more, fringe
  // less — keeping each tier's total (so the team stays at 240). Scoring + box
  // stats are untouched; minutes only feed the MPG/PER display.
  const adjMinutes = new Map(minutesPlayed);
  // Starters are reshaped by rating (stars play more). The bench is reshaped by
  // the user's ROTATION ORDER instead — dragging a bench player up the list earns
  // him more minutes (FEAT-22) — with rating only as a gentle tiebreaker. `played`
  // preserves the bench array order, so index 0 is the first man off the bench.
  const reshapeTier = (
    ids: readonly PlayerId[],
    byId: Map<PlayerId, BasketballPlayer>,
    byOrder = false,
  ) => {
    const played = ids.filter(id => (adjMinutes.get(id) ?? 0) > 0);
    if (played.length < 2) return;
    const total = played.reduce((s, id) => s + (adjMinutes.get(id) ?? 0), 0);
    const weights = played.map((id, i) => {
      const ovr = Math.max(1, byId.get(id)?.ratings.overall ?? 60);
      if (!byOrder) return ovr;
      // Order dominates (geometric decay); rating nudges within a tie.
      return Math.pow(0.8, i) * (0.6 + 0.4 * (ovr / 100));
    });
    const sumW = weights.reduce((a, b) => a + b, 0);
    played.forEach((id, i) => adjMinutes.set(id, (total * weights[i]) / sumW));
  };
  for (const [side, byId] of [[home, homePlayerById], [away, awayPlayerById]] as const) {
    reshapeTier(side.lineup.starters, byId);
    reshapeTier(side.lineup.bench.filter(id => (minutesPlayed.get(id) ?? 0) > 0), byId, true);
  }

  // ------------------------------------------------------------------
  // Finalize box scores: convert minutes to game stats + gamesPlayed
  // ------------------------------------------------------------------
  const finalBoxScores: Record<PlayerId, Partial<BasketballStats>> = {};
  for (const [playerId, stats] of boxScores) {
    const mins = Math.round((adjMinutes.get(playerId) ?? 0) / 60);
    const withMinutesAndGame = addBasketballStats(stats, {
      minutes: mins,
      gamesPlayed: 1,
      gamesStarted: isStarter(home, away, playerId) ? 1 : 0,
    });
    finalBoxScores[playerId] = withMinutesAndGame;
  }

  // Also ensure all starters get a record even if they had no events
  // (very rare but possible in edge cases)
  for (const side of [home, away]) {
    for (const starterId of side.lineup.starters) {
      if (!finalBoxScores[starterId]) {
        finalBoxScores[starterId] = addBasketballStats(emptyBasketballStats(), {
          gamesPlayed: 1,
          gamesStarted: 1,
          minutes: Math.round((minutesPlayed.get(starterId) ?? 0) / 60),
        });
      }
    }
  }

  const gameData: BasketballGameData = {
    pace,
    totalPossessions,
    periodsPlayed: settings.numQuarters + overtimePeriods,
    wentToOvertime: overtimePeriods > 0,
    quarterScores,
    biggestLead,
  };

  return {
    id: context.gameId,
    season: context.season,
    competitionId: context.competitionId,
    date: context.date,
    homeTeamId: home.teamId,
    awayTeamId: away.teamId,
    status: 'played',
    finalScore: { home: homeScore, away: awayScore },
    boxScores: finalBoxScores,
    sportData: gameData,
  };
}

// ===========================================================================
// Helpers
// ===========================================================================

function buildPlayerMap(players: BasketballPlayer[]): Map<PlayerId, BasketballPlayer> {
  const m = new Map<PlayerId, BasketballPlayer>();
  for (const p of players) m.set(p.id, p);
  return m;
}

function applyStatEvent(boxScores: Map<PlayerId, BasketballStats>, e: StatEvent): void {
  const cur = boxScores.get(e.playerId) ?? emptyBasketballStats();
  const updated = addBasketballStats(cur, { [e.field]: e.delta ?? 1 } as Partial<BasketballStats>);
  boxScores.set(e.playerId, updated);
}

function incMinutes(minutes: Map<PlayerId, number>, id: PlayerId, seconds: number): void {
  minutes.set(id, (minutes.get(id) ?? 0) + seconds);
}

function addPlusMinus(boxScores: Map<PlayerId, BasketballStats>, id: PlayerId, delta: number): void {
  if (delta === 0) return;
  const cur = boxScores.get(id) ?? emptyBasketballStats();
  const updated = addBasketballStats(cur, { plusMinus: delta });
  boxScores.set(id, updated);
}

function isStarter(
  home: BasketballGameSide,
  away: BasketballGameSide,
  playerId: PlayerId,
): boolean {
  return (
    home.lineup.starters.includes(playerId) ||
    away.lineup.starters.includes(playerId)
  );
}

// ===========================================================================
// Convenience: a single-call simulator that takes pre-built sides
// ===========================================================================

/** Direct test/dev entry — sims a game with just the essential inputs.
 *  Production code should use simBasketballGame with full context. */
export function simBasketballGameSimple(
  home: BasketballGameSide,
  away: BasketballGameSide,
  rngSeed = 'default-seed',
): BaseGameResult<BasketballStats> {
  return simBasketballGame(
    home,
    away,
    {
      gameId: 'g-test' as GameId,
      season: 2026,
      date: '2026-10-22',
      competitionId: 'primary' as CompetitionId,
      isPlayoff: false,
      rngSeed,
    },
  );
}

// Re-export the createRng / Rng for callers that need to drive the same
// RNG for the rest of their flow (e.g., simulating a full week).
export type { Rng } from './rng';
