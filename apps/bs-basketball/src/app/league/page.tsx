'use client';

import Link from 'next/link';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
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
        <h1 className="text-4xl font-extrabold mt-2" style={{ color: 'var(--accent)' }}>
          {league.displayName}
        </h1>
        <p className="opacity-70">
          {league.teams.length} teams · Season {league.currentSeason} · {league.currentPhase}
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
                          className="flex items-center gap-3 px-3 py-2 rounded border hover:border-current transition"
                          style={{ borderColor: 'var(--border)' }}
                        >
                          <span
                            className="inline-block w-4 h-4 rounded-sm"
                            style={{ background: t.primaryColor }}
                          />
                          <span className="font-semibold">{t.city} {t.name}</span>
                          <span className="ml-auto text-xs opacity-50">{t.abbreviation}</span>
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
