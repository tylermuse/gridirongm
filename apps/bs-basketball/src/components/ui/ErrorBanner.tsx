'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useLeagueStore } from '@/lib/store/leagueStore';

/**
 * Error banner (Sim-Day blocker, Fix 3). The store already records the last
 * error on every failed action, but nothing surfaced it — a failed sim looked
 * like "nothing happened." This renders that error as a dismissible bar so a
 * failure is always visible (and copy-pasteable for a bug report).
 *
 * EPIC-A: clear the error on pathname change. A failed sim or import is
 * relevant on the page that triggered it; once the user navigates somewhere
 * unrelated, a lingering red banner is more noise than signal. The store still
 * holds the last error string until then for copy-paste recovery.
 */
export function ErrorBanner() {
  const { error, clearError } = useLeagueStore();
  const pathname = usePathname();
  useEffect(() => {
    // Only clear on actual nav (not on the very first render).
    if (error) clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  if (!error) return null;

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] w-[min(92vw,40rem)] bs-animate-fade" role="alert">
      <div
        className="flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg"
        style={{ background: 'var(--surface)', borderColor: '#dc2626' }}
      >
        <span aria-hidden className="text-lg leading-none mt-0.5">⚠️</span>
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-bold" style={{ color: '#dc2626' }}>Something went wrong</div>
          <div className="text-[var(--text)] break-words">{error}</div>
        </div>
        <button
          onClick={clearError}
          className="shrink-0 text-[var(--text-sec)] hover:text-[var(--text)] text-lg leading-none"
          title="Dismiss"
          aria-label="Dismiss error"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
