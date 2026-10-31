'use client';

/**
 * `live_game_view` / `live_game_finished` for the live game viewer
 * (components/live/LiveViewer.tsx — the single surface every Watch Live,
 * playoff watch and box-score replay goes through).
 *
 *   live_game_view      once per opened viewing, when the game has events
 *   live_game_finished  once per viewing, the first time playback reaches the
 *                       final (ended_by 'skipped' if Max speed / Skip to final
 *                       got it there, else 'played'). Exiting early sends
 *                       nothing — an abandoned viewing is a view with no finish.
 *
 * Re-renders, seeking back and replaying to the end again, or React StrictMode
 * re-running effects never re-send: both are latched per game id in refs that
 * live as long as the viewer is mounted. Closing and reopening the viewer is a
 * new viewing.
 */

import { useCallback, useEffect, useRef } from 'react';
import { trackEvent } from '@bs/core/analytics/track';

export interface LiveGameTelemetryInput {
  gameId: string;
  /** The game resolved and has play-by-play events to show. */
  ready: boolean;
  /** Playback is at the final event. */
  atEnd: boolean;
  /** 'live' = the user's own just-simmed game (Watch Live); 'replay' = re-watch
   *  from the box score. */
  mode: 'live' | 'replay';
  playoff: boolean;
  /** Replaying the engine's real possession log (vs. box-score reconstruction). */
  realLog: boolean;
}

export function useLiveGameTelemetry({ gameId, ready, atEnd, mode, playoff, realLog }: LiveGameTelemetryInput): {
  /** Call when the user jumps straight to the final (Max speed / Skip to final). */
  markSkipped: () => void;
} {
  const viewedRef = useRef<string | null>(null);
  const finishedRef = useRef<string | null>(null);
  const skippedRef = useRef(false);

  useEffect(() => {
    if (!ready || viewedRef.current === gameId) return;
    viewedRef.current = gameId;
    skippedRef.current = false;
    trackEvent('live_game_view', { game_id: gameId, mode, playoff, real_log: realLog });
  }, [ready, gameId, mode, playoff, realLog]);

  useEffect(() => {
    if (!ready || !atEnd || viewedRef.current !== gameId || finishedRef.current === gameId) return;
    finishedRef.current = gameId;
    trackEvent('live_game_finished', {
      game_id: gameId,
      mode,
      playoff,
      ended_by: skippedRef.current ? 'skipped' : 'played',
    });
  }, [ready, atEnd, gameId, mode, playoff]);

  const markSkipped = useCallback(() => { skippedRef.current = true; }, []);
  return { markSkipped };
}
