'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { EmptyState } from '@/components/ui/EmptyState';
import { getSeasonHistory, type SeasonHistoryEntry } from '@/lib/history';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';

/**
 * /history — league record book (Phase 2E-4): champion timeline, all-time MVP
 * tally, and career scoring leaders.
 */
export default function HistoryPage() {
  const { league, loading, error } = useLeagueOrHydrate();

  const history = useMemo<SeasonHistoryEntry[]>(() => (league ? getSeasonHistory(league) : []), [league]);
  const teamById = useMemo(() => {
    const m = new Map<string, BasketballTeam>();
    if (league) for (const t of league.teams) m.set(t.id, t as BasketballTeam);
    return m;
  }, [league]);

  // All-time MVP tally (by name).
  const mvpTally = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of history) if (h.mvp) counts.set(h.mvp.name, (counts.get(h.mvp.name) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [history]);

  // Career scoring leaders (active players, by accumulated career points).
  const careerScorers = useMemo(() => {
    if (!league) return [];
    return (Object.values(league.players) as BasketballPlayer[])
      .filter(p => (p.careerStats?.points ?? 0) > 0)
      .sort((a, b) => (b.careerStats.points ?? 0) - (a.careerStats.points ?? 0))
      .slice(0, 10);
  }, [league]);

  if (loading) return <Loading />;
  if (!league) return <NotFound message={error ?? 'No league loaded.'} />;

  return (
    <main className="max-w-5xl mx-auto p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">← Home</Link>
      <h1 className="text-4xl font-extrabold mt-2 mb-6" style={{ color: 'var(--accent)' }}>League History</h1>

      {history.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <EmptyState icon="📚" title="The record book is blank — for now" message="Run a season to its end, crown a champion, and the banners start going up here." />
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1.5fr_1fr] gap-6">
          {/* Champions timeline */}
          <section className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <h2 className="px-3 py-2 font-bold border-b text-sm" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
              Champions
            </h2>
            <ul>
              {history.map(h => {
                const champ = h.champion ? teamById.get(h.champion) : null;
                return (
                  <li key={h.season} className="px-4 py-3 border-t first:border-t-0" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-black tabular-nums opacity-60 w-12">{h.season}</span>
                      {champ ? (
                        <>
                          <TeamLogo abbreviation={champ.abbreviation} primaryColor={champ.primaryColor} secondaryColor={champ.secondaryColor} size="sm" />
                          <span className="font-bold">{champ.city} {champ.name}</span>
                        </>
                      ) : (
                        <span className="opacity-60">—</span>
                      )}
                    </div>
                    <div className="text-xs text-[var(--text-sec)] mt-1 pl-12 space-y-0.5">
                      {h.finalsMvp && <div>Finals MVP: <span className="font-semibold">{h.finalsMvp.name}</span> ({h.finalsMvp.statline})</div>}
                      {h.mvp && <div>MVP: <span className="font-semibold">{h.mvp.name}</span> ({h.mvp.statline})</div>}
                      {h.scoringLeader && <div>Scoring: <span className="font-semibold">{h.scoringLeader.name}</span> ({h.scoringLeader.statline})</div>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <div className="space-y-6">
            {/* All-time MVPs */}
            <section className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <h2 className="px-3 py-2 font-bold border-b text-sm" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
                All-time MVPs
              </h2>
              <ul className="p-2">
                {mvpTally.map(([name, count]) => (
                  <li key={name} className="flex items-center justify-between px-2 py-1 text-sm">
                    <span className="font-semibold truncate">{name}</span>
                    <span className="tabular-nums opacity-70">{count}×</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Career scoring */}
            <section className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <h2 className="px-3 py-2 font-bold border-b text-sm" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
                Career scoring leaders
              </h2>
              {careerScorers.length === 0 ? (
                <p className="p-3 text-xs text-[var(--text-sec)]">Career totals accrue after each completed season.</p>
              ) : (
                <ul className="p-2">
                  {careerScorers.map(p => (
                    <li key={p.id} className="flex items-center justify-between px-2 py-1 text-sm">
                      <span className="font-semibold truncate">{p.firstName} {p.lastName}</span>
                      <span className="tabular-nums opacity-70">{Math.round(p.careerStats.points).toLocaleString()} pts</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </main>
  );
}

function Loading() {
  return <main className="max-w-4xl mx-auto p-8"><p className="opacity-60">Loading…</p></main>;
}

function NotFound({ message }: { message: string }) {
  return (
    <main className="max-w-4xl mx-auto p-8">
      <p className="mb-4">{message}</p>
      <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>← Home</Link>
    </main>
  );
}
