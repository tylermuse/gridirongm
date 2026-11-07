/**
 * useGameBroadcast — per-play, audio-driven live broadcast.
 *
 * The audio is the clock. For each play from a starting index, the hook:
 *   1. waits for that play's spoken call to be ready,
 *   2. reveals the play on screen (onShowPlay) as the call starts, and
 *   3. only advances to the next play when the call finishes.
 *
 * The event list is read live, because a Live Coach game generates plays one
 * at a time: when the hook catches up it reports status 'waiting' and the page
 * produces the next play (or asks the user for a call), then calls notify().
 *
 * Clips are fetched generate-ahead while the current one plays. While the
 * broadcast is driving, the caller must stand its own speed-timer down; once
 * it errors or finishes, the reveal is the caller's again.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BroadcastLine } from './gameBroadcast';
import { UNLOCK_AUDIO } from './unlockAudio';

export type BroadcastStatus =
  | 'idle'
  | 'buffering'   // the next call is taking a moment to arrive
  | 'playing'
  | 'waiting'     // caught up with a live engine: waiting on the next play
  | 'paused'
  | 'blocked'     // browser blocked autoplay — needs a user tap
  | 'error'
  | 'done';

export interface StartOpts {
  fromIndex: number;
  /** Number of events available right now — read live, it grows under Live Coach. */
  count: () => number;
  /** Spoken lines for the play at `i` ([] = reveal on a silent beat). */
  linesFor: (i: number) => BroadcastLine[];
  /** False while a live engine can still produce plays. Defaults to true. */
  isFinished?: () => boolean;
  /** Reveal the play at this event index on screen. */
  onShowPlay: (index: number) => void;
  /** Called after play `i`'s call (or silent beat) has finished. */
  onCallDone?: (index: number) => void;
  /** Called once the last play's call has finished. */
  onDone?: () => void;
  /** Extra dwell (ms) to hold after each call — read live so the speed control
   *  still paces a broadcast (slower = longer gaps; a call is never cut off). */
  postClipDelayMs?: () => number;
  /** Lets a 3D sim hold the voice back: 'call' is polled before speaking play
   *  `i` (no spoiling a play still running), 'next' before moving on. */
  gate?: (stage: 'call' | 'next', index: number) => boolean;
  /** Could a 3D sim pick this play up? Only then is it given a moment to do so. */
  willAnimate?: (index: number) => boolean;
}

export interface GameBroadcast {
  status: BroadcastStatus;
  playIndex: number;
  error: string | null;
  /** Server error code (e.g. 'tts_quota', 'premium_required'). */
  errorCode: string | null;
  start: (opts: StartOpts) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  /** Jump to a new play (a skip), cutting off the current call. */
  seek: (index: number) => void;
  /** The event list grew: wake the broadcast if it was waiting on a play. */
  notify: () => void;
}

// A play with no audio still gets a brief on-screen beat.
const SILENT_BEAT_MS = 500;
// A call that failed to load gets longer, so the play can still be read.
const FAILED_CLIP_BEAT_MS = 1500;
/** Only say "Buffering" if the call is actually late, so the label doesn't flicker. */
const BUFFERING_LABEL_MS = 400;
const PREFETCH = 2;
const CLIP_TIMEOUT_MS = 20_000;
/** A call whose playhead hasn't moved for this long is dropped, not waited on forever. */
const STALL_LIMIT_S = 8;
/** Time for a just-revealed play to reach the 3D sim and mark it active. */
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
  // Keyed by the lines, not the index: a Live Coach pivot replaces the events
  // after it, so an index can come to mean a different play.
  const clipCacheRef = useRef<Map<string, Promise<string>>>(new Map());

  const wake = useCallback(() => {
    const w = waitersRef.current;
    waitersRef.current = [];
    w.forEach(fn => fn());
  }, []);

  const nextWake = useCallback(() => new Promise<void>(resolve => { waitersRef.current.push(resolve); }), []);

  const silenceAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    // Not `src = ''`: that resolves to the page URL, which then looks like a clip.
    audio.removeAttribute('src');
    audio.load();
  }, []);

  const cleanup = useCallback(() => {
    runIdRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    pausedRef.current = false;
    blockedRef.current = false;
    wake();
    silenceAudio();
    for (const p of clipCacheRef.current.values()) {
      p.then(url => URL.revokeObjectURL(url)).catch(() => {});
    }
    clipCacheRef.current.clear();
  }, [wake, silenceAudio]);

  useEffect(() => cleanup, [cleanup]);

  /** Resolves once not paused (or once this run has been replaced). */
  const whileHeld = useCallback(async (myRun: number) => {
    while (pausedRef.current && runIdRef.current === myRun) await nextWake();
  }, [nextWake]);

  /** A delay that a pause really holds, so nothing leaks out while paused. */
  const delay = useCallback(async (ms: number, myRun: number) => {
    let left = ms;
    while (left > 0 && runIdRef.current === myRun) {
      await whileHeld(myRun);
      const step = Math.min(left, 100);
      await new Promise(r => setTimeout(r, step));
      left -= step;
    }
  }, [whileHeld]);

  const ensureClip = useCallback((lines: BroadcastLine[]): Promise<string> => {
    const key = JSON.stringify(lines);
    const cache = clipCacheRef.current;
    const hit = cache.get(key);
    if (hit) return hit;
    const p = fetchClip(lines, abortRef.current!.signal);
    p.catch(() => { cache.delete(key); }); // surfaced when awaited; a later play may retry
    cache.set(key, p);
    return p;
  }, []);

  /** Prefetch the next called plays after `i` (only those that exist yet). */
  const prefetchAfter = useCallback((i: number) => {
    const opts = optsRef.current!;
    const count = opts.count();
    let found = 0;
    for (let j = i + 1; j < count && found < PREFETCH && j < i + 8; j++) {
      const lines = opts.linesFor(j);
      if (lines.length) { ensureClip(lines); found++; }
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

  const passGate = useCallback(async (stage: 'call' | 'next', i: number, myRun: number) => {
    const gate = optsRef.current?.gate;
    if (!gate) return;
    for (let polls = 0; polls < GATE_MAX_POLLS && runIdRef.current === myRun; polls++) {
      await whileHeld(myRun);
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

    for (let i = from; ; i++) {
      // Caught up: finished, or wait on the live engine / the user's play call.
      while (i >= opts.count()) {
        if (opts.isFinished?.() ?? true) {
          if (runIdRef.current === myRun) { setStatus('done'); opts.onDone?.(); }
          return;
        }
        setStatus(s => (s === 'paused' || s === 'blocked' ? s : 'waiting'));
        await nextWake();
        if (runIdRef.current !== myRun) return;
      }

      await whileHeld(myRun);
      if (runIdRef.current !== myRun) return;

      // Have the call in hand BEFORE revealing, so voice and field land together.
      const lines = opts.linesFor(i);
      if (lines.length) ensureClip(lines); // this play's request goes out first
      prefetchAfter(i);
      let url: string | null = null;
      let clipFailed = false;
      if (lines.length) {
        const label = window.setTimeout(() => {
          if (runIdRef.current === myRun && !pausedRef.current) setStatus('buffering');
        }, BUFFERING_LABEL_MS);
        try {
          url = await ensureClip(lines);
          failedClips = 0;
        } catch (e) {
          if (runIdRef.current !== myRun) return;
          const err = e as Error;
          if (err instanceof ClipError && !err.retryable) { fail(err.message, err.code); return; }
          if (++failedClips >= MAX_FAILED_CLIPS) {
            fail(err.message, err instanceof ClipError ? err.code : null);
            return;
          }
          clipFailed = true; // keep the game moving; this one play just goes unsaid
        } finally {
          window.clearTimeout(label);
        }
      }

      await whileHeld(myRun);
      if (runIdRef.current !== myRun) return;
      opts.onShowPlay(i);
      setPlayIndex(i);

      if (opts.gate && opts.willAnimate?.(i)) await delay(GATE_SETTLE_MS, myRun);

      if (url) {
        await passGate('call', i, myRun);
        for (;;) {
          await whileHeld(myRun);
          if (runIdRef.current !== myRun) return;
          try {
            setStatus('playing');
            await playUrl(url, myRun);
            break;
          } catch (e) {
            if (runIdRef.current !== myRun) return;
            const name = (e as Error).name;
            if (name === 'NotAllowedError') {
              // Autoplay refused: wait for the user's tap, then retry this call.
              pausedRef.current = true;
              blockedRef.current = true;
              setStatus('blocked');
              continue;
            }
            if (name === 'AbortError') continue; // src swapped by a pause/resume race
            clipFailed = true; // an unplayable clip shouldn't end the broadcast
            break;
          }
        }
        URL.revokeObjectURL(url);
        clipCacheRef.current.delete(JSON.stringify(lines));
      } else {
        setStatus(s => (s === 'paused' || s === 'blocked' ? s : 'playing'));
        await delay(clipFailed ? FAILED_CLIP_BEAT_MS : SILENT_BEAT_MS, myRun);
      }
      if (runIdRef.current !== myRun) return;

      opts.onCallDone?.(i);
      await passGate('next', i, myRun);
      const dwell = opts.postClipDelayMs?.() ?? 0;
      if (dwell > 0) await delay(dwell, myRun);
      if (runIdRef.current !== myRun) return;
    }
  }, [delay, ensureClip, nextWake, passGate, playUrl, prefetchAfter, whileHeld]);

  const start = useCallback((opts: StartOpts) => {
    cleanup();
    if (opts.count() === 0 && (opts.isFinished?.() ?? true)) return;
    if (!audioRef.current) audioRef.current = new Audio();
    // Unlock the element inside this tap; it plays every call after this.
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
    setStatus(s => (s === 'playing' || s === 'buffering' || s === 'waiting' ? 'paused' : s));
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
    } else if (audio && audio.getAttribute('src') && !audio.src.startsWith('data:') && !audio.ended && audio.currentTime > 0) {
      // Mid-call: pick the clip back up where it stopped.
      audio.play().catch(() => { pausedRef.current = true; blockedRef.current = true; setStatus('blocked'); });
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

  const seek = useCallback((index: number) => {
    if (!optsRef.current) return;
    runIdRef.current++;
    wake();
    silenceAudio();
    runLoop(index);
  }, [runLoop, silenceAudio, wake]);

  return { status, playIndex, error, errorCode, start, pause, resume, stop, seek, notify: wake };
}
