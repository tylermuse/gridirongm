import { NextResponse } from 'next/server';
import { createClient as createSupabaseServer } from '@bs/core/supabase/server';
import { consumePodcastCredit, getServiceClient } from '@bs/core/podcast';
import { ELEVENLABS_API_KEY } from '@/lib/spotlight/tts';
import { payloadPath, readPayload, streamEpisode, writeJson } from '@/lib/spotlight/showEpisode';
import { parseEpisode, supabaseAdmin } from '@/lib/spotlight/showRequest';

/**
 * Team Spotlight *video* show.
 *
 * Cache hit → the whole episode as JSON ({ segments, audios }), free.
 * Otherwise (one podcast credit) → an NDJSON stream so the player can start
 * right away:
 *   {"type":"script","segments":[…],"final":bool}
 *                                       the episode so far: the opening at once,
 *                                       then again as each topic is written
 *                                       (all at once if written ahead, ./script)
 *   {"type":"block","index":n,"audio":"<b64 mp3>","lines":[{seg,start,duration}]}
 *                                       one per voiced block, as each finishes
 *   {"type":"done"} | {"type":"error","message":…}
 * Fixed lines and phrases are clips the client plays from /public/show.
 */

// Writing (~30s) + voicing (~15s) runs inside the streamed response.
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    if (!ELEVENLABS_API_KEY) {
      return NextResponse.json({ error: 'ELEVENLABS_API_KEY not configured' }, { status: 500 });
    }
    const episode = await parseEpisode(request);
    if (!episode) {
      return NextResponse.json({ error: 'topics (array) and teamName (string) required' }, { status: 400 });
    }

    const authClient = await createSupabaseServer();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Cache hit → free (no ElevenLabs cost).
    const sb = supabaseAdmin();
    const cached = await readPayload(sb, episode);
    if (cached) {
      return new NextResponse(cached, {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=604800' },
      });
    }

    // Fresh episode → one podcast credit (402 exhausted / 403 free tier).
    const consumeResult = await consumePodcastCredit(getServiceClient(), user.id, user.created_at);
    if (!consumeResult.ok) {
      return NextResponse.json(
        { error: consumeResult.error, state: consumeResult.state },
        { status: consumeResult.status },
      );
    }

    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + '\n'));
        try {
          const payload = await streamEpisode(sb, episode, send);
          send({ type: 'done' });
          await writeJson(sb, payloadPath(episode), payload);
        } catch (err) {
          console.error('Spotlight Show stream error:', err);
          send({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
        } finally {
          controller.close();
        }
      },
    });
    return new NextResponse(stream, {
      headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' },
    });
  } catch (err) {
    console.error('Spotlight Show API error:', err);
    const status = (err as Error & { status?: number }).status ?? 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status });
  }
}
