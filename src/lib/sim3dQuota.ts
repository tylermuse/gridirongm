/**
 * Weekly 3D live-game allowance for free players — an A/B test, started 2026-11-23.
 *
 * Why: free 3D drives retention (Nov 6 launch read: 3D-on devices came back after 7+ days ~2x as often), but since
 * 3D went free, half of new subscribers were heavy 3D users who never hit a reason to pay. Free-device usage the two
 * weeks before this shipped: median 1 game/week, 75th pct 2–3, 90th pct 7; a cap of 3 reaches ~17–20% of free devices.
 *
 * How it works (client only — this is a conversion test, not a security boundary):
 * - A free device is put once, at random, in arm 'cap' (3 live 3D games a week) or 'control' (unlimited, as before).
 * - A game counts against the week only once the player has watched a full quarter of it in 3D, so a game that merely
 *   opens with 3D on (the default-on test) doesn't burn the allowance. Re-opening a counted game is free.
 * - Never counted: exhibitions, and the device's first-ever 3D game.
 * - Never a mid-game cut-off: the check runs when a game opens. A game already counted, or started with allowance
 *   left, plays out in 3D to the final whistle.
 * - Weeks run Monday 00:00 to Sunday 23:59 in the browser's local time.
 *
 * Results: compare arms on sim3d_game_view / sim3d_quota_* events and subscriptions (cap_arm is on every event).
 * Set SIM3D_CAP_TEST to false to stop enrolling; devices already enrolled keep their arm so the read stays clean.
 * Set SIM3D_CAP_ENFORCE to false to turn the cap off for everyone without losing the arm labels.
 */
export const SIM3D_CAP_TEST = true;
export const SIM3D_CAP_ENFORCE = true;
export const SIM3D_WEEKLY_FREE_GAMES = 3;

const ARM_KEY = 'bsgm.sim3dCap.arm';
const WEEK_KEY = 'bsgm.sim3dCap.week';   // JSON { week: 'YYYY-MM-DD' (Monday), games: string[] }

export type Sim3DCapArm = 'cap' | 'control';

/** This device's cap-test arm, assigning one if it's eligible; null = not in the test. Client only. */
export function sim3dCapArm(): Sim3DCapArm | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = window.localStorage.getItem(ARM_KEY);
    if (saved === 'cap' || saved === 'control') return saved;
    if (!SIM3D_CAP_TEST) return null;
    const arm: Sim3DCapArm = Math.random() < 0.5 ? 'cap' : 'control';
    window.localStorage.setItem(ARM_KEY, arm);
    return arm;
  } catch { return null; }
}

/** Monday of the current local week, as YYYY-MM-DD. */
export function currentWeekKey(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysSinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Game ids counted against this week's allowance. Client only. */
export function countedGamesThisWeek(now: Date = new Date()): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(WEEK_KEY) || 'null') as { week?: string; games?: unknown } | null;
    if (!raw || raw.week !== currentWeekKey(now) || !Array.isArray(raw.games)) return [];
    return raw.games.filter((g): g is string => typeof g === 'string');
  } catch { return []; }
}

/** Count a game against this week. Idempotent per game id. Returns the week's count after the call. Client only. */
export function countGame(gameId: string, now: Date = new Date()): number {
  const games = countedGamesThisWeek(now);
  if (games.includes(gameId)) return games.length;
  const next = [...games, gameId];
  try { window.localStorage.setItem(WEEK_KEY, JSON.stringify({ week: currentWeekKey(now), games: next })); } catch { /* storage blocked */ }
  return next.length;
}

export interface Sim3DQuotaState {
  /** The cap applies to this device in this game (cap arm, free, not an exhibition, enforcement on). */
  capped: boolean;
  /** Games already counted this week (before this one, unless this one is counted). */
  used: number;
  /** Free 3D games left this week, never negative. */
  left: number;
  /** This game was already counted this week, so it stays watchable in 3D. */
  thisGameCounted: boolean;
  /** 3D is locked for this game: capped, out of games, and this game wasn't already counted. */
  blocked: boolean;
}

/** The allowance as it stands when a game opens. Pure apart from reading storage; client only. */
export function readSim3DQuota(opts: { gameId: string; isPremium: boolean; isExhibition: boolean; arm: Sim3DCapArm | null }): Sim3DQuotaState {
  const capped = SIM3D_CAP_ENFORCE && opts.arm === 'cap' && !opts.isPremium && !opts.isExhibition;
  const games = countedGamesThisWeek();
  const used = games.length;
  const thisGameCounted = games.includes(opts.gameId);
  const left = Math.max(0, SIM3D_WEEKLY_FREE_GAMES - used);
  return { capped, used, left, thisGameCounted, blocked: capped && left === 0 && !thisGameCounted };
}
