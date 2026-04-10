import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * POST /api/gm/awards/finalize
 *
 * Body: { season }
 *
 * For each category, counts votes and inserts the winner into gm_awards.
 * Tiebreaker: highest stat (e.g. wins, draft_score). Idempotent — safe to
 * call multiple times; won't double-insert thanks to UNIQUE constraint.
 *
 * If no votes were cast for a category, falls back to auto-awarding the
 * top stat winner from gm_season_history.
 */

function getServiceClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );
}

const CATEGORIES = ['gm_of_year', 'best_draft', 'best_rebuild'] as const;

export async function POST(request: Request) {
  try {
    const { season } = await request.json();
    if (typeof season !== 'number') {
      return NextResponse.json({ error: 'Missing season' }, { status: 400 });
    }

    const service = getServiceClient();
    if (!service) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    // Pull season rows once for tiebreaker / fallback computation
    const { data: seasonRows } = await service
      .from('gm_season_history')
      .select('user_id, wins, losses, draft_score')
      .eq('season', season);

    const { data: priorRows } = await service
      .from('gm_season_history')
      .select('user_id, wins')
      .eq('season', season - 1);

    const priorByUser = new Map<string, number>(
      (priorRows ?? []).map(r => [r.user_id, r.wins]),
    );

    function fallbackWinner(category: string): string | null {
      if (!seasonRows || seasonRows.length === 0) return null;
      switch (category) {
        case 'gm_of_year': {
          const sorted = [...seasonRows].sort((a, b) => {
            const aPct = a.wins + a.losses > 0 ? a.wins / (a.wins + a.losses) : 0;
            const bPct = b.wins + b.losses > 0 ? b.wins / (b.wins + b.losses) : 0;
            return bPct - aPct || b.wins - a.wins;
          });
          return sorted[0]?.user_id ?? null;
        }
        case 'best_draft': {
          const eligible = seasonRows.filter(r => r.draft_score !== null);
          if (eligible.length === 0) return null;
          eligible.sort((a, b) => (b.draft_score ?? 0) - (a.draft_score ?? 0));
          return eligible[0]?.user_id ?? null;
        }
        case 'best_rebuild': {
          const withImp = seasonRows
            .map(r => {
              const prior = priorByUser.get(r.user_id);
              if (prior === undefined) return null;
              return { user_id: r.user_id, improvement: r.wins - prior };
            })
            .filter((x): x is { user_id: string; improvement: number } => x !== null)
            .sort((a, b) => b.improvement - a.improvement);
          return withImp[0]?.user_id ?? null;
        }
      }
      return null;
    }

    const winners: Record<string, string | null> = {};

    for (const category of CATEGORIES) {
      // Count votes
      const { data: votes } = await service
        .from('gm_award_votes')
        .select('nominee_user_id')
        .eq('season', season)
        .eq('award_type', category);

      let winnerId: string | null = null;
      if (votes && votes.length > 0) {
        const counts = new Map<string, number>();
        for (const v of votes) {
          counts.set(v.nominee_user_id, (counts.get(v.nominee_user_id) ?? 0) + 1);
        }
        const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        winnerId = sorted[0]?.[0] ?? null;
      } else {
        // No votes — fall back to auto-winner by stat
        winnerId = fallbackWinner(category);
      }

      if (winnerId) {
        await service.from('gm_awards').upsert(
          {
            user_id: winnerId,
            season,
            award_type: category,
          },
          { onConflict: 'user_id,season,award_type' },
        );
      }
      winners[category] = winnerId;
    }

    return NextResponse.json({ ok: true, winners });
  } catch (err) {
    console.error('[gm/awards/finalize] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
