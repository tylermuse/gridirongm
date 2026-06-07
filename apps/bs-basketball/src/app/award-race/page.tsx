'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { EmptyState } from '@/components/ui/EmptyState';
import { RankingsTabs } from '@/components/awards/RankingsTabs';
import { AwardRaceCard } from '@/components/awards/AwardRaceCard';
import { computeAwardRaces } from '@/lib/awards/computeAwardRaces';
import { getBracket } from '@/lib/playoffs';

/**
 * /award-race — the LIVE award races (ranked top-10 per category), updating as
 * the season is simmed. Kept separate from /awards (the decided season-end
 * winners + ceremony) so the two aren't conflated on one screen.
 */
export default function AwardRacePage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const races = useMemo(() => (league ? computeAwardRaces(league) : null), [league]);

  if (loading) return <main className="max-w-6xl mx-auto p-8"><p className="opacity-60">Loading…</p></main>;
  if (!league) return <main className="max-w-6xl mx-auto p-8"><p>{error ?? 'No league loaded.'}</p></main>;

  const bracket = getBracket(league);
  const played = league.games.some(g => g.status === 'played');

  return (
    <main className="max-w-6xl mx-auto p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">← Home</Link>
      <div className="mt-2"><RankingsTabs /></div>

      <header className="flex flex-wrap items-baseline gap-3 mt-2 mb-5">
        <h1 className="text-3xl font-black uppercase tracking-tight" style={{ color: 'var(--accent)' }}>Award Race</h1>
        <p className="text-sm text-[var(--text-sec)]">
          Season {league.currentSeason} · live ranking{bracket?.complete ? '' : '…'}
        </p>
        {bracket?.complete && (
          <Link href="/awards" className="ml-auto rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white hover:brightness-110">
            🏆 Final Awards →
          </Link>
        )}
      </header>

      {bracket?.complete && (
        <div className="mb-4 rounded-lg border px-4 py-2.5 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          The season is over — these are the regular-season production leaders. The official winners (with playoffs + voting) are on the <Link href="/awards" className="font-bold" style={{ color: 'var(--accent)' }}>Awards</Link> page.
        </div>
      )}

      {!races || !played ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <EmptyState icon="🏆" title="The race hasn't started" message="Sim some games — the award races fill in as players stack up numbers." />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {races.map(race => <AwardRaceCard key={race.key} race={race} league={league} showWinnerCrown={!!bracket?.complete} />)}
        </div>
      )}
    </main>
  );
}
