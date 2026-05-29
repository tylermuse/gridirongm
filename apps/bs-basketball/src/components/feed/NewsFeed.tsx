'use client';

/**
 * NewsFeed — vertical list of derived "league moments".
 *
 * Pure derivation from league state via buildFeed(). Game-related items
 * deep-link to the box score; player-related items open a PlayerModal.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildFeed } from '@/lib/feed/buildFeed';
import { PlayerModal } from '@/components/modals/PlayerModal';
import type { BasketballLeagueState } from '@/lib/persistence/db';

interface NewsFeedProps {
  league: BasketballLeagueState | null;
  /** Cap the number of items shown (e.g. sidebar). Omit for the full feed. */
  max?: number;
}

export function NewsFeed({ league, max }: NewsFeedProps) {
  const router = useRouter();
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null);

  const items = useMemo(() => {
    const all = buildFeed(league);
    return max ? all.slice(0, max) : all;
  }, [league, max]);

  if (items.length === 0) {
    return (
      <div className="text-center py-10 px-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="text-4xl mb-2">🌙</div>
        <div className="font-bold">Quiet night in the league</div>
        <p className="text-sm text-[var(--text-sec)] mt-1">Sim some games to see moments here.</p>
      </div>
    );
  }

  return (
    <>
      <ul className="space-y-2">
        {items.map(item => {
          const clickable = !!item.gameId || !!item.playerId;
          const onClick = () => {
            if (item.playerId) setModalPlayerId(item.playerId);
            else if (item.gameId) router.push(`/game/${item.gameId}`);
          };
          return (
            <li key={item.id}>
              <div
                onClick={clickable ? onClick : undefined}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onKeyDown={clickable ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
                className={`flex items-start gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] ${
                  clickable
                    ? 'cursor-pointer hover:border-[var(--accent)] hover:shadow-lg hover:shadow-[var(--accent-glow)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]'
                    : ''
                }`}
              >
                <span className="text-2xl leading-none shrink-0" aria-hidden>{item.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug">{item.headline}</p>
                  <span className="text-[11px] uppercase tracking-widest text-[var(--text-sec)]">
                    Day {Math.floor(item.day)}
                  </span>
                </div>
                {clickable && <span className="text-[var(--text-sec)] shrink-0">→</span>}
              </div>
            </li>
          );
        })}
      </ul>

      <PlayerModal playerId={modalPlayerId} onClose={() => setModalPlayerId(null)} />
    </>
  );
}
