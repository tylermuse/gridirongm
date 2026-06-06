import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { deriveNominees, AWARD_TYPES, AWARD_LABELS, AWARD_BLURB, type AwardType } from '@/lib/gm/awards';

/**
 * GET /api/gm/awards/nominees?season=N — top-3 nominees per category for the
 * season (default: latest), each with current vote tallies + the finalized
 * winner (if any). Public. Mirrors football's awards/nominees against bball_gm_*.
 */
function getServiceClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );
}

export async function GET(request: NextRequest) {
  try {
    const service = getServiceClient();
    if (!service) return NextResponse.json({ season: null, categories: {} });

    let season = Number(request.nextUrl.searchParams.get('season'));
    if (!Number.isFinite(season) || season <= 0) {
      const { data: latest } = await service.from('bball_gm_season_history').select('season').order('season', { ascending: false }).limit(1).single();
      season = latest?.season ?? 0;
    }
    if (!season) return NextResponse.json({ season: null, categories: {} });

    const [{ data: seasonRows }, { data: priorRows }] = await Promise.all([
      service.from('bball_gm_season_history').select('user_id, wins, losses').eq('season', season),
      service.from('bball_gm_season_history').select('user_id, wins').eq('season', season - 1),
    ]);

    const priorWins = new Map<string, number>((priorRows ?? []).map((r: { user_id: string; wins: number }) => [r.user_id, r.wins]));
    const nominees = deriveNominees(
      (seasonRows ?? []).map((r: { user_id: string; wins: number; losses: number }) => ({ userId: r.user_id, wins: r.wins, losses: r.losses })),
      priorWins,
    );

    // Names, votes, finalized winners.
    const allIds = [...new Set(AWARD_TYPES.flatMap(t => nominees[t].map(n => n.userId)))];
    const { data: nameRows } = allIds.length
      ? await service.from('bball_gm_career_stats').select('user_id, display_name').in('user_id', allIds)
      : { data: [] };
    const nameOf = new Map<string, string>((nameRows ?? []).map((r: { user_id: string; display_name: string | null }) => [r.user_id, r.display_name ?? 'GM']));

    const { data: voteRows } = await service.from('bball_gm_award_votes').select('award_type, nominee_user_id').eq('season', season);
    const voteCount = new Map<string, number>();
    for (const v of (voteRows ?? []) as { award_type: string; nominee_user_id: string }[]) {
      voteCount.set(`${v.award_type}:${v.nominee_user_id}`, (voteCount.get(`${v.award_type}:${v.nominee_user_id}`) ?? 0) + 1);
    }

    const { data: winnerRows } = await service.from('bball_gm_awards').select('award_type, user_id').eq('season', season);
    const winnerOf = new Map<string, string>((winnerRows ?? []).map((r: { award_type: string; user_id: string }) => [r.award_type, r.user_id]));

    const categories: Record<string, unknown> = {};
    for (const t of AWARD_TYPES) {
      categories[t] = {
        label: AWARD_LABELS[t],
        blurb: AWARD_BLURB[t],
        winnerUserId: winnerOf.get(t) ?? null,
        nominees: nominees[t].map(n => ({
          userId: n.userId,
          displayName: nameOf.get(n.userId) ?? 'GM',
          value: n.value,
          votes: voteCount.get(`${t}:${n.userId}`) ?? 0,
        })),
      };
    }

    return NextResponse.json({ season, finalized: (winnerRows ?? []).length > 0, categories });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

export type { AwardType };
