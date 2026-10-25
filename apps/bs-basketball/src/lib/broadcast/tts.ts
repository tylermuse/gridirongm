/**
 * Server-only ElevenLabs + cache helpers for the broadcast audio routes
 * (/api/game-audio, /api/pregame-audio, /api/halftime-audio).
 *
 * Same hosts and voice IDs as the Hoops Tonight podcast (/api/spotlight-audio)
 * and BS Football's broadcast — Marcus Cole on play-by-play, Tony Blaze on
 * color. Text normalization reuses the podcast's basketball normalizer, so
 * every Hoops voice says "rebounds", not "R E B".
 */

import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient as createSupabaseServer } from '@bs/core/supabase/server';
import { readCredits, getServiceClient } from '@bs/core/podcast';
import { normalizeTtsText as normalizePodcastText } from '../show/podcastScript';

export const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';

export type BroadcastSpeaker = 'marcus' | 'tony';
export interface BroadcastLine { speaker: BroadcastSpeaker; text: string }

export const VOICES: Record<BroadcastSpeaker, string> = {
  marcus: 'NKI4WPSf2OjKR4G4fadW', // Marcus Cole — measured play-by-play
  tony: 'aGw6gMq5DRXPll7WVlNn',   // Tony Blaze — energetic color
};

/** Per-line TTS (live play-by-play clips). */
export const MODEL_ID = 'eleven_multilingual_v2';
/** One-pass two-voice dialogue (pregame + halftime segments), same model as
 *  BS Football's Spotlight show and halftime audio. */
export const DIALOGUE_MODEL_ID = 'eleven_v4_turbo';

/** Football's broadcast cache bucket (already provisioned in the shared
 *  Supabase project). Every Hoops object lives under `bball/`, so an md5
 *  collision across sports can never serve the wrong game's audio. */
export const CACHE_BUCKET = 'game-audio';
export const CACHE_PREFIX = 'bball';

/** Podcast normalizer + the few shorthands that only show up in a live call. */
export function normalizeTtsText(text: string): string {
  let t = normalizePodcastText(text);
  t = t.replace(/\band-one\b/gi, 'and one');
  t = t.replace(/\b(\d+)-(\d+) run\b/g, '$1 to $2 run');
  t = t.replace(/\b(\d{1,3})-(\d{1,3})\b/g, '$1 to $2');
  t = t.replace(/\bOT\b/g, 'overtime');
  t = t.replace(/\b(\d)OT\b/g, '$1 overtime');
  return t;
}

/** v3/v4 performance cues ([laughs], [sighs]…) are direction, not words. */
export const stripCues = (s: string) => s.replace(/\[[^\]]*\]\s*/g, '').replace(/\s{2,}/g, ' ').trim();

function quotaError(status: number, body: string): Error {
  const error = new Error(`ElevenLabs quota exceeded (${status}): ${body}`) as Error & { status: number; code: string };
  error.status = 402;
  error.code = 'tts_quota';
  return error;
}

export async function generateSpeech(text: string, voiceId: string): Promise<Buffer> {
  const res = await fetch(`${ELEVENLABS_BASE}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_API_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: MODEL_ID, output_format: 'mp3_44100_128' }),
  });
  if (!res.ok) {
    const err = await res.text();
    if (res.status === 401 || res.status === 402 || res.status === 429) throw quotaError(res.status, err);
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${err}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Voice a stretch of conversation in one pass (text-to-dialogue), so the
 *  turn-taking sounds like two people talking rather than lines read in turn. */
export async function generateDialogue(lines: BroadcastLine[]): Promise<Buffer> {
  const res = await fetch(`${ELEVENLABS_BASE}/text-to-dialogue?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_API_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model_id: DIALOGUE_MODEL_ID,
      inputs: lines.map(l => ({ text: normalizeTtsText(l.text), voice_id: VOICES[l.speaker] })),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    if (res.status === 401 || res.status === 402 || res.status === 429) throw quotaError(res.status, err);
    throw new Error(`ElevenLabs dialogue failed (${res.status}): ${err}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Group lines into dialogue requests under the per-request text limit,
 *  evenly sized (no one-line straggler voiced without context). */
export function chunkDialogue<T extends { text: string }>(lines: T[], maxChars = 2000): T[][] {
  const total = lines.reduce((n, l) => n + l.text.length, 0);
  const target = total / Math.max(1, Math.ceil(total / maxChars));
  const out: T[][] = [];
  let cur: T[] = [], n = 0;
  for (const l of lines) {
    if (cur.length && (n + l.text.length > maxChars || n >= target)) { out.push(cur); cur = []; n = 0; }
    cur.push(l); n += l.text.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Keep only well-formed host lines (trimmed, length-capped). */
export function sanitizeLines(raw: unknown, maxLines: number, maxChars = 600): BroadcastLine[] | null {
  if (!Array.isArray(raw)) return null;
  const lines = raw
    .filter((l): l is BroadcastLine => !!l && (l.speaker === 'marcus' || l.speaker === 'tony') && typeof l.text === 'string' && !!l.text.trim())
    .map(l => ({ speaker: l.speaker, text: l.text.trim().slice(0, maxChars) }));
  if (lines.length === 0 || lines.length > maxLines) return null;
  return lines;
}

export function contentHash(data: unknown): string {
  return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
}

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createSupabaseAdmin(url, key);
}

/** Cached mp3 at `bball/<path>`, or null (miss / no Supabase). */
export async function readCachedAudio(path: string): Promise<Buffer | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data } = await sb.storage.from(CACHE_BUCKET).download(`${CACHE_PREFIX}/${path}`);
  return data ? Buffer.from(await data.arrayBuffer()) : null;
}

export async function writeCachedAudio(path: string, buffer: Buffer): Promise<void> {
  const sb = supabaseAdmin();
  if (!sb) return;
  await sb.storage.from(CACHE_BUCKET).upload(`${CACHE_PREFIX}/${path}`, buffer, { contentType: 'audio/mpeg', upsert: true });
}

export function mp3Response(buffer: Buffer, cache: 'HIT' | 'MISS'): NextResponse {
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(buffer.length),
      'Cache-Control': 'private, max-age=604800',
      'X-Cache': cache,
    },
  });
}

/**
 * Premium gate, same rule as BS Football's broadcast routes: a 401/403 to send
 * back, or null when the caller is Premium (founders + admins resolve to
 * premium in readCredits). Enforced whenever Supabase is configured; bare
 * local dev (no Supabase env) stays open so it's testable on localhost.
 */
export async function requirePremium(featureLabel: string): Promise<NextResponse | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  const authClient = await createSupabaseServer();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated', code: 'auth_required' }, { status: 401 });
  const { tier } = await readCredits(getServiceClient(), user.id, user.created_at);
  if (tier !== 'premium') {
    return NextResponse.json({ error: `${featureLabel} is a Premium feature.`, code: 'premium_required' }, { status: 403 });
  }
  return null;
}

export function errorResponse(label: string, err: unknown): NextResponse {
  console.error(`${label} error:`, err);
  const status = (err as Error & { status?: number }).status ?? 500;
  const code = (err as Error & { code?: string }).code;
  return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error', ...(code ? { code } : {}) }, { status });
}
