'use client';

/**
 * useGameBroadcast — per-event, audio-driven live broadcast (the Hoops port of
 * BS Football's hook).
 *
 * The audio is the clock. For each event from a starting index, the hook:
 *   1. waits for that event's spoken call to be ready,
 *   2. reveals it on screen (onShowPlay) and plays the call (or holds a short
 *      silent beat when it has none),
 *   3. only advances when the call finishes.
 *
 * Clips are fetched generate-ahead (the next few CALLED events are prefetched
 * while the current one plays). Because the reveal is gated on the audio, the
 * caller must disable its own playback timer while a broadcast is running.
 *
 * pause() really holds the loop (silent beats and dwell included, so the
 * halftime break can't leak plays), and an autoplay block waits for the user's
 * tap and retries the same clip instead of ending the run.
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
  /** Lets Court Cam hold the voice back: 'call' is polled before speaking event
   *  `i` (no spoiling a possession still running), 'next' before moving on. */
  gate?: (stage: 'call' | 'next', i: number) => boolean;
  /** Could Court Cam pick this event up? Only then is it given a moment to. */
  willAnimate?: (i: number) => boolean;
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
/** A call that failed to load gets a longer beat, so the event can still be read. */
const FAILED_CLIP_BEAT_MS = 1500;
/** Only say "Buffering" if the call is actually late, so the label doesn't flicker. */
const BUFFERING_LABEL_MS = 400;
const CLIP_TIMEOUT_MS = 20_000;
/** A call whose playhead hasn't moved for this long is dropped, not waited on forever. */
const STALL_LIMIT_S = 8;
/** Time for a just-revealed possession to reach Court Cam and mark it active. */
const GATE_SETTLE_MS = 200;
/** Never let a sim that stopped answering freeze the broadcast. */
const GATE_MAX_POLLS = 300;
const GATE_POLL_MS = 100;
/** Consecutive failed calls before giving up on the broadcast. */
const MAX_FAILED_CLIPS = 3;
/** Retrying these can't help: stop the broadcast and say why. */
const FATAL_CODES = new Set(['tts_quota', 'premium_required', 'auth_required', 'not_configured']);

class ClipError extends Error {
  constructor(message: string, public code: string | null, public retryable: boolean) { super(message); }
}

async function fetchClipOnce(lines: BroadcastLine[], signal: AbortSignal): Promise<string> {
  // Our own controller so a hung request can time out without ending the run.
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  signal.addEventListener('abort', onAbort);
  const timer = setTimeout(() => ctl.abort(), CLIP_TIMEOUT_MS);
  try {
    const res = await fetch('/api/game-audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines }),
      signal: ctl.signal,
    });
    if (!res.ok) {
      let msg = `Audio request failed (${res.status})`;
      let code: string | null = null;
      try { const b = await res.json(); if (b?.error) msg = b.error; if (b?.code) code = b.code; } catch { /* non-JSON */ }
      throw new ClipError(msg, code, !(code && FATAL_CODES.has(code)));
    }
    return URL.createObjectURL(await res.blob());
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}

async function fetchClip(lines: BroadcastLine[], signal: AbortSignal): Promise<string> {
  try {
    return await fetchClipOnce(lines, signal);
  } catch (e) {
    if (signal.aborted || (e instanceof ClipError && !e.retryable)) throw e;
    return fetchClipOnce(lines, signal); // one retry: a single blip shouldn't lose the call
  }
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
    p.catch(() => { cache.delete(index); }); // surfaced when awaited
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

  const playUrl = useCallback((url: string, myRun: number): Promise<void> => new Promise((resolve, reject) => {
    const audio = audioRef.current!;
    let lastTime = -1;
    let stalled = 0;
    const clear = () => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      window.clearInterval(watchdog);
    };
    const finish = () => { clear(); resolve(); };
    const onEnded = () => { if (audio.src === url) finish(); };
    const onError = () => { clear(); reject(new Error('playback error')); };
    // 'ended' can simply never arrive: a stalled stream, or a phone call or the
    // lock screen taking the audio. Drop the call rather than freeze the game.
    const watchdog = window.setInterval(() => {
      if (runIdRef.current !== myRun) { finish(); return; }
      if (pausedRef.current) { stalled = 0; return; }
      if (audio.currentTime === lastTime) { if (++stalled >= STALL_LIMIT_S) finish(); }
      else { stalled = 0; lastTime = audio.currentTime; }
    }, 1000);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    audio.src = url;
    audio.play().catch(err => { clear(); reject(err); });
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

  const passGate = useCallback(async (stage: 'call' | 'next', i: number, myRun: number) => {
    const gate = optsRef.current?.gate;
    if (!gate) return;
    for (let polls = 0; polls < GATE_MAX_POLLS && runIdRef.current === myRun; polls++) {
      await whileHeld();
      if (gate(stage, i)) return;
      await new Promise(r => setTimeout(r, GATE_POLL_MS));
    }
  }, [whileHeld]);

  const runLoop = useCallback(async (from: number) => {
    const myRun = runIdRef.current;
    const opts = optsRef.current!;
    let failedClips = 0;
    const fail = (message: string, code: string | null) => {
      setError(message); setErrorCode(code); setStatus('error');
    };
    for (let i = from; i < opts.count; i++) {
      await whileHeld();
      if (runIdRef.current !== myRun) return;

      // Have the call in hand BEFORE revealing, so voice and feed land together.
      ensureClip(i).catch(() => {}); // this event's request goes out first
      prefetchAfter(i);
      let url: string | null = null;
      let clipFailed = false;
      if (opts.linesFor(i).length) {
        const label = window.setTimeout(() => {
          if (runIdRef.current === myRun && !pausedRef.current) setStatus('buffering');
        }, BUFFERING_LABEL_MS);
        try {
          url = await ensureClip(i);
          failedClips = 0;
        } catch (e) {
          if (runIdRef.current !== myRun) return;
          const err = e as Error;
          if (err instanceof ClipError && !err.retryable) { fail(err.message, err.code); return; }
          if (++failedClips >= MAX_FAILED_CLIPS) {
            fail(err.message, err instanceof ClipError ? err.code : null);
            return;
          }
          clipFailed = true; // keep the game moving; this one event just goes unsaid
        } finally {
          window.clearTimeout(label);
        }
      }

      await whileHeld();
      if (runIdRef.current !== myRun) return;
      opts.onShowPlay(i);
      setPlayIndex(i);

      if (opts.gate && opts.willAnimate?.(i)) await delay(GATE_SETTLE_MS, myRun);

      if (url) {
        // Court Cam: hold the call until the possession has played out on screen.
        await passGate('call', i, myRun);
        // Play the call; an autoplay block waits for the user's tap and retries.
        for (;;) {
          await whileHeld();
          if (runIdRef.current !== myRun) return;
          try {
            setStatus('playing');
            await playUrl(url, myRun);
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
            clipFailed = true; // an unplayable clip shouldn't end the broadcast
            break;
          }
        }
        URL.revokeObjectURL(url);
        clipCacheRef.current.delete(i);
      } else {
        if (!pausedRef.current) setStatus('playing');
        await delay(clipFailed ? FAILED_CLIP_BEAT_MS : opts.silentBeatMs?.(i) ?? DEFAULT_SILENT_BEAT_MS, myRun);
      }
      if (runIdRef.current !== myRun) return;

      opts.onCallDone?.(i);
      await passGate('next', i, myRun);
      const dwell = url ? (opts.postClipDelayMs?.() ?? 0) : 0;
      if (dwell > 0) await delay(dwell, myRun);
      if (runIdRef.current !== myRun) return;
    }
    if (runIdRef.current === myRun) { setStatus('done'); opts.onDone?.(); }
  }, [delay, ensureClip, passGate, playUrl, prefetchAfter, whileHeld]);

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
