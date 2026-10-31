'use client';

import Link from 'next/link';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { TeamSpotlight } from '@/components/show/TeamSpotlight';
import { HoopsVideoShow } from '@/components/videoShow/HoopsVideoShow';

/**
 * /show — this week's episode: the video show (Marcus & Tony on set, the
 * last game and the storylines, real numbers on screen), then every storyline
 * as the two-voice audio episode / chat transcript. The dashboard embeds both.
 */
export default function ShowPage() {
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

  // Wide like the rest of the in-game pages (and Football's dashboard
  // Spotlight) — max-w-2xl left the video show a postage stamp on desktop.
  return (
    <main className="max-w-5xl mx-auto p-5 sm:p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">← Home</Link>
      <header className="flex flex-wrap items-baseline gap-3 mt-2 mb-4">
        <h1 className="text-3xl sm:text-4xl font-extrabold" style={{ color: 'var(--accent)' }}>The Show</h1>
        <span className="text-sm text-[var(--text-sec)]">Hoops Tonight — your weekly two-voice breakdown</span>
      </header>

      <div className="mb-5"><HoopsVideoShow league={league} /></div>

      <TeamSpotlight league={league} />

      <p className="mt-4 text-xs text-[var(--text-sec)]">A fresh episode generates each week as you sim. Storylines pull from real results, streaks, and the MVP race.</p>
    </main>
  );
}
