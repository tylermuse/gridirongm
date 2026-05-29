'use client';

import Link from 'next/link';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { TeamLogo } from '@/components/ui/TeamLogo';
import type { BasketballTeam } from '@bs/sport-basketball';

/**
 * /league — all 30 teams grouped by conference + division.
 *
 * v1: simple visual grid; no standings yet (season hasn't been simmed).
 * Each team card is a Link to /team/[id].
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

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto p-8">
        <p className="opacity-60">Loading league…</p>
      </main>
    );
  }

  if (!league) {
    return (
      <main className="max-w-4xl mx-auto p-8">
        <p className="mb-4">{error ?? 'No league loaded.'}</p>
        <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
          ← Back to home
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto p-8">
      <header className="mb-8">
        <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">
          ← Home
        </Link>
        <div className="flex flex-wrap items-baseline gap-4 mt-2">
          <h1 className="text-4xl font-extrabold" style={{ color: 'var(--accent)' }}>
            {league.displayName}
          </h1>
          <Link
            href="/standings"
            className="ml-auto px-3 py-1 rounded font-semibold text-sm"
            style={{ background: 'var(--muted)' }}
          >
            Standings →
          </Link>
        </div>
        <p className="opacity-70 mt-1">
          {league.teams.length} teams · Season {league.currentSeason} · Day {league.currentTick}
        </p>
      </header>

      <div className="grid gap-8 md:grid-cols-2">
        {(Object.keys(DIVISIONS_BY_CONFERENCE) as ('Eastern' | 'Western')[]).map(conf => (
          <section key={conf}>
            <h2
              className="text-2xl font-bold mb-3 pb-1 border-b"
              style={{
                color: 'var(--accent-alt)',
                borderColor: 'var(--accent-alt)',
              }}
            >
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
                          className="flex items-center gap-3 px-3 py-2 rounded-lg border bg-[var(--surface)] hover:border-[var(--accent)] hover:shadow-lg hover:shadow-[var(--accent-glow)] transition-all"
                          style={{ borderColor: 'var(--border)' }}
                        >
                          <TeamLogo
                            abbreviation={t.abbreviation}
                            primaryColor={t.primaryColor}
                            secondaryColor={t.secondaryColor}
                            size="sm"
                          />
                          <span className="font-semibold text-sm">{t.city}</span>
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
