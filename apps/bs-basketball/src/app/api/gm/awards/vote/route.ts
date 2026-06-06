import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@bs/core/supabase/server';
import { AWARD_TYPES } from '@/lib/gm/awards';

/**
 * POST /api/gm/awards/vote { season, awardType, nomineeUserId } — one vote per
 * (voter, season, category); re-voting changes your pick (upsert). Requires
 * sign-in. The UNIQUE(voter,season,award) constraint enforces one-per-category.
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
    const { season, awardType, nomineeUserId } = await request.json();
    if (typeof season !== 'number' || !AWARD_TYPES.includes(awardType) || typeof nomineeUserId !== 'string') {
      return NextResponse.json({ error: 'Invalid vote' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

    const service = getServiceClient();
    if (!service) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

    const { error } = await service.from('bball_gm_award_votes').upsert(
      { voter_user_id: user.id, nominee_user_id: nomineeUserId, season, award_type: awardType },
      { onConflict: 'voter_user_id,season,award_type' },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
