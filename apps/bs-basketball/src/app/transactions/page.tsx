'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Skeleton, SkeletonList } from '@/components/ui/Skeleton';
import { getTransactions, type TransactionKind } from '@/lib/transactions';

/**
 * /transactions — league-wide move log (Phase 2E-3): trades, signings,
 * releases, and draft picks, filterable by kind.
 */

const FILTERS: ReadonlyArray<{ value: TransactionKind | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'trade', label: 'Trades' },
  { value: 'signing', label: 'Signings' },
  { value: 'release', label: 'Releases' },
  { value: 'draft', label: 'Draft' },
  { value: 'pick', label: 'Picks' },
  { value: 'coaching', label: 'Coaching' },
  { value: 'expansion', label: 'Expansion' },
];

const ICON: Record<TransactionKind, string> = {
  trade: '🔁',
  signing: '✍️',
  release: '✂️',
  draft: '🎟️',
  pick: '🔀',
  coaching: '📋',
  expansion: '🏗️',
};

export default function TransactionsPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const [filter, setFilter] = useState<TransactionKind | 'all'>('all');

  const all = useMemo(() => (league ? getTransactions(league) : []), [league]);
  const shown = filter === 'all' ? all : all.filter(t => t.kind === filter);

  if (loading) return <Loading />;
  if (!league) return <NotFound message={error ?? 'No league loaded.'} />;

  return (
    <main className="max-w-4xl mx-auto p-3 sm:p-5 md:p-8">
      <PageHeader
        title="Transactions"
        subtitle={`Season ${league.currentSeason} · ${all.length} move${all.length === 1 ? '' : 's'} on the wire`}
      />

      <div className="mb-5 max-w-full overflow-x-auto no-scrollbar">
        <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} size="sm" />
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <EmptyState icon="📋" title="The wire's been quiet" message="Every trade, signing, release, and draft pick around the league lands here. Go make some noise." />
        </div>
      ) : (
        <ul className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          {shown.map((t, i) => (
            <li key={i} className="flex items-start gap-3 px-4 py-3 border-t first:border-t-0" style={{ borderColor: 'var(--border)' }}>
              <span className="text-xl leading-none mt-0.5" aria-hidden>{ICON[t.kind]}</span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm">{t.summary}</div>
                <div className="text-xs text-[var(--text-sec)]">{t.detail}</div>
              </div>
              <span className="text-[10px] uppercase tracking-widest opacity-50 shrink-0 mt-1">’{String(t.season).slice(-2)}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function Loading() {
  return (
    <main className="max-w-4xl mx-auto p-3 sm:p-5 md:p-8">
      <Skeleton className="h-8 w-44 mb-5" />
      <SkeletonList rows={8} />
    </main>
  );
}

function NotFound({ message }: { message: string }) {
  return (
    <main className="max-w-4xl mx-auto p-3 sm:p-5 md:p-8">
      <p className="mb-4">{message}</p>
      <Link href="/" className="text-sm font-semibold hover:underline" style={{ color: 'var(--accent)' }}>Start or load a league</Link>
    </main>
  );
}
