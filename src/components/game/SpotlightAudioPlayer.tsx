'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useSubscription } from '@/components/providers/SubscriptionProvider';
import { listenState, nextCreditReset, formatResetDate } from '@/lib/engine/spotlightAccess';

interface SpotlightAudioPlayerProps {
  topics: { headline: string; icon: string; exchanges: { speakerId: string; text: string }[] }[];
  teamName: string;
}

export function SpotlightAudioPlayer({ topics, teamName }: SpotlightAudioPlayerProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'paused' | 'error' | 'exhausted' | 'locked' | 'signedOut'>('idle');
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  // Server credits are the only counter (profiles.podcast_credits_*).
  const { user, loading, hasFeature, podcastCredits, refreshPodcastCredits } = useSubscription();
  const access = listenState({
    loading,
    signedIn: !!user,
    premium: hasFeature('podcast_credits'),
    remaining: podcastCredits.remaining,
  });
  const resetLabel = formatResetDate(nextCreditReset(podcastCredits.resetAt));
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const pathname = usePathname();

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

    setState('loading');
    try {
      const res = await fetch('/api/spotlight-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics, teamName }),
      });

      if (!res.ok) {
        // Server is the authority; map each refusal to its own state.
        if (res.status === 401) {
          setState('signedOut');
          return;
        }
        if (res.status === 403) {
          setState('locked');
          return;
        }
        // Credits/quota issue for a user who IS entitled.
        if (res.status === 402 || res.status === 429) {
          setState('exhausted');
          void refreshPodcastCredits();
          return;
        }
        throw new Error('Failed to generate audio');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;

      // Server charged a credit on a cache miss (cache hits are free) — re-read it.
      void refreshPodcastCredits();

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

  // Nothing generated yet this session → the button reflects entitlement up front.
  const fresh = !blobUrlRef.current;
  const view = state === 'signedOut' || state === 'locked' || state === 'exhausted'
    ? state
    : fresh && state === 'idle' && access !== 'ready' ? access : state;

  if (view === 'checking') {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-50 text-purple-400">
        <span>🎧</span> Podcast
      </div>
    );
  }

  if (view === 'signedOut') {
    return (
      <Link
        href="/login"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700 hover:bg-purple-600 hover:text-white transition-colors"
      >
        <span>🎧</span> Sign in to listen
      </Link>
    );
  }

  if (view === 'locked') {
    return (
      <Link
        href="/pricing"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700 hover:bg-purple-600 hover:text-white transition-colors"
      >
        <span>🔒</span> Podcast · Premium
      </Link>
    );
  }

  if (view === 'exhausted') {
    return (
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-500"
        title={`You've used this month's ${podcastCredits.limit} podcast episodes`}
      >
        <span>🎧</span> Out of episodes · resets {resetLabel}
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
        ⚠️ Couldn&apos;t make the podcast — retry
      </button>
    );
  }

  // Idle — ready to generate (or replay this session's episode for free)
  if (state === 'idle') {
    const uncapped = podcastCredits.remaining < 0;
    const suffix = !fresh
      ? ' (replay)'
      : uncapped ? '' : ` (uses 1 of ${podcastCredits.remaining} left)`;
    return (
      <button
        onClick={handlePlay}
        title={fresh && !uncapped ? `${podcastCredits.remaining} of ${podcastCredits.limit} left this month · resets ${resetLabel}` : undefined}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 transition-colors active:scale-[0.98]"
      >
        <span>🎧</span> Listen{suffix}
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
