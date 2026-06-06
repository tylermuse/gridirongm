'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSupabaseUser } from '@/lib/auth/useSupabaseUser';

/**
 * GM Awards (parity 3.3 Phase B) — community voting on GM of the Year + Best
 * Rebuild for the latest season, with finalized winners. Sits under the global
 * board on /gm-rankings. Renders nothing when online accounts aren't configured.
 */

interface Nominee { userId: string; displayName: string; value: number; votes: number }
interface Category { label: string; blurb: string; winnerUserId: string | null; nominees: Nominee[] }
interface AwardsData { season: number | null; finalized: boolean; categories: Record<string, Category> }

export function GmAwards() {
  const { user, configured } = useSupabaseUser();
  const [data, setData] = useState<AwardsData | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch('/api/gm/awards/nominees').then(r => r.json()).then(setData).catch(() => { /* unconfigured */ });
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!configured || !data || !data.season) return null;
  const cats = Object.entries(data.categories);
  if (cats.length === 0 || cats.every(([, c]) => c.nominees.length === 0)) return null;

  async function vote(awardType: string, nomineeUserId: string) {
    setBusy(true);
    try {
      await fetch('/api/gm/awards/vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ season: data!.season, awardType, nomineeUserId }) });
      load();
    } finally { setBusy(false); }
  }
  async function finalize() {
    setBusy(true);
    try {
      await fetch('/api/gm/awards/finalize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ season: data!.season }) });
      load();
    } finally { setBusy(false); }
  }

  return (
    <section className="rounded-xl border bg-[var(--surface)] overflow-hidden mb-6" style={{ borderColor: 'var(--border)' }}>
      <div className="px-3 py-2.5 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
        <span className="font-bold text-sm">🏆 GM Awards</span>
        <span className="text-xs text-[var(--text-sec)]">· Season {data.season}</span>
        <button onClick={() => void finalize()} disabled={busy} className="ml-auto text-xs font-semibold hover:underline disabled:opacity-40" style={{ color: 'var(--accent)' }}>
          {data.finalized ? 'Re-tally winners' : 'Reveal winners'}
        </button>
      </div>

      <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {cats.map(([type, c]) => (
          <div key={type} className="px-3 py-3">
            <div className="flex items-baseline gap-2 mb-2">
              <span className="font-semibold text-sm">{c.label}</span>
              <span className="text-xs text-[var(--text-sec)]">{c.blurb}</span>
            </div>
            {c.nominees.length === 0 ? (
              <p className="text-xs text-[var(--text-sec)]">No qualifying nominees yet.</p>
            ) : (
              <ul className="space-y-1">
                {c.nominees.map(n => {
                  const isWinner = c.winnerUserId === n.userId;
                  return (
                    <li key={n.userId} className="flex items-center gap-2 text-sm rounded-lg px-2 py-1" style={isWinner ? { background: 'color-mix(in srgb, #f59e0b 14%, transparent)' } : undefined}>
                      {isWinner && <span aria-hidden>👑</span>}
                      <Link href={`/gm/${n.userId}`} className="font-semibold truncate flex-1 hover:underline">{n.displayName}</Link>
                      <span className="text-xs tabular-nums text-[var(--text-sec)]">
                        {type === 'gm_of_year' ? n.value.toFixed(3).replace(/^0/, '') : `+${n.value}`}
                      </span>
                      <span className="text-xs tabular-nums text-[var(--text-sec)] w-12 text-right">{n.votes} vote{n.votes === 1 ? '' : 's'}</span>
                      {user && (
                        <button onClick={() => void vote(type, n.userId)} disabled={busy} className="text-xs font-bold rounded px-2 py-0.5 disabled:opacity-40" style={{ background: 'color-mix(in srgb, var(--accent) 16%, transparent)', color: 'var(--accent)' }}>
                          Vote
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </div>
      {!user && <p className="px-3 py-2 text-xs text-[var(--text-sec)] border-t" style={{ borderColor: 'var(--border)' }}><Link href="/login" className="font-semibold hover:underline" style={{ color: 'var(--accent)' }}>Sign in</Link> to vote.</p>}
    </section>
  );
}
