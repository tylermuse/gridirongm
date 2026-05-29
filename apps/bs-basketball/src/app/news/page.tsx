'use client';

import Link from 'next/link';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { NewsFeed } from '@/components/feed/NewsFeed';

/**
 * /news — full league moments feed.
 */

export default function NewsPage() {
  const { league, loading, error } = useLeagueOrHydrate();

  if (loading) return <main className="max-w-2xl mx-auto p-8"><p className="opacity-60">Loading…</p></main>;
  if (!league) {
    return (
      <main className="max-w-2xl mx-auto p-8">
        <p className="mb-4">{error ?? 'No league loaded.'}</p>
        <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>← Home</Link>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto p-5 sm:p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">← Home</Link>
      <header className="flex flex-wrap items-baseline gap-3 mt-2 mb-6">
        <h1 className="text-3xl sm:text-4xl font-extrabold" style={{ color: 'var(--accent)' }}>
          League News
        </h1>
        <span className="text-sm text-[var(--text-sec)]">
          Season {league.currentSeason} · Day {league.currentTick}
        </span>
      </header>
      <NewsFeed league={league} />
    </main>
  );
}
