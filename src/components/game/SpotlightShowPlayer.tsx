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

interface SpotlightShowPlayerProps {
  topics: { headline: string; icon: string; exchanges: { speakerId: string; text: string }[] }[];
  teamName: string;
}

type Phase = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error' | 'exhausted' | 'locked';

const CLIP_IDS = Object.keys(SHOW_CLIPS) as ShowClipId[];
const other = (h: Host): Host => (h === 'marcus' ? 'tony' : 'marcus');

// Must match MP3_BYTES_PER_SEC in /api/spotlight-show (mp3_44100_128, CBR).
const MP3_BYTES_PER_SEC = 128_000 / 8;

export function SpotlightShowPlayer({ topics, teamName }: SpotlightShowPlayerProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [segments, setSegments] = useState<TimedShowSegment[]>([]);
  const [segIdx, setSegIdx] = useState(0);
  const [lowerThird, setLowerThird] = useState(false);
  const pathname = usePathname();

  // Web Audio: each TTS line is its own decoded buffer, played by an
  // AudioBufferSourceNode whose `onended` advances the show. No seeking in a
  // concatenated MP3 (unreliable in Chrome) and no rAF loop (paused in
  // background tabs), so audio and visuals can't drift apart.
  const ctxRef = useRef<AudioContext | null>(null);
  const buffersRef = useRef<Map<number, AudioBuffer>>(new Map());
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const clipRefs = useRef<Partial<Record<ShowClipId, HTMLVideoElement | null>>>({});
  const reactRefs = useRef<Partial<Record<Host, HTMLVideoElement | null>>>({});
  const segIdxRef = useRef(0);
  const segmentsRef = useRef<TimedShowSegment[]>([]);
  const tokenRef = useRef(0); // bumps on every segment start/stop so stale callbacks no-op
  const lowerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopSource = useCallback(() => {
    const src = srcRef.current;
    if (src) {
      src.onended = null;
      try { src.stop(); } catch { /* already stopped */ }
      src.disconnect();
    }
    srcRef.current = null;
  }, []);

  /** Hard stop: kills the current line and all video. */
  const stopAll = useCallback(() => {
    tokenRef.current++;
    stopSource();
    Object.values(clipRefs.current).forEach(v => { if (v) { v.onended = null; v.pause(); } });
    Object.values(reactRefs.current).forEach(v => v?.pause());
  }, [stopSource]);

  // Cleanup on unmount; pause on route change.
  useEffect(() => () => {
    stopAll();
    void ctxRef.current?.close();
    if (lowerTimer.current) clearTimeout(lowerTimer.current);
  }, [stopAll]);
  useEffect(() => {
    if (phase === 'playing') { void ctxRef.current?.suspend(); Object.values(clipRefs.current).forEach(v => v?.pause()); setPhase('paused'); }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const showLowerThird = useCallback(() => {
    setLowerThird(true);
    if (lowerTimer.current) clearTimeout(lowerTimer.current);
    lowerTimer.current = setTimeout(() => setLowerThird(false), 3500);
  }, []);

  // ── Sequencer ──────────────────────────────────────────────────────
  const playSegment = useCallback((i: number) => {
    const segs = segmentsRef.current;
    stopAll();
    const token = tokenRef.current;
    if (i >= segs.length) {
      setPhase('ended');
      return;
    }
    const prev = segs[i - 1];
    const seg = segs[i];
    segIdxRef.current = i;
    setSegIdx(i);
    const advance = () => { if (tokenRef.current === token) playSegment(i + 1); };

    if (seg.kind === 'clip') {
      const v = clipRefs.current[seg.clip];
      if (!v) return advance();
      v.currentTime = 0;
      v.onended = advance;
      v.play().catch(() => setPhase('paused'));
      return;
    }

    if (!prev || prev.speaker !== seg.speaker || prev.kind === 'clip') showLowerThird();
    const ctx = ctxRef.current;
    const buf = buffersRef.current.get(i);
    if (!ctx || !buf) return advance();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.onended = advance;
    srcRef.current = src;
    src.start();

    if (seg.visual === 'reaction') {
      reactRefs.current[other(seg.speaker)]?.play().catch(() => {});
    }
  }, [showLowerThird, stopAll]);

  // ── Controls ───────────────────────────────────────────────────────
  async function handleOpen() {
    if (segmentsRef.current.length) { setPhase('ready'); return; }
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

      // Split the concatenated MP3 back into per-line files. The server
      // derived audioStart/audioDuration as bytes / MP3_BYTES_PER_SEC, so
      // multiplying back gives exact byte offsets.
      const ctx = ctxRef.current ?? new AudioContext();
      ctxRef.current = ctx;
      const buffers = new Map<number, AudioBuffer>();
      await Promise.all(segs.map(async (seg, i) => {
        if (seg.kind !== 'tts' || seg.audioStart == null || seg.audioDuration == null) return;
        const from = Math.round(seg.audioStart * MP3_BYTES_PER_SEC);
        const to = Math.round((seg.audioStart + seg.audioDuration) * MP3_BYTES_PER_SEC);
        const slice = bytes.slice(from, to).buffer;
        buffers.set(i, await ctx.decodeAudioData(slice));
      }));
      buffersRef.current = buffers;
      segmentsRef.current = segs;
      setSegments(segs);
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }

  async function handleStart() {
    const ctx = ctxRef.current;
    if (ctx && ctx.state !== 'running') await ctx.resume(); // needs the click gesture
    if (phase === 'paused') {
      // Resume in place: suspended audio continues; a clip picks up where it paused.
      const seg = segmentsRef.current[segIdxRef.current];
      if (seg?.kind === 'clip') clipRefs.current[seg.clip]?.play().catch(() => {});
      if (seg?.kind === 'tts' && seg.visual === 'reaction') reactRefs.current[other(seg.speaker)]?.play().catch(() => {});
      setPhase('playing');
      return;
    }
    setPhase('playing');
    playSegment(0);
  }

  function handlePause() {
    void ctxRef.current?.suspend();
    Object.values(clipRefs.current).forEach(v => v?.pause());
    Object.values(reactRefs.current).forEach(v => v?.pause());
    setPhase('paused');
  }

  function handleClose() {
    stopAll();
    void ctxRef.current?.suspend();
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
              onClick={handleStart}
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
