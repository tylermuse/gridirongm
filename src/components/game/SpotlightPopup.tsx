'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useGameStore } from '@/lib/engine/store';
import { COMMENTATORS } from '@/lib/engine/debate';

/**
 * Floating corner popup that nudges the user to check the Team Spotlight on the dashboard.
 * Rendered inside GameShell so it appears on every page.
 * Dismissible per session (resets on page reload).
 */
export function SpotlightPopup() {
  const router = useRouter();
  const pathname = usePathname();
  const { teams, userTeamId, schedule } = useGameStore();

  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);

  const userTeam = teams.find(t => t.id === userTeamId);
  const gamesPlayed = userTeam ? userTeam.record.wins + userTeam.record.losses : 0;

  // Slide-in animation after a short delay
  useEffect(() => {
    if (dismissed || gamesPlayed === 0) return;
    const t = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(t);
  }, [dismissed, gamesPlayed]);

  // Don't render if no games played, dismissed, or no team
  if (dismissed || gamesPlayed === 0 || !userTeam) return null;

  function handleClick() {
    setDismissed(true);
    if (pathname === '/') {
      // Already on dashboard — dispatch a custom event so the dashboard can scroll to spotlight
      window.dispatchEvent(new CustomEvent('scroll-to-spotlight'));
    } else {
      // Navigate to dashboard with a hash so it knows to scroll
      router.push('/?spotlight=1');
    }
  }

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 transition-all duration-500 ${visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}
    >
      <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl shadow-black/10 overflow-hidden max-w-xs">
        {/* Dismiss X */}
        <button
          onClick={(e) => { e.stopPropagation(); setDismissed(true); }}
          className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded-full text-[var(--text-sec)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors text-xs"
          aria-label="Dismiss"
        >
          ✕
        </button>

        <button onClick={handleClick} className="w-full text-left p-3 hover:bg-[var(--surface-2)] transition-colors">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-lg shrink-0">
              🎬
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight">Team Spotlight</p>
              <p className="text-xs text-[var(--text-sec)] leading-tight mt-0.5">
                {COMMENTATORS.stats.avatar} {COMMENTATORS.stats.name} & {COMMENTATORS.hottake.avatar} {COMMENTATORS.hottake.name} break down the {userTeam.name}
              </p>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1 text-[10px] text-blue-600 font-semibold">
            <span>Watch Now</span>
            <span>→</span>
          </div>
        </button>
      </div>
    </div>
  );
}
