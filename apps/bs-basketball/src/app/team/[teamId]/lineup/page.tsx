'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';

/**
 * /team/[id]/lineup — legacy second lineup editor, retired.
 *
 * The lineup is edited on /roster (Lineup tab: drag / Start / Bench, saved via
 * the same saveLineup action), so this route just forwards old links: the
 * user's own team → /roster, any other team → its /team/[id] page.
 */
export default function LineupRedirectPage() {
  const params = useParams<{ teamId: string }>();
  const router = useRouter();
  const { league, loading } = useLeagueOrHydrate();
  // The hydrate hook kicks off a load on the first commit, so "not loading and
  // no league" on that first render isn't a verdict yet — only trust it once a
  // load has actually run.
  const [sawLoading, setSawLoading] = useState(false);
  if (loading && !sawLoading) setSawLoading(true);

  const target = league
    ? league.userTeamId === params.teamId ? '/roster' : `/team/${params.teamId}`
    : sawLoading && !loading ? '/roster' : null;

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  return (
    <main className="max-w-4xl mx-auto p-3 sm:p-5 md:p-8">
      <p className="opacity-60">Redirecting to your roster…</p>
      <Link href="/roster" className="text-sm font-semibold mt-2 inline-block" style={{ color: 'var(--accent)' }}>
        Go to Roster &amp; Lineup →
      </Link>
    </main>
  );
}
