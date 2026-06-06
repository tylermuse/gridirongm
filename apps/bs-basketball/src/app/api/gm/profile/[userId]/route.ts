import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * GET /api/gm/profile/[userId] — public Hall of Fame profile: career totals,
 * season-by-season history, and awards. Mirrors football against bball_gm_*.
 */

function getServiceClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );
}

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params;
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

    const service = getServiceClient();
    if (!service) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

    const { data: career } = await service
      .from('bball_gm_career_stats').select('*').eq('user_id', userId).maybeSingle();
    if (!career) return NextResponse.json({ error: 'GM not found' }, { status: 404 });

    const { data: seasons } = await service
      .from('bball_gm_season_history')
      .select('season, team_name, wins, losses, made_playoffs, won_championship')
      .eq('user_id', userId).order('season', { ascending: false });

    const { data: awards } = await service
      .from('bball_gm_awards').select('season, award_type, awarded_at')
      .eq('user_id', userId).order('season', { ascending: false });

    return NextResponse.json({
      career: {
        userId: career.user_id,
        displayName: career.display_name ?? 'GM',
        teamName: career.team_name,
        teamAbbreviation: career.team_abbreviation,
        wins: career.all_time_wins,
        losses: career.all_time_losses,
        winPct: career.all_time_wins + career.all_time_losses > 0
          ? career.all_time_wins / (career.all_time_wins + career.all_time_losses) : 0,
        championships: career.championships,
        playoffAppearances: career.playoff_appearances,
        seasonsPlayed: career.seasons_played,
        updatedAt: career.updated_at,
      },
      seasons: seasons ?? [],
      awards: awards ?? [],
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
