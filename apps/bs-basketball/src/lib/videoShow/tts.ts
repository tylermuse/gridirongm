/**
 * ElevenLabs voice config + TTS helpers for the BS Hoops Team Spotlight video
 * show (/api/spotlight-show). Same voices as BS Football; basketball text
 * normalization.
 * Server-only.
 */

// ── Voice Config ──────────────────────────────────────────────────────
export const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';

export const VOICES = {
  marcus: 'NKI4WPSf2OjKR4G4fadW',  // Marcus Cole — measured, analytical
  tony: 'aGw6gMq5DRXPll7WVlNn',    // Tony Blaze — energetic, passionate
};

export const MODEL_ID = 'eleven_multilingual_v2';

// ── Text Normalization for TTS ────────────────────────────────────────
// TTS engines read text literally — expand abbreviations and symbols
// so the voices say "points a game" instead of "P P G", "$55 million" instead of "$55M", etc.
export function normalizeTtsText(text: string): string {
  let t = text;

  // Money: "$55M" → "55 million dollars", "$4.2M" → "4.2 million dollars"
  t = t.replace(/\$(\d+(?:\.\d+)?)\s*[Mm]/g, '$1 million dollars');
  // Money: "$500K" → "500 thousand dollars"
  t = t.replace(/\$(\d+(?:\.\d+)?)\s*[Kk]/g, '$1 thousand dollars');
  // Money: "$55,000,000" or standalone "$55" (catch remaining dollar signs)
  t = t.replace(/\$(\d)/g, '$1 dollar');

  // Basketball stats and positions — word boundaries to avoid partial replacements
  t = t.replace(/\b(\d+(?:\.\d+)?)\s*PPG\b/gi, '$1 points a game');
  t = t.replace(/\b(\d+(?:\.\d+)?)\s*RPG\b/gi, '$1 rebounds a game');
  t = t.replace(/\b(\d+(?:\.\d+)?)\s*APG\b/gi, '$1 assists a game');
  t = t.replace(/\bPPG\b/gi, 'points per game');
  t = t.replace(/\bRPG\b/gi, 'rebounds per game');
  t = t.replace(/\bAPG\b/gi, 'assists per game');
  t = t.replace(/\b3P%|\b3PT%|\b3PT\b/gi, 'three-point');
  t = t.replace(/\bFG%/gi, 'field goal percentage');
  t = t.replace(/\bTS%/gi, 'true shooting');
  t = t.replace(/\b(\d+(?:\.\d+)?)%/g, '$1 percent');
  t = t.replace(/\bPGs\b/g, 'point guards');
  t = t.replace(/\bPG\b/g, 'point guard');
  t = t.replace(/\bSG\b/g, 'shooting guard');
  t = t.replace(/\bSF\b/g, 'small forward');
  t = t.replace(/\bPF\b/g, 'power forward');
  t = t.replace(/\bOT\b/g, 'overtime');
  t = t.replace(/\bFA\b/g, 'free agency');
  t = t.replace(/\bFAs\b/g, 'free agents');
  t = t.replace(/\bGM\b/g, 'general manager');
  t = t.replace(/\bGMs\b/g, 'general managers');
  t = t.replace(/\bMVP\b/g, 'M V P');
  t = t.replace(/\bOVR\b/gi, 'overall');
  t = t.replace(/\bMLE\b/g, 'mid-level exception');

  // Ordinals: "23rd" → "twenty-third" (TTS usually handles these, but ensure consistency)
  // TTS handles ordinals fine, skip these

  // Negative point differential: "-13" at start or after space
  t = t.replace(/(?<=\s|^)-(\d+)/g, 'negative $1');

  // Ensure "vs" reads as "versus"
  t = t.replace(/\bvs\.?\b/gi, 'versus');

  return t;
}

// ── TTS Helper ────────────────────────────────────────────────────────
export async function generateSpeech(text: string, voiceId: string): Promise<Buffer> {
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


// ── Dialogue (ElevenLabs v4 Turbo) ────────────────────────────────────
// The show voices each topic's conversation in one pass with
// text-to-dialogue, so turn-taking, pace and reactions sound like two
// people talking to each other instead of separately read lines.
// v4 Turbo: same delivery tags and timestamps as v3, half the price per
// character ($0.04 vs $0.08 per 1K); side by side it sounded the same.
export const DIALOGUE_MODEL_ID = 'eleven_v4_turbo';

export interface DialogueLine { voiceId: string; text: string }
export interface VoicedDialogue {
  audio: Buffer;
  /** Where each input line sits in `audio` (seconds), in input order. */
  lines: { start: number; end: number }[];
}

export async function generateDialogue(lines: DialogueLine[]): Promise<VoicedDialogue> {
  const res = await fetch(`${ELEVENLABS_BASE}/text-to-dialogue/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_API_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model_id: DIALOGUE_MODEL_ID,
      inputs: lines.map(l => ({ text: l.text, voice_id: l.voiceId })),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    if (res.status === 401 || res.status === 402 || res.status === 429) {
      const error = new Error(`ElevenLabs quota exceeded (${res.status}): ${err}`);
      (error as Error & { status: number }).status = 402;
      throw error;
    }
    throw new Error(`ElevenLabs dialogue failed (${res.status}): ${err}`);
  }
  const j = (await res.json()) as {
    audio_base64: string;
    voice_segments: { dialogue_input_index: number; start_time_seconds: number; end_time_seconds: number }[];
  };
  const spans = lines.map(() => ({ start: Infinity, end: 0 }));
  for (const s of j.voice_segments) {
    const span = spans[s.dialogue_input_index];
    if (!span) continue;
    span.start = Math.min(span.start, s.start_time_seconds);
    span.end = Math.max(span.end, s.end_time_seconds);
  }
  return {
    audio: Buffer.from(j.audio_base64, 'base64'),
    lines: spans.map(s => (Number.isFinite(s.start) ? s : { start: 0, end: 0 })),
  };
}

/** v3 performance cues ([laughs], [sighs]…) are spoken direction, not words:
 *  strip them from anything shown on screen. */
export const stripCues = (s: string) => s.replace(/\[[^\]]*\]\s*/g, '').replace(/\s{2,}/g, ' ').trim();
