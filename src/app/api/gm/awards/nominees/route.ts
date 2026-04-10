import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * GET /api/gm/awards/nominees?season=N
 *
 * Auto-generates nominees per category based on stats from gm_season_history.
 * Returns:
 *   {
 *     season: number,
 *     categories: {
 *       gm_of_year: Nominee[],
 *       best_draft: Nominee[],
 *       best_rebuild: Nominee[],
 *     }
 *   }
 */

interface Nominee {
  userId: string;
  displayName: string;
  teamName: string | null;
  primaryStat: string;
  secondaryStat?: string;
}

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
    const seasonParam = request.nextUrl.searchParams.get('season');
    if (!seasonParam) {
      return NextResponse.json({ error: 'Missing season param' }, { status: 400 });
    }
    const season = parseInt(seasonParam, 10);
    if (isNaN(season)) {
      return NextResponse.json({ error: 'Invalid season' }, { status: 400 });
    }

    const service = getServiceClient();
    if (!service) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    // Fetch this season's rows
    const { data: seasonRows, error: seasonErr } = await service
      .from('gm_season_history')
      .select('user_id, team_name, wins, losses, made_playoffs, won_championship, draft_grade, draft_score')
      .eq('season', season);

    if (seasonErr) {
      return NextResponse.json({ error: seasonErr.message }, { status: 500 });
    }

    // Fetch prior season for rebuild calculation
    const { data: priorRows } = await service
      .from('gm_season_history')
      .select('user_id, wins, losses')
      .eq('season', season - 1);

    const priorByUser = new Map<string, { wins: number; losses: number }>(
      (priorRows ?? []).map(r => [r.user_id, { wins: r.wins, losses: r.losses }]),
    );

    // Display name lookup
    const userIds = (seasonRows ?? []).map(r => r.user_id);
    const { data: nameRows } = userIds.length > 0
      ? await service.from('gm_career_stats').select('user_id, display_name').in('user_id', userIds)
      : { data: [] };
    const nameMap = new Map<string, string>(
      (nameRows ?? []).map((r: { user_id: string; display_name: string | null }) => [r.user_id, r.display_name ?? 'GM']),
    );

    interface SeasonRow {
      user_id: string;
      team_name: string | null;
      wins: number;
      losses: number;
      made_playoffs: boolean;
      won_championship: boolean;
      draft_grade: string | null;
      draft_score: number | null;
    }
    function buildNominee(row: SeasonRow, primaryStat: string, secondaryStat?: string): Nominee {
      return {
        userId: row.user_id,
        displayName: nameMap.get(row.user_id) ?? 'GM',
        teamName: row.team_name,
        primaryStat,
        secondaryStat,
      };
    }

    // ── GM of the Year — top 3 by win % ──
    const byWinPct = [...(seasonRows ?? [])]
      .map(r => ({ ...r, winPct: r.wins + r.losses > 0 ? r.wins / (r.wins + r.losses) : 0 }))
      .sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
    const gmOfYear = byWinPct.slice(0, 3).map(r =>
      buildNominee(r, `${r.wins}-${r.losses}`, `${(r.winPct * 100).toFixed(1)}%`),
    );

    // ── Best Draft Class — top 3 by draft score ──
    const byDraftScore = [...(seasonRows ?? [])]
      .filter(r => r.draft_score !== null && r.draft_score !== undefined)
      .sort((a, b) => (b.draft_score ?? 0) - (a.draft_score ?? 0));
    const bestDraft = byDraftScore.slice(0, 3).map(r =>
      buildNominee(r, r.draft_grade ?? 'N/A', `${(r.draft_score ?? 0).toFixed(1)} pts`),
    );

    // ── Best Rebuild — top 3 by win improvement vs prior season ──
    const withImprovement = (seasonRows ?? [])
      .map(r => {
        const prior = priorByUser.get(r.user_id);
        if (!prior) return null;
        const improvement = r.wins - prior.wins;
        return { row: r as SeasonRow, improvement, priorWins: prior.wins };
      })
      .filter((x): x is { row: SeasonRow; improvement: number; priorWins: number } => x !== null)
      .sort((a, b) => b.improvement - a.improvement);
    const bestRebuild = withImprovement.slice(0, 3).map(x =>
      buildNominee(x.row, `+${x.improvement} wins`, `${x.priorWins} → ${x.row.wins}`),
    );

    return NextResponse.json({
      season,
      categories: {
        gm_of_year: gmOfYear,
        best_draft: bestDraft,
        best_rebuild: bestRebuild,
      },
    });
  } catch (err) {
    console.error('[gm/awards/nominees] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
