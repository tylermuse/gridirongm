'use client';

import { useState, useRef, useEffect } from 'react';

interface SpotlightAudioPlayerProps {
  topics: { headline: string; icon: string; exchanges: { speakerId: string; text: string }[] }[];
  teamName: string;
}

export function SpotlightAudioPlayer({ topics, teamName }: SpotlightAudioPlayerProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'paused' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

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

      if (!res.ok) throw new Error('Failed to generate audio');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;

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

  if (state === 'idle' && !blobUrlRef.current) {
    return (
      <button
        onClick={handlePlay}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 transition-colors active:scale-[0.98]"
      >
        <span>🎧</span> Listen to Podcast
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

  return (
    <div className="flex items-center gap-2.5">
      <button
        onClick={handlePlay}
        className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center hover:bg-purple-700 transition-colors text-sm"
      >
        {state === 'playing' ? '⏸' : '▶'}
      </button>
      <div className="flex items-center gap-2 flex-1 min-w-[120px]">
        <span className="text-[10px] text-[var(--text-sec)] tabular-nums w-8">{formatTime(progress)}</span>
        <div
          className="flex-1 h-1.5 bg-[var(--surface-2)] rounded-full cursor-pointer relative"
          onClick={handleSeek}
        >
          <div
            className="h-full bg-purple-500 rounded-full transition-[width] duration-100"
            style={{ width: duration ? `${(progress / duration) * 100}%` : '0%' }}
          />
        </div>
        <span className="text-[10px] text-[var(--text-sec)] tabular-nums w-8">{formatTime(duration)}</span>
      </div>
    </div>
  );
}
