'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  HOSTS,
  SHOW_CLIPS,
  type Host,
  type ShowClipId,
  type TimedShowSegment,
} from '@/lib/spotlight/showScript';
import { ordinalSrc } from '@/lib/spotlight/phrases';
import { ordinal, rankTone, statsMentioned, type ShowStat, type ShowStatLine } from '@/lib/spotlight/teamStats';

interface SpotlightShowPlayerProps {
  topics: { headline: string; icon: string; exchanges: { speakerId: string; text: string }[] }[];
  teamName: string;
  /** Real numbers for on-screen graphics; null before any games are played. */
  stats?: ShowStatLine | null;
}

type Phase = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error' | 'exhausted' | 'locked';

const CLIP_IDS = Object.keys(SHOW_CLIPS) as ShowClipId[];

// Must match MP3_BYTES_PER_SEC in /api/spotlight-show (mp3_44100_128, CBR).
const MP3_BYTES_PER_SEC = 128_000 / 8;

type VideoSeg = Extract<TimedShowSegment, { kind: 'clip' | 'phrase' }>;
const videoKey = (s: VideoSeg) => (s.kind === 'clip' ? `clip:${s.clip}` : `phrase:${s.phraseId}`);
const videoSrc = (s: VideoSeg) => (s.kind === 'clip' ? SHOW_CLIPS[s.clip].src : s.src);

function toneClass(st: ShowStat) {
  const t = rankTone(st.rank, st.of);
  return t === 'good' ? 'text-emerald-600' : t === 'bad' ? 'text-red-600' : 'text-slate-500';
}

export function SpotlightShowPlayer({ topics, teamName, stats }: SpotlightShowPlayerProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [segments, setSegments] = useState<TimedShowSegment[]>([]);
  const [segIdx, setSegIdx] = useState(0);
  const [lowerThird, setLowerThird] = useState(false);
  const pathname = usePathname();

  // Web Audio drives everything: each TTS line is its own decoded buffer,
  // and phrase clips are routed through a gain node so a rank slot can be
  // muted and replaced by a pre-voiced ordinal, sample-accurately.
  const ctxRef = useRef<AudioContext | null>(null);
  const buffersRef = useRef<Map<number, AudioBuffer>>(new Map());
  const ordinalBufs = useRef<Map<string, AudioBuffer>>(new Map());
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const slotSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const videoGains = useRef<Map<string, GainNode>>(new Map());
  const segIdxRef = useRef(0);
  const segmentsRef = useRef<TimedShowSegment[]>([]);
  const tokenRef = useRef(0); // bumps on every segment start/stop so stale callbacks no-op
  const lowerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only mount <video> elements for clips this episode actually uses.
  const videoSegs = useMemo(() => {
    const seen = new Map<string, VideoSeg>();
    for (const s of segments) if (s.kind !== 'tts' && !seen.has(videoKey(s))) seen.set(videoKey(s), s);
    // Keep the fixed clips mounted even before load so the intro starts instantly.
    for (const id of CLIP_IDS) {
      const k = `clip:${id}`;
      if (!seen.has(k)) seen.set(k, { kind: 'clip', clip: id, speaker: SHOW_CLIPS[id].speaker, text: SHOW_CLIPS[id].text });
    }
    return [...seen.entries()];
  }, [segments]);

  const stopSources = useCallback(() => {
    for (const ref of [srcRef, slotSrcRef]) {
      const src = ref.current;
      if (src) {
        src.onended = null;
        try { src.stop(); } catch { /* already stopped */ }
        src.disconnect();
      }
      ref.current = null;
    }
    const ctx = ctxRef.current;
    if (ctx) for (const g of videoGains.current.values()) { g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setValueAtTime(1, ctx.currentTime); }
  }, []);

  /** Hard stop: kills the current line and all video. */
  const stopAll = useCallback(() => {
    tokenRef.current++;
    stopSources();
    for (const v of videoRefs.current.values()) { v.onended = null; v.pause(); }
  }, [stopSources]);

  // Cleanup on unmount; pause on route change.
  useEffect(() => () => {
    stopAll();
    void ctxRef.current?.close();
    if (lowerTimer.current) clearTimeout(lowerTimer.current);
  }, [stopAll]);
  useEffect(() => {
    if (phase === 'playing') {
      void ctxRef.current?.suspend();
      for (const v of videoRefs.current.values()) v.pause();
      setPhase('paused');
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const showLowerThird = useCallback(() => {
    setLowerThird(true);
    if (lowerTimer.current) clearTimeout(lowerTimer.current);
    lowerTimer.current = setTimeout(() => setLowerThird(false), 3500);
  }, []);

  /** Route a phrase clip's audio through a gain node (once per element). */
  const gainFor = useCallback((key: string, v: HTMLVideoElement) => {
    const ctx = ctxRef.current;
    if (!ctx) return null;
    let g = videoGains.current.get(key);
    if (!g) {
      g = ctx.createGain();
      ctx.createMediaElementSource(v).connect(g);
      g.connect(ctx.destination);
      videoGains.current.set(key, g);
    }
    return g;
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
    const ctx = ctxRef.current;

    if (seg.kind === 'clip' || seg.kind === 'phrase') {
      const key = videoKey(seg);
      const v = videoRefs.current.get(key);
      if (!v) return advance();
      v.currentTime = 0;
      v.onended = advance;
      if (seg.kind === 'phrase') {
        if (!prev || prev.speaker !== seg.speaker || prev.kind === 'tts') showLowerThird();
        const g = gainFor(key, v);
        const buf = seg.slot ? ordinalBufs.current.get(`${seg.speaker}/${seg.slot.rank}`) : undefined;
        if (ctx && g && seg.slot && buf) {
          // Replace the placeholder rank: duck the clip, play the real one.
          // Scheduled from the moment the video is actually playing (play()
          // has startup latency); slots at the very start begin pre-muted.
          const slot = seg.slot;
          const win = slot.end - slot.start;
          const rate = Math.min(1.3, Math.max(1, buf.duration / Math.max(0.2, win)));
          const hold = Math.max(win, buf.duration / rate);
          g.gain.cancelScheduledValues(ctx.currentTime);
          g.gain.setValueAtTime(slot.start < 0.08 ? 0 : 1, ctx.currentTime);
          const schedule = () => {
            if (tokenRef.current !== token) return;
            const at = ctx.currentTime + Math.max(0, slot.start - v.currentTime);
            const s = ctx.createBufferSource();
            s.buffer = buf;
            // Longer ordinal than the window? Speed it up slightly (≤1.3×)
            // so it never talks over the next word.
            s.playbackRate.value = rate;
            s.connect(ctx.destination);
            g.gain.setValueAtTime(0, at);
            g.gain.setValueAtTime(1, at + hold);
            s.start(at);
            slotSrcRef.current = s;
          };
          v.addEventListener('playing', schedule, { once: true });
        }
      }
      v.play().catch(() => setPhase('paused'));
      return;
    }

    // Generated line: voiceover over the stat graphic.
    if (!prev || prev.speaker !== seg.speaker || prev.kind !== 'tts') showLowerThird();
    const buf = buffersRef.current.get(i);
    if (!ctx || !buf) return advance();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.onended = advance;
    srcRef.current = src;
    src.start();
  }, [gainFor, showLowerThird, stopAll]);

  // ── Controls ───────────────────────────────────────────────────────
  async function handleOpen() {
    if (segmentsRef.current.length) { setPhase('ready'); return; }
    setPhase('loading');
    try {
      const res = await fetch('/api/spotlight-show', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics, teamName, stats }),
      });
      if (!res.ok) {
        if (res.status === 403) return setPhase('locked');
        if (res.status === 402 || res.status === 429) return setPhase('exhausted');
        throw new Error('Failed to generate show');
      }
      const { segments: segs, audio } = (await res.json()) as { segments: TimedShowSegment[]; audio: string };
      const bytes = Uint8Array.from(atob(audio), c => c.charCodeAt(0));

      const ctx = ctxRef.current ?? new AudioContext();
      ctxRef.current = ctx;

      // Split the concatenated MP3 back into per-line files. The server
      // derived audioStart/audioDuration as bytes / MP3_BYTES_PER_SEC, so
      // multiplying back gives exact byte offsets.
      const buffers = new Map<number, AudioBuffer>();
      const ordinals = new Map<string, AudioBuffer>();
      await Promise.all([
        ...segs.map(async (seg, i) => {
          if (seg.kind !== 'tts' || seg.audioStart == null || seg.audioDuration == null) return;
          const from = Math.round(seg.audioStart * MP3_BYTES_PER_SEC);
          const to = Math.round((seg.audioStart + seg.audioDuration) * MP3_BYTES_PER_SEC);
          buffers.set(i, await ctx.decodeAudioData(bytes.slice(from, to).buffer));
        }),
        ...segs.map(async seg => {
          if (seg.kind !== 'phrase' || !seg.slot) return;
          const k = `${seg.speaker}/${seg.slot.rank}`;
          if (ordinals.has(k)) return;
          const r = await fetch(ordinalSrc(seg.speaker, seg.slot.rank));
          if (r.ok) ordinals.set(k, await ctx.decodeAudioData(await r.arrayBuffer()));
        }),
      ]);
      buffersRef.current = buffers;
      ordinalBufs.current = ordinals;
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
      if (seg && seg.kind !== 'tts') videoRefs.current.get(videoKey(seg))?.play().catch(() => {});
      setPhase('playing');
      return;
    }
    setPhase('playing');
    playSegment(0);
  }

  function handlePause() {
    void ctxRef.current?.suspend();
    for (const v of videoRefs.current.values()) v.pause();
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
  const activeVideo = seg && seg.kind !== 'tts' ? videoKey(seg) : null;
  const tts = seg?.kind === 'tts' ? seg : null;
  const mentioned = tts ? statsMentioned(tts.text) : [];
  const phraseStat = seg?.kind === 'phrase' && seg.stat && stats ? stats.stats.find(s => s.key === seg.stat) ?? null : null;
  const speaker: Host | null = seg ? seg.speaker : null;
  const progressPct = segments.length ? ((segIdx + (phase === 'ended' ? 1 : 0)) / segments.length) * 100 : 0;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-white/80 backdrop-blur-sm p-4" role="dialog" aria-label={`Team Spotlight — ${teamName}`}>
      <div className="w-full max-w-4xl">
        <div className="relative w-full aspect-video overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-xl">
          {/* Lip-synced clips: fixed lines + this episode's phrases */}
          {videoSegs.map(([key, vs]) => (
            <video
              key={key}
              ref={el => { if (el) videoRefs.current.set(key, el); else videoRefs.current.delete(key); }}
              src={videoSrc(vs)}
              preload="auto"
              playsInline
              className="absolute inset-0 h-full w-full object-cover"
              style={{ opacity: activeVideo === key ? 1 : 0 }}
            />
          ))}

          {/* Voiceover lines: title card / topic graphic with the real stat line */}
          {tts && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-200 px-[6%] pb-[12%] text-center">
              <div className="absolute inset-x-0 top-0 h-[1.5%] bg-orange-600" />
              <div className="text-[clamp(10px,1.5vw,14px)] font-bold tracking-[0.3em] text-slate-500">
                {tts.visual === 'title' ? 'TEAM SPOTLIGHT' : 'THE BREAKDOWN'}
              </div>
              <div className="mt-[1.5%] flex items-center justify-center gap-[1.5%]">
                <span className="text-[clamp(22px,4.5vw,48px)] leading-none">{tts.icon}</span>
                <span className="text-[clamp(16px,3.2vw,36px)] font-extrabold leading-tight text-[#1e3a5f]">{tts.headline}</span>
              </div>
              {tts.visual === 'graphic' && (
                <div className="mt-[1%] text-[clamp(9px,1.3vw,13px)] font-semibold uppercase tracking-widest text-slate-500">
                  {teamName}{stats ? ` · ${stats.record}` : ''}
                </div>
              )}
              {tts.visual === 'title' && stats && (
                <div className="mt-[1%] text-[clamp(12px,2vw,20px)] font-bold text-slate-600">{stats.record}</div>
              )}
              {stats && (
                <div className="mt-[3%] grid w-full max-w-[92%] grid-cols-5 gap-[1.2%]">
                  {stats.stats.map(st => {
                    const hot = mentioned.includes(st.key);
                    return (
                      <div
                        key={st.key}
                        className={`rounded-lg border bg-white px-[4%] py-[6%] shadow-sm transition-all duration-300 ${hot ? 'scale-105 border-orange-500 ring-2 ring-orange-500/60' : 'border-slate-200'}`}
                      >
                        <div className="text-[clamp(8px,1.1vw,11px)] font-bold uppercase tracking-wider text-slate-500">{st.label}</div>
                        <div className="text-[clamp(16px,3vw,34px)] font-extrabold leading-tight text-[#1e3a5f] tabular-nums">{st.value}</div>
                        <div className={`text-[clamp(8px,1.1vw,12px)] font-bold ${toneClass(st)}`}>{ordinal(st.rank)} of {st.of}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Stat bug over on-camera stat reactions */}
          {phraseStat && (
            <div className="absolute right-[3%] top-[5%] rounded-md border-l-[5px] border-orange-600 bg-white/95 px-3 py-1.5 text-right shadow-md">
              <div className="text-[clamp(8px,1.1vw,11px)] font-bold uppercase tracking-wider text-slate-500">{teamName} · {phraseStat.label}</div>
              <div className="flex items-baseline justify-end gap-2">
                <span className="text-[clamp(16px,2.8vw,30px)] font-extrabold tabular-nums text-[#1e3a5f]">{phraseStat.value}</span>
                <span className={`text-[clamp(9px,1.3vw,13px)] font-bold ${toneClass(phraseStat)}`}>{ordinal(phraseStat.rank)}</span>
              </div>
            </div>
          )}

          {/* Lower third: who's talking (voiceover or on camera) */}
          {speaker && seg?.kind !== 'clip' && (
            <div
              className="absolute left-[4%] bottom-[20%] rounded border-l-[5px] border-orange-600 bg-white px-3 py-1.5 shadow-md transition-all duration-300"
              style={{ opacity: lowerThird ? 1 : 0, transform: lowerThird ? 'none' : 'translateX(-10px)' }}
            >
              <div className="text-[clamp(11px,1.8vw,17px)] font-extrabold text-[#1e3a5f]">{HOSTS[speaker].name}</div>
              <div className="text-[clamp(8px,1.1vw,11px)] font-semibold uppercase tracking-wider text-slate-500">{HOSTS[speaker].title} · Team Spotlight</div>
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
