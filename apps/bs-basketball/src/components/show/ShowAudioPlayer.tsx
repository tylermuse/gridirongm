'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSubscription } from '@/components/providers/SubscriptionProvider';
import { EPISODE_PACK } from '@bs/core/billing';
import { SPOTLIGHT_HOSTS, type SpotlightEpisode } from '@/lib/show/spotlight';
import { normalizeTtsText, type PodcastSpeaker } from '@/lib/show/podcastScript';
import {
  buildChapters, buildShowAudioRequest, cachedShowAudio, chapterIndexForLine, chapterStarts, computeLineTimings,
  estimatedGenProgress, fallbackNote, formatClock, lineIndexAt, objectUrlFor, requestShowAudio, scriptFor, showAudioKey,
  type FallbackReason, type LineTiming, type ShowAudioRequestBody,
} from '@/lib/show/showAudio';
import { isSpeechSupported, speakLine, stopSpeech } from '@/lib/ui/speech';

type Phase = 'idle' | 'generating' | 'ready' | 'playing' | 'paused' | 'ended';
type Mode = 'studio' | 'browser';

const SPEEDS = [1, 1.25, 1.5] as const;
/** Browser-voice clock: ~15 spoken characters per second at 1x. */
const BROWSER_CHARS_PER_SEC = 15;

const HOST: Record<PodcastSpeaker, { name: string; avatar: string; voice: 'analyst' | 'take'; color: string; tint: string }> = {
  marcus: { name: SPOTLIGHT_HOSTS.analyst.name, avatar: SPOTLIGHT_HOSTS.analyst.avatar, voice: 'analyst', color: '#2563eb', tint: '#dbeafe' },
  tony: { name: SPOTLIGHT_HOSTS.take.name, avatar: SPOTLIGHT_HOSTS.take.avatar, voice: 'take', color: '#dc2626', tint: '#fee2e2' },
};

function formatReset(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * The Show audio player — studio two-voice audio from /api/spotlight-audio,
 * with chapters, scrub, speed and a synced transcript. Any refusal (not
 * configured / signed out / not Premium / out of credits / error / timeout)
 * falls back to the browser's SpeechSynthesis voice with an honest note.
 *
 * `compact` is the dashboard flavour (shorter transcript); `autoStart` begins
 * as soon as it mounts (the dashboard "Listen" pill mounts it on click).
 */
interface PlayerProps {
  episode: SpotlightEpisode;
  teamName: string;
  compact?: boolean;
  autoStart?: boolean;
  onClose?: () => void;
}

export function ShowAudioPlayer(props: PlayerProps) {
  const body = useMemo(() => buildShowAudioRequest(props.episode, props.teamName), [props.episode, props.teamName]);
  const key = useMemo(() => showAudioKey(body), [body]);
  // A new episode (sim advanced) remounts the player fresh; the previous
  // episode's audio stays in the in-memory cache for a replay.
  return <PlayerInner key={key} {...props} body={body} audioKey={key} />;
}

function PlayerInner({ episode, compact = false, autoStart = false, onClose, body, audioKey: key }: PlayerProps & { body: ShowAudioRequestBody; audioKey: string }) {
  const { podcastCredits, refreshPodcastCredits, tier } = useSubscription();
  // Episode packs (BS Football parity): Premium users out of the month's
  // studio episodes can buy more. Hidden until the Stripe price is configured.
  const [buying, setBuying] = useState<'idle' | 'loading' | 'error'>('idle');
  const canBuyPack = tier === 'premium' && !!EPISODE_PACK.priceId;
  const buyPack = useCallback(async () => {
    setBuying('loading');
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product: 'episode_pack' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) throw new Error(json.error ?? String(res.status));
      window.location.href = json.url;
    } catch {
      setBuying('error');
    }
  }, []);
  const lines = useMemo(() => scriptFor(body), [body]);
  const chapters = useMemo(() => buildChapters(lines, body.topics), [lines, body]);

  const [phase, setPhase] = useState<Phase>('idle');
  const [mode, setMode] = useState<Mode | null>(null);
  const [reason, setReason] = useState<FallbackReason | null>(null);
  const [rate, setRate] = useState<number>(1);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [timings, setTimings] = useState<LineTiming[]>([]);
  const [genProgress, setGenProgress] = useState(0);
  const [showTranscript, setShowTranscript] = useState(!compact);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const loadedKey = useRef<string | null>(null);
  const failures = useRef<Map<string, FallbackReason>>(new Map());
  const rateRef = useRef(rate);
  // Browser-voice engine state (it sequences lines itself).
  const bv = useRef<{ line: number; startedAt: number; done: boolean; cancel: () => void; timer: number | null }>({ line: 0, startedAt: 0, done: false, cancel: () => {}, timer: null });
  const transcriptRef = useRef<HTMLOListElement | null>(null);

  const currentLine = timings.length ? lineIndexAt(timings, time) : -1;
  const currentChapter = currentLine >= 0 ? chapterIndexForLine(chapters, currentLine) : 0;
  const starts = useMemo(() => chapterStarts(chapters, timings), [chapters, timings]);

  // ── Browser-voice engine ─────────────────────────────────────────────
  const stopBrowser = useCallback(() => {
    const s = bv.current;
    s.cancel();
    s.cancel = () => {};
    if (s.timer != null) { window.clearInterval(s.timer); s.timer = null; }
  }, []);

  const browserTimings = useMemo(() => {
    // ESTIMATE: no real audio to measure, so each line's slot is proportional
    // to its character count (see computeLineTimings).
    const total = lines.reduce((a, l) => a + l.text.length + 12, 0) / BROWSER_CHARS_PER_SEC;
    return { total, timings: computeLineTimings(lines, total) };
  }, [lines]);

  // Self-scheduling (line N's timer starts line N+1) goes through a ref so the
  // callback never references itself before declaration.
  const speakFromRef = useRef<(lineIdx: number) => void>(() => {});
  const speakFrom = useCallback((lineIdx: number) => {
    stopBrowser();
    const s = bv.current;
    const { timings: tm, total } = browserTimings;
    if (lineIdx >= lines.length) { setTime(total); setPhase('ended'); return; }
    s.line = lineIdx;
    s.startedAt = performance.now();
    s.done = false;
    setTime(tm[lineIdx].start);
    const line = lines[lineIdx];
    if (isSpeechSupported()) {
      s.cancel = speakLine({ text: normalizeTtsText(line.text), voice: HOST[line.speaker].voice }, { rate: rateRef.current, onDone: () => { s.done = true; } });
    } else {
      s.done = true; // read-along only: the clock alone drives the transcript
    }
    s.timer = window.setInterval(() => {
      const t = tm[s.line];
      const len = t.end - t.start;
      const elapsed = ((performance.now() - s.startedAt) / 1000) * rateRef.current;
      setTime(t.start + Math.min(elapsed, len));
      // Advance when the utterance finished (but not absurdly early — a voice
      // that errors instantly shouldn't skip lines) or when it overstays.
      if ((s.done && elapsed >= len * 0.35) || elapsed >= len * 2.5) speakFromRef.current(s.line + 1);
    }, 200);
  }, [browserTimings, lines, stopBrowser]);
  useEffect(() => { speakFromRef.current = speakFrom; }, [speakFrom]);

  const startBrowser = useCallback((why: FallbackReason, autoplay: boolean) => {
    audioRef.current?.pause();
    audioRef.current = null;
    setMode('browser');
    setReason(why);
    setDuration(browserTimings.total);
    setTimings(browserTimings.timings);
    setTime(0);
    if (autoplay) { setPhase('playing'); speakFrom(0); } else setPhase('ready');
  }, [browserTimings, speakFrom]);

  // ── Studio engine ────────────────────────────────────────────────────
  const attachStudio = useCallback((url: string, lineBytes: number[] | null, autoplay: boolean) => {
    audioRef.current?.pause();
    const a = new Audio(url);
    a.preload = 'auto';
    a.playbackRate = rateRef.current;
    audioRef.current = a;
    a.addEventListener('loadedmetadata', () => {
      const d = Number.isFinite(a.duration) ? a.duration : 0;
      setDuration(d);
      setTimings(computeLineTimings(lines, d, lineBytes));
    });
    const live = () => audioRef.current === a; // ignore a detached element
    a.addEventListener('timeupdate', () => { if (live()) setTime(a.currentTime); });
    a.addEventListener('play', () => { if (live()) setPhase('playing'); });
    a.addEventListener('pause', () => { if (live()) setPhase(p => (p === 'ended' ? p : 'paused')); });
    a.addEventListener('ended', () => { if (live()) setPhase('ended'); });
    a.addEventListener('error', () => {
      // Decoding failed — degrade rather than break.
      if (audioRef.current !== a) return;
      failures.current.set(key, 'error');
      startBrowser('error', false);
    });
    setMode('studio');
    setReason(null);
    setPhase('ready');
    if (autoplay) a.play().catch(() => setPhase('ready')); // autoplay blocked → wait for a tap
  }, [key, lines, startBrowser]);

  const load = useCallback(async () => {
    const prior = failures.current.get(key);
    if (prior) { startBrowser(prior, true); return; }
    const hit = cachedShowAudio(key);
    if (hit) { loadedKey.current = key; attachStudio(objectUrlFor(hit), hit.lineBytes, true); return; }
    setPhase('generating');
    setGenProgress(0);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const t0 = performance.now();
    const tick = window.setInterval(() => setGenProgress(estimatedGenProgress(performance.now() - t0, lines.length)), 250);
    const res = await requestShowAudio(body, { signal: ctrl.signal });
    window.clearInterval(tick);
    if (ctrl.signal.aborted) return; // superseded or user chose the browser voice
    loadedKey.current = key;
    if (res.ok) {
      void refreshPodcastCredits(); // a cache miss spent a credit
      attachStudio(objectUrlFor(res), res.lineBytes, true);
    } else {
      failures.current.set(key, res.reason);
      if (res.reason === 'out_of_credits') void refreshPodcastCredits();
      startBrowser(res.reason, true);
    }
  }, [attachStudio, body, key, lines.length, refreshPodcastCredits, startBrowser]);

  // ── Controls ─────────────────────────────────────────────────────────
  function play() {
    if (phase === 'generating') return;
    if (!mode || loadedKey.current !== key) { void load(); return; }
    if (mode === 'studio' && audioRef.current) {
      if (phase === 'ended') audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
      return;
    }
    setPhase('playing');
    speakFrom(phase === 'ended' ? 0 : Math.max(0, currentLine));
  }

  function pause() {
    if (mode === 'studio') { audioRef.current?.pause(); return; }
    stopBrowser();
    stopSpeech();
    setPhase('paused');
  }

  function seekTo(t: number) {
    if (!timings.length) return;
    const clamped = Math.max(0, Math.min(t, duration));
    if (mode === 'studio' && audioRef.current) {
      audioRef.current.currentTime = clamped;
      setTime(clamped);
      if (phase === 'ended') setPhase('paused');
      return;
    }
    // Browser voice can only start at a line boundary.
    const idx = lineIndexAt(timings, clamped);
    if (phase === 'playing') speakFrom(idx);
    else { setTime(timings[idx].start); if (phase === 'ended') setPhase('paused'); }
  }

  const seekLine = (i: number) => timings[i] && seekTo(timings[i].start + 0.01);
  const jumpChapter = (delta: number) => {
    const target = Math.max(0, Math.min(chapters.length - 1, currentChapter + delta));
    seekLine(chapters[target].startLine);
  };

  function cycleSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(rate as (typeof SPEEDS)[number]) + 1) % SPEEDS.length];
    setRate(next);
    rateRef.current = next;
    if (audioRef.current) audioRef.current.playbackRate = next;
    if (mode === 'browser' && phase === 'playing') speakFrom(bv.current.line); // re-speak the line at the new rate
  }

  function switchToBrowser() {
    abortRef.current?.abort();
    loadedKey.current = key;
    startBrowser('error', true);
  }

  // Auto-start once (dashboard "Listen").
  // Via a ref so a changing `load` identity never restarts generation; the
  // cleanup resets the guard so a StrictMode/dev remount (whose teardown
  // aborted the first request) starts again.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStarted.current) return;
    autoStarted.current = true;
    void loadRef.current();
    return () => { autoStarted.current = false; };
  }, [autoStart]);

  // Teardown.
  useEffect(() => () => {
    abortRef.current?.abort();
    audioRef.current?.pause();
    audioRef.current = null;
    stopBrowser();
    stopSpeech();
  }, [stopBrowser]);

  // Keep the active transcript line in view (inside the transcript box only).
  useEffect(() => {
    const box = transcriptRef.current;
    if (!box || currentLine < 0 || (phase !== 'playing' && phase !== 'paused')) return;
    const el = box.querySelector<HTMLElement>(`[data-line="${currentLine}"]`);
    if (el) box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2, behavior: 'smooth' });
  }, [currentLine, phase]);

  // ── Render ───────────────────────────────────────────────────────────
  const note = mode === 'browser' && reason
    ? (isSpeechSupported() ? fallbackNote(reason, formatReset(podcastCredits.resetAt)) : { text: 'Studio audio is unavailable and this browser has no built-in voice — follow along with the transcript.', cta: undefined })
    : null;
  const isPlaying = phase === 'playing';
  const pct = duration > 0 ? (time / duration) * 100 : 0;
  const chapter = chapters[currentChapter];
  const transcriptMax = compact ? 'max-h-48' : 'max-h-[26rem]';

  return (
    <div className="rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }} data-testid="show-audio-player" data-mode={mode ?? 'none'} data-phase={phase}>
      {/* Header row: big play button + episode / chapter info */}
      <div className="flex items-center gap-3 p-3">
        <button
          onClick={isPlaying ? pause : play}
          disabled={phase === 'generating'}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="shrink-0 h-11 w-11 rounded-full grid place-items-center text-lg text-white shadow-sm transition-opacity disabled:opacity-60 hover:opacity-90"
          style={{ background: 'var(--accent)' }}
        >
          {phase === 'generating' ? <span className="h-4 w-4 rounded-full border-2 border-white/60 border-t-transparent animate-spin" aria-hidden /> : isPlaying ? '❚❚' : phase === 'ended' ? '↺' : '▶'}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-sec)]">
            <span>{episode.title}</span>
            {mode && (
              <span className="rounded-full px-1.5 py-px normal-case tracking-normal font-semibold" style={{ background: 'var(--muted)', color: 'var(--text-sec)' }}>
                {mode === 'studio' ? '🎙️ Studio audio' : '🗣️ Browser voice'}
              </span>
            )}
          </div>
          <div className="text-sm font-semibold leading-snug truncate" title={chapter?.title}>
            {phase === 'idle' ? 'Listen to this week’s episode' : phase === 'generating' ? 'Recording the studio episode…' : chapter?.title}
          </div>
          {phase === 'generating' && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${Math.round(genProgress * 100)}%`, background: 'var(--accent)' }} />
              </div>
              <button onClick={switchToBrowser} className="text-[11px] font-semibold hover:underline shrink-0" style={{ color: 'var(--accent)' }}>Use browser voice</button>
            </div>
          )}
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Close player" className="shrink-0 h-8 w-8 rounded-full grid place-items-center text-[var(--text-sec)] hover:bg-[var(--surface-2)]">✕</button>
        )}
      </div>

      {note && (
        <div className="mx-3 mb-2 rounded-lg px-3 py-1.5 text-xs flex flex-wrap items-center gap-x-2 gap-y-1" style={{ background: 'var(--muted)', color: 'var(--text-sec)' }} role="status" data-testid="show-audio-note">
          <span>{note.text}</span>
          {note.cta && <Link href={note.cta.href} className="font-bold hover:underline" style={{ color: 'var(--accent)' }}>{note.cta.label} →</Link>}
          {reason === 'out_of_credits' && canBuyPack && (
            <button
              onClick={() => void buyPack()}
              disabled={buying === 'loading'}
              className="font-bold hover:underline disabled:opacity-60"
              style={{ color: 'var(--accent)' }}
            >
              {buying === 'loading' ? 'Opening checkout…' : `Get ${EPISODE_PACK.credits} more episodes · ${EPISODE_PACK.priceLabel} →`}
            </button>
          )}
          {buying === 'error' && <span className="text-red-600">Couldn&apos;t open checkout. Try again.</span>}
        </div>
      )}

      {mode && phase !== 'generating' && (
        <>
          {/* Scrub bar with chapter ticks */}
          <div className="px-3">
            <div className="relative h-5 flex items-center">
              <div className="absolute inset-x-0 h-1.5 rounded-full" style={{ background: 'var(--surface-2)' }} />
              <div className="absolute left-0 h-1.5 rounded-full" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
              {duration > 0 && starts.slice(1).map((s, i) => (
                <span key={i} className="absolute h-2.5 w-0.5 rounded" style={{ left: `${(s / duration) * 100}%`, background: 'var(--border)' }} aria-hidden />
              ))}
              <input
                type="range" min={0} max={duration || 0} step={0.1} value={Math.min(time, duration || 0)}
                onChange={e => seekTo(Number(e.target.value))}
                aria-label="Seek"
                className="absolute inset-0 w-full opacity-0 cursor-pointer"
              />
              <span className="absolute h-3.5 w-3.5 rounded-full border-2 bg-white pointer-events-none -translate-x-1/2 shadow-sm" style={{ left: `${pct}%`, borderColor: 'var(--accent)' }} aria-hidden />
            </div>
            <div className="flex items-center gap-2 text-[11px] tabular-nums text-[var(--text-sec)]">
              <span>{formatClock(time)}</span>
              <span className="flex-1" />
              {mode === 'browser' && <span title="Browser voice timings are estimated">≈</span>}
              <span>{formatClock(duration)}</span>
            </div>
          </div>

          {/* Transport */}
          <div className="flex items-center gap-1.5 px-3 pb-2 pt-1 flex-wrap">
            <button onClick={() => jumpChapter(-1)} disabled={currentChapter === 0} className="rounded-md px-2 py-1 text-xs font-semibold border disabled:opacity-40 hover:bg-[var(--surface-2)]" style={{ borderColor: 'var(--border)' }} aria-label="Previous segment">⏮ Prev</button>
            <button onClick={() => jumpChapter(1)} disabled={currentChapter >= chapters.length - 1} className="rounded-md px-2 py-1 text-xs font-semibold border disabled:opacity-40 hover:bg-[var(--surface-2)]" style={{ borderColor: 'var(--border)' }} aria-label="Next segment">Next ⏭</button>
            <button onClick={cycleSpeed} className="rounded-md px-2 py-1 text-xs font-bold border tabular-nums hover:bg-[var(--surface-2)]" style={{ borderColor: 'var(--border)' }} aria-label="Playback speed">{rate}x</button>
            <span className="flex-1" />
            <button onClick={() => setShowTranscript(v => !v)} className="text-xs font-semibold hover:underline" style={{ color: 'var(--accent)' }}>{showTranscript ? 'Hide transcript' : 'Show transcript'}</button>
          </div>

          {/* Chapters */}
          <div className="flex gap-1.5 overflow-x-auto px-3 pb-2" role="tablist" aria-label="Segments">
            {chapters.map((c, i) => (
              <button
                key={i}
                role="tab"
                aria-selected={i === currentChapter}
                onClick={() => seekLine(c.startLine)}
                className="shrink-0 max-w-[13rem] truncate rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors"
                style={i === currentChapter
                  ? { borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 12%, var(--surface))', color: 'var(--foreground)' }
                  : { borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text-sec)' }}
                title={c.title}
              >
                <span className="tabular-nums opacity-70 mr-1">{formatClock(starts[i] ?? 0)}</span>{c.title}
              </button>
            ))}
          </div>

          {/* Synced transcript */}
          {showTranscript && (
            <ol ref={transcriptRef} className={`relative ${transcriptMax} overflow-y-auto border-t px-3 py-2 space-y-1`} style={{ borderColor: 'var(--border)' }} data-testid="show-transcript">
              {lines.map((l, i) => {
                const h = HOST[l.speaker];
                const active = i === currentLine && phase !== 'ready';
                const chapterHead = chapters.find(c => c.startLine === i);
                return (
                  <li key={i} data-line={i}>
                    {chapterHead && i > 0 && <div className="pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--text-sec)] truncate">{chapterHead.title}</div>}
                    <button
                      onClick={() => seekLine(i)}
                      aria-current={active ? 'true' : undefined}
                      className="w-full flex items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors"
                      style={active ? { background: 'color-mix(in srgb, var(--accent) 10%, var(--surface))', boxShadow: 'inset 3px 0 0 var(--accent)' } : undefined}
                    >
                      <span className="shrink-0 h-7 w-7 rounded-full grid place-items-center text-sm" style={{ background: h.tint }} aria-hidden>{h.avatar}</span>
                      <span className="min-w-0">
                        <span className="block text-[10px] font-bold uppercase tracking-wide" style={{ color: h.color }}>{h.name}</span>
                        <span className={`block text-sm leading-snug ${active ? 'text-[var(--foreground)]' : 'text-[var(--text-sec)]'}`}>{l.text}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
