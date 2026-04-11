import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/gm/display-name
 *
 * Body: { displayName: string }
 *
 * Updates the signed-in user's display_name in gm_career_stats so the
 * leaderboard reflects it immediately (instead of waiting for the next
 * end-of-season sync). The auth metadata source of truth is updated
 * separately via supabase.auth.updateUser on the client.
 */

function getServiceClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );
}

export async function POST(request: Request) {
  try {
    const { displayName } = await request.json();
    if (typeof displayName !== 'string') {
      return NextResponse.json({ error: 'displayName must be a string' }, { status: 400 });
    }
    const trimmed = displayName.trim();
    if (trimmed.length < 3 || trimmed.length > 30) {
      return NextResponse.json({ error: 'displayName must be 3-30 characters' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const service = getServiceClient();
    if (!service) {
      // Auth metadata still updated client-side; just no leaderboard backfill.
      return NextResponse.json({ ok: true, skipped: 'no_service' });
    }

    const { error } = await service
      .from('gm_career_stats')
      .update({ display_name: trimmed, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);

    if (error) {
      // Row may not exist yet (no synced seasons) — that's fine, next sync will use the new name.
      return NextResponse.json({ ok: true, skipped: 'no_career_row' });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[gm/display-name] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
