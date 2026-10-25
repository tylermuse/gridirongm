/**
 * Live game audio broadcast (Premium) — the Hoops port of BS Football's
 * /api/game-audio.
 *
 * Takes one play's commentary lines (built client-side by
 * lib/broadcast/gameBroadcast.ts), renders each with the matching ElevenLabs
 * voice, concatenates the MP3 frames, and caches the result in Supabase
 * Storage keyed by content hash. The script is deterministic per game, so a
 * re-watch is all cache hits.
 */

import {
  ELEVENLABS_API_KEY, VOICES, contentHash, errorResponse, generateSpeech, mp3Response,
  normalizeTtsText, readCachedAudio, requirePremium, sanitizeLines, writeCachedAudio,
} from '@/lib/broadcast/tts';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    if (!ELEVENLABS_API_KEY) {
      return NextResponse.json({ error: 'ELEVENLABS_API_KEY not configured', code: 'not_configured' }, { status: 503 });
    }
    const body = (await request.json().catch(() => null)) as { lines?: unknown } | null;
    const lines = sanitizeLines(body?.lines, 12, 400);
    if (!lines) return NextResponse.json({ error: 'lines (1-12 host lines) required' }, { status: 400 });

    const denied = await requirePremium('The live audio broadcast');
    if (denied) return denied;

    const path = `live/${contentHash(lines)}.mp3`;
    const cached = await readCachedAudio(path);
    if (cached) return mp3Response(cached, 'HIT');

    // Cache miss → render each line and concat (MP3 frames concat cleanly).
    const buffers: Buffer[] = [];
    for (const line of lines) buffers.push(await generateSpeech(normalizeTtsText(line.text), VOICES[line.speaker]));
    const buffer = Buffer.concat(buffers);
    await writeCachedAudio(path, buffer);
    return mp3Response(buffer, 'MISS');
  } catch (err) {
    return errorResponse('Game audio', err);
  }
}
