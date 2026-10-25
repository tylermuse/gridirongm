/**
 * Pregame Show audio (Premium) — voices the pregame show the viewer is
 * reading (AI-written for Premium, else the template) as one Marcus/Tony
 * conversation with ElevenLabs dialogue. Cached in Supabase Storage by a hash
 * of the lines, so reopening the same pregame is free.
 */

import { NextResponse } from 'next/server';
import {
  DIALOGUE_MODEL_ID, ELEVENLABS_API_KEY, chunkDialogue, contentHash, errorResponse, generateDialogue,
  mp3Response, readCachedAudio, requirePremium, sanitizeLines, writeCachedAudio,
} from '@/lib/broadcast/tts';

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    if (!ELEVENLABS_API_KEY) {
      return NextResponse.json({ error: 'ELEVENLABS_API_KEY not configured', code: 'not_configured' }, { status: 503 });
    }
    const body = (await request.json().catch(() => null)) as { lines?: unknown } | null;
    const lines = sanitizeLines(body?.lines, 20, 800);
    if (!lines) return NextResponse.json({ error: 'lines (1-20 host lines) required' }, { status: 400 });

    const denied = await requirePremium('The pregame show audio');
    if (denied) return denied;

    const path = `pregame/${contentHash([DIALOGUE_MODEL_ID, lines])}.mp3`;
    const cached = await readCachedAudio(path);
    if (cached) return mp3Response(cached, 'HIT');

    const voiced = await Promise.all(chunkDialogue(lines).map(generateDialogue));
    const buffer = Buffer.concat(voiced); // MP3 frames concatenate cleanly
    await writeCachedAudio(path, buffer);
    return mp3Response(buffer, 'MISS');
  } catch (err) {
    return errorResponse('Pregame audio', err);
  }
}
