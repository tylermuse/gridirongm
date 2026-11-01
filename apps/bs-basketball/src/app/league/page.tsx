'use client';

import Link from 'next/link';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton, SkeletonList } from '@/components/ui/Skeleton';
import type { BasketballTeam } from '@bs/sport-basketball';

/**
 * /league — every team grouped by conference + division.
 *
 * A simple "All Teams" directory (records live on /standings). Each team card
 * is a Link to /team/[id].
 */

const DIVISIONS_BY_CONFERENCE = {
  Eastern: ['Atlantic', 'Central', 'Southeast'] as const,
  Western: ['Northwest', 'Pacific', 'Southwest'] as const,
};

interface TeamSportData {
  conference: 'Eastern' | 'Western';
  division: 'Atlantic' | 'Central' | 'Southeast' | 'Northwest' | 'Pacific' | 'Southwest';
}

function teamDiv(t: BasketballTeam): TeamSportData {
  return t.sportData as TeamSportData;
}

export default function LeaguePage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const continueLatest = useLeagueStore(s => s.continueLatest);

  if (loading) {
    return (
      <main className="max-w-5xl mx-auto p-3 sm:p-5 md:p-8">
        <Skeleton className="h-8 w-40 mb-6" />
        <SkeletonList rows={10} />
      </main>
    );
  }

  if (!league) {
    return (
      <main className="max-w-4xl mx-auto p-3 sm:p-5 md:p-8">
        <EmptyState
          icon="🏀"
          title="Couldn’t load a league"
          message={error ?? 'No league loaded yet.'}
          action={{ label: 'Retry', onClick: () => void continueLatest() }}
        />
        <div className="text-center">
          <Link href="/" className="text-sm font-semibold hover:underline" style={{ color: 'var(--accent)' }}>
            Start or load a league
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto p-3 sm:p-5 md:p-8">
      <PageHeader
        title="All Teams"
        subtitle={`${league.displayName} · ${league.teams.length} teams · Season ${league.currentSeason} · Day ${league.currentTick}`}
        right={(
          <Link
            href="/standings"
            className="px-3 py-1.5 rounded-lg font-semibold text-sm bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--border)] transition-colors"
          >
            Standings →
          </Link>
        )}
        className="mb-8"
      />

      <div className="grid gap-8 md:grid-cols-2">
        {(Object.keys(DIVISIONS_BY_CONFERENCE) as ('Eastern' | 'Western')[]).map(conf => (
          <section key={conf}>
            <h2 className="text-lg font-black font-display uppercase tracking-tight mb-3 pb-1 border-b border-[var(--border)]">
              {conf} Conference
            </h2>

            {DIVISIONS_BY_CONFERENCE[conf].map(div => {
              const teamsInDiv = league.teams.filter(t => {
                const sd = teamDiv(t as BasketballTeam);
                return sd.conference === conf && sd.division === div;
              });
              return (
                <div key={div} className="mb-5">
                  <h3 className="text-xs uppercase tracking-wide opacity-60 mb-1">{div}</h3>
                  <ul className="space-y-1">
                    {teamsInDiv.map(t => (
                      <li key={t.id}>
                        <Link
                          href={`/team/${t.id}`}
                          className={`group flex items-center gap-3 px-3 py-2 rounded-lg border hover:border-[var(--accent)] hover:shadow-lg hover:shadow-[var(--accent-glow)] transition-all ${
                            t.id === league.userTeamId ? 'border-[var(--accent)]/50 bg-[var(--accent)]/5' : 'border-[var(--border)] bg-[var(--surface)]'
                          }`}
                        >
                          <TeamLogo
                            abbreviation={t.abbreviation}
                            primaryColor={t.primaryColor}
                            secondaryColor={t.secondaryColor}
                            size="sm"
                          />
                          <span className="font-semibold text-sm group-hover:text-[var(--accent)] transition-colors">{t.city}</span>
                          <span className="text-xs text-[var(--text-sec)] truncate">{t.name}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </main>
  );
}
