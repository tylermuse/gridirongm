import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * GET /api/gm/leaderboard — public BS Hoops GM boards: all-time (career) sorted
 * by win% → championships → wins, and the latest season. Mirrors football
 * against the bball_gm_* tables.
 */

function getServiceClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );
}

export async function GET() {
  try {
    const service = getServiceClient();
    if (!service) return NextResponse.json({ latestSeason: null, allTime: [], thisSeason: [], _warning: 'Supabase not configured' });

    const { data: latestRow } = await service
      .from('bball_gm_season_history').select('season')
      .order('season', { ascending: false }).limit(1).single();
    const latestSeason = latestRow?.season ?? null;

    const { data: careerRows, error: careerErr } = await service
      .from('bball_gm_career_stats')
      .select('user_id, display_name, team_name, team_abbreviation, all_time_wins, all_time_losses, championships, playoff_appearances, seasons_played')
      .limit(200);
    if (careerErr) return NextResponse.json({ error: careerErr.message }, { status: 500 });

    const allTime = (careerRows ?? [])
      .map(r => ({
        userId: r.user_id,
        displayName: r.display_name ?? 'GM',
        teamName: r.team_name,
        teamAbbreviation: r.team_abbreviation,
        wins: r.all_time_wins,
        losses: r.all_time_losses,
        winPct: r.all_time_wins + r.all_time_losses > 0 ? r.all_time_wins / (r.all_time_wins + r.all_time_losses) : 0,
        championships: r.championships,
        playoffAppearances: r.playoff_appearances,
        seasonsPlayed: r.seasons_played,
      }))
      .filter(r => r.seasonsPlayed >= 1)
      .sort((a, b) => (b.winPct - a.winPct) || (b.championships - a.championships) || (b.wins - a.wins))
      .slice(0, 100);

    let thisSeason: Array<{ userId: string; displayName: string; teamName: string | null; wins: number; losses: number; winPct: number; madePlayoffs: boolean }> = [];
    if (latestSeason !== null) {
      const { data: seasonRows } = await service
        .from('bball_gm_season_history')
        .select('user_id, team_name, wins, losses, made_playoffs')
        .eq('season', latestSeason).order('wins', { ascending: false });
      const userIds = (seasonRows ?? []).map(r => r.user_id);
      const { data: nameRows } = userIds.length > 0
        ? await service.from('bball_gm_career_stats').select('user_id, display_name').in('user_id', userIds)
        : { data: [] };
      const nameMap = new Map<string, string>((nameRows ?? []).map((r: { user_id: string; display_name: string | null }) => [r.user_id, r.display_name ?? 'GM']));
      thisSeason = (seasonRows ?? []).map(r => ({
        userId: r.user_id,
        displayName: nameMap.get(r.user_id) ?? 'GM',
        teamName: r.team_name,
        wins: r.wins,
        losses: r.losses,
        winPct: r.wins + r.losses > 0 ? r.wins / (r.wins + r.losses) : 0,
        madePlayoffs: r.made_playoffs,
      }));
    }

    return NextResponse.json({ latestSeason, allTime, thisSeason });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
