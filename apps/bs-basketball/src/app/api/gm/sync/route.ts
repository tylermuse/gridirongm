import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@bs/core/supabase/server';

/**
 * POST /api/gm/sync — upsert a GM season row + recompute career totals for the
 * BS Hoops global leaderboard. Mirrors football's route against the bball_gm_*
 * tables. Anonymous users are silently skipped; the service-role client bypasses
 * RLS for the server write.
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
    const body = await request.json();
    const { season, teamId, teamName, teamAbbreviation, wins, losses, madePlayoffs, wonChampionship, draftScore, draftGrade } = body;

    if (typeof season !== 'number' || typeof wins !== 'number' || typeof losses !== 'number') {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    // NBA season bounds — reject a forged 200-0 record.
    if (wins < 0 || wins > 82 || losses < 0 || losses > 82 || wins + losses > 82) {
      return NextResponse.json({ error: 'Invalid wins/losses for a single season' }, { status: 400 });
    }
    const hasDraft = typeof draftScore === 'number' && Number.isFinite(draftScore) && Math.abs(draftScore) <= 100;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: true, skipped: 'no_user' });

    const service = getServiceClient();
    if (!service) return NextResponse.json({ ok: true, skipped: 'no_service' });

    const userId = user.id;
    const metadataName = typeof user.user_metadata?.display_name === 'string'
      ? (user.user_metadata.display_name as string).trim() : '';
    const displayName = metadataName.length > 0 ? metadataName : (user.email?.split('@')[0] ?? 'GM');

    const { error: histErr } = await service.from('bball_gm_season_history').upsert(
      {
        user_id: userId, season,
        team_id: teamId ?? null, team_name: teamName ?? null,
        wins, losses, made_playoffs: !!madePlayoffs, won_championship: !!wonChampionship,
        ...(hasDraft ? { draft_score: draftScore, draft_grade: typeof draftGrade === 'string' ? draftGrade : null } : {}),
      },
      { onConflict: 'user_id,season' },
    );
    if (histErr) return NextResponse.json({ error: histErr.message }, { status: 500 });

    const { data: allHistory, error: readErr } = await service
      .from('bball_gm_season_history')
      .select('wins, losses, made_playoffs, won_championship')
      .eq('user_id', userId);
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

    type Row = { wins: number; losses: number; made_playoffs: boolean; won_championship: boolean };
    const rows: Row[] = (allHistory ?? []) as Row[];
    const totals = {
      all_time_wins: rows.reduce((s, r) => s + (r.wins ?? 0), 0),
      all_time_losses: rows.reduce((s, r) => s + (r.losses ?? 0), 0),
      championships: rows.filter(r => r.won_championship).length,
      playoff_appearances: rows.filter(r => r.made_playoffs).length,
      seasons_played: rows.length,
    };

    const { error: careerErr } = await service.from('bball_gm_career_stats').upsert(
      {
        user_id: userId, display_name: displayName,
        team_id: teamId ?? null, team_name: teamName ?? null, team_abbreviation: teamAbbreviation ?? null,
        ...totals, updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (careerErr) return NextResponse.json({ error: careerErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, totals });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
