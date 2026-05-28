'use client';

import { useEffect } from 'react';

/**
 * 5/27 silent-failure catcher for the "take over expansion team" flow.
 * bitter__pill (msg 1508516553270759667 + 1509108345976524851) reported
 * a fatal error after expansion drafting when choosing "Play as
 * [expansion team]" — unbypassable, on mobile. Original screenshot is
 * unread by the bug-triage MCP, and the breadth of his repro ("expansion
 * overall is unusable / tried different settings and years") suggests
 * it's not a one-off setting.
 *
 * Same playbook as RolloverErrorBeacon: listen for window-level errors
 * and unhandled promise rejections, but only write the breadcrumb when
 * the takeover is mid-flight (entry set, exit not set). Catches async
 * errors that surface AFTER the takeover handler redirects to "/" —
 * most likely candidate root cause, since the click handler itself is
 * synchronous and short.
 *
 * Outside the takeover window every listener is a no-op so we don't
 * pollute the breadcrumb with errors from unrelated user flows.
 */
export function ExpansionTakeoverErrorBeacon() {
  useEffect(() => {
    function midTakeover(): boolean {
      try {
        return !!localStorage.getItem('gg-expansion-takeover-entry')
          && !localStorage.getItem('gg-expansion-takeover-exit');
      } catch {
        return false;
      }
    }

    function writeAsyncError(payload: Record<string, unknown>) {
      try {
        localStorage.setItem('gg-expansion-takeover-async-error', JSON.stringify({
          ts: new Date().toISOString(),
          ...payload,
        }));
      } catch { /* best-effort */ }
    }

    function onError(ev: ErrorEvent) {
      if (!midTakeover()) return;
      const err = ev.error;
      writeAsyncError({
        kind: 'error',
        message: err instanceof Error ? err.message : (ev.message ?? String(err)),
        stack: err instanceof Error ? err.stack?.split('\n').slice(0, 6).join('\n') : undefined,
      });
    }

    function onRejection(ev: PromiseRejectionEvent) {
      if (!midTakeover()) return;
      const reason = ev.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
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
