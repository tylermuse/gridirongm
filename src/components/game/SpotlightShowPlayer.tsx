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
import { playerForLine, topicTeam } from '@/lib/spotlight/showVisuals';
import type { Player, Team } from '@/types';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { ShowCaption, ShowGraphic, TWO_SHOT_SRC, avatarSrc } from './SpotlightShowGraphics';

interface SpotlightShowPlayerProps {
  topics: {
    headline: string;
    icon: string;
    exchanges: { speakerId: string; text: string }[];
    teamIds?: string[];
    playerIds?: string[];
  }[];
  teamName: string;
  /** Real numbers for on-screen graphics; null before any games are played. */
  stats?: ShowStatLine | null;
  /** For logos and player photos on the graphics. */
  team?: Team;
  teams?: Team[];
  players?: Player[];
}

const logoOf = (t: Team) => (
  <TeamLogo abbreviation={t.abbreviation} primaryColor={t.primaryColor} secondaryColor={t.secondaryColor} logoUrl={t.logoUrl} size="fill" />
);

type Phase = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error' | 'exhausted' | 'locked';

const CLIP_IDS = Object.keys(SHOW_CLIPS) as ShowClipId[];

// Must match MP3_BYTES_PER_SEC in /api/spotlight-show (mp3_44100_128, CBR).
const MP3_BYTES_PER_SEC = 128_000 / 8;

// Silence kept around each piece of speech. Clips and TTS lines all carry
// padding (clips ~0.35s in / ~0.6s out); trimming it to this keeps the
// conversation moving instead of stalling at every cut.
const LEAD_PAD = 0.05;
const TAIL_PAD = 0.12;

/** Where the speech is inside a decoded TTS line (s): first/last 10ms
 *  window within 32 dB of the loudest one. */
function speechSpan(buf: AudioBuffer): { start: number; end: number } {
  const x = buf.getChannelData(0);
  const hop = Math.max(1, Math.round(buf.sampleRate / 100));
  const n = Math.floor(x.length / hop);
  const rms = new Float32Array(n);
  let max = 0;
  for (let k = 0; k < n; k++) {
    let acc = 0;
    for (let j = k * hop; j < (k + 1) * hop; j++) acc += x[j] * x[j];
    rms[k] = Math.sqrt(acc / hop);
    if (rms[k] > max) max = rms[k];
  }
  const thr = max * 0.025; // -32 dB
  let a = 0;
  let b = n - 1;
  while (a < n && rms[a] < thr) a++;
  while (b > a && rms[b] < thr) b--;
  if (a >= n) return { start: 0, end: buf.duration };
  return { start: (a * hop) / buf.sampleRate, end: ((b + 1) * hop) / buf.sampleRate };
}

type VideoSeg = Extract<TimedShowSegment, { kind: 'clip' | 'phrase' }>;
const videoKey = (s: VideoSeg) => (s.kind === 'clip' ? `clip:${s.clip}` : `phrase:${s.phraseId}`);
const videoSrc = (s: VideoSeg) => (s.kind === 'clip' ? SHOW_CLIPS[s.clip].src : s.src);

function toneClass(st: ShowStat) {
  const t = rankTone(st.rank, st.of);
  return t === 'good' ? 'text-emerald-600' : t === 'bad' ? 'text-red-600' : 'text-slate-500';
}

export function SpotlightShowPlayer({ topics, teamName, stats, team, teams = [], players = [] }: SpotlightShowPlayerProps) {
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

  // Show clock for the animated graphics (ms, frozen while paused).
  const [clock, setClock] = useState(0);
  const pausedTotal = useRef(0);
  const pausedAt = useRef<number | null>(null);
  const blockStart = useRef(0);
  const lineStart = useRef(0);
  const speakerStart = useRef(0);
  const blockKey = useRef('');
  const playerStart = useRef(0);
  const playerKey = useRef<string | null>(null);
  const panelKey = useRef('');
  const topicStart = useRef(0);
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spansRef = useRef<Map<number, { start: number; end: number }>>(new Map());

  // Only mount <video> elements for clips this episode actually uses.
  const videoSegs = useMemo(() => {
    const seen = new Map<string, VideoSeg>();
    for (const s of segments) if (s.kind !== 'tts' && !seen.has(videoKey(s))) seen.set(videoKey(s), s);
    // Keep the fixed clips mounted even before load so the intro starts instantly.
    for (const id of CLIP_IDS) {
      const k = `clip:${id}`;
      if (!seen.has(k)) seen.set(k, { kind: 'clip', clip: id, speaker: SHOW_CLIPS[id].speaker, text: SHOW_CLIPS[id].text, speech: SHOW_CLIPS[id].speech });
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
    if (endTimer.current) { clearTimeout(endTimer.current); endTimer.current = null; }
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
      pausedAt.current = performance.now();
      if (endTimer.current) { clearTimeout(endTimer.current); endTimer.current = null; }
      void ctxRef.current?.suspend();
      for (const v of videoRefs.current.values()) v.pause();
      setPhase('paused');
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase !== 'playing') return;
    let raf = 0;
    const tick = () => { setClock(performance.now() - pausedTotal.current); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

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

  /** Player pictured for the voiceover at segment `i`: the latest one named
   *  so far in its topic (see playerForLine). */
  const playerAt = useCallback((segs: TimedShowSegment[], i: number): Player | null => {
    const s = segs[i];
    const t = s?.kind === 'tts' ? s.topicIdx : s?.kind === 'clip' && s.voiceover ? s.voiceover.topicIdx : -1;
    if (t < 0 || !players.length) return null;
    const lines: string[] = [];
    for (let k = 0; k <= i; k++) { const x = segs[k]; if (x.kind === 'tts' && x.topicIdx === t) lines.push(x.text); }
    return playerForLine(lines, lines.length - 1, topics[t], players);
  }, [players, topics]);

  /** Cut away when the clip's speech (plus a hair) is done, not at the end
   *  of the file. Re-armed on resume. */
  const armClipEnd = useCallback((v: HTMLVideoElement, until: number, advance: () => void) => {
    if (endTimer.current) clearTimeout(endTimer.current);
    endTimer.current = setTimeout(advance, Math.max(0, until - v.currentTime) * 1000);
  }, []);
  const resumeClip = useRef<(() => void) | null>(null);

  /** Start (or continue) the graphic: consecutive lines of one topic — and
   *  returns to it after a cutaway — are one continuous shot, and a new
   *  topic only swaps the headline (the panel and tiles stay put). */
  const enterGraphic = useCallback((key: string, speakerChanged: boolean) => {
    const now = performance.now() - pausedTotal.current;
    const panel = key.split(':')[0];
    if (panelKey.current !== panel) { panelKey.current = panel; blockStart.current = now; }
    const same = blockKey.current === key;
    if (!same) { blockKey.current = key; topicStart.current = now; }
    if (!same || speakerChanged) speakerStart.current = now;
    lineStart.current = now;
    const p = playerAt(segmentsRef.current, segIdxRef.current);
    if ((p?.id ?? null) !== playerKey.current) { playerKey.current = p?.id ?? null; playerStart.current = now; }
    setClock(now);
  }, [playerAt]);

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
      if (lowerTimer.current) clearTimeout(lowerTimer.current);
      setLowerThird(false);
      const key = videoKey(seg);
      const v = videoRefs.current.get(key);
      if (!v) return advance();
      const from = Math.max(0, seg.speech.start - LEAD_PAD);
      const until = Math.min(v.duration || Infinity, seg.speech.end + TAIL_PAD);
      v.currentTime = from;
      v.onended = advance; // fallback
      resumeClip.current = () => armClipEnd(v, until, advance);
      v.addEventListener('playing', () => { if (tokenRef.current === token) armClipEnd(v, until, advance); }, { once: true });
      if (seg.kind === 'clip' && seg.voiceover) {
        // Topic transition: the host's line plays over the new topic's
        // graphic wiping in, rather than as a one-second shot of a host.
        enterGraphic(`graphic:${seg.voiceover.topicIdx}`, true);
      }
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
          g.gain.setValueAtTime(slot.start - from < 0.08 ? 0 : 1, ctx.currentTime);
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

    // Generated line: voiceover over the animated graphic.
    resumeClip.current = null;
    const onGraphic = prev && (prev.kind === 'tts' || (prev.kind === 'clip' && !!prev.voiceover));
    enterGraphic(`${seg.visual}:${seg.topicIdx}`, !onGraphic || prev.speaker !== seg.speaker);
    const buf = buffersRef.current.get(i);
    if (!ctx || !buf) return advance();
    const span = spansRef.current.get(i) ?? { start: 0, end: buf.duration };
    const from = Math.max(0, span.start - LEAD_PAD);
    const to = Math.min(buf.duration, span.end + TAIL_PAD);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.onended = advance;
    srcRef.current = src;
    src.start(0, from, to - from);
  }, [armClipEnd, enterGraphic, gainFor, showLowerThird, stopAll]);

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
      // Graphics artwork, decoded up front so the first frame isn't blank.
      await Promise.all([TWO_SHOT_SRC, avatarSrc('marcus'), avatarSrc('tony')].map(src => {
        const im = new Image();
        im.src = src;
        return im.decode().catch(() => {});
      }));
      const spans = new Map<number, { start: number; end: number }>();
      for (const [i, b] of buffers) spans.set(i, speechSpan(b));
      spansRef.current = spans;
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
    if (pausedAt.current != null) { pausedTotal.current += performance.now() - pausedAt.current; pausedAt.current = null; }
    if (phase === 'paused') {
      // Resume in place: suspended audio continues; a clip picks up where it paused.
      const seg = segmentsRef.current[segIdxRef.current];
      if (seg && seg.kind !== 'tts') {
        videoRefs.current.get(videoKey(seg))?.play().catch(() => {});
        resumeClip.current?.();
      }
      setPhase('playing');
      return;
    }
    setPhase('playing');
    playSegment(0);
  }

  function handlePause() {
    pausedAt.current = performance.now();
    if (endTimer.current) { clearTimeout(endTimer.current); endTimer.current = null; }
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
  const vo = seg?.kind === 'clip' && seg.voiceover ? seg : null;
  const activeVideo = seg && seg.kind !== 'tts' && !vo ? videoKey(seg) : null;
  const tts = seg?.kind === 'tts' ? seg : null;
  // What the graphic layer shows: the current voiceover (a line, or a topic
  // transition wiping in), else the last one — kept mounted to dissolve.
  type Gfx = { visual: 'title' | 'graphic'; headline: string; icon: string; speaker: Host; text: string; topicIdx: number };
  const gfxOf = (x: TimedShowSegment | undefined): Gfx | null =>
    !x ? null
      : x.kind === 'tts' ? x
      : x.kind === 'clip' && x.voiceover ? { visual: 'graphic', ...x.voiceover, speaker: x.speaker, text: '' }
      : null;
  let gfx: Gfx | null = null;
  let gfxIdx = segIdx;
  for (; !gfx && gfxIdx >= 0; gfxIdx--) gfx = gfxOf(segments[gfxIdx]);
  gfxIdx++;
  const linePlayer = gfx ? playerAt(segments, gfxIdx) : null;
  const artTeam = team ? topicTeam(gfx ? topics[gfx.topicIdx] : undefined, team, teams) : null;
  const onGfx = !!(tts || vo);
  const mentioned = tts ? statsMentioned(tts.text) : [];
  const phraseStat = seg?.kind === 'phrase' && seg.stat && stats ? stats.stats.find(s => s.key === seg.stat) ?? null : null;
  const speaker: Host | null = seg ? seg.speaker : null;
  const progressPct = segments.length ? ((segIdx + (phase === 'ended' ? 1 : 0)) / segments.length) * 100 : 0;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-white/80 backdrop-blur-sm p-4" role="dialog" aria-label={`Team Spotlight — ${teamName}`}>
      <div className="w-full max-w-4xl">
        <style>{'@keyframes spotlight-bug{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}'}</style>
        <div className="relative w-full aspect-video overflow-hidden rounded-xl border border-slate-200 bg-slate-800 shadow-xl">
          {/* Voiceover lines: animated graphic over the studio two-shot. Stays
              mounted (faded out) during on-camera shots so cuts dissolve. */}
          {gfx && (
            <div className="absolute inset-0 transition-opacity duration-200" style={{ opacity: onGfx ? 1 : 0 }}>
              <ShowGraphic
                variant={gfx.visual === 'title' ? 'title' : 'topic'}
                teamName={teamName}
                headline={gfx.headline}
                icon={gfx.icon}
                stats={stats}
                mentioned={mentioned}
                speaker={gfx.speaker}
                blockMs={onGfx ? clock - blockStart.current : 60_000}
                topicMs={onGfx ? clock - topicStart.current : 60_000}
                lineMs={onGfx ? clock - lineStart.current : 60_000}
                speakerMs={onGfx ? clock - speakerStart.current : 60_000}
                text={gfx.text}
                logo={team ? logoOf(team) : null}
                topicArt={artTeam ? logoOf(artTeam) : <span className="flex h-full w-full items-center justify-center text-[2em] leading-none">{gfx.icon}</span>}
                player={linePlayer && {
                  key: linePlayer.id,
                  art: <PlayerAvatar player={linePlayer} size="fill" teamColor={team?.primaryColor} />,
                  name: `${linePlayer.firstName} ${linePlayer.lastName}`,
                  detail: [linePlayer.position, teams.find(t => t.id === linePlayer.teamId)?.abbreviation].filter(Boolean).join(' · '),
                }}
                playerMs={onGfx ? clock - playerStart.current : 60_000}
              />
            </div>
          )}

          {/* Lip-synced clips: fixed lines + this episode's phrases */}
          {videoSegs.map(([key, vs]) => (
            <video
              key={key}
              ref={el => { if (el) videoRefs.current.set(key, el); else videoRefs.current.delete(key); }}
              src={videoSrc(vs)}
              preload="auto"
              playsInline
              className="absolute inset-0 h-full w-full object-cover transition-opacity duration-200"
              style={{ opacity: activeVideo === key ? 1 : 0 }}
            />
          ))}

          {/* Stat bug over on-camera stat reactions */}
          {phraseStat && (
            <div
              key={seg?.kind === 'phrase' ? seg.phraseId : 'bug'}
              className="absolute right-[3%] top-[5%] animate-[spotlight-bug_450ms_cubic-bezier(0.2,0.8,0.2,1)_both] rounded-md border-l-[5px] border-orange-600 bg-white/95 px-3 py-1.5 text-right shadow-md"
            >
              <div className="flex items-center justify-end gap-1.5 text-[clamp(8px,1.1vw,11px)] font-bold uppercase tracking-wider text-slate-500">
                {team && <span className="inline-block h-[1.6em] w-[1.6em]">{logoOf(team)}</span>}
                {teamName} · {phraseStat.label}
              </div>
              <div className="flex items-baseline justify-end gap-2">
                <span className="text-[clamp(16px,2.8vw,30px)] font-extrabold tabular-nums text-[#1e3a5f]">{phraseStat.value}</span>
                <span className={`text-[clamp(9px,1.3vw,13px)] font-bold ${toneClass(phraseStat)}`}>{ordinal(phraseStat.rank)} of {phraseStat.of}</span>
              </div>
            </div>
          )}

          {/* Lower third: who's on camera for a reaction */}
          {speaker && seg?.kind === 'phrase' && (
            <div
              className="absolute left-[4%] bottom-[18%] rounded border-l-[5px] border-orange-600 bg-white px-3 py-1.5 shadow-md transition-all duration-300"
              style={{ opacity: lowerThird ? 1 : 0, transform: lowerThird ? 'none' : 'translateX(-10px)' }}
            >
              <div className="text-[clamp(11px,1.8vw,17px)] font-extrabold text-[#1e3a5f]">{HOSTS[speaker].name}</div>
              <div className="text-[clamp(8px,1.1vw,11px)] font-semibold uppercase tracking-wider text-slate-500">{HOSTS[speaker].title} · Team Spotlight</div>
            </div>
          )}

          {/* Captions (topic graphics carry the line as a pull quote instead) */}
          {seg && phase !== 'ended' && !(tts && tts.visual === 'graphic') && !vo && <ShowCaption text={seg.text} />}

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
