'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';

const PODCAST_LIMIT = 3;
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const STORAGE_KEY = 'gg-podcast-timestamps';

/** Returns timestamps of podcast generations within the last 30 days */
function getRecentTimestamps(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const all: number[] = JSON.parse(raw);
    const cutoff = Date.now() - WINDOW_MS;
    return all.filter(ts => ts > cutoff);
  } catch { return []; }
}

function getPodcastCount(): number {
  return getRecentTimestamps().length;
}

function incrementPodcastCount(): void {
  try {
    const recent = getRecentTimestamps();
    recent.push(Date.now());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
  } catch { /* noop */ }
}

interface SpotlightAudioPlayerProps {
  topics: { headline: string; icon: string; exchanges: { speakerId: string; text: string }[] }[];
  teamName: string;
}

export function SpotlightAudioPlayer({ topics, teamName }: SpotlightAudioPlayerProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'paused' | 'error' | 'exhausted'>('idle');
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
        // Check if it's a credits/quota issue from the API
        const isCreditsIssue = res.status === 402 || res.status === 429;
        if (isCreditsIssue) {
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
