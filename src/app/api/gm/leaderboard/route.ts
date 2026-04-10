import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * GET /api/gm/leaderboard?period=all|season
 *
 * Returns the leaderboard data:
 *   { allTime: GmCareerRow[], thisSeason: GmSeasonRow[] }
 *
 * No auth required — leaderboard is public.
 */

function getServiceClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );
}

export async function GET(request: NextRequest) {
  try {
    const service = getServiceClient();
    if (!service) {
      return NextResponse.json({ allTime: [], thisSeason: [], _warning: 'Supabase not configured' });
    }

    // Latest season number across all users
    const { data: latestRow } = await service
      .from('gm_season_history')
      .select('season')
      .order('season', { ascending: false })
      .limit(1)
      .single();
    const latestSeason = latestRow?.season ?? null;

    // ── All-time career leaderboard ──
    const { data: careerRows, error: careerErr } = await service
      .from('gm_career_stats')
      .select('user_id, display_name, team_id, team_name, team_abbreviation, all_time_wins, all_time_losses, championships, playoff_appearances, draft_score_total, drafts_completed, seasons_played, updated_at')
      .order('championships', { ascending: false })
      .order('all_time_wins', { ascending: false })
      .limit(100);

    if (careerErr) {
      return NextResponse.json({ error: careerErr.message }, { status: 500 });
    }

    const allTime = (careerRows ?? []).map(r => ({
      userId: r.user_id,
      displayName: r.display_name ?? 'GM',
      teamId: r.team_id,
      teamName: r.team_name,
      teamAbbreviation: r.team_abbreviation,
      wins: r.all_time_wins,
      losses: r.all_time_losses,
      winPct: r.all_time_wins + r.all_time_losses > 0
        ? r.all_time_wins / (r.all_time_wins + r.all_time_losses)
        : 0,
      championships: r.championships,
      playoffAppearances: r.playoff_appearances,
      avgDraftScore: r.drafts_completed > 0
        ? r.draft_score_total / r.drafts_completed
        : 0,
      draftsCompleted: r.drafts_completed,
      seasonsPlayed: r.seasons_played,
    })).filter(r => r.seasonsPlayed >= 1);

    // ── This-season leaderboard ──
    let thisSeason: Array<{
      userId: string;
      displayName: string;
      teamName: string | null;
      wins: number;
      losses: number;
      winPct: number;
      madePlayoffs: boolean;
      draftGrade: string | null;
    }> = [];

    if (latestSeason !== null) {
      const { data: seasonRows } = await service
        .from('gm_season_history')
        .select('user_id, season, team_name, wins, losses, made_playoffs, draft_grade')
        .eq('season', latestSeason)
        .order('wins', { ascending: false });

      // Join to display_name from career stats
      const userIds = (seasonRows ?? []).map(r => r.user_id);
      const { data: nameRows } = userIds.length > 0
        ? await service.from('gm_career_stats').select('user_id, display_name').in('user_id', userIds)
        : { data: [] };
      const nameMap = new Map<string, string>(
        (nameRows ?? []).map((r: { user_id: string; display_name: string | null }) => [r.user_id, r.display_name ?? 'GM']),
      );

      thisSeason = (seasonRows ?? []).map(r => ({
        userId: r.user_id,
        displayName: nameMap.get(r.user_id) ?? 'GM',
        teamName: r.team_name,
        wins: r.wins,
        losses: r.losses,
        winPct: r.wins + r.losses > 0 ? r.wins / (r.wins + r.losses) : 0,
        madePlayoffs: r.made_playoffs,
        draftGrade: r.draft_grade,
      }));
    }

    return NextResponse.json({
      latestSeason,
      allTime,
      thisSeason,
    });
  } catch (err) {
    console.error('[gm/leaderboard] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
