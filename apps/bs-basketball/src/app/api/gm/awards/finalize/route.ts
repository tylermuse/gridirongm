import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { deriveNominees, AWARD_TYPES } from '@/lib/gm/awards';

/**
 * POST /api/gm/awards/finalize { season } — tally votes per category and record
 * the winner (most votes; fallback to the top-stat nominee if nobody voted).
 * Idempotent (upsert). Mirrors football's finalize against bball_gm_*.
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
    const { season } = await request.json();
    if (typeof season !== 'number' || season <= 0) return NextResponse.json({ error: 'Invalid season' }, { status: 400 });

    const service = getServiceClient();
    if (!service) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

    const [{ data: seasonRows }, { data: priorRows }, { data: voteRows }] = await Promise.all([
      service.from('bball_gm_season_history').select('user_id, wins, losses, draft_score').eq('season', season),
      service.from('bball_gm_season_history').select('user_id, wins').eq('season', season - 1),
      service.from('bball_gm_award_votes').select('award_type, nominee_user_id').eq('season', season),
    ]);

    const priorWins = new Map<string, number>((priorRows ?? []).map((r: { user_id: string; wins: number }) => [r.user_id, r.wins]));
    const nominees = deriveNominees(
      (seasonRows ?? []).map((r: { user_id: string; wins: number; losses: number; draft_score: number | null }) => ({ userId: r.user_id, wins: r.wins, losses: r.losses, draftScore: r.draft_score })),
      priorWins,
    );

    const winners: { award_type: string; user_id: string }[] = [];
    for (const t of AWARD_TYPES) {
      // Tally votes for this category.
      const tally = new Map<string, number>();
      for (const v of (voteRows ?? []) as { award_type: string; nominee_user_id: string }[]) {
        if (v.award_type !== t) continue;
        tally.set(v.nominee_user_id, (tally.get(v.nominee_user_id) ?? 0) + 1);
      }
      let winner: string | null = null;
      let best = -1;
      for (const [uid, n] of tally) if (n > best) { best = n; winner = uid; }
      // Fallback to the top-stat nominee when nobody voted.
      if (!winner) winner = nominees[t][0]?.userId ?? null;
      if (winner) winners.push({ award_type: t, user_id: winner });
    }

    if (winners.length) {
      const { error } = await service.from('bball_gm_awards').upsert(
        winners.map(w => ({ user_id: w.user_id, season, award_type: w.award_type })),
        { onConflict: 'user_id,season,award_type' },
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, winners });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
