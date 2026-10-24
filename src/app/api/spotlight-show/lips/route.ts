import { NextResponse } from 'next/server';
import { createClient as createSupabaseServer } from '@bs/core/supabase/server';
import { lipsEnabled, lipsStatus } from '@/lib/spotlight/showLips';
import { openPreview } from '@/lib/spotlight/showRequest';

/**
 * GET /api/spotlight-show/lips?ids=a,b,c
 *
 * Where the episode's two-shot renders are (see showLips): the player asks
 * every few seconds while the show plays and cuts to a line's two-shot once
 * its clip is done. Signed-in viewers only (the fal key stays here).
 */
export async function GET(request: Request) {
  if (!lipsEnabled()) return NextResponse.json({ clips: [] });
  if (!openPreview()) {
    const sb = await createSupabaseServer();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const ids = (new URL(request.url).searchParams.get('ids') ?? '').split(',').filter(Boolean).slice(0, 40);
  const clips = await Promise.all(ids.map(id => lipsStatus(id).catch(() => ({ id, status: 'failed' as const }))));
  return NextResponse.json({ clips }, { headers: { 'Cache-Control': 'no-store' } });
}
