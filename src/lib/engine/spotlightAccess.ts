/**
 * Spotlight access rules — the single place that decides who gets what.
 *
 *  - AI commentary (AI Spotlight topics + AI weekly recap): Premium only
 *    (founders/admins resolve to premium), and only when the league setting
 *    isn't explicitly OFF. Missing setting = ON.
 *  - Popup: same moments for every tier — the narrative moments from
 *    detectNarrativeMoment (preseason/week 1, trade deadline, season over /
 *    offseason transitions, playoffs). Never on ordinary weeks.
 *  - Podcast Listen button: state comes from server credits only.
 */
import type { NarrativeMoment } from './aiSpotlight';

export function aiCommentaryEnabled(setting: boolean | undefined, entitled: boolean): boolean {
  return entitled && setting !== false;
}

export function shouldShowSpotlightPopup(narrative: NarrativeMoment): boolean {
  return narrative !== 'weekly';
}

export type ListenState = 'checking' | 'signedOut' | 'locked' | 'exhausted' | 'ready';

export function listenState(a: {
  loading: boolean;
  signedIn: boolean;
  premium: boolean;
  /** -1 = uncapped (admin) */
  remaining: number;
}): ListenState {
  if (a.loading) return 'checking';
  if (!a.signedIn) return 'signedOut';
  if (!a.premium) return 'locked';
  if (a.remaining === 0) return 'exhausted';
  return 'ready';
}

/** When credits next reset: the stored reset time if still ahead, else the 1st of next month (UTC). */
export function nextCreditReset(resetAt: string | null, now: Date = new Date()): Date {
  if (resetAt) {
    const d = new Date(resetAt);
    if (d.getTime() > now.getTime()) return d;
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export function formatResetDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
