import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient as createSupabaseServer } from '@bs/core/supabase/server';
import { consumePodcastCredit, getServiceClient } from '@bs/core/podcast';

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

// ── Text Normalization for TTS ────────────────────────────────────────
// TTS engines read text literally — expand abbreviations and symbols so
// the voices say "rebounds" instead of "R E B", "$55 million" instead of
// "$55M", etc.
function normalizeTtsText(text: string): string {
  let t = text;

  // Money: "$55M" → "55 million dollars", "$4.2M" → "4.2 million dollars"
  t = t.replace(/\$(\d+(?:\.\d+)?)\s*[Mm]/g, '$1 million dollars');
  // Money: "$500K" → "500 thousand dollars"
  t = t.replace(/\$(\d+(?:\.\d+)?)\s*[Kk]/g, '$1 thousand dollars');
  // Money: standalone "$55" — catch remaining dollar signs
  t = t.replace(/\$(\d)/g, '$1 dollar');

  // Basketball box-score stats — word boundaries to avoid partial replacements
  t = t.replace(/\bPPG\b/gi, 'points per game');
  t = t.replace(/\bRPG\b/gi, 'rebounds per game');
  t = t.replace(/\bAPG\b/gi, 'assists per game');
  t = t.replace(/\bSPG\b/gi, 'steals per game');
  t = t.replace(/\bBPG\b/gi, 'blocks per game');
  t = t.replace(/\bMPG\b/gi, 'minutes per game');

  // Shot type abbreviations
  t = t.replace(/\b3PT\b/gi, 'three-point');
  t = t.replace(/\b3-PT\b/gi, 'three-point');
  t = t.replace(/\b3P%\b/gi, 'three-point percentage');
  t = t.replace(/\b3PA\b/gi, 'three-point attempts');
  t = t.replace(/\b3PM\b/gi, 'three-pointers made');
  t = t.replace(/\bFG%\b/gi, 'field goal percentage');
  t = t.replace(/\bFGA\b/gi, 'field goal attempts');
  t = t.replace(/\bFGM\b/gi, 'field goals made');
  t = t.replace(/\bFT%\b/gi, 'free throw percentage');
  t = t.replace(/\bFTA\b/gi, 'free throw attempts');
  t = t.replace(/\bFTM\b/gi, 'free throws made');
  t = t.replace(/\bTS%\b/gi, 'true shooting percentage');
  t = t.replace(/\beFG%\b/gi, 'effective field goal percentage');

  // Rebounds split-out (plural and singular)
  t = t.replace(/\bOREB\b/gi, 'offensive rebounds');
  t = t.replace(/\bDREB\b/gi, 'defensive rebounds');
  t = t.replace(/\bREB\b/gi, 'rebounds');
  t = t.replace(/\bAST\b/gi, 'assists');
  t = t.replace(/\bSTL\b/gi, 'steals');
  t = t.replace(/\bBLK\b/gi, 'blocks');
  t = t.replace(/\bTOV\b/gi, 'turnovers');
  t = t.replace(/\bPF\b/g, 'personal fouls');

  // Basketball position abbreviations
  t = t.replace(/\bPG\b/g, 'point guard');
  t = t.replace(/\bPGs\b/g, 'point guards');
  t = t.replace(/\bSG\b/g, 'shooting guard');
  t = t.replace(/\bSGs\b/g, 'shooting guards');
  t = t.replace(/\bSF\b/g, 'small forward');
  t = t.replace(/\bSFs\b/g, 'small forwards');
  // PF can collide with "personal foul" above — handled there first.
  t = t.replace(/\bC\b(?=\s|$)/g, 'center');

  // Awards / acronyms read as letters
  t = t.replace(/\bMVP\b/g, 'M V P');
  t = t.replace(/\bDPOY\b/g, 'D P O Y');
  t = t.replace(/\bROY\b/g, 'R O Y');
  t = t.replace(/\bMIP\b/g, 'M I P');
  t = t.replace(/\bCOY\b/g, 'C O Y');
  t = t.replace(/\b6MOY\b/g, 'sixth man of the year');
  t = t.replace(/\bAll-League\b/gi, 'All League');
  t = t.replace(/\bAll-NBA\b/gi, 'All N B A');
  t = t.replace(/\bAll-Star\b/gi, 'All Star');

  // Org-level abbreviations
  t = t.replace(/\bFA\b/g, 'free agency');
  t = t.replace(/\bFAs\b/g, 'free agents');
  t = t.replace(/\bGM\b/g, 'general manager');
  t = t.replace(/\bGMs\b/g, 'general managers');
  t = t.replace(/\bOVR\b/gi, 'overall');

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
  speaker: 'mike' | 'trey';
  text: string;
}

function buildPodcastScript(topics: Topic[], teamName: string): ScriptLine[] {
  const lines: ScriptLine[] = [];

  lines.push({
    speaker: 'mike',
    text: `Welcome back to Hoops Tonight. I'm Mike Hartwell alongside Trey "Big Shot" Daniels, and today we're breaking down the ${teamName}. Let's get into it.`,
  });
  lines.push({
    speaker: 'trey',
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
        { speaker: 'mike' as const, text: `Alright, let's move on. Next topic.` },
        { speaker: 'mike' as const, text: `OK, shifting gears here.` },
        { speaker: 'mike' as const, text: `Let's keep it moving, Trey.` },
        { speaker: 'trey' as const, text: `Next one. Let's go.` },
      ];
      lines.push(transitions[i % transitions.length]);
    }

    for (const exchange of debateExchanges) {
      lines.push({
        speaker: exchange.speakerId === 'stats' ? 'mike' : 'trey',
        text: exchange.text,
      });
    }
  }

  lines.push({
    speaker: 'mike',
    text: `And that's the show. Thanks for tuning in to Hoops Tonight. We'll see you next time.`,
  });
  lines.push({
    speaker: 'trey',
    text: `Stay loud, stay passionate, and keep grinding. This is Trey Daniels — we're out!`,
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
        .from(STORAGE_BUCKET)
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
        .from(STORAGE_BUCKET)
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
