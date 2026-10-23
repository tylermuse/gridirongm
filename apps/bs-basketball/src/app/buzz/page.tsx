'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { PlayerModal } from '@/components/modals/PlayerModal';
import { BuzzFeed } from '@/components/feed/BuzzFeed';
import { Skeleton, SkeletonList } from '@/components/ui/Skeleton';

/**
 * /buzz — "Hoops Buzz" social timeline (parity audit #14). A derived feed of
 * fictional reporter / fan reactions to league moments and roster moves.
 * The same feed is also the News page's Social tab (/news?tab=social).
 */
export default function BuzzPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null);

  if (loading) return <main className="max-w-2xl mx-auto p-5 sm:p-8"><Skeleton className="h-8 w-40 mb-4" /><SkeletonList rows={6} /></main>;
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
      <header className="flex flex-wrap items-baseline gap-3 mt-2 mb-4">
        <h1 className="text-3xl sm:text-4xl font-extrabold" style={{ color: 'var(--accent)' }}>Hoops Buzz</h1>
        <span className="text-sm text-[var(--text-sec)]">What the timeline is saying</span>
        <Link href="/news?tab=social" className="ml-auto text-xs font-semibold hover:underline" style={{ color: 'var(--accent)' }}>📰 All league news →</Link>
      </header>

      <BuzzFeed league={league} onPlayer={setModalPlayerId} />

      <PlayerModal playerId={modalPlayerId} onClose={() => setModalPlayerId(null)} />
    </main>
  );
}
