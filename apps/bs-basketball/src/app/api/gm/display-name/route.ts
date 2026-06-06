import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@bs/core/supabase/server';

/**
 * POST /api/gm/display-name { name } — set the signed-in user's leaderboard
 * display name (stored on auth metadata + the bball_gm_career_stats row).
 */
function getServiceClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );
}

export async function POST(request: Request) {
  try {
    const { name } = await request.json();
    const trimmed = typeof name === 'string' ? name.trim().slice(0, 32) : '';
    if (!trimmed) return NextResponse.json({ error: 'Name required' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

    await supabase.auth.updateUser({ data: { display_name: trimmed } });

    const service = getServiceClient();
    if (service) {
      await service.from('bball_gm_career_stats')
        .update({ display_name: trimmed })
        .eq('user_id', user.id);
    }
    return NextResponse.json({ ok: true, displayName: trimmed });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
