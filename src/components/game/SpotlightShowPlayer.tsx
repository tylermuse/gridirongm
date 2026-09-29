'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  HOSTS,
  REACTION_CLIPS,
  SHOW_CLIPS,
  type Host,
  type ShowClipId,
  type TimedShowSegment,
} from '@/lib/spotlight/showScript';
import { PODCAST_LIMIT, getPodcastCount, incrementPodcastCount } from './SpotlightAudioPlayer';

interface SpotlightShowPlayerProps {
  topics: { headline: string; icon: string; exchanges: { speakerId: string; text: string }[] }[];
  teamName: string;
}

type Phase = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error' | 'exhausted' | 'locked';

const CLIP_IDS = Object.keys(SHOW_CLIPS) as ShowClipId[];
const other = (h: Host): Host => (h === 'marcus' ? 'tony' : 'marcus');

export function SpotlightShowPlayer({ topics, teamName }: SpotlightShowPlayerProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [segments, setSegments] = useState<TimedShowSegment[]>([]);
  const [segIdx, setSegIdx] = useState(0);
  const [lowerThird, setLowerThird] = useState(false);
  const pathname = usePathname();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const clipRefs = useRef<Partial<Record<ShowClipId, HTMLVideoElement | null>>>({});
  const reactRefs = useRef<Partial<Record<Host, HTMLVideoElement | null>>>({});
  const rafRef = useRef<number | null>(null);
  const segIdxRef = useRef(0);
  const segmentsRef = useRef<TimedShowSegment[]>([]);
  const lowerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (getPodcastCount() >= PODCAST_LIMIT) setPhase('exhausted');
  }, []);

  const stopAll = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    audioRef.current?.pause();
    Object.values(clipRefs.current).forEach(v => v?.pause());
    Object.values(reactRefs.current).forEach(v => v?.pause());
  }, []);

  // Cleanup on unmount; pause on route change.
  useEffect(() => () => {
    stopAll();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    if (lowerTimer.current) clearTimeout(lowerTimer.current);
  }, [stopAll]);
  useEffect(() => {
    if (phase === 'playing') { stopAll(); setPhase('paused'); }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const showLowerThird = useCallback(() => {
    setLowerThird(true);
    if (lowerTimer.current) clearTimeout(lowerTimer.current);
    lowerTimer.current = setTimeout(() => setLowerThird(false), 3500);
  }, []);

  // ── Sequencer ──────────────────────────────────────────────────────
  const playSegment = useCallback((i: number, resume = false) => {
    const segs = segmentsRef.current;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (i >= segs.length) {
      stopAll();
      setPhase('ended');
      return;
    }
    const prev = segs[i - 1];
    const seg = segs[i];
    segIdxRef.current = i;
    setSegIdx(i);
    if (!resume && seg.kind === 'tts' && (!prev || prev.speaker !== seg.speaker || prev.kind === 'clip')) showLowerThird();

    if (seg.kind === 'clip') {
      audioRef.current?.pause();
      Object.values(reactRefs.current).forEach(v => v?.pause());
      const v = clipRefs.current[seg.clip];
      if (!v) return playSegment(i + 1);
      if (!resume) v.currentTime = 0;
      v.onended = () => playSegment(segIdxRef.current + 1);
      v.play().catch(() => setPhase('paused'));
      return;
    }

    // TTS line: play its slice of the episode audio; visuals are the topic
    // graphic or the *listener's* silent reaction loop.
    const audio = audioRef.current;
    if (!audio || seg.audioStart == null || seg.audioDuration == null) return playSegment(i + 1);
    const start = seg.audioStart;
    const end = start + seg.audioDuration;
    const contiguous = prev?.kind === 'tts' && Math.abs(audio.currentTime - start) < 0.35 && !audio.paused;
    if (!resume && !contiguous) audio.currentTime = start;
    if (audio.paused) audio.play().catch(() => setPhase('paused'));

    if (seg.visual === 'reaction') {
      const r = reactRefs.current[other(seg.speaker)];
      if (r && r.paused) r.play().catch(() => {});
    }

    const tick = () => {
      if (audio.currentTime >= end - 0.03 || audio.ended) {
        const next = segs[i + 1];
        if (!next || next.kind === 'clip') audio.pause();
        playSegment(i + 1);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [showLowerThird, stopAll]);

  // ── Controls ───────────────────────────────────────────────────────
  async function handleOpen() {
    if (segmentsRef.current.length) { setPhase('ready'); return; }
    if (getPodcastCount() >= PODCAST_LIMIT) { setPhase('exhausted'); return; }
    setPhase('loading');
    try {
      const res = await fetch('/api/spotlight-show', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics, teamName }),
      });
      if (!res.ok) {
        if (res.status === 403) return setPhase('locked');
        if (res.status === 402 || res.status === 429) return setPhase('exhausted');
        throw new Error('Failed to generate show');
      }
      const { segments: segs, audio } = (await res.json()) as { segments: TimedShowSegment[]; audio: string };
      const bytes = Uint8Array.from(atob(audio), c => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
      audioUrlRef.current = url;
      audioRef.current = new Audio(url);
      audioRef.current.preload = 'auto';
      incrementPodcastCount();
      segmentsRef.current = segs;
      setSegments(segs);
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }

  function handleStart() {
    setPhase('playing');
    playSegment(phase === 'paused' ? segIdxRef.current : 0, phase === 'paused');
  }

  function handlePause() {
    stopAll();
    setPhase('paused');
  }

  function handleClose() {
    stopAll();
    setPhase('idle');
    setSegIdx(0);
    segIdxRef.current = 0;
  }

  // ── Button states (match SpotlightAudioPlayer styling) ─────────────
  if (phase === 'locked') {
    return (
      <Link href="/pricing" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700 hover:bg-purple-600 hover:text-white transition-colors">
        <span>🔒</span> Show is Premium — Upgrade
      </Link>
    );
  }
  if (phase === 'exhausted') {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-500">
        <span>📺</span> Show credits exhausted
      </div>
    );
  }
  if (phase === 'error') {
    return (
      <button onClick={() => setPhase('idle')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-100 text-red-700 hover:bg-red-200 transition-colors">
        ⚠️ Retry show
      </button>
    );
  }
  if (phase === 'idle') {
    return (
      <button onClick={handleOpen} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 transition-colors active:scale-[0.98]">
        <span>📺</span> Watch Show
      </button>
    );
  }
  if (phase === 'loading') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700">
        <span className="animate-pulse">📺</span> Producing show…
      </div>
    );
  }

  // ── Stage ──────────────────────────────────────────────────────────
  const seg = segments[segIdx];
  const isClip = seg?.kind === 'clip';
  const tts = seg?.kind === 'tts' ? seg : null;
  const listener = tts ? other(tts.speaker) : null;
  const progressPct = segments.length ? ((segIdx + (phase === 'ended' ? 1 : 0)) / segments.length) * 100 : 0;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-white/80 backdrop-blur-sm p-4" role="dialog" aria-label={`Team Spotlight — ${teamName}`}>
      <div className="w-full max-w-4xl">
        <div className="relative w-full aspect-video overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-xl">
          {/* Lip-synced fixed-line clips (with audio) */}
          {CLIP_IDS.map(id => (
            <video
              key={id}
              ref={el => { clipRefs.current[id] = el; }}
              src={SHOW_CLIPS[id].src}
              preload="auto"
              playsInline
              className="absolute inset-0 h-full w-full object-cover transition-none"
              style={{ opacity: isClip && seg.clip === id ? 1 : 0 }}
            />
          ))}

          {/* Silent listener reaction loops */}
          {(Object.keys(REACTION_CLIPS) as Host[]).map(h => (
            <video
              key={h}
              ref={el => { reactRefs.current[h] = el; }}
              src={REACTION_CLIPS[h]}
              preload="auto"
              muted
              loop
              playsInline
              className="absolute inset-0 h-full w-full object-cover"
              style={{ opacity: tts?.visual === 'reaction' && listener === h ? 1 : 0 }}
            />
          ))}

          {/* Title / topic graphic */}
          {tts && tts.visual !== 'reaction' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-200 px-[8%] text-center">
              <div className="absolute inset-x-0 top-0 h-[1.5%] bg-orange-600" />
              <div className="text-[clamp(10px,1.6vw,15px)] font-bold tracking-[0.3em] text-slate-500">
                {tts.visual === 'title' ? 'TEAM SPOTLIGHT' : 'THE BREAKDOWN'}
              </div>
              <div className="mt-[2%] text-[clamp(28px,6vw,64px)] leading-none">{tts.icon}</div>
              <div className="mt-[2%] text-[clamp(18px,3.6vw,40px)] font-extrabold leading-tight text-[#1e3a5f]">
                {tts.headline}
              </div>
              {tts.visual === 'graphic' && (
                <div className="mt-[1.5%] text-[clamp(10px,1.5vw,14px)] font-semibold uppercase tracking-widest text-slate-500">{teamName}</div>
              )}
            </div>
          )}

          {/* Lower third */}
          {tts && (
            <div
              className="absolute left-[4%] bottom-[20%] rounded border-l-[5px] border-orange-600 bg-white px-3 py-1.5 shadow-md transition-all duration-300"
              style={{ opacity: lowerThird ? 1 : 0, transform: lowerThird ? 'none' : 'translateX(-10px)' }}
            >
              <div className="text-[clamp(11px,1.8vw,17px)] font-extrabold text-[#1e3a5f]">{HOSTS[tts.speaker].name}</div>
              <div className="text-[clamp(8px,1.1vw,11px)] font-semibold uppercase tracking-wider text-slate-500">{HOSTS[tts.speaker].title} · Team Spotlight</div>
            </div>
          )}

          {/* Captions */}
          {seg && phase !== 'ended' && (
            <div className="absolute inset-x-[7%] bottom-[5%] text-center">
              <span className="rounded bg-white/90 px-2 py-0.5 text-[clamp(11px,1.8vw,17px)] font-semibold leading-snug text-slate-800 [box-decoration-break:clone]">
                {seg.text}
              </span>
            </div>
          )}

          {/* Start / resume / replay */}
          {(phase === 'ready' || phase === 'paused' || phase === 'ended') && (
            <button
              onClick={phase === 'ended' ? () => { setPhase('playing'); playSegment(0); } : handleStart}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1e3a5f] px-6 py-3 text-sm font-bold text-white shadow-lg hover:bg-[#244873]"
            >
              {phase === 'ready' ? '▶ Start the show' : phase === 'paused' ? '▶ Resume' : '↺ Watch again'}
            </button>
          )}
        </div>

        {/* Controls */}
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={phase === 'playing' ? handlePause : handleStart}
            disabled={phase === 'ended'}
            className="h-9 w-9 shrink-0 rounded-full bg-purple-600 text-sm text-white hover:bg-purple-700 disabled:opacity-40"
            aria-label={phase === 'playing' ? 'Pause' : 'Play'}
          >
            {phase === 'playing' ? '⏸' : '▶'}
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium text-slate-600">📺 Team Spotlight — {teamName}</div>
            <div className="mt-1 h-1.5 rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-purple-600 transition-[width] duration-300" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
          <button onClick={handleClose} className="shrink-0 px-2 py-1 text-sm text-slate-500 hover:text-slate-800" aria-label="Close show">
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
