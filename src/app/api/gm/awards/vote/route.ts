import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/gm/awards/vote
 *
 * Body: { season, awardType, nomineeUserId }
 *
 * Records the user's vote. One vote per voter per category per season.
 */

function getServiceClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );
}

const ALLOWED_AWARDS = new Set(['gm_of_year', 'best_draft', 'best_rebuild']);

export async function POST(request: Request) {
  try {
    const { season, awardType, nomineeUserId } = await request.json();

    if (typeof season !== 'number' || !awardType || !nomineeUserId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (!ALLOWED_AWARDS.has(awardType)) {
      return NextResponse.json({ error: 'Invalid award type' }, { status: 400 });
    }

    // Verify auth
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }

    const service = getServiceClient();
    if (!service) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    // Insert vote (UNIQUE constraint prevents duplicates)
    const { error: voteErr } = await service
      .from('gm_award_votes')
      .upsert(
        {
          voter_user_id: user.id,
          nominee_user_id: nomineeUserId,
          season,
          award_type: awardType,
        },
        { onConflict: 'voter_user_id,season,award_type' },
      );

    if (voteErr) {
      console.error('[gm/awards/vote] insert error:', voteErr);
      return NextResponse.json({ error: voteErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[gm/awards/vote] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
