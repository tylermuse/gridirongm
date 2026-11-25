/**
 * Live game audio broadcast (Premium).
 *
 * Takes one play's commentary lines and voices them in a single ElevenLabs
 * dialogue pass (the Team Spotlight show's model), so Tony's reaction is
 * performed as a reply to Marcus's call rather than read on its own. The clip is
 * cached in Supabase Storage keyed by content hash. The client requests clips
 * generate-ahead so the voice stays in step with the game.
 *
 * Failures carry a `code` the client acts on: tts_quota, premium_required,
 * auth_required, not_configured and teaser_used end the broadcast; anything else
 * is retried and, if it persists, that one play goes unsaid.
 *
 * Premium feature. Free signed-in users get a taste: `teaser: true` requests
 * (one drive of the call, sent by the game page over the 3D sim) are allowed up to
 * TEASER_LINES_PER_DAY freshly rendered lines per user per UTC day, reserved
 * atomically with game_audio_teaser_take() (migration 20261106_sim3d_followup)
 * before anything is sent to ElevenLabs. Cache hits cost nothing and don't count.
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient as createSupabaseServer } from '@bs/core/supabase/server';
import { readCredits, getServiceClient } from '@bs/core/podcast';
import { ELEVENLABS_API_KEY, VOICES, generateDialogue } from '@/lib/spotlight/tts';

/** Part of the cache key. Bump when the voicing changes, so clips rendered the old way aren't reused. */
const VOICE_VERSION = 'call-v4t-1';
/** Free-tier broadcast teaser: freshly rendered lines per user per UTC day (one drive is ~10–40 lines). */
const TEASER_LINES_PER_DAY = 50;
const CACHE_BUCKET = 'game-audio';

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createSupabaseAdmin(url, key);
}

function contentHash(data: unknown): string {
  return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
}

// Expand the football shorthand that shows up in play descriptions so the
// voices say "touchdown" not "T D", "3rd and 8" cleanly, etc. (Subset of the
// spotlight normalizer — kept local so the podcast route stays untouched.)
function normalizeTtsText(text: string): string {
  let t = text;
  t = t.replace(/\b(\d+)\s*TDs\b/gi, '$1 touchdowns');
  t = t.replace(/\b(\d+)\s*TD\b/gi, '$1 touchdowns');
  t = t.replace(/\bTD\b/gi, 'touchdown');
  t = t.replace(/\b(\d+)\s*INTs\b/gi, '$1 interceptions');
  t = t.replace(/\b(\d+)\s*INT\b/gi, '$1 interceptions');
  t = t.replace(/\bINT\b/gi, 'interception');
  t = t.replace(/\bQB\b/g, 'quarterback');
  t = t.replace(/\bRB\b/g, 'running back');
  t = t.replace(/\bWR\b/g, 'wide receiver');
  t = t.replace(/\bTE\b/g, 'tight end');
  t = t.replace(/\bFG\b/g, 'field goal');
  t = t.replace(/\bXP\b/g, 'extra point');
  // "PAT" is read as the word "pat" by TTS — say "extra point" instead.
  t = t.replace(/\bPATs\b/g, 'extra points');
  t = t.replace(/\bPAT\b/g, 'extra point');
  t = t.replace(/\byd\b/gi, 'yard');
  t = t.replace(/\byds\b/gi, 'yards');
  t = t.replace(/\bvs\.?\b/gi, 'versus');
  return t;
}

interface Line {
  speaker: 'marcus' | 'tony';
  text: string;
}

export async function POST(request: Request) {
  try {
    if (!ELEVENLABS_API_KEY) {
      return NextResponse.json({ error: 'ELEVENLABS_API_KEY not configured', code: 'not_configured' }, { status: 500 });
    }

    const { lines, teaser } = (await request.json()) as { lines?: Line[]; teaser?: boolean };
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: 'lines (non-empty array) required' }, { status: 400 });
    }
    if (lines.length > 24) {
      return NextResponse.json({ error: 'segment too large (max 24 lines)' }, { status: 400 });
    }

    // Premium feature. Enforced only when Supabase is configured (prod / a
    // hydrated env); local dev without Supabase still works with just the
    // ELEVENLABS_API_KEY + flag so it stays testable on localhost.
    // Set for a free user's teaser request: whose daily teaser allowance a cache miss is charged to.
    let teaserUserId: string | null = null;
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const authClient = await createSupabaseServer();
      const { data: { user } } = await authClient.auth.getUser();
      if (!user) return NextResponse.json({ error: 'Not authenticated', code: 'auth_required' }, { status: 401 });
      // Premium (incl. founders + admins, grandfathered by resolveTier). Free → 403 unless it's the teaser.
      const { tier } = await readCredits(getServiceClient(), user.id, user.created_at);
      if (tier !== 'premium') {
        if (!teaser) {
          return NextResponse.json(
            { error: 'The live audio broadcast is a Premium feature.', code: 'premium_required' },
            { status: 403 },
          );
        }
        teaserUserId = user.id;
      }
    }

    const hash = contentHash({ v: VOICE_VERSION, lines });
    const sb = supabaseAdmin();

    if (sb) {
      const { data } = await sb.storage.from(CACHE_BUCKET).download(`${hash}.mp3`);
      if (data) {
        const buffer = Buffer.from(await data.arrayBuffer());
        return new NextResponse(buffer, {
          headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Length': String(buffer.length),
            'Cache-Control': 'public, max-age=604800',
            'X-Cache': 'HIT',
          },
        });
      }
    }

    // Free teaser, cache miss: reserve the lines before paying for TTS. Fails closed (no table / RPC error = no teaser).
    if (teaserUserId) {
      const { data: ok, error } = await getServiceClient().rpc('game_audio_teaser_take', {
        p_user: teaserUserId,
        p_lines: lines.length,
        p_cap: TEASER_LINES_PER_DAY,
      });
      if (error || ok !== true) {
        if (error) console.error('game_audio_teaser_take failed:', error.message);
        return NextResponse.json(
          { error: "That's today's free taste of the broadcast. Premium gets the full call.", code: 'teaser_used' },
          { status: 403 },
        );
      }
    }

    // Cache miss → voice the whole play in one dialogue pass.
    let finalBuffer: Buffer;
    try {
      ({ audio: finalBuffer } = await generateDialogue(lines.map(line => ({
        voiceId: VOICES[line.speaker] ?? VOICES.marcus,
        text: normalizeTtsText(line.text),
      }))));
    } catch (e) {
      // ElevenLabs quota/auth failures come back as 402: tell the client to stop asking.
      if ((e as { status?: number }).status === 402) (e as { code?: string }).code = 'tts_quota';
      throw e;
    }

    if (sb) {
      await sb.storage.from(CACHE_BUCKET).upload(`${hash}.mp3`, finalBuffer, {
        contentType: 'audio/mpeg',
        upsert: true,
      });
    }

    return new NextResponse(new Uint8Array(finalBuffer), {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(finalBuffer.length),
        'Cache-Control': 'public, max-age=604800',
        'X-Cache': 'MISS',
      },
    });
  } catch (err) {
    console.error('Game Audio API error:', err);
    const { status = 500, code } = err as Error & { status?: number; code?: string };
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error', ...(code ? { code } : {}) },
      { status },
    );
  }
}
