/**
 * Defensive looks for Live Coach.
 *
 * Before each snap the user calls, the defense shows one of five looks. Every play call is a little better or worse
 * against each look, so the call becomes a read instead of a pick from five fixed dice rolls:
 *
 *   Blitz        → Screen / Short Pass punish it, a Deep Shot risks the sack
 *   Stacked Box  → Deep Shot is open behind it, a Run goes nowhere
 *   Two-High     → Run into the light box, a Deep Shot is covered and picked
 *   Man Press    → QB Scramble (backs are turned) or a Deep Shot that beats the jam; Short Pass is contested
 *   Soft Zone    → Short Pass is given away, anything deep or wide is rallied to
 *
 * The tables are built to be zero-sum per call under NEUTRAL_WEIGHTS: a coach who ignores the look gets, on average,
 * the same play he got before looks existed. tests/integration/football-livecoach-defensive-looks.test.ts holds that.
 * Pure data and pure functions; all randomness is passed in.
 */

import type { DefensiveScheme } from '@/types';

export type DefensiveLook = 'blitz' | 'stacked_box' | 'two_high' | 'man_press' | 'soft_zone';
export type LookPlay = 'run' | 'qb_run' | 'pass_short' | 'pass_deep' | 'screen';

export const DEFENSIVE_LOOKS: DefensiveLook[] = ['blitz', 'stacked_box', 'two_high', 'man_press', 'soft_zone'];
export const LOOK_PLAYS: LookPlay[] = ['run', 'qb_run', 'pass_short', 'pass_deep', 'screen'];

export const LOOK_INFO: Record<DefensiveLook, { label: string; icon: string; read: string }> = {
  blitz:       { label: 'Blitz',       icon: '🔥', read: 'Extra rushers are coming. The ball has to come out fast.' },
  stacked_box: { label: 'Stacked Box', icon: '🧱', read: 'Eight men up at the line. One safety is deep on his own.' },
  two_high:    { label: 'Two-High',    icon: '🛡️', read: 'Both safeties are deep. The box is light.' },
  man_press:   { label: 'Man Press',   icon: '🤼', read: 'Corners are up in the receivers’ faces with their backs to the QB.' },
  soft_zone:   { label: 'Soft Zone',   icon: '🕸️', read: 'Everyone is backed off, giving up the short stuff and rallying to it.' },
};

/** How a look changes one play. Deltas are added; mults multiply the engine's own chance. */
export interface LookModifier {
  /** Yards added to the play's gain (runs: every carry; passes: completions only) */
  yards: number;
  /** Added to the completion rate (passes) */
  comp: number;
  sackMult: number;
  intMult: number;
  /** Multiplies the chance of the engine's big-play bonus */
  bigPlayMult: number;
  /** -1 the look has this call covered, 0 even, +1 the call beats the look */
  edge: -1 | 0 | 1;
}

const m = (edge: -1 | 0 | 1, p: Partial<Omit<LookModifier, 'edge'>> = {}): LookModifier =>
  ({ yards: 0, comp: 0, sackMult: 1, intMult: 1, bigPlayMult: 1, ...p, edge });

export const NO_LOOK: LookModifier = m(0);

export const LOOK_TABLE: Record<LookPlay, Record<DefensiveLook, LookModifier>> = {
  run: {
    blitz:       m(0,  { yards: 0.5, bigPlayMult: 1.4 }),
    stacked_box: m(-1, { yards: -1.8, bigPlayMult: 0.4 }),
    two_high:    m(1,  { yards: 1.5, bigPlayMult: 1.2 }),
    man_press:   m(0,  { yards: -0.3 }),
    soft_zone:   m(0,  { yards: 0.3 }),
  },
  qb_run: {
    blitz:       m(-1, { yards: -1.0 }),
    stacked_box: m(-1, { yards: -1.0, bigPlayMult: 0.5 }),
    two_high:    m(0,  { yards: 0.5 }),
    man_press:   m(1,  { yards: 2.0, bigPlayMult: 1.5 }),
    soft_zone:   m(0,  { yards: -0.5 }),
  },
  pass_short: {
    blitz:       m(1,  { comp: 0.06, sackMult: 0.8, bigPlayMult: 1.4 }),
    stacked_box: m(0,  { comp: 0.02 }),
    two_high:    m(0,  { comp: 0.03 }),
    man_press:   m(-1, { comp: -0.14, yards: 1.0, intMult: 1.2 }),
    soft_zone:   m(1,  { comp: 0.05, yards: -1.0, intMult: 0.8, bigPlayMult: 0.6 }),
  },
  pass_deep: {
    blitz:       m(-1, { comp: 0.06, sackMult: 1.7 }),
    stacked_box: m(1,  { comp: 0.12, sackMult: 0.9, intMult: 0.6 }),
    two_high:    m(-1, { comp: -0.15, sackMult: 0.9, intMult: 1.6, bigPlayMult: 0.5 }),
    man_press:   m(1,  { comp: 0.06, intMult: 0.8, bigPlayMult: 1.5 }),
    soft_zone:   m(-1, { comp: -0.08, sackMult: 0.75 }),
  },
  screen: {
    blitz:       m(1,  { yards: 4.0, comp: 0.05, bigPlayMult: 2.0 }),
    stacked_box: m(-1, { yards: -1.5, comp: -0.03 }),
    two_high:    m(0,  { yards: 0.5 }),
    man_press:   m(-1, { yards: -1.5, comp: -0.05 }),
    soft_zone:   m(0,  { yards: -1.0, bigPlayMult: 0.6 }),
  },
};

/**
 * How much of LOOK_TABLE reaches the field. At 1.0 a coach who always makes the right read gained ~36% more yards per
 * play than before looks existed, which swamps the ratings; at 0.5 the right read is worth roughly +18% and the wrong
 * one roughly -10%, with ignoring the look still a wash. Tune here, not in the table (the table's shape is the design).
 */
export const LOOK_STRENGTH = 0.5;

const SCALED_TABLE = Object.fromEntries(LOOK_PLAYS.map(play => [play, Object.fromEntries(DEFENSIVE_LOOKS.map(look => {
  const t = LOOK_TABLE[play][look];
  const k = LOOK_STRENGTH;
  return [look, {
    yards: t.yards * k, comp: t.comp * k,
    sackMult: 1 + (t.sackMult - 1) * k, intMult: 1 + (t.intMult - 1) * k, bigPlayMult: 1 + (t.bigPlayMult - 1) * k,
    edge: t.edge,
  }];
}))])) as Record<LookPlay, Record<DefensiveLook, LookModifier>>;

/** What the look does to this call on the field (LOOK_TABLE scaled by LOOK_STRENGTH). */
export function lookModifier(play: LookPlay, look: DefensiveLook | null | undefined): LookModifier {
  return look ? SCALED_TABLE[play][look] : NO_LOOK;
}

/** The mix a defense with no scheme shows; the tables above are balanced against it. */
export const NEUTRAL_WEIGHTS: Record<DefensiveLook, number> = {
  blitz: 0.18, stacked_box: 0.20, two_high: 0.22, man_press: 0.20, soft_zone: 0.20,
};

const SCHEME_WEIGHTS: Record<DefensiveScheme, Record<DefensiveLook, number>> = {
  cover_3:    { blitz: 0.15, stacked_box: 0.28, two_high: 0.10, man_press: 0.12, soft_zone: 0.35 },
  man_press:  { blitz: 0.20, stacked_box: 0.20, two_high: 0.12, man_press: 0.40, soft_zone: 0.08 },
  tampa_2:    { blitz: 0.10, stacked_box: 0.12, two_high: 0.45, man_press: 0.08, soft_zone: 0.25 },
  blitz_34:   { blitz: 0.40, stacked_box: 0.22, two_high: 0.10, man_press: 0.20, soft_zone: 0.08 },
  zone_blitz: { blitz: 0.32, stacked_box: 0.15, two_high: 0.18, man_press: 0.05, soft_zone: 0.30 },
};
/** How much of the mix comes from the coordinator's scheme; the rest is the neutral mix. */
const SCHEME_SHARE = 0.6;

/** How many of the user's recent calls the defense remembers. */
export const TENDENCY_WINDOW = 8;
const TENDENCY_MIN_CALLS = 4;

export interface LookSituation {
  down: number;
  yardsToGo: number;
  /** Yards from the offense's own end zone */
  fieldPos: number;
  quarter: number;
  timeSecs: number;
  /** Offense score minus defense score */
  offenseLead: number;
  scheme?: DefensiveScheme | null;
  /** The user's most recent play calls, oldest first */
  recentCalls?: LookPlay[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The chance of each look in this situation (sums to 1). */
export function lookWeights(s: LookSituation): Record<DefensiveLook, number> {
  const scheme = s.scheme ? SCHEME_WEIGHTS[s.scheme] : null;
  const w = {} as Record<DefensiveLook, number>;
  for (const k of DEFENSIVE_LOOKS) {
    w[k] = scheme ? SCHEME_SHARE * scheme[k] + (1 - SCHEME_SHARE) * NEUTRAL_WEIGHTS[k] : NEUTRAL_WEIGHTS[k];
  }

  // Down and distance
  if (s.yardsToGo <= 2) { w.stacked_box *= 2.0; w.two_high *= 0.6; w.soft_zone *= 0.4; }
  else if (s.yardsToGo >= 15) { w.soft_zone *= 1.8; w.stacked_box *= 0.3; }
  else if (s.down >= 3 && s.yardsToGo >= 7) { w.blitz *= 1.5; w.two_high *= 1.4; w.soft_zone *= 1.3; w.stacked_box *= 0.3; }
  // Short field: no room to play deep
  if (s.fieldPos >= 90) { w.two_high *= 0.5; w.man_press *= 1.4; w.stacked_box *= 1.3; }
  // Protecting a lead late: keep everything in front
  if (s.quarter >= 4 && s.timeSecs <= 120 && s.offenseLead < 0) { w.soft_zone *= 2.0; w.two_high *= 1.5; w.stacked_box *= 0.5; }

  // The defense adjusts to what the user keeps calling
  const calls = (s.recentCalls ?? []).slice(-TENDENCY_WINDOW);
  if (calls.length >= TENDENCY_MIN_CALLS) {
    const share = (...plays: LookPlay[]) => calls.filter(c => plays.includes(c)).length / calls.length;
    w.stacked_box *= clamp(1 + 2 * (share('run', 'qb_run') - 0.4), 0.5, 2.2);
    w.two_high *= clamp(1 + 3 * (share('pass_deep') - 0.2), 0.5, 2.5);
    w.man_press *= clamp(1 + 2 * (share('pass_short', 'screen') - 0.4), 0.5, 2.2);
  }

  const total = DEFENSIVE_LOOKS.reduce((sum, k) => sum + w[k], 0);
  for (const k of DEFENSIVE_LOOKS) w[k] /= total;
  return w;
}

export function pickDefensiveLook(s: LookSituation, rand: () => number = Math.random): DefensiveLook {
  const w = lookWeights(s);
  let r = rand();
  for (const k of DEFENSIVE_LOOKS) { r -= w[k]; if (r < 0) return k; }
  return 'soft_zone';
}

// ── Calling the defense ──
/**
 * When the user calls the defense the roles flip. The CPU offense lines up in a set, the user answers with one of the
 * same five looks, and the CPU's play is resolved against that look with the same table (so a look that an offensive
 * call beats is, from the other sideline, the wrong defensive call against that play).
 *
 * The set is the read. The CPU's play is chosen exactly as before; the set is then drawn from SET_GIVEN_PLAY, so it
 * leans toward the play without giving it away. Showing a set never changes what the CPU runs, and a user who picks
 * looks in the neutral mix allows, on average, what the defense allowed before (the table is zero-sum against it).
 */
export type OffensiveSet = 'heavy' | 'balanced' | 'spread' | 'max_protect';
/** The scrimmage plays the CPU offense calls. */
export type CpuPlay = 'run' | 'pass_short' | 'pass_deep';

export const OFFENSIVE_SETS: OffensiveSet[] = ['heavy', 'balanced', 'spread', 'max_protect'];

export const SET_INFO: Record<OffensiveSet, { label: string; icon: string; read: string }> = {
  heavy:       { label: 'Heavy',       icon: '🐘', read: 'Two tight ends and a fullback. They are built to run it.' },
  balanced:    { label: 'Balanced',    icon: '⚖️', read: 'One back, receivers on both sides. It could be anything.' },
  spread:      { label: 'Spread',      icon: '↔️', read: 'Four wide in the shotgun. The ball is probably coming out quick.' },
  max_protect: { label: 'Max Protect', icon: '🧤', read: 'Extra blockers are staying in. They want time to throw deep.' },
};

/** The chance of each set given the play the CPU has already chosen (each row sums to 1). */
export const SET_GIVEN_PLAY: Record<CpuPlay, Record<OffensiveSet, number>> = {
  run:        { heavy: 0.45, balanced: 0.40, spread: 0.12, max_protect: 0.03 },
  pass_short: { heavy: 0.08, balanced: 0.37, spread: 0.50, max_protect: 0.05 },
  pass_deep:  { heavy: 0.05, balanced: 0.30, spread: 0.30, max_protect: 0.35 },
};

export function pickOffensiveSet(play: CpuPlay, rand: () => number = Math.random): OffensiveSet {
  const w = SET_GIVEN_PLAY[play];
  let r = rand();
  for (const k of OFFENSIVE_SETS) { r -= w[k]; if (r < 0) return k; }
  return 'balanced';
}

/** What each look is for when the user is the one calling it (the defense menu's button captions). */
export const LOOK_CALL_INFO: Record<DefensiveLook, { stops: string; risk: string }> = {
  blitz:       { stops: 'Gets home on a deep drop', risk: 'a quick throw beats it' },
  stacked_box: { stops: 'Stuffs the run',           risk: 'open deep' },
  two_high:    { stops: 'Takes away the deep ball', risk: 'soft against the run' },
  man_press:   { stops: 'Smothers short throws',    risk: 'can be beaten deep' },
  soft_zone:   { stops: 'Keeps the deep ball in front', risk: 'gives up the short pass' },
};

// ── Showing a look on the field ──
/**
 * Where the back seven stand before the snap in each look, so a look can be SEEN (the 3D sim lines the defenders up
 * this way; the 2D field draws them at the line). Each man is [x, depth]: x = yards across from the ball (negative is
 * the offense's left), depth = yards off the line of scrimmage. Order: linebackers left / middle / right, corners
 * left / right, safeties left / right. The four linemen never move.
 *
 * The 3D sim is plain JS and cannot import this, so it carries the same table (public/chase-cam/index.html, LOOKS).
 * tests/integration/football-look-alignment.test.ts fails if the two drift apart.
 */
export interface LookAlignment { lb: [number, number][]; cb: [number, number][]; s: [number, number][] }

export const DL_ALIGNMENT: [number, number][] = [[-6.4, 1.7], [-2.2, 1.7], [2.2, 1.7], [6.4, 1.7]];

export const LOOK_ALIGNMENT: Record<DefensiveLook, LookAlignment> = {
  // backers walked up into the gaps, one safety creeping down
  blitz:       { lb: [[-4.3, 2.2], [0, 2.4], [4.3, 2.2]], cb: [[-20, 6.5], [19.5, 6.5]], s: [[-3, 11.5], [8, 7.5]] },
  // backers tight, a safety down as the eighth man, the other alone deep
  stacked_box: { lb: [[-5, 3.3], [0, 3.3], [5, 3.3]], cb: [[-20, 6.5], [19.5, 6.5]], s: [[0, 14], [8.5, 4.2]] },
  // both safeties deep and wide, a light box
  two_high:    { lb: [[-5, 5.2], [0, 5.2], [5, 5.2]], cb: [[-20, 6.5], [19.5, 6.5]], s: [[-12, 15], [12, 15]] },
  // corners up on the receivers, a safety down over the slot, one deep
  man_press:   { lb: [[-5, 4.8], [0, 4.8], [5, 4.8]], cb: [[-20, 1.6], [19.5, 1.6]], s: [[-11.5, 4.5], [1, 13]] },
  // everyone backed off
  soft_zone:   { lb: [[-7, 6.3], [0, 6.3], [7, 6.3]], cb: [[-20, 9.5], [19.5, 9.5]], s: [[-10, 16], [10, 16]] },
};

/** All eleven defenders in a look, front to back. */
export function lookDefenders(look: DefensiveLook): { x: number; depth: number; unit: 'dl' | 'lb' | 'cb' | 's' }[] {
  const a = LOOK_ALIGNMENT[look];
  const men = (unit: 'dl' | 'lb' | 'cb' | 's', list: [number, number][]) => list.map(([x, depth]) => ({ x, depth, unit }));
  return [...men('dl', DL_ALIGNMENT), ...men('lb', a.lb), ...men('cb', a.cb), ...men('s', a.s)];
}
