'use client';

/**
 * Global player-modal plumbing.
 *
 * One <PlayerModal> instance lives at the app shell; anything rendered inside it
 * can pop a player's card by calling openPlayer(id) — no per-page modal state.
 * <PlayerName> is the sugar: render a player's name and it's clickable
 * everywhere, opening the card. Falls back to a plain span when there's no id
 * (e.g. a historical name we no longer have a player record for).
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { PlayerModal } from './PlayerModal';

interface PlayerModalContextValue {
  openPlayer: (playerId: string) => void;
}

const PlayerModalContext = createContext<PlayerModalContextValue | null>(null);

export function PlayerModalProvider({ children }: { children: ReactNode }) {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const value = useMemo<PlayerModalContextValue>(() => ({ openPlayer: setPlayerId }), []);
  return (
    <PlayerModalContext.Provider value={value}>
      {children}
      <PlayerModal playerId={playerId} onClose={() => setPlayerId(null)} />
    </PlayerModalContext.Provider>
  );
}

/** Open the shared player card imperatively. Safe no-op outside the provider. */
export function usePlayerModal(): (playerId: string) => void {
  const ctx = useContext(PlayerModalContext);
  return ctx?.openPlayer ?? (() => {});
}

interface PlayerNameProps {
  /** When absent, the name renders as plain (non-clickable) text. */
  playerId?: string | null;
  firstName?: string;
  lastName?: string;
  /** Override the rendered label (defaults to `firstName lastName`). */
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Stop click from bubbling to a parent row/card handler (default true). */
  stopPropagation?: boolean;
}

/**
 * A player's name that opens the shared player card on click. Drop-in for the
 * plain `{p.firstName} {p.lastName}` spans scattered through the app.
 */
export function PlayerName({
  playerId,
  firstName,
  lastName,
  children,
  className,
  style,
  stopPropagation = true,
}: PlayerNameProps) {
  const openPlayer = usePlayerModal();
  const label = children ?? `${firstName ?? ''} ${lastName ?? ''}`.trim();

  if (!playerId) {
    return <span className={className} style={style}>{label}</span>;
  }
  return (
    <button
      type="button"
      onClick={e => {
        if (stopPropagation) e.stopPropagation();
        openPlayer(playerId);
      }}
      className={`text-left hover:underline ${className ?? ''}`}
      style={style}
    >
      {label}
    </button>
  );
}
