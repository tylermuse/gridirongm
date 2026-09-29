import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient as createSupabaseServer } from '@bs/core/supabase/server';
import { consumePodcastCredit, getServiceClient } from '@bs/core/podcast';
import { ELEVENLABS_API_KEY, VOICES, normalizeTtsText, generateSpeech } from '@/lib/spotlight/tts';

// ── Supabase Storage Cache ────────────────────────────────────────────
function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createSupabaseAdmin(url, key);
}

function contentHash(data: unknown): string {
  return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
}

// ── Script Builder ────────────────────────────────────────────────────
interface Exchange {
  speakerId: 'stats' | 'hottake' | 'fans' | 'player';
  text: string;
  playerName?: string;
}

interface Topic {
  headline: string;
  icon: string;
  exchanges: Exchange[];
}

interface ScriptLine {
  speaker: 'marcus' | 'tony';
  text: string;
}

function buildPodcastScript(topics: Topic[], teamName: string): ScriptLine[] {
  const lines: ScriptLine[] = [];

  lines.push({
    speaker: 'marcus',
    text: `Welcome back to the Team Spotlight. I'm Marcus Cole alongside Tony Blaze, and today we're breaking down the ${teamName}. Let's get into it.`,
  });
  lines.push({
    speaker: 'tony',
    text: `Let's GO! I've got a LOT to say about this team. Let's not waste any time.`,
  });

  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i];
    const debateExchanges = topic.exchanges.filter(
      e => e.speakerId === 'stats' || e.speakerId === 'hottake'
    );
    if (debateExchanges.length === 0) continue;

    if (i > 0) {
      const transitions = [
        { speaker: 'marcus' as const, text: `Alright, let's move on. Next topic.` },
        { speaker: 'marcus' as const, text: `OK, shifting gears here.` },
        { speaker: 'marcus' as const, text: `Let's keep it moving, Tony.` },
        { speaker: 'tony' as const, text: `Next one. Let's go.` },
      ];
      lines.push(transitions[i % transitions.length]);
    }

    for (const exchange of debateExchanges) {
      lines.push({
        speaker: exchange.speakerId === 'stats' ? 'marcus' : 'tony',
        text: exchange.text,
      });
    }
  }

  lines.push({
    speaker: 'marcus',
    text: `And that's the show. Thanks for tuning in to the Team Spotlight. We'll see you next time.`,
  });
  lines.push({
    speaker: 'tony',
    text: `Stay loud, stay passionate, and keep grinding. This is Tony Blaze — we're out!`,
  });

  return lines;
}

// ── Main Handler ──────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    if (!ELEVENLABS_API_KEY) {
      return NextResponse.json(
        { error: 'ELEVENLABS_API_KEY not configured' },
        { status: 500 }
      );
    }

    const { topics, teamName } = await request.json();
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
        .from('spotlight-audio')
        .download(`${hash}.mp3`);
      if (data) {
        const buffer = Buffer.from(await data.arrayBuffer());
        return new NextResponse(buffer, {
          headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Length': String(buffer.length),
            'Cache-Control': 'public, max-age=604800',
          },
        });
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

    // Concatenate MP3 buffers (MP3 is frame-based — direct concat works)
    const finalBuffer = Buffer.concat(audioBuffers);

    // Cache to Supabase Storage
    if (sb) {
      await sb.storage
        .from('spotlight-audio')
        .upload(`${hash}.mp3`, finalBuffer, {
          contentType: 'audio/mpeg',
          upsert: true,
        });
    }

    return new NextResponse(finalBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(finalBuffer.length),
        'Cache-Control': 'public, max-age=604800',
      },
    });
  } catch (err) {
    console.error('Spotlight Audio API error:', err);
    const status = (err as Error & { status?: number }).status ?? 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status }
    );
  }
}
