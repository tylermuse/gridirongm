/**
 * Single-possession resolver.
 *
 * Given an offensive lineup, a defensive lineup, and an RNG, simulate ONE
 * possession and emit the stat events that resulted.
 *
 * Possession outcomes (v1):
 *   - Turnover (steal or non-steal)
 *   - Shot attempt (made, missed, or fouled)
 *   - Free throws (from shooting foul)
 *   - Rebound (offensive or defensive) on missed shot
 *
 * Possession outcomes intentionally NOT modeled in v1:
 *   - Non-shooting fouls (defensive 3-second, off-ball, push-off — small effect)
 *   - Jump balls, held balls
 *   - Goaltending / basket interference
 *   - Technical fouls
 *   - Buzzer-beater clock-aware shot selection (every shot is "normal")
 *
 * The game loop (../game.ts) calls simPossession ~200 times per game,
 * alternating which team has the ball and aggregating stat events into
 * per-player game lines.
 */

import type { BasketballPlayer, BasketballGamePlan } from '../types';
import type { PlayerId } from '@bs/core/adapter';
import type { Rng } from './rng';
import { selectShotType, makeProbability, isContested, drewShootingFoul } from './shotModel';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A lineup is just 5 players on the floor for the team. The sim doesn't
 *  care about bench order during the possession itself — substitutions
 *  happen between possessions and produce a new lineup. */
export interface SimLineup {
  /** Exactly 5 players in canonical position order: PG, SG, SF, PF, C. */
  players: readonly [BasketballPlayer, BasketballPlayer, BasketballPlayer, BasketballPlayer, BasketballPlayer];
  /** The team's pre-game plan, if set (neutral when absent). */
  plan?: BasketballGamePlan;
}

// Game-plan effect multipliers — all 1.0 at the 'balanced' default, so an unset
// or default plan leaves possession outcomes unchanged.
function threeBias(plan?: BasketballGamePlan): number {
  if (!plan) return 1;
  let m = 1;
  if (plan.offensiveFocus === 'perimeter') m *= 1.4;
  else if (plan.offensiveFocus === 'inside') m *= 0.6;
  if (plan.shotRisk === 'hero') m *= 1.12;
  else if (plan.shotRisk === 'conservative') m *= 0.92;
  return m;
}

function turnoverMult(off?: BasketballGamePlan, def?: BasketballGamePlan): number {
  let m = 1;
  if (def?.pressure === 'press') m *= 1.4;       // full-court pressure forces TOs
  else if (def?.pressure === 'pack') m *= 0.92;
  if (off?.shotRisk === 'conservative') m *= 0.92;
  else if (off?.shotRisk === 'hero') m *= 1.08;
  return m;
}

function makeMult(off?: BasketballGamePlan, def?: BasketballGamePlan): number {
  let m = 1;
  if (off?.shotRisk === 'hero') m *= 0.97;        // forcing tougher shots
  else if (off?.shotRisk === 'conservative') m *= 1.02;
  if (def?.pressure === 'press') m *= 1.05;       // gambling press → easier buckets when beaten
  else if (def?.pressure === 'pack') m *= 0.96;   // packed paint contests everything
  if (def?.defensiveScheme === 'zone') m *= 0.98; // a set zone slightly lowers FG%
  return m;
}

/** A single stat change emitted by a possession. The game loop applies these
 *  to per-player game-line accumulators. Kept as an explicit event list (not
 *  inline mutation) so the same possession can be replayed for the box-score
 *  vs the future live-sim event log. */
export interface StatEvent {
  playerId: PlayerId;
  /** Stat field to increment. Matches BasketballStats keys. */
  field: StatEventField;
  /** Amount to add. Defaults to 1 for counting stats. */
  delta?: number;
}

export type StatEventField =
  | 'minutes' // accumulated by game loop, not per-possession
  | 'points'
  | 'fieldGoalsMade'
  | 'fieldGoalsAttempted'
  | 'threePointsMade'
  | 'threePointsAttempted'
  | 'freeThrowsMade'
  | 'freeThrowsAttempted'
  | 'assists'
  | 'turnovers'
  | 'offensiveRebounds'
  | 'defensiveRebounds'
  | 'totalRebounds'
  | 'steals'
  | 'blocks'
  | 'personalFouls';

export interface PossessionResult {
  /** Stat events to apply. */
  events: StatEvent[];
  /** Whether the possession ended with the defense getting the ball. True
   *  on: made FG, defensive rebound, turnover, made-and-1 (1 FT), missed
   *  shooting FTs caught DRB. False on: offensive rebound, made FTs that
   *  count as transition. The game loop uses this to flip possession. */
  possessionFlipsToDefense: boolean;
  /** Seconds consumed. NBA averages 14.2s/possession league-wide;
   *  fast-pace teams trend faster, slow-pace teams slower. */
  secondsElapsed: number;
  /** Points scored on this possession (for game-state tracking + plus-minus). */
  pointsScored: number;
}

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** League average turnover rate per possession (~14 TOs / ~100 possessions). */
const BASE_TURNOVER_RATE = 0.135;

/** Fraction of turnovers that come from steals (the rest are live-ball
 *  errors — bad passes, dribble offs, traveling, etc.). */
const STEAL_FRACTION_OF_TURNOVERS = 0.55;

/** Per-team offensive rebound rate on missed shots. League average ~26%. */
const BASE_OFFENSIVE_REBOUND_RATE = 0.26;

/** Average seconds per possession. Pace adjustments happen at game level. */
const AVG_POSSESSION_SECONDS = 14.5;

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function simPossession(
  offense: SimLineup,
  defense: SimLineup,
  rng: Rng,
): PossessionResult {
  const events: StatEvent[] = [];
  let pointsScored = 0;

  // Step 1: Did the possession end in a turnover?
  const turnoverCheck = rng.random();
  if (turnoverCheck < BASE_TURNOVER_RATE * turnoverMult(offense.plan, defense.plan)) {
    const wasSteal = rng.chance(STEAL_FRACTION_OF_TURNOVERS);
    const turnoverPlayer = selectTurnoverPlayer(offense, rng);
    events.push({ playerId: turnoverPlayer.id, field: 'turnovers' });
    if (wasSteal) {
      const stealer = selectStealer(defense, rng);
      events.push({ playerId: stealer.id, field: 'steals' });
    }
    return {
      events,
      possessionFlipsToDefense: true,
      secondsElapsed: turnoverSeconds(rng),
      pointsScored: 0,
    };
  }

  // Step 2: Pick a shooter — weighted by usage
  const shooter = selectShooter(offense, rng);
  const shooterIdx = offense.players.indexOf(shooter);
  const defender = defense.players[shooterIdx]; // same-position matchup, v1 simplification

  // Step 3: Pick shot type (game plan biases the 3-point lean)
  const shotType = selectShotType(shooter.sportData.position, shooter.ratings, rng, threeBias(offense.plan));
  const isThree = shotType === 'three';
  const contested = isContested(shooter.ratings, defender.ratings, rng);

  // Step 4: Did the defender block it? (Only relevant at the rim, and only
  // for shots not already going to be made through traffic.)
  const blockChance = (shotType === 'at_rim' || shotType === 'post')
    ? Math.max(0, (defender.ratings.block - 65) * 0.0035)
    : 0;
  if (rng.chance(blockChance)) {
    events.push({ playerId: defender.id, field: 'blocks' });
    events.push({ playerId: shooter.id, field: 'fieldGoalsAttempted' });
    if (isThree) events.push({ playerId: shooter.id, field: 'threePointsAttempted' });
    // Blocked shot → live ball → rebound
    return resolveRebound(events, offense, defense, contested, rng, 0, false);
  }

  // Step 5: Resolve shot make/miss (game plan nudges shot quality)
  const makeP = Math.max(0.02, Math.min(0.99,
    makeProbability(shotType, shooter.ratings, defender.ratings, contested) * makeMult(offense.plan, defense.plan),
  ));
  const made = rng.chance(makeP);
  const fouled = drewShootingFoul(shotType, shooter.ratings, defender.ratings, rng);

  events.push({ playerId: shooter.id, field: 'fieldGoalsAttempted' });
  if (isThree) events.push({ playerId: shooter.id, field: 'threePointsAttempted' });

  if (made) {
    const points = isThree ? 3 : 2;
    events.push({ playerId: shooter.id, field: 'fieldGoalsMade' });
    if (isThree) events.push({ playerId: shooter.id, field: 'threePointsMade' });
    events.push({ playerId: shooter.id, field: 'points', delta: points });
    pointsScored += points;

    // Credit an assist ~55% of the time (NBA league average for made FGs).
    // Assister is one of the other 4 offensive players, weighted by passing.
    if (rng.chance(0.55)) {
      const assister = selectAssister(offense, shooter, rng);
      events.push({ playerId: assister.id, field: 'assists' });
    }

    // Defender foul → and-1 free throw
    if (fouled) {
      events.push({ playerId: defender.id, field: 'personalFouls' });
      const ftMade = resolveFreeThrows(shooter, 1, events, rng);
      pointsScored += ftMade;
    }
    return {
      events,
      possessionFlipsToDefense: true,
      secondsElapsed: shotSeconds(rng),
      pointsScored,
    };
  }

  // Missed shot
  if (fouled) {
    // Defender foul on missed shot → 2 FTs (or 3 if a three-point attempt)
    events.push({ playerId: defender.id, field: 'personalFouls' });
    const ftCount = isThree ? 3 : 2;
    const ftMade = resolveFreeThrows(shooter, ftCount, events, rng);
    pointsScored += ftMade;
    // Last FT outcome doesn't trigger a rebound in this simplified v1
    return {
      events,
      possessionFlipsToDefense: true,
      secondsElapsed: shotSeconds(rng),
      pointsScored,
    };
  }

  // Plain missed shot → rebound battle
  return resolveRebound(events, offense, defense, contested, rng, pointsScored, false);
}

// ---------------------------------------------------------------------------
// Sub-resolvers
// ---------------------------------------------------------------------------

function resolveRebound(
  events: StatEvent[],
  offense: SimLineup,
  defense: SimLineup,
  contested: boolean,
  rng: Rng,
  pointsAlreadyScored: number,
  _wasBlocked: boolean,
): PossessionResult {
  // Compute offensive rebound probability based on team rebounding ratings
  const offReboundSum = offense.players.reduce((s, p) => s + p.ratings.rebounding, 0);
  const defReboundSum = defense.players.reduce((s, p) => s + p.ratings.rebounding, 0);
  const offReboundEdge = (offReboundSum - defReboundSum) / 500; // small effect
  let orbRate = BASE_OFFENSIVE_REBOUND_RATE + offReboundEdge;
  if (contested) orbRate += 0.02; // contested misses → long rebounds → more orb chances
  orbRate = Math.max(0.12, Math.min(0.42, orbRate));

  const offensiveRebound = rng.chance(orbRate);
  if (offensiveRebound) {
    const rebounder = selectRebounder(offense, rng);
    events.push({ playerId: rebounder.id, field: 'offensiveRebounds' });
    events.push({ playerId: rebounder.id, field: 'totalRebounds' });
    return {
      events,
      possessionFlipsToDefense: false,
      secondsElapsed: shotSeconds(rng),
      pointsScored: pointsAlreadyScored,
    };
  }
  const rebounder = selectRebounder(defense, rng);
  events.push({ playerId: rebounder.id, field: 'defensiveRebounds' });
  events.push({ playerId: rebounder.id, field: 'totalRebounds' });
  return {
    events,
    possessionFlipsToDefense: true,
    secondsElapsed: shotSeconds(rng),
    pointsScored: pointsAlreadyScored,
  };
}

function resolveFreeThrows(
  shooter: BasketballPlayer,
  count: number,
  events: StatEvent[],
  rng: Rng,
): number {
  // Free throw % derived from FT rating. 70 rating = 78% (league avg).
  const ftPct = 0.78 + (shooter.ratings.freeThrow - 70) * 0.006;
  const ftMakeProb = Math.max(0.4, Math.min(0.95, ftPct));
  let made = 0;
  for (let i = 0; i < count; i++) {
    events.push({ playerId: shooter.id, field: 'freeThrowsAttempted' });
    if (rng.chance(ftMakeProb)) {
      events.push({ playerId: shooter.id, field: 'freeThrowsMade' });
      events.push({ playerId: shooter.id, field: 'points' });
      made++;
    }
  }
  return made;
}

// ---------------------------------------------------------------------------
// Player selection (weighted)
// ---------------------------------------------------------------------------

/** Weight a player's offensive usage: scoring + shot creation. */
function usageWeight(p: BasketballPlayer): number {
  const r = p.ratings;
  return (
    r.threePoint * 0.25 +
    r.midRange * 0.15 +
    r.finishing * 0.20 +
    r.postScoring * 0.10 +
    r.handles * 0.15 +
    r.basketballIQ * 0.15
  );
}

function selectShooter(lineup: SimLineup, rng: Rng): BasketballPlayer {
  const weights = lineup.players.map(usageWeight);
  return rng.pickWeighted(lineup.players, weights);
}

function selectAssister(lineup: SimLineup, exclude: BasketballPlayer, rng: Rng): BasketballPlayer {
  const others = lineup.players.filter(p => p !== exclude);
  const weights = others.map(p => p.ratings.passing * 1.5 + p.ratings.basketballIQ);
  return rng.pickWeighted(others, weights);
}

function selectTurnoverPlayer(lineup: SimLineup, rng: Rng): BasketballPlayer {
  // Higher-usage players cough it up more (more touches), but bad handles
  // hurt — so weight is usage minus handles rating.
  const weights = lineup.players.map(p =>
    Math.max(5, usageWeight(p) - p.ratings.handles * 0.6),
  );
  return rng.pickWeighted(lineup.players, weights);
}

function selectStealer(lineup: SimLineup, rng: Rng): BasketballPlayer {
  const weights = lineup.players.map(p => p.ratings.steal);
  return rng.pickWeighted(lineup.players, weights);
}

function selectRebounder(lineup: SimLineup, rng: Rng): BasketballPlayer {
  // Rebounding weighted by rebounding rating + height + position bias
  const weights = lineup.players.map(p => {
    const pos = p.sportData.position;
    const positionBoost = pos === 'C' ? 1.3 : pos === 'PF' ? 1.15 : 1.0;
    return (p.ratings.rebounding + p.ratings.height / 3) * positionBoost;
  });
  return rng.pickWeighted(lineup.players, weights);
}

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

function shotSeconds(rng: Rng): number {
  // Most possessions take 10-20 seconds; tail to 24
  return 4 + rng.random() * 20;
}

function turnoverSeconds(rng: Rng): number {
  // Turnovers are usually quicker than shot attempts
  return 2 + rng.random() * 12;
}

export { AVG_POSSESSION_SECONDS };
