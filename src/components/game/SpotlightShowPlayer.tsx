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
import { computeShowStatLine, ordinal, rankTone, statsMentioned, type ShowStat, type ShowStatLine } from '@/lib/spotlight/teamStats';
import { topicTeam } from '@/lib/spotlight/showVisuals';
import { focusForLine, measurableIn, type Focus } from '@/lib/spotlight/showFocus';
import { planShots } from '@/lib/spotlight/showShots';
import type { TileStat } from '@/lib/spotlight/playerStats';
import type { GameTopic } from '@/lib/spotlight/showGame';
import { conferenceRace, divisionTable } from '@/lib/spotlight/showStandings';
import type { Player, Team } from '@/types';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { ShowCaption, ShowGraphic, TWO_SHOT_SRC, avatarSrc } from './SpotlightShowGraphics';

/** Over-the-shoulder listening loops (studio screens frozen, so the
 *  footage on them doesn't run backward on the loop). */
const OTS_SRC = (listener: Host) => `/show/ots/${listener}_listen.mp4`;
const OTS_ALL = [OTS_SRC('marcus'), OTS_SRC('tony')];

type ShowTopic = {
  headline: string;
  icon: string;
  exchanges: { speakerId: string; text: string }[];
  teamIds?: string[];
  playerIds?: string[];
} & Partial<Pick<GameTopic, 'depth' | 'gameLines' | 'gameTeam' | 'gameCompare' | 'gameLabel' | 'gameFlow'>>;

interface SpotlightShowPlayerProps {
  topics: ShowTopic[];
  /** The postgame breakdown of the team's last game (goes first). */
  game?: GameTopic[];
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

/** Clips fetched into memory before the Start button appears; the rest
 *  stream in behind playback, in the order they're needed. */
const CLIPS_BEFORE_START = 6;

/** Episodes whose script has been requested ahead of time (per page load). */
const prefetched = new Set<string>();

interface BlockMsg { index: number; audio: string; lines: { seg: number; start: number; duration: number }[] }


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

export function SpotlightShowPlayer({ topics: storyTopics, game, teamName, stats, team, teams = [], players = [] }: SpotlightShowPlayerProps) {
  // The episode: the last game broken down first, then the storylines.
  const topics: ShowTopic[] = useMemo(() => [...(game ?? []), ...storyTopics], [game, storyTopics]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [segments, setSegments] = useState<TimedShowSegment[]>([]);
  /** The request (topics + stats) the loaded episode was made for. */
  const loadedFor = useRef<string | null>(null);
  const [segIdx, setSegIdx] = useState(0);
  // The clip actually on screen: switched only once the next clip is really
  // playing, so a cut never flashes a stale frame or an empty stage.
  const [visibleVideo, setVisibleVideo] = useState<string | null>(null);
  // Clips fetched into memory (src → blob URL): the first few before Start,
  // the rest during playback. An element keeps whatever source it was first
  // given, so a clip never reloads under the viewer.
  const blobUrls = useRef<Map<string, string>>(new Map());
  const lockedSrc = useRef<Map<string, string>>(new Map());
  /** Other teams' league ranks, computed once each (lines about the opponent). */
  const teamStatCache = useRef<Map<string, ShowStatLine | null>>(new Map());
  const [, setClipVersion] = useState(0);
  // The episode's voices arrive block by block (NDJSON); a line whose block
  // hasn't landed yet waits for it.
  const streamDone = useRef(true);
  const waitingFor = useRef<number | null>(null);
  const [buffering, setBuffering] = useState(false);
  // Holding at the end of what's written so far: keep the last graphic up.
  const [holding, setHolding] = useState(false);
  const [, setAudioVersion] = useState(0);
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
  const segStart = useRef(0);
  const [scrub, setScrub] = useState<number | null>(null); // 0..1 while dragging
  const playerStart = useRef(0);
  const playerKey = useRef<string | null>(null);
  // Focus per segment, recomputed when the episode or league data changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a fresh cache per input is the point
  const focusCache = useMemo(() => new Map<number, Focus>(), [segments, players, teams, team, topics]);
  const otsRefs = useRef(new Map<string, HTMLVideoElement>());
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

  useEffect(() => {
    const urls = blobUrls.current;
    return () => { for (const u of urls.values()) URL.revokeObjectURL(u); };
  }, []);

  // Write the script ahead of time, once the Spotlight's topics settle, so
  // Watch Show starts right away (server-side it's writing only — no voices,
  // no credit — and only for viewers who can watch).
  const requestBody = useMemo(() => JSON.stringify({ topics, teamName, stats }), [topics, teamName, stats]);
  useEffect(() => {
    if (!topics.length || prefetched.has(requestBody)) return;
    const t = setTimeout(() => {
      prefetched.add(requestBody);
      void fetch('/api/spotlight-show/script', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: requestBody }).catch(() => {});
    }, 4000);
    return () => clearTimeout(t);
  }, [requestBody, topics.length]);

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

  // The listening shots run whenever the show does.
  useEffect(() => {
    for (const v of otsRefs.current.values()) {
      if (phase === 'playing') void v.play().catch(() => {});
      else v.pause();
    }
  }, [phase]);

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
  /** iPhone Safari only lets a <video> with sound start on its own once it
   *  has been played inside a tap. Every clip is its own element, so without
   *  this each first on-camera shot stalled on "Resume". Play-and-pause each
   *  idle clip during the tap (Start/Resume, or any tap on the player) —
   *  silent, since nothing renders before the pause. */
  const primed = useRef(new WeakSet<HTMLVideoElement>());
  const primeVideos = useCallback(() => {
    for (const v of videoRefs.current.values()) {
      if (primed.current.has(v) || !v.paused) continue;
      primed.current.add(v);
      v.play().catch(() => {});
      v.pause();
    }
  }, []);

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

  /** What the voiceover at segment `i` is about (a player, a unit, a team
   *  stat, or nothing measurable) — decides the graphic. */
  const focusAt = useCallback((segs: TimedShowSegment[], i: number): Focus => {
    const hit = focusCache.get(i);
    if (hit) return hit;
    const s0 = segs[i];
    const t = s0?.kind === 'tts' ? s0.topicIdx : s0?.kind === 'clip' && s0.voiceover ? s0.voiceover.topicIdx : -1;
    let f: Focus;
    if (t < 0 || !team) {
      f = { kind: 'team', mentioned: s0?.kind === 'tts' ? statsMentioned(s0.text) : [] };
    } else {
      const earlier: string[] = [];
      const earlierPlays: (number | undefined)[] = [];
      for (let k = 0; k < i; k++) { const x = segs[k]; if (x.kind === 'tts' && x.topicIdx === t) { earlier.push(x.text); earlierPlays.push(x.play); } }
      f = focusForLine(s0.kind === 'tts' ? s0.text : '', { topic: topics[t], team, teams, players, earlier, earlierPlays, play: s0.kind === 'tts' ? s0.play : undefined });
      // A topic transition always shows the panel (the new headline wipes in).
      if (s0.kind === 'clip' && f.kind === 'none') f = { kind: 'team', mentioned: [] };
    }
    focusCache.set(i, f);
    return f;
  }, [focusCache, team, teams, players, topics]);

  /** Which shot each voiced line plays over (the graphic or the
   *  over-the-shoulder listening shot), planned over the whole run of lines
   *  so short lines and asides don't cut back and forth. */
  const shots = useMemo(() => planShots(segments.map(sg => sg.kind === 'tts' && sg.visual === 'graphic' && sg.topicIdx >= 0
    ? {
      kind: 'tts' as const, speaker: sg.speaker, topicIdx: sg.topicIdx, words: sg.text.split(/\s+/).length,
      bare: !!team && !measurableIn(sg.text, { topic: topics[sg.topicIdx], team, teams, players, earlier: [], play: sg.play }),
    }
    : { kind: 'other' as const, speaker: sg.speaker, topicIdx: -1, words: 0, bare: false })), [segments, team, teams, players, topics]);

  /** Cut away when the clip's speech (plus a hair) is done, not at the end
   *  of the file. Watches the video's own playhead rather than a wall-clock
   *  timer, so a clip that stalls to buffer (phones) isn't cut off before its
   *  last words. Re-armed on resume. */
  const armClipEnd = useCallback((v: HTMLVideoElement, until: number, advance: () => void) => {
    if (endTimer.current) clearTimeout(endTimer.current);
    const check = () => {
      if (v.ended || (!v.seeking && v.currentTime >= until - 0.02)) { endTimer.current = null; advance(); return; }
      const left = (until - v.currentTime) / (v.playbackRate || 1);
      endTimer.current = setTimeout(check, Math.min(250, Math.max(15, left * 1000)));
    };
    check();
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
    const f = focusAt(segmentsRef.current, segIdxRef.current);
    const fk = f.kind === 'player' ? `p:${f.player.id}` : f.kind === 'unit' ? `u:${f.unit}` : f.kind;
    if (fk !== playerKey.current) { playerKey.current = fk; playerStart.current = now; }
    setClock(now);
  }, [focusAt]);

  // ── Sequencer ──────────────────────────────────────────────────────
  const playSegment = useCallback((i: number) => {
    const segs = segmentsRef.current;
    stopAll();
    const token = tokenRef.current;
    if (i >= segs.length) {
      // Still being written: hold on the episode's graphic (never a frozen
      // host) until the next lines land.
      if (!streamDone.current) { waitingFor.current = i; setBuffering(true); setHolding(true); setVisibleVideo(null); return; }
      setPhase('ended');
      return;
    }
    const prev = segs[i - 1];
    const seg = segs[i];
    setHolding(false);
    segIdxRef.current = i;
    segStart.current = performance.now() - pausedTotal.current;
    setSegIdx(i);
    const advance = () => { if (tokenRef.current === token) playSegment(i + 1); };
    const ctx = ctxRef.current;

    if (seg.kind === 'clip' || seg.kind === 'phrase') {
      if (lowerTimer.current) clearTimeout(lowerTimer.current);
      setLowerThird(false);
      const key = videoKey(seg);
      const v = videoRefs.current.get(key);
      if (!v) return advance();
      if (!v.getAttribute('src')) {
        // Jumped ahead of the clip fetches: stream this one from the network.
        lockedSrc.current.set(key, videoSrc(seg));
        v.src = videoSrc(seg);
      }
      const from = Math.max(0, seg.speech.start - LEAD_PAD);
      const until = Math.min(v.duration || Infinity, seg.speech.end + TAIL_PAD);
      v.currentTime = from;
      v.onended = advance; // fallback
      resumeClip.current = () => armClipEnd(v, until, advance);
      const isVo = seg.kind === 'clip' && !!seg.voiceover;
      v.addEventListener('playing', () => {
        if (tokenRef.current !== token) return;
        armClipEnd(v, until, advance);
        setVisibleVideo(isVo ? null : key);
      }, { once: true });
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
          // The ordinals are cut from running speech, so they already fit the
          // window; never speed them up more than ~1 semitone (any more and
          // the rank comes out chipmunk-high) — a hair of overlap is better.
          const slot = seg.slot;
          const win = slot.end - slot.start;
          const rate = Math.min(1.06, Math.max(1, buf.duration / Math.max(0.2, win)));
          const hold = Math.max(win, buf.duration / rate);
          g.gain.cancelScheduledValues(ctx.currentTime);
          g.gain.setValueAtTime(slot.start - from < 0.08 ? 0 : 1, ctx.currentTime);
          const schedule = () => {
            if (tokenRef.current !== token) return;
            const at = ctx.currentTime + Math.max(0, slot.start - v.currentTime);
            const s = ctx.createBufferSource();
            s.buffer = buf;
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
    setVisibleVideo(null);
    const onGraphic = prev && (prev.kind === 'tts' || (prev.kind === 'clip' && !!prev.voiceover));
    enterGraphic(`${seg.visual}:${seg.topicIdx}`, !onGraphic || prev.speaker !== seg.speaker);
    const buf = buffersRef.current.get(i);
    if (!ctx) return advance();
    if (!buf) {
      // Its voices are still being produced: hold on the graphic.
      if (!streamDone.current) { waitingFor.current = i; setBuffering(true); return; }
      return advance();
    }
    waitingFor.current = null;
    setBuffering(false);
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
  // Latest sequencer and phase for callbacks that outlive a render (voices
  // arriving from the stream).
  const playSegmentRef = useRef(playSegment);
  const phaseRef = useRef<Phase>(phase);
  useEffect(() => { playSegmentRef.current = playSegment; }, [playSegment]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── Controls ───────────────────────────────────────────────────────
  /** Decode one voiced block and cut each of its lines out by the server's
   *  timestamps; resumes a line that was waiting for it. */
  async function addBlock(ctx: AudioContext, msg: BlockMsg) {
    const bytes = Uint8Array.from(atob(msg.audio), c => c.charCodeAt(0));
    const block = await ctx.decodeAudioData(bytes.buffer);
    const sr = block.sampleRate;
    for (const l of msg.lines) {
      const from = Math.max(0, Math.floor((l.start - 0.03) * sr));
      const to = Math.min(block.length, Math.ceil((l.start + l.duration + 0.08) * sr));
      if (to <= from) continue;
      const line = ctx.createBuffer(block.numberOfChannels, to - from, sr);
      for (let c = 0; c < block.numberOfChannels; c++) line.copyToChannel(block.getChannelData(c).subarray(from, to), c);
      buffersRef.current.set(l.seg, line);
      spansRef.current.set(l.seg, speechSpan(line));
    }
    setAudioVersion(v => v + 1);
    resumeWaiting();
  }

  /** A line was waiting for voices that just arrived (or never will). */
  function resumeWaiting() {
    const k = waitingFor.current;
    if (k == null || phaseRef.current !== 'playing') return;
    const seg = segmentsRef.current[k];
    const ready = !!seg && (seg.kind !== 'tts' || buffersRef.current.has(k));
    if (!ready && !streamDone.current) return;
    waitingFor.current = null;
    setBuffering(false);
    playSegmentRef.current(k);
  }

  const clipQueue = useRef<string[]>([]);
  const queued = useRef<Set<string>>(new Set());
  const fetchers = useRef(0);

  async function fetchClip(src: string) {
    if (blobUrls.current.has(src)) return;
    try {
      const r = await fetch(src);
      if (!r.ok) return;
      blobUrls.current.set(src, URL.createObjectURL(await r.blob()));
      setClipVersion(v => v + 1);
    } catch { /* the element falls back to the network */ }
  }

  /** Fetch what a (possibly grown) script needs: rank ordinals for slot
   *  phrases, and its clips — queued in play order, three at a time. */
  async function loadAssets(ctx: AudioContext, segs: TimedShowSegment[]) {
    await Promise.all(segs.map(async seg => {
      if (seg.kind !== 'phrase' || !seg.slot) return;
      const k = `${seg.speaker}/${seg.slot.rank}`;
      if (ordinalBufs.current.has(k)) return;
      const r = await fetch(ordinalSrc(seg.speaker, seg.slot.rank));
      if (r.ok) ordinalBufs.current.set(k, await ctx.decodeAudioData(await r.arrayBuffer()));
    }));
    for (const sg of segs) {
      if (sg.kind === 'tts') continue;
      const src = videoSrc(sg);
      if (queued.current.has(src)) continue;
      queued.current.add(src);
      clipQueue.current.push(src);
    }
    while (fetchers.current < 3 && clipQueue.current.length) {
      fetchers.current++;
      void (async () => {
        for (let src = clipQueue.current.shift(); src; src = clipQueue.current.shift()) await fetchClip(src);
        fetchers.current--;
      })();
    }
  }

  /** Lay out the episode and fetch what the first moments need. */
  async function prepare(ctx: AudioContext, segs: TimedShowSegment[]) {
    updateScript(ctx, segs);
    const first: string[] = [];
    for (const sg of segs) if (sg.kind !== 'tts' && !first.includes(videoSrc(sg))) first.push(videoSrc(sg));
    await Promise.all([
      ...first.slice(0, CLIPS_BEFORE_START).map(fetchClip),
      ...[TWO_SHOT_SRC, avatarSrc('marcus'), avatarSrc('tony')].map(src => {
        const im = new Image();
        im.src = src;
        return im.decode().catch(() => {});
      }),
    ]);
  }

  /** The script grew (the next topic was written): play on into it. */
  function updateScript(ctx: AudioContext, segs: TimedShowSegment[]) {
    segmentsRef.current = segs;
    setSegments(segs);
    void loadAssets(ctx, segs);
    resumeWaiting();
  }

  // ── Controls ───────────────────────────────────────────────────────
  async function handleOpen() {
    // The player stays mounted on the dashboard across sims: reuse the
    // loaded episode only if it's for this same Spotlight.
    if (segmentsRef.current.length && loadedFor.current === requestBody) { setPhase('ready'); return; }
    const episode = requestBody;
    loadedFor.current = episode;
    segmentsRef.current = [];
    setSegments([]);
    segIdxRef.current = 0;
    setSegIdx(0);
    setPhase('loading');
    try {
      const res = await fetch('/api/spotlight-show', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      });
      if (!res.ok) {
        if (res.status === 403) return setPhase('locked');
        if (res.status === 402 || res.status === 429) return setPhase('exhausted');
        throw new Error('Failed to generate show');
      }
      const ctx = ctxRef.current ?? new AudioContext();
      ctxRef.current = ctx;
      buffersRef.current = new Map();
      spansRef.current = new Map();
      ordinalBufs.current = new Map();

      if (!(res.headers.get('content-type') ?? '').includes('ndjson')) {
        // A cached episode: everything at once.
        const { segments: segs, audios } = (await res.json()) as { segments: TimedShowSegment[]; audios: string[] };
        streamDone.current = true;
        const blocks: BlockMsg[] = audios.map((audio, index) => ({ index, audio, lines: [] }));
        segs.forEach((sg, i) => {
          if (sg.kind === 'tts' && sg.audioIndex != null && sg.audioStart != null && sg.audioDuration != null) {
            blocks[sg.audioIndex]?.lines.push({ seg: i, start: sg.audioStart, duration: sg.audioDuration });
          }
        });
        await Promise.all([prepare(ctx, segs), ...blocks.map(b => addBlock(ctx, b))]);
        setPhase('ready');
        return;
      }

      // A fresh episode: the script first, then each topic's voices as
      // they're produced. Start is offered as soon as the opening is ready.
      streamDone.current = false;
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let gotScript = false;
      const pending: Promise<void>[] = [];
      const finish = () => { streamDone.current = true; resumeWaiting(); };
      void (async () => {
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            if (loadedFor.current !== episode) { void reader.cancel(); return; } // a newer episode took over
            buf += dec.decode(value, { stream: true });
            let nl: number;
            while ((nl = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, nl).trim();
              buf = buf.slice(nl + 1);
              if (!line) continue;
              const msg = JSON.parse(line) as { type: string; segments?: TimedShowSegment[]; message?: string } & Partial<BlockMsg>;
              if (msg.type === 'script' && msg.segments) {
                if (!gotScript) {
                  gotScript = true;
                  void prepare(ctx, msg.segments).then(() => setPhase(p => (p === 'loading' ? 'ready' : p)), () => setPhase('error'));
                } else {
                  updateScript(ctx, msg.segments);
                }
              } else if (msg.type === 'block' && msg.audio && msg.lines) {
                pending.push(addBlock(ctx, msg as BlockMsg).catch(() => {}));
              } else if (msg.type === 'error' && !gotScript) {
                setPhase('error');
              }
            }
          }
        } catch {
          if (!gotScript) setPhase('error');
        }
        await Promise.all(pending);
        finish();
      })();
    } catch {
      setPhase('error');
    }
  }

  async function handleStart() {
    primeVideos(); // before any await: it needs the tap
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
      phaseRef.current = 'playing';
      setPhase('playing');
      resumeWaiting();
      return;
    }
    phaseRef.current = 'playing';
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
    void leaveFull();
    stopAll();
    void ctxRef.current?.suspend();
    setPhase('idle');
    setSegIdx(0);
    segIdxRef.current = 0;
  }

  // ── Seeking ────────────────────────────────────────────────────────
  function frac(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  }

  /** Jump to the start of the line playing at `t` seconds (lines are the
   *  unit: you go back to the beginning of what they said). */
  async function seekTo(t: number) {
    if (!segmentsRef.current.length) return;
    let k = timeline.starts.findIndex((s0, i) => t >= s0 && t < (timeline.starts[i + 1] ?? Infinity));
    if (k < 0) k = segmentsRef.current.length - 1;
    const ctx = ctxRef.current;
    if (ctx && ctx.state !== 'running') await ctx.resume();
    if (pausedAt.current != null) { pausedTotal.current += performance.now() - pausedAt.current; pausedAt.current = null; }
    // Jumping into a topic mid-way: let its graphic come in fresh.
    blockKey.current = '';
    panelKey.current = '';
    phaseRef.current = 'playing';
    setPhase('playing');
    playSegment(k);
  }

  // ── Full screen ────────────────────────────────────────────────────
  // Native Fullscreen API where the browser has it for elements (Android,
  // desktop, iPad); iPhone Safari only allows it on <video>, so there the
  // stage just fills the viewport (turn the phone sideways). Controls float
  // over the picture and fade while it plays; tap to bring them back.
  const dialogRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const [chromeShown, setChromeShown] = useState(true);
  const [poked, setPoked] = useState(0);
  const poke = useCallback(() => { setChromeShown(true); setPoked(n => n + 1); }, []);
  useEffect(() => {
    if (!full || phase !== 'playing') return;
    const t = setTimeout(() => setChromeShown(false), 3000);
    return () => clearTimeout(t);
  }, [full, phase, poked]);
  useEffect(() => {
    const onChange = () => { if (!fullscreenElement()) setFull(false); };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);
  async function enterFull() {
    setFull(true);
    poke();
    const el = dialogRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> }) | null;
    const request = el?.requestFullscreen ?? el?.webkitRequestFullscreen;
    try {
      await request?.call(el);
      await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.('landscape');
    } catch { /* CSS full-viewport fallback is already showing */ }
  }
  async function leaveFull() {
    setFull(false);
    setChromeShown(true);
    if (!fullscreenElement()) return;
    const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> };
    try { await (doc.exitFullscreen ?? doc.webkitExitFullscreen)?.call(doc); } catch { /* already out */ }
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
  const activeVideo = visibleVideo;
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
  const focus: Focus | null = gfx ? focusAt(segments, gfxIdx) : null;
  const linePlayer = focus?.kind === 'player' ? focus.player : null;
  // A line about another team: its numbers (and its name in the corner).
  const focusTeam = focus?.kind === 'team' && focus.teamId ? teams.find(t => t.id === focus.teamId) ?? null : null;
  let focusTeamStats: ShowStatLine | null = null;
  if (focusTeam) {
    // Keyed by record too: the player stays mounted across sims.
    const key = `${focusTeam.id}:${focusTeam.record.wins}-${focusTeam.record.losses}`;
    if (!teamStatCache.current.has(key)) teamStatCache.current.set(key, computeShowStatLine(focusTeam, teams, players));
    focusTeamStats = teamStatCache.current.get(key) ?? null;
  }
  // The panel's corner shows the spotlight team — or the other team while a
  // line is about them: one of their players, or the team itself by name.
  const cornerTeam = (() => {
    if (!team || !gfx) return null;
    if (focusTeam) return focusTeam;
    if (linePlayer) return linePlayer.teamId && linePlayer.teamId !== team.id ? teams.find(t => t.id === linePlayer.teamId) ?? null : null;
    const other = topicTeam(topics[gfx.topicIdx], team, teams);
    return other.id !== team.id && namesTeam(gfx.text, other) ? other : null;
  })();
  const shot = tts && phase !== 'ended' ? shots[segIdx] : undefined;
  const ots = shot?.kind === 'ots';
  const otsSrc = shot?.kind === 'ots' ? OTS_SRC(shot.listener) : null;
  const onGfx = !!(tts || vo || (holding && phase === 'playing')) && !ots;
  // Tiles only when they match what's being said: the player's or the
  // unit's numbers, the team's when a team stat comes up — and none for a
  // line with nothing measurable (just the quote).
  // In the postgame topics, team numbers are that game's box score.
  const gfxTopic = gfx ? topics[gfx.topicIdx] : undefined;
  const tiles: TileStat[] | null =
    focus?.kind === 'player' ? focus.tiles ?? gfxTopic?.gameTeam ?? null
      : focus?.kind === 'unit' ? focus.tiles
        : focus?.kind === 'team' ? (focusTeam ? focusTeamStats?.stats ?? null : gfxTopic?.gameTeam ?? stats?.stats ?? null)
          : focus?.kind === 'moment' ? null
            : gfxTopic?.gameTeam ?? null;
  const tilesLabel =
    focus?.kind === 'player' && focus.tiles ? focus.label
      : focus?.kind === 'unit' ? focus.label
        : focusTeam ? `${focusTeam.abbreviation} · League ranks`
          : gfxTopic?.gameTeam ? gfxTopic.gameLabel
            : stats ? `${team?.abbreviation ?? teamName} · League ranks` : undefined;
  const mentioned: string[] = !tts || !focus || focus.kind === 'none' || focus.kind === 'standings' || focus.kind === 'moment' ? [] : focus.mentioned;
  // Game breakdown: the scores on a timeline, the one being discussed called out.
  const flowData = focus?.kind === 'moment' ? gfxTopic?.gameFlow ?? null : null;
  const flow = flowData && focus?.kind === 'moment' ? (() => {
    const hi = focus.play != null ? flowData.plays[focus.play - 1] : undefined;
    const scorer = hi?.playerIds[0] ? players.find(x => x.id === hi.playerIds[0]) : undefined;
    const t = (id: string) => teams.find(x => x.id === id);
    return {
      ...flowData,
      play: hi?.n ?? null,
      quarter: focus.quarter ?? null,
      label: gfxTopic?.gameLabel,
      usArt: t(flowData.us.teamId) ? logoOf(t(flowData.us.teamId)!) : null,
      themArt: t(flowData.them.teamId) ? logoOf(t(flowData.them.teamId)!) : null,
      scorer: scorer ? { key: scorer.id, name: `${scorer.firstName} ${scorer.lastName}`, pos: scorer.position, art: <PlayerAvatar player={scorer} size="fill" teamColor={scorer.teamId ? t(scorer.teamId)?.primaryColor : undefined} /> } : null,
    };
  })() : null;
  // A game's team box score reads as a side-by-side: us left, them right.
  const cmpData = gfxTopic?.gameCompare && tiles && tiles === gfxTopic.gameTeam ? gfxTopic.gameCompare : null;
  const teamOf = (id: string) => teams.find(x => x.id === id);
  const compare = cmpData ? {
    left: { abbreviation: cmpData.left.abbreviation, art: teamOf(cmpData.left.teamId) ? logoOf(teamOf(cmpData.left.teamId)!) : null },
    right: { abbreviation: cmpData.right.abbreviation, art: teamOf(cmpData.right.teamId) ? logoOf(teamOf(cmpData.right.teamId)!) : null },
    rows: cmpData.rows,
  } : null;
  const board = focus?.kind === 'standings' && team && teams.length
    ? (() => {
      const b = focus.scope === 'division' ? divisionTable(team, teams) : conferenceRace(team, teams);
      return { ...b, rows: b.rows.map(r => { const t = teams.find(x => x.id === r.teamId)!; return { ...r, art: logoOf(t) }; }) };
    })()
    : null;
  const phraseStat = seg?.kind === 'phrase' && seg.stat && stats ? stats.stats.find(s => s.key === seg.stat) ?? null : null;
  const speaker: Host | null = seg ? seg.speaker : null;
  // Seconds each segment plays for (speech span + padding), so the bar is
  // proportional to time and a drag lands on the line that was playing.
  const timeline = (() => {
    const starts: number[] = [];
    let t = 0;
    segments.forEach((sg, i) => {
      starts.push(t);
      const sp = sg.kind === 'tts' ? spansRef.current.get(i) : sg.speech;
      // Lines still being voiced: estimate from their length (~2.7 words/s).
      t += sp ? sp.end - sp.start + LEAD_PAD + TAIL_PAD : sg.kind === 'tts' ? sg.text.split(/\s+/).length / 2.7 + 0.2 : 2;
    });
    return { starts, total: t || 1 };
  })();
  // A clip element's source: its in-memory copy once fetched; the network
  // if it's about to play and isn't fetched yet; nothing until then. Fixed
  // once chosen, so an element never reloads mid-show.
  const firstIdx = new Map<string, number>();
  segments.forEach((sg, i) => { if (sg.kind !== 'tts' && !firstIdx.has(videoKey(sg))) firstIdx.set(videoKey(sg), i); });
  const srcFor = (key: string, src: string): string | undefined => {
    const locked = lockedSrc.current.get(key);
    if (locked) return locked;
    const chosen = blobUrls.current.get(src) ?? ((firstIdx.get(key) ?? 0) <= segIdx + 2 ? src : undefined);
    if (chosen) lockedSrc.current.set(key, chosen);
    return chosen;
  };
  const segLen = (i: number) => (timeline.starts[i + 1] ?? timeline.total) - (timeline.starts[i] ?? 0);
  const elapsed = phase === 'ended'
    ? timeline.total
    : (timeline.starts[segIdx] ?? 0) + Math.min(segLen(segIdx), Math.max(0, (clock - segStart.current) / 1000));
  const progressPct = scrub != null ? scrub * 100 : (elapsed / timeline.total) * 100;

  return (
    <div
      ref={dialogRef}
      onPointerDown={primeVideos}
      className={full
        ? 'fixed inset-0 z-[110] flex items-center justify-center bg-black'
        : 'fixed inset-0 z-[110] flex items-center justify-center bg-white/80 backdrop-blur-sm p-4'}
      role="dialog"
      aria-label={`Team Spotlight — ${teamName}`}
    >
      <div
        className={full ? 'relative' : 'w-full max-w-4xl'}
        style={full ? { width: 'min(100vw, calc(100dvh * 16 / 9))' } : undefined}
        onClick={full ? poke : undefined}
      >
        <style>{'@keyframes spotlight-bug{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}'}</style>
        <div className={full
          ? 'relative w-full aspect-video overflow-hidden bg-slate-800'
          : 'relative w-full aspect-video overflow-hidden rounded-xl border border-slate-200 bg-slate-800 shadow-xl'}>
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
                tiles={tiles}
                board={board}
                compare={compare}
                flow={flow}
                tilesLabel={tilesLabel}
                tilesMs={onGfx ? clock - Math.max(blockStart.current, playerStart.current) : 60_000}
                mentioned={mentioned}
                speaker={gfx.speaker}
                blockMs={onGfx ? clock - blockStart.current : 60_000}
                topicMs={onGfx ? clock - topicStart.current : 60_000}
                lineMs={onGfx ? clock - lineStart.current : 60_000}
                speakerMs={onGfx ? clock - speakerStart.current : 60_000}
                text={gfx.text}
                logo={team ? logoOf(team) : null}
                corner={cornerTeam && {
                  name: `${cornerTeam.city} ${cornerTeam.name}`,
                  record: `${cornerTeam.record.wins}-${cornerTeam.record.losses}${cornerTeam.record.ties ? `-${cornerTeam.record.ties}` : ''}`,
                  logo: logoOf(cornerTeam),
                }}
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

          {/* Over-the-shoulder: the listener facing camera (looping, silent). */}
          {OTS_ALL.map(src => (
            <video
              key={src}
              ref={el => { if (el) otsRefs.current.set(src, el); else otsRefs.current.delete(src); }}
              src={src}
              muted
              loop
              playsInline
              preload="auto"
              className="absolute inset-0 h-full w-full object-cover transition-opacity duration-200"
              style={{ opacity: otsSrc === src ? 1 : 0 }}
            />
          ))}

          {/* Lip-synced clips: fixed lines + this episode's phrases */}
          {videoSegs.map(([key, vs]) => (
            <video
              key={key}
              ref={el => { if (el) videoRefs.current.set(key, el); else videoRefs.current.delete(key); }}
              src={srcFor(key, videoSrc(vs))}
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
          {seg && phase !== 'ended' && !(tts && tts.visual === 'graphic' && !ots) && !vo && <ShowCaption text={seg.text} />}

          {/* Waiting on a line's voices (rare: they stream in during the open) */}
          {buffering && phase === 'playing' && (
            <div className="absolute right-[3%] bottom-[16%] flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-[clamp(9px,1.2vw,12px)] font-semibold text-slate-600 shadow">
              <span className="h-2 w-2 animate-pulse rounded-full bg-purple-600" /> Loading…
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
        <div
          className={full
            ? `absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/50 to-transparent px-4 pt-4 pb-[max(8px,env(safe-area-inset-bottom))] transition-opacity duration-300 ${chromeShown ? 'opacity-100' : 'pointer-events-none opacity-0'}`
            : 'mt-3 flex items-center gap-3'}
        >
          <button
            onClick={phase === 'playing' ? handlePause : handleStart}
            disabled={phase === 'ended'}
            className={`shrink-0 rounded-full bg-purple-600 text-sm text-white hover:bg-purple-700 disabled:opacity-40 ${full ? 'order-2 h-8 w-8' : 'h-9 w-9'}`}
            aria-label={phase === 'playing' ? 'Pause' : 'Play'}
          >
            {phase === 'playing' ? '⏸' : '▶'}
          </button>
          <div className="min-w-0 flex-1">
            {/* Fullscreen keeps only the scrubber down here, clear of the speaker chip. */}
            {!full && <div className="truncate text-xs font-medium text-slate-600">📺 Team Spotlight — {teamName}</div>}
            {/* Scrubber: drag or tap to jump to the line at that point. */}
            <div
              role="slider"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={Math.round(timeline.total)}
              aria-valuenow={Math.round(elapsed)}
              tabIndex={0}
              className="group relative mt-1 flex h-4 cursor-pointer touch-none items-center"
              onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setScrub(frac(e)); }}
              onPointerMove={e => { if (scrub != null) setScrub(frac(e)); }}
              onPointerUp={e => { const f = frac(e); setScrub(null); void seekTo(f * timeline.total); }}
              onPointerCancel={() => setScrub(null)}
              onKeyDown={e => {
                if (e.key === 'ArrowLeft') void seekTo(Math.max(0, (timeline.starts[segIdx] ?? 0) - 0.01));
                if (e.key === 'ArrowRight') void seekTo(timeline.starts[segIdx + 1] ?? timeline.total);
              }}
            >
              <div className="h-1.5 w-full rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-purple-600" style={{ width: `${progressPct}%` }} />
              </div>
              <div
                className="absolute h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-white bg-purple-600 shadow transition-transform group-hover:scale-110"
                style={{ left: `${progressPct}%` }}
              />
            </div>
          </div>
          <button
            onClick={e => { e.stopPropagation(); void (full ? leaveFull() : enterFull()); }}
            className={`shrink-0 rounded-md p-1.5 ${full ? 'order-3 text-white/90 hover:text-white' : 'text-slate-500 hover:text-slate-800'}`}
            aria-label={full ? 'Exit full screen' : 'Full screen'}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {full
                ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
                : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
            </svg>
          </button>
          <button onClick={handleClose} className={`shrink-0 px-2 py-1 text-sm ${full ? 'order-3 text-white/90 hover:text-white' : 'text-slate-500 hover:text-slate-800'}`} aria-label="Close show">
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

function fullscreenElement(): Element | null {
  const doc = document as Document & { webkitFullscreenElement?: Element | null };
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

/** Does a line name this team (city, nickname or abbreviation)? */
function namesTeam(text: string, t: Team): boolean {
  return [t.city, t.name, t.abbreviation].some(w => !!w && new RegExp(`(^|[^A-Za-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`).test(text));
}
