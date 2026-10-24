/**
 * useGameBroadcast (Phase 2) — per-play, audio-driven broadcast.
 *
 * The audio is the clock. For each play from a starting index, the hook:
 *   1. reveals that play on screen (via onShowPlay),
 *   2. plays that play's spoken call, and
 *   3. only advances to the next play when the call finishes.
 *
 * Clips are fetched generate-ahead (the next couple of plays are prefetched
 * while the current one plays) so playback stays smooth. Because the reveal is
 * gated on the audio, the caller must disable its own speed-timer advancement
 * while a broadcast is running.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { broadcastClipLines, type BroadcastLine } from './gameBroadcast';
import type { PlayEvent } from './playByPlay';

export type BroadcastStatus =
  | 'idle'
  | 'buffering'   // fetching the clip we need to play next
  | 'playing'
  | 'paused'
  | 'blocked'     // browser blocked autoplay — needs a user tap
  | 'error'
  | 'done';

export interface StartOpts {
  events: PlayEvent[];
  fromIndex: number;
  homeAbbr: string;
  awayAbbr: string;
  /** Full city names — spoken instead of the abbreviation ("Dallas", not "DAL"). */
  homeName: string;
  awayName: string;
  /** Reveal the play at this event index on screen. */
  onShowPlay: (index: number) => void;
  /** Called once the last play's call has finished. */
  onDone?: () => void;
  /** Extra dwell (ms) to hold after each call finishes, before the next play —
   *  read live so the game's speed control still affects pacing during a
   *  broadcast (slower speed = longer gaps; the call is never cut off). */
  postClipDelayMs?: () => number;
}

export interface GameBroadcast {
  status: BroadcastStatus;
  playIndex: number;
  error: string | null;
  start: (opts: StartOpts) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

// A play with no audio (structural filler) still gets a brief on-screen beat.
const SILENT_BEAT_MS = 500;

async function fetchClip(lines: BroadcastLine[], signal: AbortSignal): Promise<string> {
  const res = await fetch('/api/game-audio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lines }),
    signal,
  });
  if (!res.ok) {
    let msg = `Audio request failed (${res.status})`;
    try { const b = await res.json(); if (b?.error) msg = b.error; } catch { /* non-JSON */ }
    throw new Error(msg);
  }
  return URL.createObjectURL(await res.blob());
}

export function useGameBroadcast(): GameBroadcast {
  const [status, setStatus] = useState<BroadcastStatus>('idle');
  const [playIndex, setPlayIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);
  const optsRef = useRef<StartOpts | null>(null);
  // index → promise of blob URL (null = no audio for that play)
  const clipCacheRef = useRef<Map<number, Promise<string | null>>>(new Map());

  const cleanup = useCallback(() => {
    runIdRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
    for (const p of clipCacheRef.current.values()) {
      p.then(url => { if (url) URL.revokeObjectURL(url); }).catch(() => {});
    }
    clipCacheRef.current.clear();
  }, []);

  useEffect(() => cleanup, [cleanup]);

  // Fetch (once) the clip for a given play index; null when it has no audio.
  const ensureClip = useCallback((index: number): Promise<string | null> => {
    const cache = clipCacheRef.current;
    const hit = cache.get(index);
    if (hit) return hit;
    const opts = optsRef.current!;
    const lines = broadcastClipLines(opts.events, index, opts.homeAbbr, opts.awayAbbr, opts.fromIndex, opts.homeName, opts.awayName);
    const p: Promise<string | null> = lines.length === 0
      ? Promise.resolve(null)
      : fetchClip(lines, abortRef.current!.signal);
    cache.set(index, p);
    return p;
  }, []);

  const playUrl = useCallback((url: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const audio = audioRef.current!;
      const done = () => { audio.removeEventListener('ended', done); audio.removeEventListener('error', fail); resolve(); };
      const fail = () => { audio.removeEventListener('ended', done); audio.removeEventListener('error', fail); reject(new Error('playback error')); };
      audio.addEventListener('ended', done);
      audio.addEventListener('error', fail);
      audio.src = url;
      audio.play().catch(reject);
    });
  }, []);

  const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

  const runLoop = useCallback(async (from: number) => {
    const myRun = runIdRef.current;
    const opts = optsRef.current!;
    for (let i = from; i < opts.events.length; i++) {
      if (runIdRef.current !== myRun) return;
      opts.onShowPlay(i);
      setPlayIndex(i);
      // Prefetch the next couple of plays while this one plays.
      ensureClip(i + 1).catch(() => {});
      ensureClip(i + 2).catch(() => {});
      let url: string | null;
      try {
        setStatus('buffering');
        url = await ensureClip(i);
      } catch (e) {
        if (runIdRef.current !== myRun || (e as Error).name === 'AbortError') return;
        setError((e as Error).message); setStatus('error'); return;
      }
      if (runIdRef.current !== myRun) return;
      if (!url) { await delay(SILENT_BEAT_MS); continue; }
      try {
        setStatus('playing');
        await playUrl(url);
      } catch (e) {
        if (runIdRef.current !== myRun) return;
        if ((e as Error).name === 'NotAllowedError' || /play\(\)/.test((e as Error).message)) {
          setStatus('blocked'); return;
        }
        setError((e as Error).message); setStatus('error'); return;
      }
      // Speed-controlled dwell between calls (call already finished; never cuts it).
      const dwell = opts.postClipDelayMs?.() ?? 0;
      if (dwell > 0) await delay(dwell);
    }
    if (runIdRef.current === myRun) { setStatus('done'); opts.onDone?.(); }
  }, [ensureClip, playUrl]);

  const start = useCallback((opts: StartOpts) => {
    cleanup();
    if (opts.events.length === 0) return;
    if (!audioRef.current) audioRef.current = new Audio();
    abortRef.current = new AbortController();
    optsRef.current = opts;
    setError(null);
    setPlayIndex(opts.fromIndex);
    runLoop(opts.fromIndex);
  }, [cleanup, runLoop]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setStatus(s => (s === 'playing' ? 'paused' : s));
  }, []);

  const resume = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    audio.play().then(() => setStatus('playing')).catch(() => setStatus('blocked'));
  }, []);

  const stop = useCallback(() => {
    cleanup();
    setStatus('idle');
    setPlayIndex(0);
  }, [cleanup]);

  return { status, playIndex, error, start, pause, resume, stop };
}
