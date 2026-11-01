'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { PlayerModal } from '@/components/modals/PlayerModal';
import { BuzzFeed } from '@/components/feed/BuzzFeed';
import { Skeleton, SkeletonList } from '@/components/ui/Skeleton';
import { PageHeader } from '@/components/ui/PageHeader';

/**
 * /buzz — "Hoops Buzz" social timeline (parity audit #14). A derived feed of
 * fictional reporter / fan reactions to league moments and roster moves.
 * The same feed is also the News page's Social tab (/news?tab=social).
 */
export default function BuzzPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null);

  if (loading) return <main className="max-w-2xl mx-auto p-3 sm:p-5 md:p-8"><Skeleton className="h-8 w-40 mb-4" /><SkeletonList rows={6} /></main>;
  if (!league) {
    return (
      <main className="max-w-2xl mx-auto p-3 sm:p-5 md:p-8">
        <p className="mb-4">{error ?? 'No league loaded.'}</p>
        <Link href="/" className="text-sm font-semibold hover:underline" style={{ color: 'var(--accent)' }}>Start or load a league</Link>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto p-3 sm:p-5 md:p-8">
      <PageHeader
        title="Hoops Buzz"
        subtitle="What the timeline is saying"
        right={<Link href="/news?tab=social" className="text-xs font-semibold hover:underline" style={{ color: 'var(--accent)' }}>📰 All league news →</Link>}
        className="mb-4"
      />

      <BuzzFeed league={league} onPlayer={setModalPlayerId} />

      <PlayerModal playerId={modalPlayerId} onClose={() => setModalPlayerId(null)} />
    </main>
  );
}
