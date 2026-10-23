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
import type { CoachSchemeEffect } from '../coachingSystem';
import type { PlayerId } from '@bs/core/adapter';
import type { Rng } from './rng';
import { selectShotType, makeProbability, isContested, drewShootingFoul, type ShotType } from './shotModel';

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
  /** The head coach's scheme effect, if any (neutral when absent). */
  schemeEffect?: CoachSchemeEffect;
  /** Game-state make-rate nudge for this possession's offense (score effects:
   *  a big second-half lead → leader eases off, trailer presses). 0 = none. */
  makeAdj?: number;
  /** End-game: the offense must take a three (down 3 late, etc.). */
  forceThree?: boolean;
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
  /** Shot type when the possession produced a field-goal attempt (absent on
   *  turnovers). Used by the live viewer's play log + shot chart. */
  shotType?: ShotType;
  /** Whether that shot was contested. */
  contested?: boolean;
  /** End-game intentional foul (no shot; two free throws). */
  intentional?: boolean;
}

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** League average turnover rate per possession (~14 TOs / ~100 possessions). */
const BASE_TURNOVER_RATE = 0.128;

/** Fraction of turnovers that come from steals (the rest are live-ball
 *  errors — bad passes, dribble offs, traveling, etc.). */
const STEAL_FRACTION_OF_TURNOVERS = 0.55;

/** Per-team offensive rebound rate on missed shots. League average ~26%. */
const BASE_OFFENSIVE_REBOUND_RATE = 0.245;

// ---- Calibration (2024-25 NBA targets, per team-game: ~114 PTS, 46.7 FG%,
// 36% 3P, 21.7 FTA, 4.9 BLK, 26.5 AST, 18 PF; leaders ~32 PPG / 13.5 RPG /
// 11 APG / 3.5 BPG). Measured with a full-season harness across seeds. ----

/** Exponent on usage weight when picking a shooter. Linear weights made a
 *  65-usage role player and an 88 star nearly equal (top PPG ~21, zero 25-ppg
 *  scorers). Raised to this power relative to the lineup mean so stars carry
 *  ~30% usage like real primary options. */
const USAGE_EXPONENT = 3.4;
/** Same idea for assists (passing + IQ) and rebounds (rebounding + size). */
const ASSIST_EXPONENT = 3.3;
const REBOUND_EXPONENT = 1.8;
/** Fraction of made FGs assisted, by shot type (NBA: catch-and-shoot threes
 *  are mostly assisted; post-ups and pull-ups mostly aren't). ~60% overall. */
const ASSIST_RATE: Record<ShotType, number> = { three: 0.82, midrange: 0.45, at_rim: 0.62, post: 0.38 };
/** Base block chance by shot type, before the defense's rim-protection factor.
 *  Was rim/post only and gated on the matched defender's block > 65, which
 *  produced ~0.6 blocks per team-game (NBA ~4.9). */
const BLOCK_BASE: Record<ShotType, number> = { at_rim: 0.105, post: 0.075, midrange: 0.018, three: 0.0065 };
/** Non-shooting (reach-in, off-ball, loose-ball) fouls per possession, and the
 *  share that send the offense to the line (team in the bonus). Shooting fouls
 *  alone left teams at ~12.7 FTA and 8.5 PF per game. */
const NON_SHOOTING_FOUL_RATE = 0.095;
const BONUS_FT_SHARE = 0.4;

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

  // Step 1: Did the possession end in a turnover? (defensive scheme intensity
  // forces a few more TOs at >1, fewer at <1)
  const defIntensity = defense.schemeEffect?.defensiveIntensityMultiplier ?? 1;
  const turnoverCheck = rng.random();
  if (turnoverCheck < BASE_TURNOVER_RATE * turnoverMult(offense.plan, defense.plan) * defIntensity) {
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

  // Step 1b: Non-shooting foul. Charged to a defender; in the bonus it sends
  // the fouled player to the line for two (possession ends), otherwise play
  // continues to a shot.
  if (rng.chance(NON_SHOOTING_FOUL_RATE)) {
    const fouler = rng.pickWeighted(defense.players, defense.players.map(p => Math.max(10, 120 - p.ratings.basketballIQ)));
    events.push({ playerId: fouler.id, field: 'personalFouls' });
    if (rng.chance(BONUS_FT_SHARE)) {
      const fouledPlayer = selectShooter(offense, rng);
      const ftMade = resolveFreeThrows(fouledPlayer, 2, events, rng);
      return {
        events,
        possessionFlipsToDefense: true,
        secondsElapsed: turnoverSeconds(rng),
        pointsScored: ftMade,
      };
    }
  }

  // Step 2: Pick a shooter — weighted by usage (a must-make three goes to the
  // best shooter far more often).
  const shooter = offense.forceThree ? selectThreeShooter(offense, rng) : selectShooter(offense, rng);
  const shooterIdx = offense.players.indexOf(shooter);
  const defender = defense.players[shooterIdx]; // same-position matchup, v1 simplification

  // Step 3: Pick shot type (game plan + coach scheme bias 3-point / post lean)
  const threeMult = threeBias(offense.plan) * (offense.schemeEffect?.threePointAttemptMultiplier ?? 1) * (offense.forceThree ? 40 : 1);
  const postMult = offense.schemeEffect?.postAttemptMultiplier ?? 1;
  const shotType = selectShotType(shooter.sportData.position, shooter.ratings, rng, threeMult, postMult);
  const isThree = shotType === 'three';
  const contested = isContested(shooter.ratings, defender.ratings, rng);
  const tag = (r: PossessionResult): PossessionResult => ({ ...r, shotType, contested });

  // Step 4: Did the defender block it? (Only relevant at the rim, and only
  // for shots not already going to be made through traffic.)
  // Help defense counts: the lineup's rim protection (block rating, weighted
  // toward its best shot-blocker) scales the shot type's base rate.
  const rimProtect = lineupRimProtection(defense);
  const blockChance = BLOCK_BASE[shotType] * rimProtect;
  if (rng.chance(blockChance)) {
    const blocker = selectBlocker(defense, defender, shotType, rng);
    events.push({ playerId: blocker.id, field: 'blocks' });
    events.push({ playerId: shooter.id, field: 'fieldGoalsAttempted' });
    if (isThree) events.push({ playerId: shooter.id, field: 'threePointsAttempted' });
    // Blocked shot → live ball → rebound
    return tag(resolveRebound(events, offense, defense, contested, rng, 0, false));
  }

  // Step 5: Resolve shot make/miss (game plan + a tighter defensive scheme nudge
  // shot quality; intensity >1 shaves the opponent's make%)
  const makeP = Math.max(0.02, Math.min(0.99,
    makeProbability(shotType, shooter.ratings, defender.ratings, contested)
      * makeMult(offense.plan, defense.plan)
      * (1 + (offense.makeAdj ?? 0))
      * (1 - (defIntensity - 1) * 0.3),
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
    if (rng.chance(ASSIST_RATE[shotType])) {
      const assister = selectAssister(offense, shooter, rng);
      events.push({ playerId: assister.id, field: 'assists' });
    }

    // Defender foul → and-1 free throw
    if (fouled) {
      events.push({ playerId: defender.id, field: 'personalFouls' });
      const ftMade = resolveFreeThrows(shooter, 1, events, rng);
      pointsScored += ftMade;
    }
    return tag({
      events,
      possessionFlipsToDefense: true,
      secondsElapsed: shotSeconds(rng),
      pointsScored,
    });
  }

  // Missed shot
  if (fouled) {
    // Defender foul on missed shot → 2 FTs (or 3 if a three-point attempt)
    events.push({ playerId: defender.id, field: 'personalFouls' });
    const ftCount = isThree ? 3 : 2;
    const ftMade = resolveFreeThrows(shooter, ftCount, events, rng);
    pointsScored += ftMade;
    // Last FT outcome doesn't trigger a rebound in this simplified v1
    return tag({
      events,
      possessionFlipsToDefense: true,
      secondsElapsed: shotSeconds(rng),
      pointsScored,
    });
  }

  // Plain missed shot → rebound battle
  return tag(resolveRebound(events, offense, defense, contested, rng, pointsScored, false));
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
  const ftPct = 0.745 + (shooter.ratings.freeThrow - 70) * 0.006;
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

/** Raise weights to a power relative to their mean (keeps magnitudes sane). */
function sharpen(weights: number[], exponent: number): number[] {
  const mean = weights.reduce((a, b) => a + b, 0) / Math.max(1, weights.length) || 1;
  return weights.map(w => Math.pow(Math.max(0.01, w) / mean, exponent));
}

function selectShooter(lineup: SimLineup, rng: Rng): BasketballPlayer {
  const weights = sharpen(lineup.players.map(usageWeight), USAGE_EXPONENT);
  return rng.pickWeighted(lineup.players, weights);
}

function selectThreeShooter(lineup: SimLineup, rng: Rng): BasketballPlayer {
  return rng.pickWeighted(lineup.players, sharpen(lineup.players.map(p => p.ratings.threePoint + usageWeight(p) / 2), 6));
}

/**
 * End-game intentional foul: the trailing defense fouls before a shot. Teams
 * hunt the worst free-throw shooter on the floor; two shots, clock barely moves.
 */
export function simIntentionalFoul(offense: SimLineup, defense: SimLineup, rng: Rng): PossessionResult {
  const events: StatEvent[] = [];
  const fouler = rng.pickWeighted(defense.players, defense.players.map(() => 1));
  events.push({ playerId: fouler.id, field: 'personalFouls' });
  const fouled = rng.pickWeighted(offense.players, offense.players.map(p => Math.max(5, 100 - p.ratings.freeThrow) ** 1.5));
  const made = resolveFreeThrows(fouled, 2, events, rng);
  return { events, possessionFlipsToDefense: true, secondsElapsed: 1 + rng.random() * 3, pointsScored: made, intentional: true };
}

/** 0.6-1.6 multiplier on block chance from the defense's shot-blocking. */
function lineupRimProtection(defense: SimLineup): number {
  const blocks = defense.players.map(p => p.ratings.block).sort((a, b) => b - a);
  const anchor = blocks[0] * 0.6 + blocks[1] * 0.25 + blocks[2] * 0.15;
  return Math.max(0.6, Math.min(1.6, 1 + (anchor - 65) * 0.03));
}

/** Who gets the block: rim protectors dominate inside; on jumpers the
 *  closest defender matters more. */
function selectBlocker(defense: SimLineup, matched: BasketballPlayer, shot: ShotType, rng: Rng): BasketballPlayer {
  const inside = shot === 'at_rim' || shot === 'post';
  const weights = sharpen(defense.players.map(p => {
    const pos = p.sportData.position;
    const posBoost = pos === 'C' ? 1.5 : pos === 'PF' ? 1.25 : 1;
    const matchBoost = p === matched ? (inside ? 1.3 : 3) : 1;
    return (p.ratings.block + p.ratings.height / 4) * (inside ? posBoost : 1) * matchBoost;
  }), 3);
  return rng.pickWeighted(defense.players, weights);
}

function selectAssister(lineup: SimLineup, exclude: BasketballPlayer, rng: Rng): BasketballPlayer {
  const others = lineup.players.filter(p => p !== exclude);
  const weights = sharpen(others.map(p => {
    const pos = p.sportData.position;
    const role = pos === 'PG' ? 1.25 : pos === 'SG' || pos === 'SF' ? 1.0 : 0.85;
    return (p.ratings.passing * 1.5 + p.ratings.basketballIQ) * role;
  }), ASSIST_EXPONENT);
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
  return rng.pickWeighted(lineup.players, sharpen(weights, REBOUND_EXPONENT));
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
