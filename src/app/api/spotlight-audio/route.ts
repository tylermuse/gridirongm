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

// ── Text Normalization for TTS ────────────────────────────────────────
// TTS engines read text literally — expand abbreviations and symbols
// so the voices say "touchdown" instead of "T D", "$55 million" instead of "$55M", etc.
function normalizeTtsText(text: string): string {
  let t = text;

  // Money: "$55M" → "55 million dollars", "$4.2M" → "4.2 million dollars"
  t = t.replace(/\$(\d+(?:\.\d+)?)\s*[Mm]/g, '$1 million dollars');
  // Money: "$500K" → "500 thousand dollars"
  t = t.replace(/\$(\d+(?:\.\d+)?)\s*[Kk]/g, '$1 thousand dollars');
  // Money: "$55,000,000" or standalone "$55" (catch remaining dollar signs)
  t = t.replace(/\$(\d)/g, '$1 dollar');

  // Football stats — word boundaries to avoid partial replacements
  // Plural and singular forms
  t = t.replace(/\b(\d+)\s*INTs\b/gi, '$1 interceptions');
  t = t.replace(/\b(\d+)\s*INT\b/gi, '$1 interceptions');
  t = t.replace(/\bINTs\b/gi, 'interceptions');
  t = t.replace(/\bINT\b/gi, 'interception');

  t = t.replace(/\b(\d+)\s*TDs\b/gi, '$1 touchdowns');
  t = t.replace(/\b(\d+)\s*TD\b/gi, '$1 touchdowns');
  t = t.replace(/\bTDs\b/gi, 'touchdowns');
  t = t.replace(/\bTD\b/gi, 'touchdown');

  // TD-to-INT ratio
  t = t.replace(/\btouchdown-to-interception\b/gi, 'touchdown to interception');

  // Common football abbreviations
  t = t.replace(/\bQB\b/g, 'quarterback');
  t = t.replace(/\bQBs\b/g, 'quarterbacks');
  t = t.replace(/\bRB\b/g, 'running back');
  t = t.replace(/\bRBs\b/g, 'running backs');
  t = t.replace(/\bWR\b/g, 'wide receiver');
  t = t.replace(/\bWRs\b/g, 'wide receivers');
  t = t.replace(/\bTE\b/g, 'tight end');
  t = t.replace(/\bTEs\b/g, 'tight ends');
  t = t.replace(/\bCB\b/g, 'cornerback');
  t = t.replace(/\bCBs\b/g, 'cornerbacks');
  t = t.replace(/\bLB\b/g, 'linebacker');
  t = t.replace(/\bLBs\b/g, 'linebackers');
  t = t.replace(/\bDE\b/g, 'defensive end');
  t = t.replace(/\bDEs\b/g, 'defensive ends');
  t = t.replace(/\bDT\b/g, 'defensive tackle');
  t = t.replace(/\bDTs\b/g, 'defensive tackles');
  t = t.replace(/\bOL\b/g, 'offensive line');
  t = t.replace(/\bO-line\b/gi, 'offensive line');
  t = t.replace(/\bD-line\b/gi, 'defensive line');
  t = t.replace(/\bFA\b/g, 'free agency');
  t = t.replace(/\bFAs\b/g, 'free agents');
  t = t.replace(/\bGM\b/g, 'general manager');
  t = t.replace(/\bGMs\b/g, 'general managers');
  t = t.replace(/\bOC\b/g, 'offensive coordinator');
  t = t.replace(/\bDC\b/g, 'defensive coordinator');
  t = t.replace(/\bMVP\b/g, 'M V P');
  t = t.replace(/\bOVR\b/gi, 'overall');
  t = t.replace(/\bPPG\b/gi, 'points per game');

  // Ordinals: "23rd" → "twenty-third" (TTS usually handles these, but ensure consistency)
  // TTS handles ordinals fine, skip these

  // Negative point differential: "-13" at start or after space
  t = t.replace(/(?<=\s|^)-(\d+)/g, 'negative $1');

  // Ensure "vs" reads as "versus"
  t = t.replace(/\bvs\.?\b/gi, 'versus');

  return t;
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
      (error as Error & { status: number }).status = 402;
      throw error;
    }
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
