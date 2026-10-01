import { NextResponse } from 'next/server';
import { createClient as createSupabaseServer } from '@bs/core/supabase/server';
import { getServiceClient, readCredits } from '@bs/core/podcast';
import { getScript, readPayload } from '@/lib/spotlight/showEpisode';
import { parseEpisode, supabaseAdmin } from '@/lib/spotlight/showRequest';

/**
 * Write a Spotlight show's script ahead of time (called when the Spotlight
 * renders), so Watch Show starts right away. Only the writing happens here —
 * a few cents of Claude, no ElevenLabs, no podcast credit — and only for
 * users who could actually watch it (premium, with a credit left).
 */
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const episode = await parseEpisode(request);
    if (!episode) return NextResponse.json({ error: 'topics (array) and teamName (string) required' }, { status: 400 });

    const authClient = await createSupabaseServer();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ skipped: 'auth' });

    const credits = await readCredits(getServiceClient(), user.id, user.created_at);
    if (!credits.isAdmin && (credits.tier !== 'premium' || credits.remaining === 0)) {
      return NextResponse.json({ skipped: 'not eligible' });
    }

    const sb = supabaseAdmin();
    if (await readPayload(sb, episode)) return NextResponse.json({ ready: 'episode' });
    await getScript(sb, episode);
    return NextResponse.json({ ready: 'script' });
  } catch (err) {
    console.error('Spotlight Show script prefetch error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
