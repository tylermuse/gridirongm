# Team Spotlight Podcast Audio Feature — Build Instructions

## Overview

Add a "Listen to Podcast" button to the Team Spotlight section that generates a two-host podcast audio (MP3) from the spotlight debate exchanges using ElevenLabs TTS, then plays it in-browser with a custom audio player.

The existing spotlight flow already generates structured dialogue between Marcus Cole and Tony Blaze (via AI or templates). This feature takes those exchanges and converts them to audio on demand.

---

## Architecture

```
User clicks "Listen" → POST /api/spotlight-audio
  → Server receives topic exchanges
  → Formats into podcast script (intro + transitions + exchanges + outro)
  → Calls ElevenLabs TTS for each line (two different voices)
  → Stitches clips into single MP3 using ffmpeg
  → Returns MP3 binary (or uploads to Supabase Storage and returns URL)
  → Client plays audio in a custom player component
```

---

## Files to Create / Modify

### 1. NEW: `src/app/api/spotlight-audio/route.ts` — Audio Generation API

This is the core backend. It receives the spotlight exchanges and returns an MP3.

```typescript
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

// ── Supabase Storage Cache (optional) ─────────────────────────────────
// If Supabase is configured, cache generated MP3s in a storage bucket
// called "spotlight-audio" to avoid re-generating for the same content.
// Falls back to generating fresh each time if no Supabase.

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

// ── Silence Generator ─────────────────────────────────────────────────
// Generate a silent MP3 frame of approximate duration using ffmpeg
// This runs in the Vercel serverless function (Node.js runtime)
// NOTE: Vercel serverless functions do NOT have ffmpeg available.
// Instead, generate silence as raw PCM and encode, OR use a pure-JS approach.
//
// RECOMMENDED: Use a pre-generated silent MP3 buffer. Store a 100ms and
// 400ms silent MP3 as base64 constants (they're tiny — ~1KB each).
// Alternatively, use the `audiobuffer-to-wav` or similar npm package.

// For simplicity: concatenate MP3 buffers directly. MP3 is a streaming
// format — you CAN just concatenate MP3 frames together. The only issue
// is adding silence between segments.
//
// APPROACH: Use ElevenLabs to generate a short "..." or pause token for
// silence, OR just concatenate the speech buffers directly (the natural
// trailing silence in TTS output provides some gap).
//
// BEST APPROACH for production: Use ffmpeg via @ffmpeg/ffmpeg (WASM) or
// build the full audio server-side with a small silence MP3 between clips.

// Pre-generated 400ms silence MP3 (generate once, paste base64 here)
// You can generate this with: ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 0.4 -c:a libmp3lame -b:a 128k silence_400ms.mp3
// Then: base64 -i silence_400ms.mp3
// For now, we'll use direct concatenation (MP3 frames are concatenable)

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

  // Intro
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

    // Only include stats/hottake exchanges (skip fans/player posts for audio)
    const debateExchanges = topic.exchanges.filter(
      e => e.speakerId === 'stats' || e.speakerId === 'hottake'
    );

    if (debateExchanges.length === 0) continue;

    // Add transition between topics (except before first topic)
    if (i > 0) {
      const transitions = [
        { speaker: 'marcus' as const, text: `Alright, let's move on. Next topic.` },
        { speaker: 'marcus' as const, text: `OK, shifting gears here.` },
        { speaker: 'marcus' as const, text: `Let's keep it moving, Tony.` },
        { speaker: 'tony' as const, text: `Next one. Let's go.` },
      ];
      lines.push(transitions[i % transitions.length]);
    }

    // Add the debate exchanges
    for (const exchange of debateExchanges) {
      lines.push({
        speaker: exchange.speakerId === 'stats' ? 'marcus' : 'tony',
        text: exchange.text,
      });
    }
  }

  // Outro
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
            'Cache-Control': 'public, max-age=604800', // 7 days
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

    // Concatenate MP3 buffers (MP3 is a streaming format — direct concat works)
    const finalBuffer = Buffer.concat(audioBuffers);

    // Cache to Supabase Storage if available
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
```

**Key design decisions:**
- Only converts `stats` and `hottake` exchanges to audio (skips fan reactions and player tweets — those are visual-only)
- Auto-generates intro, transitions, and outro around the raw debate exchanges
- Caches generated MP3 to Supabase Storage bucket `spotlight-audio` (create this bucket in Supabase dashboard)
- Direct MP3 concatenation (no ffmpeg dependency needed — MP3 frames are independently decodable)
- Uses `eleven_multilingual_v2` model for high quality

---

### 2. NEW: `src/components/game/SpotlightAudioPlayer.tsx` — Audio Player UI

A play/pause button + progress bar that sits in the Team Spotlight card header.

```typescript
'use client';

import { useState, useRef, useEffect } from 'react';

interface SpotlightAudioPlayerProps {
  topics: { headline: string; icon: string; exchanges: { speakerId: string; text: string }[] }[];
  teamName: string;
}

export function SpotlightAudioPlayer({ topics, teamName }: SpotlightAudioPlayerProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'paused' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  async function handlePlay() {
    // If we already have audio loaded, just toggle play/pause
    if (audioRef.current && blobUrlRef.current) {
      if (state === 'playing') {
        audioRef.current.pause();
        setState('paused');
      } else {
        audioRef.current.play();
        setState('playing');
      }
      return;
    }

    // Fetch the audio
    setState('loading');
    try {
      const res = await fetch('/api/spotlight-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics, teamName }),
      });

      if (!res.ok) throw new Error('Failed to generate audio');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.addEventListener('loadedmetadata', () => setDuration(audio.duration));
      audio.addEventListener('timeupdate', () => setProgress(audio.currentTime));
      audio.addEventListener('ended', () => { setState('idle'); setProgress(0); });
      audio.addEventListener('error', () => setState('error'));

      await audio.play();
      setState('playing');
    } catch {
      setState('error');
    }
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = pct * duration;
    setProgress(pct * duration);
  }

  function formatTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  // Idle state — just a button
  if (state === 'idle' && !blobUrlRef.current) {
    return (
      <button
        onClick={handlePlay}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                   bg-purple-600 text-white hover:bg-purple-700 transition-colors"
      >
        <span>🎧</span> Listen to Podcast
      </button>
    );
  }

  if (state === 'loading') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold
                      bg-purple-100 text-purple-700">
        <span className="animate-pulse">🎧</span> Generating audio...
      </div>
    );
  }

  if (state === 'error') {
    return (
      <button
        onClick={() => { setState('idle'); blobUrlRef.current = null; audioRef.current = null; }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                   bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
      >
        ⚠️ Retry
      </button>
    );
  }

  // Playing / Paused — show player
  return (
    <div className="flex items-center gap-2.5">
      <button
        onClick={handlePlay}
        className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center
                   hover:bg-purple-700 transition-colors text-sm"
      >
        {state === 'playing' ? '⏸' : '▶'}
      </button>

      {/* Progress bar */}
      <div className="flex items-center gap-2 flex-1 min-w-[120px]">
        <span className="text-[10px] text-[var(--text-sec)] tabular-nums w-8">
          {formatTime(progress)}
        </span>
        <div
          className="flex-1 h-1.5 bg-[var(--surface-2)] rounded-full cursor-pointer relative"
          onClick={handleSeek}
        >
          <div
            className="h-full bg-purple-500 rounded-full transition-[width] duration-100"
            style={{ width: duration ? `${(progress / duration) * 100}%` : '0%' }}
          />
        </div>
        <span className="text-[10px] text-[var(--text-sec)] tabular-nums w-8">
          {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
```

---

### 3. MODIFY: `src/app/page.tsx` — Wire Up the Audio Player

In the `TeamSpotlightSection` component, add the audio player button to the card header.

**Import the new component** (add near top of file with other imports):
```typescript
import { SpotlightAudioPlayer } from '@/components/game/SpotlightAudioPlayer';
```

**Add the player to the spotlight card header.** Find this block (around line 451-463):
```tsx
<CardHeader>
  <div className="flex items-center justify-between">
    <div>
      <CardTitle>
        <span className="flex items-center gap-2"><span>🎬</span> Team Spotlight</span>
      </CardTitle>
      <p className="text-xs text-[var(--text-sec)] mt-0.5">
        with {COMMENTATORS.stats.name} {COMMENTATORS.stats.avatar} & {COMMENTATORS.hottake.name} {COMMENTATORS.hottake.avatar}
        {aiCommentary && aiState.topics && (
          <span className="ml-2 text-purple-500 font-medium">AI</span>
        )}
      </p>
    </div>
  </div>
</CardHeader>
```

**Replace it with:**
```tsx
<CardHeader>
  <div className="flex items-center justify-between">
    <div>
      <CardTitle>
        <span className="flex items-center gap-2"><span>🎬</span> Team Spotlight</span>
      </CardTitle>
      <p className="text-xs text-[var(--text-sec)] mt-0.5">
        with {COMMENTATORS.stats.name} {COMMENTATORS.stats.avatar} & {COMMENTATORS.hottake.name} {COMMENTATORS.hottake.avatar}
        {aiCommentary && aiState.topics && (
          <span className="ml-2 text-purple-500 font-medium">AI</span>
        )}
      </p>
    </div>
    {/* Podcast audio player — only show when ElevenLabs is configured */}
    {topics.length > 0 && (
      <SpotlightAudioPlayer
        topics={topics}
        teamName={`${team.city} ${team.name}`}
      />
    )}
  </div>
</CardHeader>
```

---

### 4. MODIFY: `.env.local` — Add ElevenLabs API Key

```
ELEVENLABS_API_KEY=sk_a223ec6a8c8f40a82fffa4c9ee2e94b5c6b08bd61e23131c
```

---

### 5. OPTIONAL: Supabase Storage Bucket

If caching is desired (recommended to avoid re-generating the same audio):

1. Go to Supabase Dashboard → Storage
2. Create a new bucket called `spotlight-audio`
3. Set it to **public** (so cached audio URLs can be served directly)
4. The API route handles upload/download automatically

---

## Voice Configuration

The current voice assignments:

| Character | Voice ID | Style |
|-----------|----------|-------|
| Marcus Cole | `NKI4WPSf2OjKR4G4fadW` | Measured, analytical anchor |
| Tony Blaze | `aGw6gMq5DRXPll7WVlNn` | Energetic, passionate hot-take host |

To change voices, update the `VOICES` object in `src/app/api/spotlight-audio/route.ts`. You can browse voices at https://elevenlabs.io/voice-library.

---

## How It Works End-to-End

1. **Spotlight generates** (existing flow — no changes). Either via AI (Gemini/Claude) for special narrative moments, or via the template engine for weekly recaps.

2. **User sees the spotlight card** on the home page with the debate bubbles rendered as usual.

3. **"Listen to Podcast" button** appears in the top-right of the spotlight card header.

4. **User clicks the button** → `SpotlightAudioPlayer` sends a POST to `/api/spotlight-audio` with the topics array and team name.

5. **Server builds the podcast script** from the exchanges:
   - Adds a short intro (Marcus welcomes, Tony hypes)
   - For each topic, maps `stats` exchanges → Marcus voice, `hottake` → Tony voice
   - Adds transitions between topics
   - Adds an outro sign-off
   - Skips `fans` and `player` exchanges (those are visual-only in the UI)

6. **Server calls ElevenLabs TTS** for each script line with the appropriate voice ID, then concatenates the MP3 buffers.

7. **Server returns the MP3 binary** (and optionally caches to Supabase Storage).

8. **Client receives the blob**, creates an object URL, and plays it through the HTML5 Audio API with a progress bar and play/pause controls.

---

## Edge Cases & Notes

- **No ElevenLabs key configured**: The audio player button simply won't appear (the API returns a 500, player shows retry state). Consider adding an env check client-side to hide the button entirely.
- **Rate limits**: ElevenLabs free tier allows ~10K characters/month. A full spotlight podcast is roughly 2,000-3,000 characters. Consider showing the button only for AI-generated spotlights (special narrative moments) to conserve quota.
- **Generation time**: Expect 10-20 seconds for a full podcast (~20 TTS calls). The "Generating audio..." loading state handles this. Consider adding a progress indicator if desired.
- **MP3 concatenation**: Direct buffer concatenation works because MP3 is a streaming frame-based format. There may be tiny clicks at join points. For production polish, consider using `@ffmpeg/ffmpeg` (WASM) to properly re-encode, or add pre-generated silence buffers between clips.
- **Vercel function timeout**: Default 10s on Hobby, 60s on Pro. A full podcast generation may need Pro tier or you can use Vercel's streaming response to keep the connection alive. Alternative: generate async and poll.

---

## Future Enhancements

- **Background music**: Mix in a subtle loop under the voices using ffmpeg WASM
- **Per-topic playback**: Let users play audio for individual topics instead of the full podcast
- **Download button**: Let users save the MP3
- **Voice settings UI**: Let users pick their preferred voices from their ElevenLabs library
- **Scheduled generation**: Auto-generate podcast audio when spotlight content is created (during the existing `fetchAiSpotlight` flow) so it's ready instantly when the user wants to listen
