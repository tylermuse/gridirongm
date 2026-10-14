/**
 * Halftime breakdown audio (Premium).
 *
 * Takes the templated first-half read (generateHalftimeAudioBreakdown) as
 * notes, has Claude rewrite it as a natural Marcus/Tony conversation in the
 * Team Spotlight show's voice, and voices it with ElevenLabs v3 dialogue (one
 * pass per chunk, so turn-taking and reactions sound like two people talking,
 * not lines read one by one). Cached in Supabase Storage by a hash of the
 * notes, so replaying the same half is free.
 */
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient as createSupabaseServer } from '@bs/core/supabase/server';
import { readCredits, getServiceClient } from '@bs/core/podcast';
import { ELEVENLABS_API_KEY, VOICES, generateDialogue, normalizeTtsText } from '@/lib/spotlight/tts';
import { writeHalftime, chunkDialogue, type HalftimeLine } from '@/lib/engine/halftimeShow';

export const maxDuration = 120;

const CACHE_BUCKET = 'game-audio';
/** Bump when the writer or voicing changes, so old cached audio isn't reused. */
const VERSION = 'ht-v3-1';

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createSupabaseAdmin(url, key);
}

const mp3 = (buffer: Buffer, cache: 'HIT' | 'MISS') => new NextResponse(new Uint8Array(buffer), {
  headers: {
    'Content-Type': 'audio/mpeg',
    'Content-Length': String(buffer.length),
    'Cache-Control': 'private, max-age=604800',
    'X-Cache': cache,
  },
});

export async function POST(request: Request) {
  try {
    if (!ELEVENLABS_API_KEY) return NextResponse.json({ error: 'ELEVENLABS_API_KEY not configured' }, { status: 500 });

    const { lines } = (await request.json()) as { lines?: HalftimeLine[] };
    const notes = (Array.isArray(lines) ? lines : [])
      .filter(l => (l?.speaker === 'marcus' || l?.speaker === 'tony') && typeof l.text === 'string' && l.text.trim())
      .map(l => ({ speaker: l.speaker, text: l.text.trim().slice(0, 600) }));
    if (notes.length === 0) return NextResponse.json({ error: 'lines (non-empty array) required' }, { status: 400 });
    if (notes.length > 24) return NextResponse.json({ error: 'too many lines (max 24)' }, { status: 400 });

    // Premium only (founders + admins grandfathered by resolveTier). Enforced
    // whenever Supabase is configured (prod); bare local dev skips it.
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const authClient = await createSupabaseServer();
      const { data: { user } } = await authClient.auth.getUser();
      if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      const { tier } = await readCredits(getServiceClient(), user.id, user.created_at);
      if (tier !== 'premium') {
        return NextResponse.json({ error: 'The halftime audio breakdown is a Premium feature.', code: 'premium_required' }, { status: 403 });
      }
    }

    const hash = crypto.createHash('md5').update(JSON.stringify([VERSION, notes])).digest('hex');
    const path = `halftime/${hash}.mp3`;
    const sb = supabaseAdmin();
    if (sb) {
      const { data } = await sb.storage.from(CACHE_BUCKET).download(path);
      if (data) return mp3(Buffer.from(await data.arrayBuffer()), 'HIT');
    }

    const script = (await writeHalftime(notes)) ?? notes;
    const voiced = await Promise.all(chunkDialogue(script).map(chunk =>
      generateDialogue(chunk.map(l => ({ voiceId: VOICES[l.speaker], text: normalizeTtsText(l.text) })))));
    // MP3 frames concatenate cleanly.
    const buffer = Buffer.concat(voiced.map(v => v.audio));

    if (sb) await sb.storage.from(CACHE_BUCKET).upload(path, buffer, { contentType: 'audio/mpeg', upsert: true });
    return mp3(buffer, 'MISS');
  } catch (err) {
    console.error('Halftime audio error:', err);
    const status = (err as Error & { status?: number }).status ?? 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status });
  }
}
