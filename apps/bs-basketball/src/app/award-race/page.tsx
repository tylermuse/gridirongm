'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton, SkeletonList } from '@/components/ui/Skeleton';
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

  if (loading) {
    return (
      <main className="max-w-6xl mx-auto p-3 sm:p-5 md:p-8">
        <Skeleton className="h-8 w-44 mb-4" />
        <SkeletonList rows={8} />
      </main>
    );
  }
  if (!league) {
    return (
      <main className="max-w-6xl mx-auto p-3 sm:p-5 md:p-8">
        <p className="mb-4">{error ?? 'No league loaded.'}</p>
        <Link href="/" className="text-sm font-semibold hover:underline" style={{ color: 'var(--accent)' }}>Start or load a league</Link>
      </main>
    );
  }

  const bracket = getBracket(league);
  const played = league.games.some(g => g.status === 'played');

  return (
    <main className="max-w-6xl mx-auto p-3 sm:p-5 md:p-8">
      <RankingsTabs />
      <PageHeader
        title="Award Race"
        subtitle={`Season ${league.currentSeason} · live ranking${bracket?.complete ? '' : '…'}`}
        right={bracket?.complete ? (
          <Link href="/awards" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--accent-strong)] transition-colors">
            🏆 Final Awards →
          </Link>
        ) : undefined}
      />

      {bracket?.complete && (
        <div className="mb-4 rounded-lg border px-4 py-2.5 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          The season is over — these are the regular-season production leaders. The official winners (with playoffs + voting) are on the <Link href="/awards" className="font-bold hover:underline" style={{ color: 'var(--accent)' }}>Awards</Link> page.
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
