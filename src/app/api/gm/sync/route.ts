import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/gm/sync
 *
 * Upserts a GM season history row + updates rolling career totals.
 * Called by the engine at end of season / end of playoffs / end of draft.
 *
 * Body:
 *   {
 *     season: number,
 *     teamId: string,
 *     teamName: string,
 *     teamAbbreviation: string,
 *     wins: number,
 *     losses: number,
 *     madePlayoffs: boolean,
 *     wonChampionship: boolean,
 *     draftGrade?: string,
 *     draftScore?: number,
 *   }
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
    const body = await request.json();
    const {
      season,
      teamId,
      teamName,
      teamAbbreviation,
      wins,
      losses,
      madePlayoffs,
      wonChampionship,
      draftGrade,
      draftScore,
    } = body;

    if (typeof season !== 'number' || typeof wins !== 'number' || typeof losses !== 'number') {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify auth
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // Anonymous users — silently skip (don't fail the engine)
      return NextResponse.json({ ok: true, skipped: 'no_user' });
    }

    const service = getServiceClient();
    if (!service) {
      return NextResponse.json({ ok: true, skipped: 'no_service' });
    }

    const userId = user.id;
    const displayName = (user.email?.split('@')[0]) ?? 'GM';

    // ── Upsert season row ────────────────────────────────────────
    const { error: histErr } = await service
      .from('gm_season_history')
      .upsert(
        {
          user_id: userId,
          season,
          team_id: teamId ?? null,
          team_name: teamName ?? null,
          wins,
          losses,
          made_playoffs: !!madePlayoffs,
          won_championship: !!wonChampionship,
          draft_grade: draftGrade ?? null,
          draft_score: typeof draftScore === 'number' ? draftScore : null,
        },
        { onConflict: 'user_id,season' },
      );
    if (histErr) {
      console.error('[gm/sync] season history upsert error:', histErr);
      return NextResponse.json({ error: histErr.message }, { status: 500 });
    }

    // ── Recompute career totals from history (source of truth) ──
    // Fetch all rows for this user and aggregate.
    const { data: allHistory, error: histReadErr } = await service
      .from('gm_season_history')
      .select('wins, losses, made_playoffs, won_championship, draft_score')
      .eq('user_id', userId);

    if (histReadErr) {
      console.error('[gm/sync] history read error:', histReadErr);
      return NextResponse.json({ error: histReadErr.message }, { status: 500 });
    }

    type HistRow = {
      wins: number;
      losses: number;
      made_playoffs: boolean;
      won_championship: boolean;
      draft_score: number | null;
    };
    const rows: HistRow[] = (allHistory ?? []) as HistRow[];

    const totals = {
      all_time_wins: rows.reduce((s, r) => s + (r.wins ?? 0), 0),
      all_time_losses: rows.reduce((s, r) => s + (r.losses ?? 0), 0),
      championships: rows.filter(r => r.won_championship).length,
      playoff_appearances: rows.filter(r => r.made_playoffs).length,
      seasons_played: rows.length,
      draft_score_total: rows.reduce((s, r) => s + (r.draft_score ?? 0), 0),
      drafts_completed: rows.filter(r => r.draft_score !== null && r.draft_score !== undefined).length,
    };

    const { error: careerErr } = await service
      .from('gm_career_stats')
      .upsert(
        {
          user_id: userId,
          display_name: displayName,
          team_id: teamId ?? null,
          team_name: teamName ?? null,
          team_abbreviation: teamAbbreviation ?? null,
          ...totals,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
    if (careerErr) {
      console.error('[gm/sync] career upsert error:', careerErr);
      return NextResponse.json({ error: careerErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, totals });
  } catch (err) {
    console.error('[gm/sync] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
