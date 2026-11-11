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
