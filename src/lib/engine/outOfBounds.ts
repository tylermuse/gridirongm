/**
 * Out of bounds: whether a run or a catch ends with the ball carrier going out of bounds, and what that does to the
 * game clock. Both engines (playByPlay.ts and liveCoachEngine.ts) decide it here and stamp `outOfBounds` on the event;
 * the 3D sim (liveSim3d.ts -> public/chase-cam) pictures what the engine decided instead of making up its own finish.
 * It used to be the other way round: the sim ran some long runs and sideline catches out of bounds at random while the
 * engine had no idea, so the player stepped out and the clock kept running.
 *
 * NFL clock rule (Rule 4): a runner going out of bounds stops the clock.
 *  - Outside the late windows, the clock starts again on the referee's signal once the ball is spotted, so the play
 *    costs only a few seconds less than one that ends in bounds.
 *  - In the last two minutes of the first half and the last five minutes of the second half, the clock stays stopped
 *    until the next snap. Overtime uses the fourth-quarter timing in the last five minutes of the period.
 */

/** Seconds a play that goes out of bounds takes, snap to whistle. Inside the late windows that is all it costs. */
export const OOB_PLAY_SECS = 6;
/** Seconds the clock stays stopped while the ball is brought back in and spotted (outside the late windows). */
export const OOB_SPOT_SECS = 7;

/** True when a runner going out of bounds with `timeSecs` left on the clock keeps it stopped until the next snap. */
export function oobStopsClockUntilSnap(quarter: number, timeSecs: number, overtime = false): boolean {
  if (overtime || quarter >= 5) return timeSecs <= 300;
  if (quarter === 2) return timeSecs <= 120;
  if (quarter === 4) return timeSecs <= 300;
  return false;
}

/** Shortest gains the 3D sim can picture ending out of bounds. A back has to get outside and turn up the sideline
 *  (10+ yards), a QB keeper or scramble 15+; a catch needs a few yards after it, and a deep ball or a screen never ends
 *  out of bounds (the sim's choreography for those has no sideline finish). */
export const OOB_MIN_RUN_YARDS = 10;
export const OOB_MIN_QB_RUN_YARDS = 15;
export const OOB_MIN_CATCH_YARDS = 6;
/** Longest short completion: from 20 yards a catch is pictured as a deep ball (a play-action throw from 16). */
export const OOB_MAX_CATCH_YARDS = 19;
export const OOB_MAX_PLAY_ACTION_YARDS = 15;

/** Chance an eligible run / catch ends out of bounds in an ordinary situation. */
const BASE_CHANCE = { run: 0.3, catch: 0.2 } as const;

export interface OobSituation {
  quarter: number;
  /** clock when the play ends */
  timeSecs: number;
  overtime?: boolean;
  /** offense's score minus the defense's */
  scoreDiff: number;
}

/** How much more (or less) often a carrier heads for the sideline: inside the late windows an offense that needs the
 *  clock stopped gets out of bounds (any drive before the half, or trailing / tied late in the game), and one protecting
 *  a lead stays in bounds to keep it running. */
function urgency(s: OobSituation): number {
  if (!oobStopsClockUntilSnap(s.quarter, s.timeSecs, s.overtime)) return 1;
  if (s.quarter === 2 && !s.overtime) return 2;
  return s.scoreDiff <= 0 ? 2 : 0.2;
}

/** Whether a run that wasn't a touchdown or a fumble ends with the carrier out of bounds. */
export function rollRunOutOfBounds(yards: number, isQb: boolean, s: OobSituation, rand: () => number = Math.random): boolean {
  if (yards < (isQb ? OOB_MIN_QB_RUN_YARDS : OOB_MIN_RUN_YARDS)) return false;
  return rand() < BASE_CHANCE.run * urgency(s);
}

/** Whether a short completion that wasn't a touchdown or a fumble ends with the receiver out of bounds. */
export function rollCatchOutOfBounds(
  yards: number,
  kind: 'short' | 'play_action' | 'deep' | 'screen',
  s: OobSituation,
  rand: () => number = Math.random,
): boolean {
  if (kind === 'deep' || kind === 'screen') return false;
  if (yards < OOB_MIN_CATCH_YARDS || yards > (kind === 'play_action' ? OOB_MAX_PLAY_ACTION_YARDS : OOB_MAX_CATCH_YARDS)) return false;
  return rand() < BASE_CHANCE.catch * urgency(s);
}

/** Seconds of runoff owed to the next snap after a play that went out of bounds, given what an in-bounds finish
 *  would have owed: none inside the late windows, otherwise the in-bounds runoff less the time spent spotting the ball. */
export function oobRunoffSecs(inBoundsRunoffSecs: number, quarter: number, timeSecsAfterPlay: number, overtime = false): number {
  if (oobStopsClockUntilSnap(quarter, timeSecsAfterPlay, overtime)) return 0;
  return Math.max(0, inBoundsRunoffSecs - OOB_SPOT_SECS);
}

const pickOne = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** The sentence added to a run that ends out of bounds (nobody makes the tackle). Clear of the words other code reads
 *  a play line for (deep, screen, scramble, sack, fumble, batted, touchdown). */
export function runOutOfBoundsNote(clockStopped: boolean): string {
  return clockStopped
    ? pickOne([' Gets out of bounds to stop the clock.', ' Steps out of bounds. The clock stops.', ' Out of bounds, and the clock is stopped.'])
    : pickOne([' Steps out of bounds.', ' Runs out of bounds.', ' Gets out of bounds at the end of the run.']);
}

/** The sentence added to a catch that ends with the receiver shoved out of bounds by `name`, who is credited with the
 *  tackle. It is the event's `defNote`, so it names the defender and nothing else; add CLOCK_STOPPED_TAIL after it when
 *  the clock stays stopped. */
export function catchOutOfBoundsNote(name: string): string {
  return pickOne([` Pushed out of bounds by ${name}.`, ` ${name} shoves him out of bounds.`, ` ${name} runs him out of bounds.`]);
}
export const CLOCK_STOPPED_TAIL = ' The clock stops.';
