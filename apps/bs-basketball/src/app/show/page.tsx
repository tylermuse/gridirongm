'use client';

import Link from 'next/link';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { TeamSpotlight } from '@/components/show/TeamSpotlight';
import { HoopsVideoShow } from '@/components/videoShow/HoopsVideoShow';
import { PageHeader } from '@/components/ui/PageHeader';

/**
 * /show — this week's episode: the video show (Marcus & Tony on set, the
 * last game and the storylines, real numbers on screen), then every storyline
 * as the two-voice audio episode / chat transcript. The dashboard embeds both.
 */
export default function ShowPage() {
  const { league, loading, error } = useLeagueOrHydrate();

  if (loading) return <main className="max-w-2xl mx-auto p-3 sm:p-5 md:p-8"><p className="opacity-60">Loading…</p></main>;
  if (!league) {
    return (
      <main className="max-w-2xl mx-auto p-3 sm:p-5 md:p-8">
        <p className="mb-4">{error ?? 'No league loaded.'}</p>
        <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>← Home</Link>
      </main>
    );
  }

  // Wide like the rest of the in-game pages (and Football's dashboard
  // Spotlight) — max-w-2xl left the video show a postage stamp on desktop.
  return (
    <main className="max-w-5xl mx-auto p-3 sm:p-5 md:p-8">
      <PageHeader title="The Show" subtitle="Hoops Tonight — your weekly two-voice breakdown" className="mb-4" />

      <div className="mb-5"><HoopsVideoShow league={league} /></div>

      <TeamSpotlight league={league} />

      <p className="mt-4 text-xs text-[var(--text-sec)]">A fresh episode generates each week as you sim. Storylines pull from real results, streaks, and the MVP race.</p>
    </main>
  );
}
