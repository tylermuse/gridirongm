/**
 * Returns — the one place a change of possession on a return is spotted.
 *
 * Every engine (headless sim, watch-live play-by-play, Live Coach) hands this
 * helper the spot where the ball was caught / recovered and the yards the
 * return gained, and gets back where the new offense's drive starts — or that
 * the return scored, or was a touchback. Used for interception returns, fumble
 * returns, punt returns and kickoff returns (and ready for blocked kicks: none
 * of the engines has one yet).
 *
 * Before this each engine rolled a single "the defense takes over about here"
 * number for a pick (the mirror of the line of scrimmage, give or take ten),
 * with no catch spot and no return yards, so the play that was pictured and
 * described could not agree with the spot of the next drive, and a pick-six
 * could never be scored.
 *
 * Yard lines here are always "yards from a team's own goal line" (the same
 * convention as PlayEvent.fieldPos): 1-99 in the field of play, 0 or less in
 * that team's own end zone, 100 or more in the opponent's.
 */

export type ReturnKind = 'interception' | 'fumble' | 'punt' | 'kickoff' | 'blocked_kick';

export interface ReturnOutcome {
  /** 'spot': the new offense starts a drive at `fieldPos`.
   *  'touchdown': the return reached the end zone — a return / defensive TD, never 1st-and-goal at the 1.
   *  'touchback': caught or recovered in its own end zone and not brought out.
   *  'safety': caught in the field of play, then carried back into its own end zone and downed there. */
  result: 'spot' | 'touchdown' | 'touchback' | 'safety';
  /** The NEW offense's yard line where its drive starts (1-99). 100 on a touchdown, 0 on a safety. */
  fieldPos: number;
  /** The NEW offense's yard line where it got the ball. 0 = in its own end zone. */
  from: number;
  /** Yards credited to the returner (what the play-by-play says and what the spot moved by). */
  returnYards: number;
}

/** Where the ball goes on a touchback after a turnover or a punt. Kickoffs pass their own (the 35 under the current rule). */
export const TOUCHBACK_SPOT = 20;

/** NFL momentum rule: a ball caught inside the 5 and carried into the catcher's own end zone by his momentum comes back
 *  out to the spot of the catch instead of being a safety. */
const MOMENTUM_RULE_INSIDE = 5;

/**
 * Spot the ball after a return.
 *
 * @param spot        where the ball was caught / recovered, as the team that LOST it sees the field (its own yard line:
 *                    the line of scrimmage plus the air yards on a pick, the spot of the fumble, the kick's landing
 *                    spot). 100 or more = in the returning team's end zone.
 * @param returnYards yards the return gained toward the other goal line (negative = lost ground)
 * @param touchbackAt where a touchback puts the ball (default the 20)
 */
export function resolveReturn(opts: { spot: number; returnYards: number; touchbackAt?: number }): ReturnOutcome {
  const touchbackAt = opts.touchbackAt ?? TOUCHBACK_SPOT;
  // Flip the field first, THEN add the return: the return is the new offense's gain.
  const raw = 100 - Math.round(opts.spot);
  const inEndZone = raw <= 0;
  const from = Math.max(0, Math.min(99, raw));
  const end = from + Math.round(opts.returnYards);

  if (end >= 100) return { result: 'touchdown', fieldPos: 100, from, returnYards: 100 - from };
  if (end <= 0) {
    if (inEndZone) return { result: 'touchback', fieldPos: touchbackAt, from: 0, returnYards: 0 };
    if (from < MOMENTUM_RULE_INSIDE) return { result: 'spot', fieldPos: Math.max(1, from), from, returnYards: 0 };
    return { result: 'safety', fieldPos: 0, from, returnYards: -from };
  }
  // Only a return that did not score is kept inside the field of play.
  const fieldPos = Math.max(1, Math.min(99, end));
  return { result: 'spot', fieldPos, from, returnYards: fieldPos - from };
}

// ── Rolls ────────────────────────────────────────────────────────────────────
// Shared by the three engines so a pick, a fumble or a punt is the same play whichever one simulates the game.

type Rng = () => number;
const between = (lo: number, hi: number, rng: Rng) => lo + Math.floor(rng() * (hi - lo + 1));

export type PickDepth = 'deep' | 'short' | 'screen' | 'tipped' | 'play_action';

/** Share of picks on an uncalled pass that come on a deep ball. */
export const DEEP_PICK_SHARE = 0.3;

/** Yards past the line of scrimmage where a pass is picked off. The ranges are the ones the 3D sim throws to, so the
 *  pick is pictured where the engine put it. `toGoal`: yards from the line of scrimmage to the goal line — a ball
 *  picked deeper than that is caught in the end zone. */
export function rollPickAirYards(depth: PickDepth, toGoal: number, rng: Rng = Math.random): number {
  // play action: thrown behind the backers who bit on the fake, between a short pass and a deep shot
  const air = depth === 'deep' ? between(18, 27, rng) : depth === 'play_action' ? between(10, 20, rng)
    : depth === 'short' ? between(4, 9, rng) : between(0, 2, rng);
  return Math.min(air, toGoal + 7);
}

/** Interception return: about a third go nowhere, most are a short run, a few break. Averages about 12 yards. */
export function rollInterceptionReturnYards(rng: Rng = Math.random): number {
  const r = rng();
  if (r < 0.35) return between(0, 3, rng);
  if (r < 0.82) return between(4, 18, rng);
  if (r < 0.96) return between(19, 40, rng);
  return between(41, 99, rng);
}

/** Fumble return: most are fallen on where they lie; a scoop-and-run is the exception. */
export function rollFumbleReturnYards(rng: Rng = Math.random): number {
  const r = rng();
  if (r < 0.65) return 0;
  if (r < 0.9) return between(1, 12, rng);
  if (r < 0.98) return between(13, 40, rng);
  return between(41, 99, rng);
}

/** Punt return: nearly half are fair catches, the rest a short return, and about 1 in 200 goes the distance. */
export function rollPuntReturnYards(rng: Rng = Math.random): number {
  const r = rng();
  if (r < 0.45) return 0;
  if (r < 0.9) return between(1, 9, rng);
  if (r < 0.995) return between(10, 24, rng);
  return 100;
}

/**
 * Roll a turnover or punt return and spot it. A ball caught / recovered in the returner's own end zone is downed for a
 * touchback most of the time (always on a punt). The rolls never lose ground, so this never comes back a safety.
 */
export function rollReturn(kind: 'interception' | 'fumble' | 'punt', spot: number, rng: Rng = Math.random): ReturnOutcome {
  const roll = kind === 'interception' ? rollInterceptionReturnYards : kind === 'fumble' ? rollFumbleReturnYards : rollPuntReturnYards;
  const inEndZone = Math.round(spot) >= 100;
  const returnYards = inEndZone && (kind === 'punt' || rng() < 0.85) ? 0 : roll(rng);
  return resolveReturn({ spot, returnYards });
}

// ── Words ────────────────────────────────────────────────────────────────────

/** "his own 30" / "midfield" / "the opponent's 10", from the returner's side of the field. */
export function returnSpotLabel(fieldPos: number): string {
  const fp = Math.round(fieldPos);
  if (fp === 50) return 'midfield';
  return fp < 50 ? `his own ${Math.max(1, fp)}` : `the opponent's ${Math.max(1, 100 - fp)}`;
}

/** The sentence that tells the return, appended to the play's own line. It names no player (code that reads names out
 *  of a play line must not find one here) and says exactly what `outcome` did to the ball. */
export function returnNote(kind: 'interception' | 'fumble', outcome: ReturnOutcome): string {
  const yds = (n: number) => `${n} yard${n === 1 ? '' : 's'}`;
  if (outcome.result === 'touchdown') {
    return kind === 'interception'
      ? ` PICK-SIX! Returned ${yds(outcome.returnYards)} for a TOUCHDOWN!`
      : ` SCOOP AND SCORE! Returned ${yds(outcome.returnYards)} for a TOUCHDOWN!`;
  }
  if (outcome.result === 'touchback') return kind === 'interception' ? ' Picked in the end zone — touchback.' : ' Recovered in the end zone — touchback.';
  if (outcome.result === 'safety') return ' Run back into his own end zone — safety.';
  if (outcome.returnYards > 0) return ` Returned ${yds(outcome.returnYards)} to ${returnSpotLabel(outcome.fieldPos)}.`;
  return ` Down at ${returnSpotLabel(outcome.fieldPos)}, no return.`;
}
