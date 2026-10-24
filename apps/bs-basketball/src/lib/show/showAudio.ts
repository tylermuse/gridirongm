/**
 * The Show — studio-audio helpers for ShowAudioPlayer (pure, testable).
 *
 * Contract of POST /api/spotlight-audio (apps/bs-basketball/src/app/api/spotlight-audio/route.ts):
 *   body:     { topics: PodcastTopic[], teamName: string }
 *   200:      audio/mpeg — every script line rendered as its own ElevenLabs
 *             clip, concatenated. `X-Line-Bytes` lists each clip's byte length
 *             (in script order) so the client can sync the transcript.
 *   503 { code: 'not_configured' } — no ELEVENLABS_API_KEY on the server
 *   400 — bad body · 401 — signed out · 403 — not Premium
 *   402 — monthly credits exhausted (or `code: 'tts_quota'` when ElevenLabs
 *         itself is out of quota) · 429 — rate limited · 500 — anything else
 *   Cache hits (Supabase bucket `spotlight-audio-bball`, md5 of the body) are
 *   free; a cache miss consumes one podcast credit.
 *
 * Every non-200 maps to a FallbackReason and the player falls back to the
 * browser's SpeechSynthesis voice with an honest note.
 */

import { buildPodcastScript, type PodcastExchange, type PodcastScriptLine, type PodcastTopic } from './podcastScript';
import type { ExchangeVoice, SpotlightEpisode } from './spotlight';

export const SHOW_AUDIO_ENDPOINT = '/api/spotlight-audio';
/** ~20 sequential TTS calls on a cache miss; past this we stop waiting. */
export const SHOW_AUDIO_TIMEOUT_MS = 90_000;
/** Rough server render time per line, for the "recording…" progress estimate. */
export const EST_GEN_MS_PER_LINE = 1_600;

// ── Request body ──────────────────────────────────────────────────────

const SPEAKER_OF: Record<ExchangeVoice, PodcastExchange['speakerId']> = {
  analyst: 'stats',
  take: 'hottake',
  player: 'player',
  fan: 'fans',
};

export interface ShowAudioRequestBody { topics: PodcastTopic[]; teamName: string }

/** Map a spotlight episode onto the route's body. Always uses the FULL
 *  episode (not the compact dashboard slice) so the dashboard and /show send
 *  byte-identical bodies → one server cache entry, one in-memory cache hit. */
export function buildShowAudioRequest(episode: SpotlightEpisode, teamName: string): ShowAudioRequestBody {
  return {
    teamName: teamName.trim() || 'league',
    topics: episode.stories.map(s => ({
      headline: s.headline,
      icon: s.category,
      exchanges: s.exchanges.map(ex => ({ speakerId: SPEAKER_OF[ex.voice], text: ex.line })),
    })),
  };
}

/** Stable key for the in-memory cache (also what the server hashes). */
export function showAudioKey(body: ShowAudioRequestBody): string {
  return JSON.stringify(body);
}

// ── Fallback reasons ──────────────────────────────────────────────────

export type FallbackReason =
  | 'not_configured' | 'signed_out' | 'not_premium' | 'out_of_credits'
  | 'tts_quota' | 'timeout' | 'offline' | 'error';

export function mapAudioFailure(status: number, body?: { code?: string; error?: string } | null): FallbackReason {
  if (body?.code === 'not_configured' || /not configured/i.test(body?.error ?? '')) return 'not_configured';
  if (body?.code === 'tts_quota' || /elevenlabs quota/i.test(body?.error ?? '')) return 'tts_quota';
  if (status === 401) return 'signed_out';
  if (status === 403) return 'not_premium';
  if (status === 402 || status === 429) return 'out_of_credits';
  return 'error';
}

export interface FallbackNote { text: string; cta?: { label: string; href: string } }

export function fallbackNote(reason: FallbackReason, resetLabel?: string | null): FallbackNote {
  const voice = "Playing with your browser's voice";
  switch (reason) {
    case 'signed_out': return { text: `${voice} — sign in and go Premium for studio audio.`, cta: { label: 'Sign in', href: '/login?next=/show' } };
    case 'not_premium': return { text: `${voice} — go Premium for studio audio.`, cta: { label: 'Go Premium', href: '/pricing' } };
    case 'out_of_credits': return { text: `${voice} — you've used this month's studio episodes${resetLabel ? ` (more on ${resetLabel})` : ''}.` };
    case 'not_configured': return { text: `${voice} — studio audio isn't set up on this server yet.` };
    case 'tts_quota': return { text: `${voice} — the studio voices are over capacity right now.` };
    case 'timeout': return { text: `${voice} — the studio recording took too long.` };
    case 'offline': return { text: `${voice} — you're offline, so studio audio is unavailable.` };
    default: return { text: `${voice} — studio audio is unavailable right now.` };
  }
}

// ── Script, timings, chapters ─────────────────────────────────────────

export function scriptFor(body: ShowAudioRequestBody): PodcastScriptLine[] {
  return buildPodcastScript(body.topics, body.teamName);
}

export interface LineTiming { start: number; end: number }

/** Parse `X-Line-Bytes` ("12345,6789,…"). Null unless it's one positive
 *  integer per script line — a mismatch means we can't trust it. */
export function parseLineBytes(header: string | null | undefined, lineCount: number): number[] | null {
  if (!header) return null;
  const parts = header.split(',').map(s => Number(s.trim()));
  if (parts.length !== lineCount || parts.some(n => !Number.isFinite(n) || n <= 0)) return null;
  return parts;
}

/** Fixed per-clip overhead (lead-in/out silence ElevenLabs adds to every
 *  clip), expressed in characters, for the estimate below. */
const CLIP_OVERHEAD_CHARS = 12;

/**
 * Per-line [start, end) offsets in seconds across `total` seconds of audio.
 *
 * - With clip byte lengths (route's X-Line-Bytes): ElevenLabs mp3_44100_128
 *   is constant-bitrate, so time is proportional to bytes — exact enough to
 *   land on the right line.
 * - Without them (older cache entries, or the browser-voice fallback): an
 *   ESTIMATE proportional to each line's character count plus a fixed
 *   per-clip overhead. Speech rate is roughly constant per voice, so this
 *   drifts by at most a second or so per line — fine for highlighting.
 */
export function computeLineTimings(lines: { text: string }[], total: number, lineBytes?: number[] | null): LineTiming[] {
  if (lines.length === 0) return [];
  const weights = lineBytes && lineBytes.length === lines.length
    ? lineBytes
    : lines.map(l => l.text.length + CLIP_OVERHEAD_CHARS);
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const out: LineTiming[] = [];
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    const start = (acc / sum) * total;
    acc += weights[i];
    out.push({ start, end: i === weights.length - 1 ? total : (acc / sum) * total });
  }
  return out;
}

/** Index of the line playing at time `t` (binary search; clamps). */
export function lineIndexAt(timings: LineTiming[], t: number): number {
  if (timings.length === 0) return -1;
  let lo = 0, hi = timings.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (timings[mid].start <= t) lo = mid; else hi = mid - 1;
  }
  return lo;
}

export interface ShowChapter { title: string; category?: string; startLine: number; endLine: number }

/** Contiguous chapters from the script: Cold open → one per voiced topic →
 *  Sign-off. The transition line ("Next topic") opens its topic's chapter. */
export function buildChapters(lines: PodcastScriptLine[], topics: PodcastTopic[]): ShowChapter[] {
  const chapters: ShowChapter[] = [];
  let prevTopic: number | null = null;
  lines.forEach((line, i) => {
    const k = line.topicIndex;
    if (k === prevTopic) { chapters[chapters.length - 1].endLine = i; return; }
    prevTopic = k;
    const isTopic = k >= 0 && k < topics.length;
    chapters.push({
      title: k < 0 ? 'Cold open' : isTopic ? topics[k].headline : 'Sign-off',
      category: isTopic ? topics[k].icon : undefined,
      startLine: i,
      endLine: i,
    });
  });
  return chapters;
}

/** Chapter start times (seconds) for scrub-bar markers / jump buttons. */
export function chapterStarts(chapters: ShowChapter[], timings: LineTiming[]): number[] {
  return chapters.map(c => timings[c.startLine]?.start ?? 0);
}

export function chapterIndexForLine(chapters: ShowChapter[], line: number): number {
  const i = chapters.findIndex(c => line >= c.startLine && line <= c.endLine);
  return i < 0 ? 0 : i;
}

export function formatClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Estimated generation progress (0–0.95) while the server renders clips —
 *  the route returns one response, so there's no real progress signal. */
export function estimatedGenProgress(elapsedMs: number, lineCount: number): number {
  const expected = Math.max(4_000, lineCount * EST_GEN_MS_PER_LINE);
  return Math.min(0.95, 1 - Math.exp(-elapsedMs / expected * 1.6));
}

// ── Client request + in-memory cache ──────────────────────────────────

export type ShowAudioResult =
  | { ok: true; blob: Blob; lineBytes: number[] | null; url?: string }
  | { ok: false; reason: FallbackReason };

interface RequestOpts {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Override for tests; defaults to navigator.onLine. */
  online?: boolean;
}

const MAX_CACHED = 3;
// Successful renders, keyed by request body — replays (and dashboard → /show)
// never re-request. Small LRU; evicted object URLs are revoked.
const audioCache = new Map<string, Extract<ShowAudioResult, { ok: true }>>();
// Server-wide "not configured" is sticky for the session; per-user gating
// reasons are not (the user may sign in / upgrade without a reload).
let notConfigured = false;

export function _resetShowAudioCache(): void {
  for (const v of audioCache.values()) if (v.url && typeof URL !== 'undefined' && URL.revokeObjectURL) URL.revokeObjectURL(v.url);
  audioCache.clear();
  notConfigured = false;
}

export function cachedShowAudio(key: string): Extract<ShowAudioResult, { ok: true }> | null {
  return audioCache.get(key) ?? null;
}

/** Object URL for a cached result, created once and reused. */
export function objectUrlFor(result: Extract<ShowAudioResult, { ok: true }>): string {
  if (!result.url) result.url = URL.createObjectURL(result.blob);
  return result.url;
}

export async function requestShowAudio(body: ShowAudioRequestBody, opts: RequestOpts = {}): Promise<ShowAudioResult> {
  const key = showAudioKey(body);
  const hit = audioCache.get(key);
  if (hit) { audioCache.delete(key); audioCache.set(key, hit); return hit; }
  if (notConfigured) return { ok: false, reason: 'not_configured' };
  const online = opts.online ?? (typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  if (!online) return { ok: false, reason: 'offline' };

  const fetchImpl = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, opts.timeoutMs ?? SHOW_AUDIO_TIMEOUT_MS);
  const onOuterAbort = () => ctrl.abort();
  opts.signal?.addEventListener('abort', onOuterAbort);
  try {
    const res = await fetchImpl(SHOW_AUDIO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: key,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      let json: { code?: string; error?: string } | null = null;
      try { json = await res.json(); } catch { /* non-JSON error body */ }
      const reason = mapAudioFailure(res.status, json);
      if (reason === 'not_configured') notConfigured = true;
      return { ok: false, reason };
    }
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('audio')) return { ok: false, reason: 'error' };
    const blob = await res.blob();
    if (blob.size === 0) return { ok: false, reason: 'error' };
    const lineBytes = parseLineBytes(res.headers.get('x-line-bytes'), scriptFor(body).length);
    const result = { ok: true as const, blob, lineBytes };
    audioCache.set(key, result);
    while (audioCache.size > MAX_CACHED) {
      const [oldKey, old] = audioCache.entries().next().value as [string, Extract<ShowAudioResult, { ok: true }>];
      if (old.url) URL.revokeObjectURL(old.url);
      audioCache.delete(oldKey);
    }
    return result;
  } catch {
    if (timedOut) return { ok: false, reason: 'timeout' };
    return { ok: false, reason: 'error' };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onOuterAbort);
  }
}
