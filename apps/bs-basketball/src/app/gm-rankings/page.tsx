'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { EmptyState } from '@/components/ui/EmptyState';
import { gmRankings, type GmRanking } from '@/lib/rankings/gmRankings';
import { GlobalLeaderboard } from '@/components/gm/GlobalLeaderboard';
import { Skeleton, SkeletonList } from '@/components/ui/Skeleton';
import type { BasketballTeam } from '@bs/sport-basketball';

/**
 * /gm-rankings — every front office ranked by a composite GM score (results,
 * talent, young-core upside, cap health, legacy). The user's team is pinned
 * with a breakdown of its component scores.
 */
export default function GmRankingsPage() {
  const { league, loading, error } = useLeagueOrHydrate();

  const ranked = useMemo(() => (league ? gmRankings(league) : []), [league]);
  const teamById = useMemo(() => {
    const m = new Map<string, BasketballTeam>();
    if (league) for (const t of league.teams) m.set(t.id, t as BasketballTeam);
    return m;
  }, [league]);

  if (loading) return <main className="max-w-3xl mx-auto p-5 sm:p-8"><Skeleton className="h-8 w-44 mb-4" /><SkeletonList rows={10} /></main>;
  if (!league) {
    return (
      <main className="max-w-3xl mx-auto p-8">
        <p className="mb-4">{error ?? 'No league loaded.'}</p>
        <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>← Home</Link>
      </main>
    );
  }

  const userRow = ranked.find(r => r.isUser) ?? null;

  return (
    <main className="max-w-3xl mx-auto p-5 sm:p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">← Home</Link>
      <header className="flex flex-wrap items-baseline gap-3 mt-2 mb-2">
        <h1 className="text-3xl sm:text-4xl font-extrabold" style={{ color: 'var(--accent)' }}>GM Rankings</h1>
        <span className="text-sm text-[var(--text-sec)]">Season {league.currentSeason}</span>
      </header>
      <p className="text-sm text-[var(--text-sec)] mb-5">Front offices ranked by results, roster talent, young-core upside, cap health, and franchise legacy.</p>

      {/* Cross-player global board (opt-in, online). Renders nothing if online accounts aren't configured. */}
      <GlobalLeaderboard />

      <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--text-sec)] mb-2">This league</h2>
      {ranked.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <EmptyState icon="🏅" title="No rankings yet" message="Start a league to see the GM leaderboard." />
        </div>
      ) : (
        <>
          {userRow && <UserBreakdown row={userRow} team={teamById.get(userRow.teamId)} total={ranked.length} />}
          <ol className="space-y-2">
            {ranked.map(r => {
              const team = teamById.get(r.teamId);
              if (!team) return null;
              return (
                <li key={r.teamId}>
                  <Link
                    href={`/team/${r.teamId}`}
                    className="flex items-center gap-3 p-3 rounded-xl border bg-[var(--surface)] hover:border-[var(--accent)] transition-colors"
                    style={{ borderColor: r.isUser ? 'var(--accent)' : 'var(--border)', background: r.isUser ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : undefined }}
                  >
                    <span className="w-7 text-center font-black tabular-nums text-[var(--text-sec)]">{r.rank}</span>
                    <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className={`truncate ${r.isUser ? 'font-bold' : 'font-semibold'}`}>{team.city} {team.name}</div>
                      <div className="text-xs" style={{ color: r.tier.color }}>{r.tier.label} · {r.record}</div>
                    </div>
                    <span className="text-xl font-black tabular-nums" style={{ color: 'var(--accent)' }}>{r.score.toFixed(0)}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </main>
  );
}

function UserBreakdown({ row, team, total }: { row: GmRanking; team?: BasketballTeam; total: number }) {
  const bars: { label: string; value: number }[] = [
    { label: 'Results', value: row.components.results },
    { label: 'Talent', value: row.components.talent },
    { label: 'Future', value: row.components.future },
    { label: 'Cap health', value: row.components.capHealth },
    { label: 'Legacy', value: row.components.legacy },
  ];
  return (
    <div className="rounded-2xl border-2 p-5 mb-5" style={{ borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 8%, transparent)' }}>
      <div className="flex items-center gap-3 mb-3">
        {team && <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="md" />}
        <div className="flex-1">
          <div className="font-black">{team ? `${team.city} ${team.name}` : 'Your team'}</div>
          <div className="text-sm" style={{ color: row.tier.color }}>{row.tier.label}</div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-black tabular-nums" style={{ color: 'var(--accent)' }}>#{row.rank}</div>
          <div className="text-xs text-[var(--text-sec)]">of {total}</div>
        </div>
      </div>
      <div className="space-y-1.5">
        {bars.map(b => (
          <div key={b.label} className="flex items-center gap-2 text-xs">
            <span className="w-20 text-[var(--text-sec)]">{b.label}</span>
            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
              <div className="h-full rounded-full" style={{ width: `${b.value}%`, background: 'var(--accent)' }} />
            </div>
            <span className="w-8 text-right tabular-nums">{b.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
