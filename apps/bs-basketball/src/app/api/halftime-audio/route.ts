/**
 * Halftime breakdown audio (Premium) — the Hoops port of BS Football's
 * /api/halftime-audio.
 *
 * Takes the templated first-half read (lib/broadcast/halftimeNotes) as notes,
 * has Claude rewrite it as a natural Marcus/Tony conversation, and voices it
 * with ElevenLabs dialogue (one pass per chunk, so turn-taking sounds like two
 * people talking). Falls back to voicing the notes when no writer is
 * configured. Cached in Supabase Storage by a hash of the notes, so replaying
 * the same half is free.
 */

import { NextResponse } from 'next/server';
import {
  ELEVENLABS_API_KEY, chunkDialogue, contentHash, errorResponse, generateDialogue,
  mp3Response, readCachedAudio, requirePremium, sanitizeLines, writeCachedAudio,
} from '@/lib/broadcast/tts';
import { writeHalftime } from '@/lib/broadcast/halftimeWriter';

export const maxDuration = 120;

/** Bump when the writer or voicing changes, so old cached audio isn't reused. */
const VERSION = 'bball-ht-v1';

export async function POST(request: Request) {
  try {
    if (!ELEVENLABS_API_KEY) {
      return NextResponse.json({ error: 'ELEVENLABS_API_KEY not configured', code: 'not_configured' }, { status: 503 });
    }
    const body = (await request.json().catch(() => null)) as { lines?: unknown } | null;
    const notes = sanitizeLines(body?.lines, 24);
    if (!notes) return NextResponse.json({ error: 'lines (1-24 host lines) required' }, { status: 400 });

    const denied = await requirePremium('The halftime audio breakdown');
    if (denied) return denied;

    const path = `halftime/${contentHash([VERSION, notes])}.mp3`;
    const cached = await readCachedAudio(path);
    if (cached) return mp3Response(cached, 'HIT');

    const script = (await writeHalftime(notes)) ?? notes;
    const voiced = await Promise.all(chunkDialogue(script).map(generateDialogue));
    const buffer = Buffer.concat(voiced); // MP3 frames concatenate cleanly
    await writeCachedAudio(path, buffer);
    return mp3Response(buffer, 'MISS');
  } catch (err) {
    return errorResponse('Halftime audio', err);
  }
}
