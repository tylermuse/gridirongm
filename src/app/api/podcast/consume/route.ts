import { NextResponse } from 'next/server';
import { createClient } from '@bs/core/supabase/server';
import { consumePodcastCredit, getServiceClient, readCredits } from '@bs/core/podcast';

/**
 * POST /api/podcast/consume
 * Consumes 1 monthly podcast credit. Returns 402 when exhausted, 403 for
 * non-Premium users, 401 if unauthenticated. Admin accounts always succeed.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const service = getServiceClient();
    const result = await consumePodcastCredit(service, user.id, user.created_at);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, state: result.state },
        { status: result.status },
      );
    }

    return NextResponse.json({ ok: true, state: result.state });
  } catch (err) {
    console.error('[podcast/consume] error:', err);
    return NextResponse.json(
      { error: 'Failed to consume podcast credit' },
      { status: 500 },
    );
  }
}

/** GET — read current credit state without mutating. */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const service = getServiceClient();
    const state = await readCredits(service, user.id, user.created_at);
    return NextResponse.json({ state });
  } catch (err) {
    console.error('[podcast/consume:GET] error:', err);
    return NextResponse.json(
      { error: 'Failed to read podcast credits' },
      { status: 500 },
    );
  }
}
