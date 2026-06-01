'use client';

import Link from 'next/link';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { TeamSpotlight } from '@/components/show/TeamSpotlight';

/**
 * /show — the full "Hoops Tonight" episode: every storyline this week, as a
 * two-persona chat-bubble talk show. The dashboard embeds a compact version.
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

  return (
    <main className="max-w-2xl mx-auto p-5 sm:p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">← Home</Link>
      <header className="flex flex-wrap items-baseline gap-3 mt-2 mb-4">
        <h1 className="text-3xl sm:text-4xl font-extrabold" style={{ color: 'var(--accent)' }}>The Show</h1>
        <span className="text-sm text-[var(--text-sec)]">Hoops Tonight — your weekly two-voice breakdown</span>
      </header>

      <TeamSpotlight league={league} />

      <p className="mt-4 text-xs text-[var(--text-sec)]">A fresh episode generates each week as you sim. Storylines pull from real results, streaks, and the MVP race.</p>
    </main>
  );
}
