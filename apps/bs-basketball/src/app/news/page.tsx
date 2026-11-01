'use client';

import Link from 'next/link';
import { Suspense, useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { NewsFeed } from '@/components/feed/NewsFeed';
import { NewsTabs } from '@/components/feed/NewsTabs';
import { BuzzFeed } from '@/components/feed/BuzzFeed';
import { PlayerModal } from '@/components/modals/PlayerModal';
import { PageHeader } from '@/components/ui/PageHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton, SkeletonList } from '@/components/ui/Skeleton';
import { buildFeed, type FeedItem } from '@/lib/feed/buildFeed';
import { getTransactions, type TransactionEntry } from '@/lib/transactions';

/**
 * /news — league moments feed with All / My Team / Transactions / Injuries /
 * Social tabs. Social renders the Hoops Buzz timeline (same generator as /buzz).
 * Deep-linkable via ?tab=social etc. The News / Recap strip on top flips to the
 * season recap (football parity).
 */
type Tab = 'all' | 'my_team' | 'injuries' | 'transactions' | 'social';
const TABS: readonly Tab[] = ['all', 'my_team', 'injuries', 'transactions', 'social'];
const INJURY_KINDS = new Set(['injury', 'suspension', 'fine']);

const injuryFilter = (item: FeedItem) => INJURY_KINDS.has(item.kind);

function NewsLoading() {
  return (
    <main className="max-w-3xl mx-auto p-3 sm:p-5 md:p-8">
      <Skeleton className="h-8 w-40 mb-4" />
      <SkeletonList rows={8} />
    </main>
  );
}

// useSearchParams() needs a Suspense boundary for static export.
export default function NewsPage() {
  return (
    <Suspense fallback={<NewsLoading />}>
      <NewsPageInner />
    </Suspense>
  );
}

function NewsPageInner() {
  const { league, loading, error } = useLeagueOrHydrate();
  const sp = useSearchParams();
  const initial = sp.get('tab');
  const [tab, setTab] = useState<Tab>(TABS.includes(initial as Tab) ? (initial as Tab) : 'all');
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null);

  // Derive the feed once: it feeds both the list and the My Team count bubble.
  const feed = useMemo(() => (league ? buildFeed(league) : []), [league]);

  // Game ids involving the user team — for the My Team filter.
  const userGameIds = useMemo(() => {
    const set = new Set<string>();
    const uid = league?.userTeamId;
    if (league && uid) for (const g of league.games) if (g.homeTeamId === uid || g.awayTeamId === uid) set.add(g.id);
    return set;
  }, [league]);
  const userTeamId = league?.userTeamId ?? null;
  const myTeamFilter = useCallback(
    (item: FeedItem) => (!!item.gameId && userGameIds.has(item.gameId)) || (!!item.teamId && item.teamId === userTeamId),
    [userGameIds, userTeamId],
  );
  const myTeamCount = useMemo(() => feed.filter(myTeamFilter).length, [feed, myTeamFilter]);

  if (loading) return <NewsLoading />;
  if (!league) {
    return (
      <main className="max-w-3xl mx-auto p-3 sm:p-5 md:p-8">
        <p className="mb-4">{error ?? 'No league loaded.'}</p>
        <Link href="/" className="text-sm font-semibold hover:underline" style={{ color: 'var(--accent)' }}>Start or load a league</Link>
      </main>
    );
  }

  const txns = getTransactions(league);
  const hasTeam = !!league.userTeamId;
  const tabs: { value: Tab; label: string; badge?: number }[] = [
    { value: 'all', label: 'All' },
    ...(hasTeam ? [{ value: 'my_team' as Tab, label: 'My Team', badge: myTeamCount }] : []),
    { value: 'injuries', label: 'Injuries' },
    { value: 'transactions', label: 'Transactions' },
    { value: 'social', label: 'Social' },
  ];

  return (
    <main className="max-w-3xl mx-auto p-3 sm:p-5 md:p-8">
      <NewsTabs />
      <PageHeader
        title="League News"
        subtitle={`Season ${league.currentSeason} · Day ${league.currentTick}`}
        className="mb-4"
      />

      <div className="mb-4 max-w-full overflow-x-auto no-scrollbar">
        <SegmentedControl options={tabs} value={tab} onChange={setTab} size="sm" />
      </div>

      {tab === 'social' ? (
        <BuzzFeed league={league} onPlayer={setModalPlayerId} />
      ) : tab === 'transactions' ? (
        <TransactionsList txns={txns} />
      ) : tab === 'my_team' ? (
        <NewsFeed league={league} items={feed} filter={myTeamFilter} />
      ) : tab === 'injuries' ? (
        <NewsFeed league={league} items={feed} filter={injuryFilter} />
      ) : (
        <NewsFeed league={league} items={feed} />
      )}

      <footer className="mt-8 rounded-xl border bg-[var(--surface)] p-4 text-xs leading-relaxed text-[var(--text-sec)]" style={{ borderColor: 'var(--border)' }}>
        🏀 Player ratings are adapted from <span className="font-semibold text-[var(--text)]">AlexNoob</span>&rsquo;s 2025&ndash;26 NBA roster (synced to current overalls). Huge thanks to AlexNoob for the base roster that makes this league possible.
      </footer>

      <PlayerModal playerId={modalPlayerId} onClose={() => setModalPlayerId(null)} />
    </main>
  );
}

const KIND_ICON: Record<string, string> = { trade: '🔄', signing: '🖊️', release: '✂️', draft: '🎯', coaching: '📋' };

function TransactionsList({ txns }: { txns: TransactionEntry[] }) {
  if (txns.length === 0) {
    return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--text-sec)]">No transactions yet.</div>;
  }
  return (
    <div className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      {txns.slice(0, 100).map((t, i) => (
        <div key={i} className="flex items-start gap-2.5 px-4 py-2.5 border-t first:border-t-0 text-sm" style={{ borderColor: 'var(--border)' }}>
          <span className="text-base leading-none mt-0.5" aria-hidden>{KIND_ICON[t.kind] ?? '📋'}</span>
          <div className="min-w-0">
            <div className="font-semibold">{t.summary}</div>
            <div className="text-xs text-[var(--text-sec)]">{t.detail}</div>
          </div>
          <span className="ml-auto text-[10px] uppercase tracking-widest text-[var(--text-sec)] shrink-0">{t.kind}</span>
        </div>
      ))}
    </div>
  );
}
