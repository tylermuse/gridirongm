'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { EmptyState } from '@/components/ui/EmptyState';
import { getTransactions, type TransactionKind } from '@/lib/transactions';

/**
 * /transactions — league-wide move log (Phase 2E-3): trades, signings,
 * releases, and draft picks, filterable by kind.
 */

const FILTERS: { key: TransactionKind | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'trade', label: 'Trades' },
  { key: 'signing', label: 'Signings' },
  { key: 'release', label: 'Releases' },
  { key: 'draft', label: 'Draft' },
];

const ICON: Record<TransactionKind, string> = {
  trade: '🔁',
  signing: '✍️',
  release: '✂️',
  draft: '🎟️',
};

export default function TransactionsPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const [filter, setFilter] = useState<TransactionKind | 'all'>('all');

  const all = useMemo(() => (league ? getTransactions(league) : []), [league]);
  const shown = filter === 'all' ? all : all.filter(t => t.kind === filter);

  if (loading) return <Loading />;
  if (!league) return <NotFound message={error ?? 'No league loaded.'} />;

  return (
    <main className="max-w-4xl mx-auto p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">← Home</Link>
      <h1 className="text-4xl font-extrabold mt-2 mb-5" style={{ color: 'var(--accent)' }}>Transactions</h1>

      <div className="flex flex-wrap gap-1.5 mb-5">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className="px-3 py-1 rounded-full text-sm font-semibold transition-colors"
            style={{
              background: filter === f.key ? 'var(--accent)' : 'var(--surface-2)',
              color: filter === f.key ? '#fff' : 'var(--text-sec)',
            }}
          >
            {f.label}
          </button>
        ))}
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
  return <main className="max-w-4xl mx-auto p-8"><p className="opacity-60">Loading…</p></main>;
}

function NotFound({ message }: { message: string }) {
  return (
    <main className="max-w-4xl mx-auto p-8">
      <p className="mb-4">{message}</p>
      <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>← Home</Link>
    </main>
  );
}
