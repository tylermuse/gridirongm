import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient as createSupabaseServer } from '@bs/core/supabase/server';
import { consumePodcastCredit, getServiceClient } from '@bs/core/podcast';
import { ELEVENLABS_API_KEY, VOICES, normalizeTtsText, generateSpeech } from '@/lib/spotlight/tts';
import { buildShowScript, type ShowTopicInput, type TimedShowSegment } from '@/lib/spotlight/showScript';
import type { ShowStatLine } from '@/lib/spotlight/teamStats';

/**
 * Team Spotlight *video* show.
 *
 * Returns { segments, audio } where `audio` is base64 MP3 of every TTS line
 * concatenated in order, and each TTS segment carries its [audioStart,
 * audioDuration] slice. Fixed lines are `clip` segments the client plays
 * from /public/show with their own audio — no TTS spent on them.
 *
 * Same gating as /api/spotlight-audio: cache hits are free; fresh
 * generations require auth and consume one podcast credit.
 */

// ElevenLabs `mp3_44100_128` is CBR 128 kbps → duration = bytes * 8 / 128000.
const MP3_BYTES_PER_SEC = 128_000 / 8;
const CACHE_BUCKET = 'spotlight-audio';
const CACHE_VERSION = 'show-v3';

interface ShowPayload {
  segments: TimedShowSegment[];
  audio: string; // base64 mp3
}

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createSupabaseAdmin(url, key);
}

/** Client-supplied stat line only steers phrase choice + rank slots, but it
 *  builds asset paths (/show/ordinals/<host>/<rank>.mp3), so validate it. */
function sanitizeStats(raw: unknown): ShowStatLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { record?: unknown; stats?: unknown };
  if (typeof r.record !== 'string' || !/^\d{1,2}-\d{1,2}(-\d{1,2})?$/.test(r.record) || !Array.isArray(r.stats)) return null;
  const keys = new Set(['ppg', 'pag', 'pass', 'rush', 'yds']);
  const stats = r.stats.flatMap((s: unknown) => {
    const x = s as { key?: unknown; label?: unknown; value?: unknown; rank?: unknown; of?: unknown };
    const ok = typeof x.key === 'string' && keys.has(x.key)
      && Number.isInteger(x.rank) && Number.isInteger(x.of)
      && (x.of as number) >= 2 && (x.of as number) <= 32
      && (x.rank as number) >= 1 && (x.rank as number) <= (x.of as number);
    return ok ? [{ key: x.key, label: String(x.label ?? ''), value: String(x.value ?? ''), rank: x.rank, of: x.of }] : [];
  });
  return { record: r.record, stats } as ShowStatLine;
}

function contentHash(data: unknown): string {
  return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
}

export async function POST(request: Request) {
  try {
    if (!ELEVENLABS_API_KEY) {
      return NextResponse.json({ error: 'ELEVENLABS_API_KEY not configured' }, { status: 500 });
    }

    const input = (await request.json()) as { topics?: ShowTopicInput[]; teamName?: string; stats?: unknown };
    const { topics, teamName } = input;
    const stats = sanitizeStats(input.stats);
    if (!topics || !Array.isArray(topics) || !teamName) {
      return NextResponse.json({ error: 'topics (array) and teamName (string) required' }, { status: 400 });
    }

    const authClient = await createSupabaseServer();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Cache hit → free (no ElevenLabs cost).
    const hash = contentHash({ v: CACHE_VERSION, topics, teamName, stats });
    const cachePath = `show/${hash}.json`;
    const sb = supabaseAdmin();
    if (sb) {
      const { data } = await sb.storage.from(CACHE_BUCKET).download(cachePath);
      if (data) {
        return new NextResponse(await data.text(), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=604800' },
        });
      }
    }

    // Fresh generation → one podcast credit (402 exhausted / 403 free tier).
    const consumeResult = await consumePodcastCredit(getServiceClient(), user.id, user.created_at);
    if (!consumeResult.ok) {
      return NextResponse.json(
        { error: consumeResult.error, state: consumeResult.state },
        { status: consumeResult.status },
      );
    }

    const script = buildShowScript(topics, teamName, stats);
    const buffers: Buffer[] = [];
    const segments: TimedShowSegment[] = [];
    let cursor = 0;

    for (const seg of script) {
      if (seg.kind !== 'tts') {
        segments.push(seg);
        continue;
      }
      const buf = await generateSpeech(normalizeTtsText(seg.text), VOICES[seg.speaker]);
      const dur = buf.length / MP3_BYTES_PER_SEC;
      buffers.push(buf);
      segments.push({ ...seg, audioStart: cursor, audioDuration: dur });
      cursor += dur;
    }

    const payload: ShowPayload = {
      segments,
      audio: Buffer.concat(buffers).toString('base64'),
    };
    const body = JSON.stringify(payload);

    if (sb) {
      await sb.storage.from(CACHE_BUCKET).upload(cachePath, body, {
        contentType: 'application/json',
        upsert: true,
      });
    }

    return new NextResponse(body, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=604800' },
    });
  } catch (err) {
    console.error('Spotlight Show API error:', err);
    const status = (err as Error & { status?: number }).status ?? 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status });
  }
}
