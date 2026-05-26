'use client';

import { useEffect } from 'react';

/**
 * 5/22 silent-failure catcher (bige08676 5/20 data drop ruled out throw-based
 * failure on season rollover — entry+exit set, no error keys). Listen for
 * unhandled errors and promise rejections at the window level; if one fires
 * while a rollover is mid-flight (entry set, exit not set), write a
 * gg-rollover-async-error breadcrumb so /diagnostics can surface it.
 *
 * Outside the rollover window every listener is a no-op — we don't want to
 * pollute the breadcrumb with errors from unrelated user flows.
 */
export function RolloverErrorBeacon() {
  useEffect(() => {
    function midRollover(): boolean {
      try {
        return !!localStorage.getItem('gg-rollover-entry')
          && !localStorage.getItem('gg-rollover-exit');
      } catch {
        return false;
      }
    }

    function writeAsyncError(payload: Record<string, unknown>) {
      try {
        localStorage.setItem('gg-rollover-async-error', JSON.stringify({
          ts: new Date().toISOString(),
          ...payload,
        }));
      } catch { /* best-effort */ }
    }

    function onError(ev: ErrorEvent) {
      if (!midRollover()) return;
      const err = ev.error;
      writeAsyncError({
        kind: 'error',
        message: err instanceof Error ? err.message : (ev.message ?? String(err)),
        stack: err instanceof Error ? err.stack?.split('\n').slice(0, 6).join('\n') : undefined,
      });
    }

    function onRejection(ev: PromiseRejectionEvent) {
      if (!midRollover()) return;
      const reason = ev.reason;
      const name = reason instanceof Error ? reason.name : '';
      const message = reason instanceof Error ? reason.message : String(reason);

      // 5/25 (bige08676 fresh recapture msg 1508324042183151737):
      // AbortError with "steal" in the message comes from Supabase auth-js's
      // own orphaned-lock recovery path
      // (node_modules/@supabase/auth-js/dist/module/lib/locks.js:184). When
      // a prior tab/session holds the auth-storage lock past the acquireTimeout,
      // auth-js retries with { steal: true } — which forcibly aborts the prior
      // holder's request. That prior holder's promise then rejects with this
      // exact AbortError message, and if no `.catch()` is registered on it,
      // it surfaces here as an unhandled rejection.
      //
      // This is RECOVERABLE noise, NOT a rollover failure: Supabase's own
      // retry path completes successfully. Don't classify it as a rollover
      // soft-lock cause. Log to a separate breadcrumb for telemetry and
      // console.warn so we still see it, but don't write the headline
      // gg-rollover-async-error key.
      if (name === 'AbortError' && /steal/i.test(message)) {
        try {
          localStorage.setItem('gg-rollover-recoverable-error', JSON.stringify({
            ts: new Date().toISOString(),
            kind: 'supabase-lock-steal',
            message,
            stack: reason instanceof Error ? reason.stack?.split('\n').slice(0, 6).join('\n') : undefined,
          }));
        } catch { /* best-effort */ }
        console.warn('[RolloverErrorBeacon] filtered recoverable Supabase lock-steal AbortError mid-rollover:', message);
        return;
      }

      writeAsyncError({
        kind: 'unhandledrejection',
        message,
        stack: reason instanceof Error ? reason.stack?.split('\n').slice(0, 6).join('\n') : undefined,
        reason: typeof reason === 'string' ? reason : undefined,
      });
    }

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
