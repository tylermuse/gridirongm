import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';

// ── Voice Config ──────────────────────────────────────────────────────
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';

const VOICES = {
  marcus: 'NKI4WPSf2OjKR4G4fadW',  // Marcus Cole — measured, analytical
  tony: 'aGw6gMq5DRXPll7WVlNn',    // Tony Blaze — energetic, passionate
};

const MODEL_ID = 'eleven_multilingual_v2';

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
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${err}`);
  }

  return Buffer.from(await res.arrayBuffer());
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

    // Check cache
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

    // Build script
    const script = buildPodcastScript(topics, teamName);

    // Generate all TTS clips
    const audioBuffers: Buffer[] = [];
    for (const line of script) {
      const voiceId = VOICES[line.speaker];
      const clip = await generateSpeech(line.text, voiceId);
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
