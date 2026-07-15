'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

const PODCAST_LIMIT = 3;

/** Storage key is namespaced by current year-month, so credits reset
 *  automatically on the 1st of every month — everyone gets 3 fresh
 *  podcasts each month with no manual intervention. */
function currentMonthKey(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `gg-podcast-credits-${year}-${month}`;
}

function getPodcastCount(): number {
  try {
    const raw = localStorage.getItem(currentMonthKey());
    return parseInt(raw ?? '0', 10) || 0;
  } catch { return 0; }
}

function incrementPodcastCount(): void {
  try {
    localStorage.setItem(currentMonthKey(), String(getPodcastCount() + 1));
  } catch { /* noop */ }
}

interface SpotlightAudioPlayerProps {
  topics: { headline: string; icon: string; exchanges: { speakerId: string; text: string }[] }[];
  teamName: string;
}

export function SpotlightAudioPlayer({ topics, teamName }: SpotlightAudioPlayerProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'paused' | 'error' | 'exhausted' | 'locked'>('idle');
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [remaining, setRemaining] = useState(PODCAST_LIMIT);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const pathname = usePathname();

  // Check remaining on mount
  useEffect(() => {
    const used = getPodcastCount();
    setRemaining(Math.max(0, PODCAST_LIMIT - used));
    if (used >= PODCAST_LIMIT) setState('exhausted');
  }, []);

  // Stop audio and clean up on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  // Stop audio on route change
  useEffect(() => {
    if (audioRef.current && state === 'playing') {
      audioRef.current.pause();
      setState('paused');
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handlePlay() {
    if (audioRef.current && blobUrlRef.current) {
      if (state === 'playing') {
        audioRef.current.pause();
        setState('paused');
      } else {
        audioRef.current.play();
        setState('playing');
      }
      return;
    }

    // Check limit before making API call
    if (getPodcastCount() >= PODCAST_LIMIT) {
      setState('exhausted');
      return;
    }

    setState('loading');
    try {
      const res = await fetch('/api/spotlight-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics, teamName }),
      });

      if (!res.ok) {
        // 403 = free tier. The server enforces `tier !== 'premium'` (see
        // packages/core/src/podcast/index.ts) but this component used to only
        // handle 402/429, so a free user clicking Listen fell through to the
        // generic red "⚠️ Retry" error — no explanation, no upgrade path.
        if (res.status === 403) {
          setState('locked');
          return;
        }
        // Credits/quota issue for a user who IS entitled.
        if (res.status === 402 || res.status === 429) {
          setState('exhausted');
          return;
        }
        throw new Error('Failed to generate audio');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;

      // Count this successful generation
      incrementPodcastCount();
      setRemaining(Math.max(0, PODCAST_LIMIT - getPodcastCount()));

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.addEventListener('loadedmetadata', () => setDuration(audio.duration));
      audio.addEventListener('timeupdate', () => setProgress(audio.currentTime));
      audio.addEventListener('ended', () => { setState('idle'); setProgress(0); });
      audio.addEventListener('error', () => setState('error'));

      await audio.play();
      setState('playing');
    } catch {
      setState('error');
    }
  }

  function handleStop() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setState('idle');
    setProgress(0);
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = pct * duration;
    setProgress(pct * duration);
  }

  function formatTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  // Free tier — the server will 403. Sell the upgrade instead of erroring.
  if (state === 'locked') {
    return (
      <Link
        href="/pricing"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700 hover:bg-purple-600 hover:text-white transition-colors"
      >
        <span>🔒</span> Podcasts are Premium — Upgrade
      </Link>
    );
  }

  // Exhausted state
  if (state === 'exhausted') {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-500">
        <span>🎧</span> Podcast credits exhausted
      </div>
    );
  }

  // Error state
  if (state === 'error') {
    return (
      <button
        onClick={() => { setState('idle'); blobUrlRef.current = null; audioRef.current = null; }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
      >
        ⚠️ Retry
      </button>
    );
  }

  // Idle state — just a button
  if (state === 'idle' && !blobUrlRef.current) {
    return (
      <button
        onClick={handlePlay}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 transition-colors active:scale-[0.98]"
      >
        <span>🎧</span> Listen to Podcast{remaining < PODCAST_LIMIT ? ` (${remaining} left)` : ''}
      </button>
    );
  }

  if (state === 'loading') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700">
        <span className="animate-pulse">🎧</span> Generating audio...
      </div>
    );
  }

  // Playing / Paused — sticky player bar
  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-purple-600 text-white shadow-lg">
      <div className="max-w-4xl mx-auto flex items-center gap-3 px-4 py-2">
        <button
          onClick={handlePlay}
          className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors text-sm shrink-0"
        >
          {state === 'playing' ? '⏸' : '▶'}
        </button>

        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-medium opacity-80 truncate">
            🎧 Team Spotlight — {teamName}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] tabular-nums opacity-70 w-7 shrink-0">{formatTime(progress)}</span>
            <div
              className="flex-1 h-1.5 bg-white/20 rounded-full cursor-pointer"
              onClick={handleSeek}
            >
              <div
                className="h-full bg-white/70 rounded-full transition-[width] duration-100"
                style={{ width: duration ? `${(progress / duration) * 100}%` : '0%' }}
              />
            </div>
            <span className="text-[10px] tabular-nums opacity-70 w-7 shrink-0">{formatTime(duration)}</span>
          </div>
        </div>

        <button
          onClick={handleStop}
          className="text-[10px] font-medium opacity-70 hover:opacity-100 transition-opacity shrink-0 px-2 py-1"
          title="Stop"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
