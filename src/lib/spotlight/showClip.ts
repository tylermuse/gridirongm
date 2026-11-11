/**
 * Team Spotlight video show — highlight clips of the scores.
 *
 * A finished game keeps its scoring log, not its play-by-play. But a score's
 * line says what the play was ("D. Prescott 34 yd pass to C. Lamb", "27-yard
 * field goal"), and a score ends at a known spot (the goal line, the
 * uprights) — so the snap can be worked back from it: a 34-yard touchdown
 * was snapped at the 34, a 27-yard field goal from the 10.
 *
 * This rebuilds that snap as a PlayEvent, which the 3D sim (LiveSim3D's
 * chase-cam) already knows how to run. It is a re-enactment: who scored, how
 * and from where are the game's; the route and the blocking are the sim's.
 * Pure (client-safe).
 */
import type { PlayEvent } from '@/lib/engine/playByPlay';
import type { FlowPlay, GameFlow } from './showGame';

/** Scores with nothing to work back from, or that the sim has no picture
 *  for (returns, defensive scores): the game-flow chart shows those. */
const NO_SNAP = /intercept|pick[- ]?six|fumble|block|safety|punt|onside|muff/i;
const KICK_RETURN = /kick(off)? return/i;
const RUSH = /\byd rush\b|-yard rush|\bruns? it in\b|punches it in|crosses the goal line|stretches across|pylon|\bscrambl/i;
const PASS = /\bpass\b|\bhits\b|\bhauls in\b|\bgrab\b|\bthrow\b|\bfires\b|\bfinds\b| to [A-Z]\. /;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** How far the score was from, when its line says. */
function yardsIn(desc: string): number | null {
  const m = /(\d{1,3})[- ]?(?:yd|yard)/i.exec(desc);
  return m ? Number(m[1]) : null;
}

/** Can this score be shown as a clip? */
export function hasClip(p: FlowPlay): boolean {
  if (p.kind !== 'td' && p.kind !== 'fg') return false;
  if (KICK_RETURN.test(p.description)) return true;
  return !NO_SNAP.test(p.description);
}

/**
 * Score `n` (1-based) of a game's flow as the play the sim should run, or
 * null when it can't be pictured. Scores on the event are the engines'
 * convention: the score once the play's own points are on the board (the
 * extra point is a separate play, so a touchdown is +6).
 */
export function clipEventOf(flow: GameFlow, n: number): PlayEvent | null {
  const p = flow.plays[n - 1];
  if (!p || !hasClip(p)) return null;
  const usHome = flow.usHome !== false;
  const scorer: 'home' | 'away' = p.ours === usHome ? 'home' : 'away';
  const before = flow.plays[n - 2] ?? { us: 0, them: 0 };
  const pre = { home: usHome ? before.us : before.them, away: usHome ? before.them : before.us };
  const yards = yardsIn(p.description);
  const base = { id: n, description: p.description, quarter: p.quarter, timeStr: p.timeLeft ?? '7:30', isScoring: true };

  // A kickoff taken back: the kicking team has the ball on the event, and
  // the engines credit the points after it.
  if (KICK_RETURN.test(p.description)) {
    return { ...base, type: 'kickoff', possession: scorer === 'home' ? 'away' : 'home', fieldPos: 35, down: 1, yardsToGo: 10, yardsGained: 100, homeScore: pre.home, awayScore: pre.away };
  }
  const post = (pts: number) => ({ homeScore: pre.home + (scorer === 'home' ? pts : 0), awayScore: pre.away + (scorer === 'away' ? pts : 0) });

  if (p.kind === 'fg') {
    // The kick is 17 yards longer than the line of scrimmage (10 of end zone, 7 back to the hold).
    const toGoal = clamp((yards ?? 37) - 17, 1, 60);
    return { ...base, type: 'field_goal_good', possession: scorer, fieldPos: 100 - toGoal, down: 4, yardsToGo: Math.min(4, toGoal), yardsGained: 0, ...post(3) };
  }

  const rush = RUSH.test(p.description) || (!PASS.test(p.description) && (yards ?? 0) < 10);
  // No distance in the line ("crosses the goal line!", "makes the grab in the end zone"): a short one.
  const toGoal = clamp(yards ?? (rush ? 3 : 12), 1, 99);
  return { ...base, type: rush ? 'run' : 'pass_complete', possession: scorer, fieldPos: 100 - toGoal, down: 1, yardsToGo: Math.min(10, toGoal), yardsGained: toGoal, ...post(6) };
}
