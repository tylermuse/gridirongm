'use client';

/**
 * @bs/core/analytics — anonymous event tracking + page-view hook.
 *
 * Promoted from apps/web/src/lib/analytics.ts during Sub-phase 1D.
 *
 * Consumers must provide:
 *   - A React-compatible context (this is a 'use client' module)
 *   - A POST handler at /api/analytics/track — use createTrackHandler() from
 *     @bs/core/analytics/server, which accepts the batched payload
 *
 * Non-React code (stores, engines) should import from @bs/core/analytics/track
 * instead, which has no React / next/navigation dependency.
 *
 * The hook + function are sport-agnostic, which is why they live here rather
 * than in @bs/sport-football.
 */

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

import { trackEvent } from './track';

export { trackEvent, flushEvents } from './track';

const AUTH_EVENT_KEY = 'gg-auth-event';
/** Collapse repeated SIGNED_IN callbacks for the same user into one event. */
const AUTH_EVENT_WINDOW_MS = 30 * 60 * 1000;

/**
 * Emit exactly one `signup` or `login` event per user per 30-minute window.
 *
 * supabase-js fires `SIGNED_IN` from onAuthStateChange far more often than a
 * human "logs in" — on initial session hydration, on token refresh, and every
 * time a background tab regains focus. Tracking that callback directly made a
 * single sign-in show up as 3-4 `login` rows from one device_id.
 *
 * Dedupe lives in localStorage (not sessionStorage) so a user with the game
 * open in several tabs still only counts once.
 */
export function trackAuthEvent(user: {
  id: string;
  created_at: string;
  last_sign_in_at?: string | null;
}) {
  try {
    const raw = localStorage.getItem(AUTH_EVENT_KEY);
    if (raw) {
      const prev = JSON.parse(raw) as { id?: string; at?: number };
      if (prev.id === user.id && Date.now() - (prev.at ?? 0) < AUTH_EVENT_WINDOW_MS) {
        return; // already counted this sign-in
      }
    }
    localStorage.setItem(AUTH_EVENT_KEY, JSON.stringify({ id: user.id, at: Date.now() }));
  } catch {
    // Private mode / storage disabled — fall through and track. Better to
    // over-count in a rare case than to lose the event entirely.
  }

  // First-ever sign-in: the account was created at essentially the same moment
  // it was signed into. The old check ("created less than 60s ago") misfired on
  // slow first sessions, logging real signups as `login` and deflating the
  // conversion-rate denominator.
  const createdAt = new Date(user.created_at).getTime();
  const lastSignIn = user.last_sign_in_at
    ? new Date(user.last_sign_in_at).getTime()
    : createdAt;
  const isNewUser = Math.abs(lastSignIn - createdAt) < 10_000;

  trackEvent(isNewUser ? 'signup' : 'login');
}

/** Clear the auth dedupe marker so the next sign-in is counted. */
export function clearAuthEventDedupe() {
  try {
    localStorage.removeItem(AUTH_EVENT_KEY);
  } catch { /* ignore */ }
}

/** Track page views on route changes. Call once in a root provider. */
export function usePageView() {
  const pathname = usePathname();
  const prev = useRef<string | null>(null);

  useEffect(() => {
    if (pathname === prev.current) return;
    prev.current = pathname;
    trackEvent('page_view', { path: pathname });
  }, [pathname]);

  // Track session start once per browser session
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem('gg_session')) return;
    sessionStorage.setItem('gg_session', '1');
    trackEvent('session_start');
  }, []);
}
