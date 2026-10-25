'use client';

/**
 * One-shot spoken segment (pregame show, halftime breakdown): tap to have
 * Marcus & Tony record + play it, tap again to stop. Mirrors BS Football's
 * halftime audio button: phones only let audio start inside the tap, so the
 * tap unlocks the element with a silent clip right away and the same element
 * plays the segment when the (slow) generation request returns.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { UNLOCK_AUDIO } from './unlockAudio';

export type SegmentAudioState = 'idle' | 'loading' | 'playing' | 'error';

export interface SegmentAudio {
  state: SegmentAudioState;
  errorCode: string | null;
  /** Start (or stop, if playing) the segment voiced from these lines. */
  toggle: (lines: { speaker: 'marcus' | 'tony'; text: string }[]) => void;
  stop: () => void;
}

/** Point the element at `src` and play it (module-level so the element is
 *  mutated outside React's render-tracked values). */
function playOn(audio: HTMLAudioElement, src: string, onEnded?: () => void): Promise<void> {
  if (onEnded) audio.onended = onEnded;
  audio.src = src;
  audio.currentTime = 0;
  return audio.play();
}

export function useSegmentAudio(endpoint: string): SegmentAudio {
  const [state, setState] = useState<SegmentAudioState>('idle');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // The last generated segment (keyed by its lines), so a replay is instant.
  const cacheRef = useRef<{ key: string; url: string } | null>(null);
  const wantedRef = useRef(false);

  const stop = useCallback(() => {
    wantedRef.current = false;
    audioRef.current?.pause();
    setState(s => (s === 'playing' || s === 'loading' ? 'idle' : s));
  }, []);

  useEffect(() => () => {
    audioRef.current?.pause();
    if (cacheRef.current) URL.revokeObjectURL(cacheRef.current.url);
  }, []);

  const toggle = useCallback((lines: { speaker: 'marcus' | 'tony'; text: string }[]) => {
    const audio = audioRef.current ?? (audioRef.current = new Audio());
    if (state === 'playing') { stop(); return; }
    if (state === 'loading') return;
    wantedRef.current = true;
    const onEnded = () => setState('idle');
    const key = JSON.stringify(lines);
    if (cacheRef.current?.key === key) {
      playOn(audio, cacheRef.current.url, onEnded).then(() => setState('playing')).catch(() => setState('error'));
      return;
    }
    playOn(audio, UNLOCK_AUDIO).catch(() => { /* unlock only */ });
    setState('loading');
    setErrorCode(null);
    (async () => {
      try {
        const res = await fetch(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lines }),
        });
        if (!res.ok) {
          let code: string | null = null;
          try { code = (await res.json())?.code ?? null; } catch { /* non-JSON */ }
          setErrorCode(code ?? `http_${res.status}`);
          setState('error');
          return;
        }
        const url = URL.createObjectURL(await res.blob());
        if (cacheRef.current) URL.revokeObjectURL(cacheRef.current.url);
        cacheRef.current = { key, url };
        if (!wantedRef.current) { setState('idle'); return; }
        await playOn(audio, url, onEnded);
        setState('playing');
      } catch {
        setState('error');
      }
    })();
  }, [endpoint, state, stop]);

  return { state, errorCode, toggle, stop };
}
