'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { NewsFeed } from '@/components/feed/NewsFeed';
import { getTransactions, type TransactionEntry } from '@/lib/transactions';

/**
 * /news — league moments feed with All / My Team / Injuries / Transactions tabs.
 */
type Tab = 'all' | 'my_team' | 'injuries' | 'transactions';
const INJURY_KINDS = new Set(['injury', 'suspension', 'fine']);

export default function NewsPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const [tab, setTab] = useState<Tab>('all');

  // Game ids involving the user team — for the My Team filter.
  const userGameIds = useMemo(() => {
    const set = new Set<string>();
    const uid = league?.userTeamId;
    if (league && uid) for (const g of league.games) if (g.homeTeamId === uid || g.awayTeamId === uid) set.add(g.id);
    return set;
  }, [league]);

  if (loading) return <main className="max-w-2xl mx-auto p-8"><p className="opacity-60">Loading…</p></main>;
  if (!league) {
    return (
      <main className="max-w-2xl mx-auto p-8">
        <p className="mb-4">{error ?? 'No league loaded.'}</p>
        <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>← Home</Link>
      </main>
    );
  }

  const txns = getTransactions(league);
  const hasTeam = !!league.userTeamId;
  const tabs: { key: Tab; label: string }[] = [
    { key: 'all', label: 'All' },
    ...(hasTeam ? [{ key: 'my_team' as Tab, label: 'My Team' }] : []),
    { key: 'injuries', label: 'Injuries' },
    { key: 'transactions', label: 'Transactions' },
  ];

  return (
    <main className="max-w-2xl mx-auto p-5 sm:p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">← Home</Link>
      <header className="flex flex-wrap items-baseline gap-3 mt-2 mb-4">
        <h1 className="text-3xl sm:text-4xl font-extrabold" style={{ color: 'var(--accent)' }}>League News</h1>
        <span className="text-sm text-[var(--text-sec)]">Season {league.currentSeason} · Day {league.currentTick}</span>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border overflow-hidden text-sm font-semibold" style={{ borderColor: 'var(--border)' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className="px-3 py-1.5" style={tab === t.key ? { background: 'var(--accent)', color: '#fff' } : { color: 'var(--text-sec)' }}>{t.label}</button>
          ))}
        </div>
        <Link href="/buzz" className="text-xs font-semibold hover:underline" style={{ color: 'var(--accent)' }}>💬 Social timeline →</Link>
      </div>

      {tab === 'transactions' ? (
        <TransactionsList txns={txns} />
      ) : tab === 'my_team' ? (
        <NewsFeed league={league} filter={item => (!!item.gameId && userGameIds.has(item.gameId)) || (!!item.teamId && item.teamId === league.userTeamId)} />
      ) : tab === 'injuries' ? (
        <NewsFeed league={league} filter={item => INJURY_KINDS.has(item.kind)} />
      ) : (
        <NewsFeed league={league} />
      )}
    </main>
  );
}

const KIND_ICON: Record<string, string> = { trade: '🔄', signing: '🖊️', release: '✂️', draft: '🎯' };

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
