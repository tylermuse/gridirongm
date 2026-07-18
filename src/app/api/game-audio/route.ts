/**
 * Game Broadcast audio (Phase 1 spike, feature-flagged on the client).
 *
 * Mirrors /api/spotlight-audio: takes a small batch of commentary lines,
 * renders each with the matching ElevenLabs voice, concatenates the MP3
 * frames, and caches the result in Supabase Storage keyed by content hash.
 * The client requests segments generate-ahead so playback can start fast.
 *
 * NOTE (spike): this route requires an authenticated user but does NOT yet
 * consume a billing credit. The client feature is off unless
 * NEXT_PUBLIC_GAME_AUDIO=1, so it isn't reachable in prod. Before shipping,
 * gate fresh generations on an entitlement/credit like the podcast does
 * (see consumePodcastCredit in /api/spotlight-audio).
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient as createSupabaseServer } from '@bs/core/supabase/server';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';

const VOICES = {
  marcus: 'NKI4WPSf2OjKR4G4fadW', // Marcus Cole — measured play-by-play
  tony: 'aGw6gMq5DRXPll7WVlNn',   // Tony Blaze — energetic color
} as const;

const MODEL_ID = 'eleven_multilingual_v2';
const CACHE_BUCKET = 'game-audio';

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createSupabaseAdmin(url, key);
}

function contentHash(data: unknown): string {
  return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
}

// Expand the football shorthand that shows up in play descriptions so the
// voices say "touchdown" not "T D", "3rd and 8" cleanly, etc. (Subset of the
// spotlight normalizer — kept local so the podcast route stays untouched.)
function normalizeTtsText(text: string): string {
  let t = text;
  t = t.replace(/\b(\d+)\s*TDs\b/gi, '$1 touchdowns');
  t = t.replace(/\b(\d+)\s*TD\b/gi, '$1 touchdowns');
  t = t.replace(/\bTD\b/gi, 'touchdown');
  t = t.replace(/\b(\d+)\s*INTs\b/gi, '$1 interceptions');
  t = t.replace(/\b(\d+)\s*INT\b/gi, '$1 interceptions');
  t = t.replace(/\bINT\b/gi, 'interception');
  t = t.replace(/\bQB\b/g, 'quarterback');
  t = t.replace(/\bRB\b/g, 'running back');
  t = t.replace(/\bWR\b/g, 'wide receiver');
  t = t.replace(/\bTE\b/g, 'tight end');
  t = t.replace(/\bFG\b/g, 'field goal');
  t = t.replace(/\bXP\b/g, 'extra point');
  t = t.replace(/\byd\b/gi, 'yard');
  t = t.replace(/\byds\b/gi, 'yards');
  t = t.replace(/\bvs\.?\b/gi, 'versus');
  return t;
}

async function generateSpeech(text: string, voiceId: string): Promise<Buffer> {
  const res = await fetch(`${ELEVENLABS_BASE}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_API_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: MODEL_ID, output_format: 'mp3_44100_128' }),
  });
  if (!res.ok) {
    const err = await res.text();
    if (res.status === 401 || res.status === 402 || res.status === 429) {
      const error = new Error(`ElevenLabs quota/auth error (${res.status}): ${err}`) as Error & { status: number };
      error.status = 402;
      throw error;
    }
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${err}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

interface Line {
  speaker: 'marcus' | 'tony';
  text: string;
}

export async function POST(request: Request) {
  try {
    if (!ELEVENLABS_API_KEY) {
      return NextResponse.json({ error: 'ELEVENLABS_API_KEY not configured' }, { status: 500 });
    }

    const { lines } = (await request.json()) as { lines?: Line[] };
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: 'lines (non-empty array) required' }, { status: 400 });
    }
    if (lines.length > 24) {
      return NextResponse.json({ error: 'segment too large (max 24 lines)' }, { status: 400 });
    }

    // Require auth (cache hits are still free — no ElevenLabs cost).
    const authClient = await createSupabaseServer();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const hash = contentHash(lines);
    const sb = supabaseAdmin();

    if (sb) {
      const { data } = await sb.storage.from(CACHE_BUCKET).download(`${hash}.mp3`);
      if (data) {
        const buffer = Buffer.from(await data.arrayBuffer());
        return new NextResponse(buffer, {
          headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Length': String(buffer.length),
            'Cache-Control': 'public, max-age=604800',
            'X-Cache': 'HIT',
          },
        });
      }
    }

    // Cache miss → render each line and concat (MP3 frames concat cleanly).
    const buffers: Buffer[] = [];
    for (const line of lines) {
      const voiceId = VOICES[line.speaker] ?? VOICES.marcus;
      buffers.push(await generateSpeech(normalizeTtsText(line.text), voiceId));
    }
    const finalBuffer = Buffer.concat(buffers);

    if (sb) {
      await sb.storage.from(CACHE_BUCKET).upload(`${hash}.mp3`, finalBuffer, {
        contentType: 'audio/mpeg',
        upsert: true,
      });
    }

    return new NextResponse(finalBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(finalBuffer.length),
        'Cache-Control': 'public, max-age=604800',
        'X-Cache': 'MISS',
      },
    });
  } catch (err) {
    console.error('Game Audio API error:', err);
    const status = (err as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status },
    );
  }
}
