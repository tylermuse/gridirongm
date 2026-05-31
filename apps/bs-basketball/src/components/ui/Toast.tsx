'use client';

import { useEffect } from 'react';
import { useLeagueStore } from '@/lib/store/leagueStore';

/**
 * Sim-result toast (Tier 2.3). Reads the transient `simToast` the store sets
 * after each sim and auto-dismisses after a few seconds. The store writes a new
 * object every sim, so re-simming re-triggers the display.
 */
export function SimToast() {
  const { simToast, dismissToast } = useLeagueStore();

  useEffect(() => {
    if (!simToast) return;
    const id = window.setTimeout(() => dismissToast(), 3200);
    return () => window.clearTimeout(id);
  }, [simToast, dismissToast]);

  if (!simToast) return null;

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bs-animate-fade" role="status">
      <button
        onClick={dismissToast}
        className="flex items-center gap-2 px-4 py-2 rounded-full border shadow-lg text-sm font-semibold"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        title="Dismiss"
      >
        <span aria-hidden>🏀</span>
        <span className="text-[var(--text)]">{simToast.text}</span>
      </button>
    </div>
  );
}
