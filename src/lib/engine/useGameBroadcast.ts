/**
 * useGameBroadcast (Phase 1 spike) — buffered audio broadcast playback.
 *
 * Given a segmented commentary script, this hook fetches each segment's audio
 * from /api/game-audio, plays them back-to-back through a single <audio>
 * element, and prefetches the NEXT segment while the current one plays
 * (generate-ahead) so playback starts fast and rarely stalls.
 *
 * This is a listening track, not frame-synced to the field animation — that
 * sync is Phase 2. The hook only owns audio; the caller decides when to start.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BroadcastLine } from './gameBroadcast';

export type BroadcastStatus =
  | 'idle'        // not started
  | 'buffering'   // fetching the segment we need to play next
  | 'playing'
  | 'paused'
  | 'blocked'     // browser blocked autoplay — needs a user tap
  | 'error'
  | 'done';

export interface GameBroadcast {
  status: BroadcastStatus;
  segmentIndex: number;
  segmentCount: number;
  error: string | null;
  /** Begin (or restart) playback from segment 0 of the given script. */
  start: (segments: BroadcastLine[][]) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

async function fetchSegmentAudio(lines: BroadcastLine[], signal: AbortSignal): Promise<string> {
  const res = await fetch('/api/game-audio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lines }),
    signal,
  });
  if (!res.ok) {
    let msg = `Audio request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch { /* non-JSON error body */ }
    throw new Error(msg);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export function useGameBroadcast(): GameBroadcast {
  const [status, setStatus] = useState<BroadcastStatus>('idle');
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [segmentCount, setSegmentCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);              // bumps on every start/stop to cancel stale loops
  const urlCacheRef = useRef<Map<number, Promise<string>>>(new Map());
  const segmentsRef = useRef<BroadcastLine[][]>([]);

  const cleanup = useCallback(() => {
    runIdRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    // Revoke any resolved blob URLs.
    for (const p of urlCacheRef.current.values()) {
      p.then(url => URL.revokeObjectURL(url)).catch(() => {});
    }
    urlCacheRef.current.clear();
  }, []);

  useEffect(() => cleanup, [cleanup]); // revoke on unmount

  const ensureFetched = useCallback((i: number): Promise<string> => {
    const cache = urlCacheRef.current;
    const hit = cache.get(i);
    if (hit) return hit;
    const signal = abortRef.current!.signal;
    const p = fetchSegmentAudio(segmentsRef.current[i], signal);
    cache.set(i, p);
    return p;
  }, []);

  const playUrl = useCallback((url: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const audio = audioRef.current!;
      const onEnded = () => { audio.removeEventListener('ended', onEnded); audio.removeEventListener('error', onError); resolve(); };
      const onError = () => { audio.removeEventListener('ended', onEnded); audio.removeEventListener('error', onError); reject(new Error('playback error')); };
      audio.addEventListener('ended', onEnded);
      audio.addEventListener('error', onError);
      audio.src = url;
      audio.play().catch(reject);
    });
  }, []);

  const runLoop = useCallback(async (fromSegment: number) => {
    const myRun = runIdRef.current;
    const segments = segmentsRef.current;
    for (let i = fromSegment; i < segments.length; i++) {
      if (runIdRef.current !== myRun) return;
      setSegmentIndex(i);
      setStatus('buffering');
      let url: string;
      try {
        url = await ensureFetched(i);
      } catch (e) {
        if (runIdRef.current !== myRun) return;
        if ((e as Error).name === 'AbortError') return;
        setError((e as Error).message);
        setStatus('error');
        return;
      }
      if (runIdRef.current !== myRun) return;
      // Prefetch the next segment while this one plays.
      if (i + 1 < segments.length) ensureFetched(i + 1).catch(() => {});
      try {
        setStatus('playing');
        await playUrl(url);
      } catch (e) {
        if (runIdRef.current !== myRun) return;
        // Autoplay rejection — surface a tap-to-start state.
        if ((e as Error).name === 'NotAllowedError' || /play\(\)/.test((e as Error).message)) {
          setStatus('blocked');
        } else {
          setError((e as Error).message);
          setStatus('error');
        }
        return;
      }
    }
    if (runIdRef.current === myRun) setStatus('done');
  }, [ensureFetched, playUrl]);

  const start = useCallback((segments: BroadcastLine[][]) => {
    cleanup();
    if (segments.length === 0) return;
    if (!audioRef.current) audioRef.current = new Audio();
    abortRef.current = new AbortController();
    segmentsRef.current = segments;
    setSegmentCount(segments.length);
    setSegmentIndex(0);
    setError(null);
    runLoop(0);
  }, [cleanup, runLoop]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setStatus(s => (s === 'playing' ? 'paused' : s));
  }, []);

  const resume = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.play().then(() => setStatus('playing')).catch(() => setStatus('blocked'));
  }, []);

  const stop = useCallback(() => {
    cleanup();
    setStatus('idle');
    setSegmentIndex(0);
    setSegmentCount(0);
  }, [cleanup]);

  return { status, segmentIndex, segmentCount, error, start, pause, resume, stop };
}
