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
      writeAsyncError({
        kind: 'unhandledrejection',
        message: reason instanceof Error ? reason.message : String(reason),
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
