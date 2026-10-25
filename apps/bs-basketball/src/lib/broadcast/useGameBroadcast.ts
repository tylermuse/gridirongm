'use client';

/**
 * useGameBroadcast — per-event, audio-driven live broadcast (the Hoops port of
 * BS Football's Phase 2 hook).
 *
 * The audio is the clock. For each event from a starting index, the hook:
 *   1. reveals that event on screen (onShowPlay),
 *   2. plays its spoken call (or holds a short silent beat when it has none),
 *   3. only advances when the call finishes.
 *
 * Clips are fetched generate-ahead (the next few CALLED events are prefetched
 * while the current one plays). Because the reveal is gated on the audio, the
 * caller must disable its own playback timer while a broadcast is running.
 *
 * Differences from Football's hook: pause() really holds the loop (silent
 * beats and dwell included, so the halftime break can't leak plays), and an
 * autoplay block waits for the user's tap and retries the same clip instead
 * of ending the run.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BroadcastLine } from './gameBroadcast';
import { UNLOCK_AUDIO } from './unlockAudio';

export type BroadcastStatus =
  | 'idle'
  | 'buffering'   // fetching the clip we need to play next
  | 'playing'
  | 'paused'
  | 'blocked'     // browser blocked autoplay — needs a user tap
  | 'error'
  | 'done';

export interface StartOpts {
  /** Number of events in the game. */
  count: number;
  fromIndex: number;
  /** Spoken lines for the event at `i` ([] = reveal on a silent beat). */
  linesFor: (i: number) => BroadcastLine[];
  /** Reveal the event at this index on screen. */
  onShowPlay: (i: number) => void;
  /** Called after event `i`'s call (or silent beat) has finished. */
  onCallDone?: (i: number) => void;
  /** Called once the last event has been revealed and called. */
  onDone?: () => void;
  /** Dwell (ms) after each call — read live so the speed control still paces
   *  a broadcast (slower = longer gaps; a call is never cut off). */
  postClipDelayMs?: () => number;
  /** On-screen beat (ms) for an event with no call — read live. */
  silentBeatMs?: (i: number) => number;
}

export interface GameBroadcast {
  status: BroadcastStatus;
  playIndex: number;
  error: string | null;
  /** Server error code (e.g. 'premium_required', 'not_configured'). */
  errorCode: string | null;
  start: (opts: StartOpts) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

const DEFAULT_SILENT_BEAT_MS = 300;
/** How many upcoming called events to prefetch. */
const PREFETCH = 2;

class ClipError extends Error {
  constructor(message: string, public code: string | null) { super(message); }
}

async function fetchClip(lines: BroadcastLine[], signal: AbortSignal): Promise<string> {
  const res = await fetch('/api/game-audio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lines }),
    signal,
  });
  if (!res.ok) {
    let msg = `Audio request failed (${res.status})`;
    let code: string | null = null;
    try { const b = await res.json(); if (b?.error) msg = b.error; if (b?.code) code = b.code; } catch { /* non-JSON */ }
    throw new ClipError(msg, code);
  }
  return URL.createObjectURL(await res.blob());
}

export function useGameBroadcast(): GameBroadcast {
  const [status, setStatus] = useState<BroadcastStatus>('idle');
  const [playIndex, setPlayIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);
  const optsRef = useRef<StartOpts | null>(null);
  const pausedRef = useRef(false);
  const blockedRef = useRef(false);
  const waitersRef = useRef<(() => void)[]>([]);
  // index → promise of blob URL (null = no call for that event)
  const clipCacheRef = useRef<Map<number, Promise<string | null>>>(new Map());

  const wake = useCallback(() => {
    const w = waitersRef.current;
    waitersRef.current = [];
    w.forEach(fn => fn());
  }, []);

  const cleanup = useCallback(() => {
    runIdRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    pausedRef.current = false;
    blockedRef.current = false;
    wake();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.removeAttribute('src'); }
    for (const p of clipCacheRef.current.values()) {
      p.then(url => { if (url) URL.revokeObjectURL(url); }).catch(() => {});
    }
    clipCacheRef.current.clear();
  }, [wake]);

  useEffect(() => cleanup, [cleanup]);

  /** Resolves immediately unless paused; otherwise on resume (or stop). */
  const whileHeld = useCallback(() => new Promise<void>(resolve => {
    if (!pausedRef.current) resolve(); else waitersRef.current.push(resolve);
  }), []);

  const ensureClip = useCallback((index: number): Promise<string | null> => {
    const cache = clipCacheRef.current;
    const hit = cache.get(index);
    if (hit) return hit;
    const opts = optsRef.current!;
    const lines = index < opts.count ? opts.linesFor(index) : [];
    const p: Promise<string | null> = lines.length === 0
      ? Promise.resolve(null)
      : fetchClip(lines, abortRef.current!.signal);
    p.catch(() => {}); // surfaced when awaited
    cache.set(index, p);
    return p;
  }, []);

  /** Prefetch the next PREFETCH called events after `i`. */
  const prefetchAfter = useCallback((i: number) => {
    const opts = optsRef.current!;
    let found = 0;
    for (let j = i + 1; j < opts.count && found < PREFETCH && j < i + 40; j++) {
      if (clipCacheRef.current.has(j)) { found++; continue; }
      if (opts.linesFor(j).length) { ensureClip(j); found++; }
    }
  }, [ensureClip]);

  const playUrl = useCallback((url: string): Promise<void> => new Promise((resolve, reject) => {
    const audio = audioRef.current!;
    const done = () => { audio.removeEventListener('ended', done); audio.removeEventListener('error', fail); resolve(); };
    const fail = () => { audio.removeEventListener('ended', done); audio.removeEventListener('error', fail); reject(new Error('playback error')); };
    audio.addEventListener('ended', done);
    audio.addEventListener('error', fail);
    audio.src = url;
    audio.play().catch(err => { audio.removeEventListener('ended', done); audio.removeEventListener('error', fail); reject(err); });
  }), []);

  const delay = useCallback(async (ms: number, myRun: number) => {
    const end = Date.now() + ms;
    while (runIdRef.current === myRun) {
      await whileHeld();
      const left = end - Date.now();
      if (left <= 0) return;
      await new Promise(r => setTimeout(r, Math.min(left, 100)));
    }
  }, [whileHeld]);

  const runLoop = useCallback(async (from: number) => {
    const myRun = runIdRef.current;
    const opts = optsRef.current!;
    for (let i = from; i < opts.count; i++) {
      await whileHeld();
      if (runIdRef.current !== myRun) return;
      opts.onShowPlay(i);
      setPlayIndex(i);
      prefetchAfter(i);
      let url: string | null;
      try {
        if (opts.linesFor(i).length) setStatus('buffering');
        url = await ensureClip(i);
      } catch (e) {
        if (runIdRef.current !== myRun || (e as Error).name === 'AbortError') return;
        setError((e as Error).message);
        setErrorCode(e instanceof ClipError ? e.code : null);
        setStatus('error');
        return;
      }
      if (runIdRef.current !== myRun) return;
      if (!url) {
        if (!pausedRef.current) setStatus('playing');
        await delay(opts.silentBeatMs?.(i) ?? DEFAULT_SILENT_BEAT_MS, myRun);
        if (runIdRef.current === myRun) opts.onCallDone?.(i);
        continue;
      }
      // Play the call; an autoplay block waits for the user's tap and retries.
      for (;;) {
        await whileHeld();
        if (runIdRef.current !== myRun) return;
        try {
          setStatus('playing');
          await playUrl(url);
          break;
        } catch (e) {
          if (runIdRef.current !== myRun) return;
          if ((e as Error).name === 'NotAllowedError') {
            pausedRef.current = true;
            blockedRef.current = true;
            setStatus('blocked');
            continue;
          }
          if ((e as Error).name === 'AbortError') continue; // src swapped by a pause/resume race
          setError((e as Error).message); setErrorCode(null); setStatus('error');
          return;
        }
      }
      opts.onCallDone?.(i);
      const dwell = opts.postClipDelayMs?.() ?? 0;
      if (dwell > 0) await delay(dwell, myRun);
    }
    if (runIdRef.current === myRun) { setStatus('done'); opts.onDone?.(); }
  }, [delay, ensureClip, playUrl, prefetchAfter, whileHeld]);

  const start = useCallback((opts: StartOpts) => {
    cleanup();
    if (opts.count === 0 || opts.fromIndex >= opts.count) return;
    if (!audioRef.current) audioRef.current = new Audio();
    // Phones only let audio start inside the tap: start (unlock) the element
    // now with a silent clip, and the same element plays every call after.
    const audio = audioRef.current;
    audio.src = UNLOCK_AUDIO;
    audio.play().catch(() => { /* unlock only */ });
    abortRef.current = new AbortController();
    optsRef.current = opts;
    setError(null);
    setErrorCode(null);
    setPlayIndex(opts.fromIndex);
    setStatus('buffering');
    runLoop(opts.fromIndex);
  }, [cleanup, runLoop]);

  const pause = useCallback(() => {
    if (!optsRef.current) return;
    pausedRef.current = true;
    audioRef.current?.pause();
    setStatus(s => (s === 'playing' || s === 'buffering' ? 'paused' : s));
  }, []);

  const resume = useCallback(() => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    const audio = audioRef.current;
    if (audio && blockedRef.current) {
      // Autoplay was refused: play the silent clip inside this tap to unlock
      // the element, then the loop retries the call on it.
      blockedRef.current = false;
      audio.src = UNLOCK_AUDIO;
      audio.play().catch(() => { /* unlock only */ });
    } else if (audio && audio.src && !audio.src.startsWith('data:') && !audio.ended && audio.currentTime > 0) {
      // Mid-call: pick the clip back up where it stopped.
      audio.play().catch(() => { pausedRef.current = true; setStatus('blocked'); });
    }
    setStatus(s => (s === 'paused' || s === 'blocked' ? 'playing' : s));
    wake();
  }, [wake]);

  const stop = useCallback(() => {
    cleanup();
    optsRef.current = null;
    setStatus('idle');
    setPlayIndex(0);
  }, [cleanup]);

  return { status, playIndex, error, errorCode, start, pause, resume, stop };
}
