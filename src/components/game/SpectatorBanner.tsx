'use client';

import { useGameStore } from '@/lib/engine/store';

export function useIsSpectator(): boolean {
  return useGameStore(s => s.isSpectator ?? false);
}

export function SpectatorBanner() {
  const isSpectator = useIsSpectator();
  if (!isSpectator) return null;
  return (
    <div className="mb-4 px-4 py-2.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-700 text-xs sm:text-sm flex items-center gap-2">
      <span className="text-base">👁️</span>
      <span><strong className="font-bold">Spectator mode</strong> — observing only. Roster moves, trades, and draft picks are AI-only in this league.</span>
    </div>
  );
}
