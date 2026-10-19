import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient as createSupabaseServer } from '@bs/core/supabase/server';
import { consumePodcastCredit, getServiceClient } from '@bs/core/podcast';
import { buildPodcastScript, normalizeTtsText, type PodcastTopic } from '@/lib/show/podcastScript';

// ~20 sequential TTS calls on a cache miss — give generation headroom.
export const maxDuration = 120;

// ── Voice Config ──────────────────────────────────────────────────────
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';

// Voice IDs reused from football — Mike Hartwell takes the analytical voice
// slot (was Marcus Cole), Trey "Big Shot" Daniels takes the hot-take voice
// slot (was Tony Blaze). Same speakers, basketball framing.
const VOICES = {
  mike: 'NKI4WPSf2OjKR4G4fadW',  // Mike Hartwell — measured, analytical
  trey: 'aGw6gMq5DRXPll7WVlNn',  // Trey "Big Shot" Daniels — energetic, passionate
};

const MODEL_ID = 'eleven_multilingual_v2';

// ── Supabase Storage Cache ────────────────────────────────────────────
// BS Hoops uses its own bucket — `spotlight-audio-bball` — so md5(content)
// collisions across sports can't surface the wrong-sport mp3. Football uses
// `spotlight-audio`.
const STORAGE_BUCKET = 'spotlight-audio-bball';

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createSupabaseAdmin(url, key);
}

function contentHash(data: unknown): string {
  return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
}

// ── TTS Helper ────────────────────────────────────────────────────────
async function generateSpeech(text: string, voiceId: string): Promise<Buffer> {
  const res = await fetch(`${ELEVENLABS_BASE}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      output_format: 'mp3_44100_128',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    // Propagate quota/auth errors so the client can show "credits exhausted"
    if (res.status === 401 || res.status === 402 || res.status === 429) {
      const error = new Error(`ElevenLabs quota exceeded (${res.status}): ${err}`);
      (error as Error & { status: number; code: string }).status = 402;
      (error as Error & { code: string }).code = 'tts_quota';
      throw error;
    }
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${err}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

function audioResponse(buffer: Buffer, lineBytes: number[] | null): NextResponse {
  const headers: Record<string, string> = {
    'Content-Type': 'audio/mpeg',
    'Content-Length': String(buffer.length),
    'Cache-Control': 'public, max-age=604800',
  };
  if (lineBytes?.length) headers['X-Line-Bytes'] = lineBytes.join(',');
  return new NextResponse(new Uint8Array(buffer), { headers });
}

// Script builder + TTS normalization live in lib/show/podcastScript so the
// client player's synced transcript is built from the exact same lines.

// ── Main Handler ──────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    if (!ELEVENLABS_API_KEY) {
      // 503 + code so the client can fall back to the browser voice quietly.
      return NextResponse.json(
        { error: 'ELEVENLABS_API_KEY not configured', code: 'not_configured' },
        { status: 503 }
      );
    }

    const { topics, teamName } = (await request.json()) as { topics?: PodcastTopic[]; teamName?: string };
    if (!topics || !Array.isArray(topics) || !teamName) {
      return NextResponse.json(
        { error: 'topics (array) and teamName (string) required' },
        { status: 400 }
      );
    }

    // Authenticate the request — podcast generation is a Premium feature.
    // Cache hits are served regardless (no ElevenLabs cost), but we still
    // need to know the user to gate fresh generations on credit availability.
    const authClient = await createSupabaseServer();
    const {
      data: { user },
    } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check cache (free for everyone, including Free tier — no API cost)
    const hash = contentHash({ topics, teamName });
    const sb = supabaseAdmin();
    if (sb) {
      const { data } = await sb.storage
        .from(STORAGE_BUCKET)
        .download(`${hash}.mp3`);
      if (data) {
        const buffer = Buffer.from(await data.arrayBuffer());
        // Per-line clip sizes live in a small sidecar; older entries lack it
        // and the client falls back to estimating line offsets.
        let lineBytes: number[] | null = null;
        const { data: meta } = await sb.storage.from(STORAGE_BUCKET).download(`${hash}.json`);
        if (meta) {
          try { lineBytes = (JSON.parse(await meta.text()) as { lineBytes?: number[] }).lineBytes ?? null; } catch { /* ignore */ }
        }
        return audioResponse(buffer, lineBytes);
      }
    }

    // Cache miss → fresh generation. Consume one podcast credit.
    // Returns 402 when exhausted, 403 for Free tier.
    const service = getServiceClient();
    const consumeResult = await consumePodcastCredit(service, user.id, user.created_at);
    if (!consumeResult.ok) {
      return NextResponse.json(
        { error: consumeResult.error, state: consumeResult.state },
        { status: consumeResult.status },
      );
    }

    // Build script
    const script = buildPodcastScript(topics, teamName);

    // Generate all TTS clips (normalize text for natural speech)
    const audioBuffers: Buffer[] = [];
    for (const line of script) {
      const voiceId = VOICES[line.speaker];
      const normalizedText = normalizeTtsText(line.text);
      const clip = await generateSpeech(normalizedText, voiceId);
      audioBuffers.push(clip);
    }

    // Concatenate MP3 buffers (MP3 is frame-based — direct concat works).
    // CBR 128kbps, so each clip's byte length is proportional to its duration
    // — the client uses these to sync the transcript line by line.
    const finalBuffer = Buffer.concat(audioBuffers);
    const lineBytes = audioBuffers.map(b => b.length);

    // Cache to Supabase Storage (mp3 + per-line sidecar)
    if (sb) {
      await sb.storage
        .from(STORAGE_BUCKET)
        .upload(`${hash}.mp3`, finalBuffer, {
          contentType: 'audio/mpeg',
          upsert: true,
        });
      await sb.storage
        .from(STORAGE_BUCKET)
        .upload(`${hash}.json`, JSON.stringify({ lineBytes }), {
          contentType: 'application/json',
          upsert: true,
        });
    }

    return audioResponse(finalBuffer, lineBytes);
  } catch (err) {
    console.error('Spotlight Audio API error:', err);
    const status = (err as Error & { status?: number }).status ?? 500;
    const code = (err as Error & { code?: string }).code;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error', ...(code ? { code } : {}) },
      { status }
    );
  }
}
