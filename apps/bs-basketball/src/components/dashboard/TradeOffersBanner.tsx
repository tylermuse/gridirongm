'use client';

import Link from 'next/link';
import { getPendingProposals } from '@/lib/trade/proposals';
import type { useLeagueStore } from '@/lib/store/leagueStore';

type League = NonNullable<ReturnType<typeof useLeagueStore.getState>['league']>;

/**
 * Light dashboard banner when rival GMs have pending trade offers for the user.
 * Links straight into the Trade Center's Offers inbox. Renders nothing when the
 * inbox is empty (or the user is spectating).
 */
export function TradeOffersBanner({ league }: { league: League }) {
  if (!league.userTeamId) return null;
  const pending = getPendingProposals(league);
  if (pending.length === 0) return null;
  const newest = pending[0];
  const city = league.teams.find(t => t.id === newest.fromTeamId)?.city ?? 'A rival';
  const isNew = newest.createdDay >= league.currentTick - 1;
  return (
    <Link
      href="/trade?tab=offers"
      className="mb-5 flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors hover:bg-[var(--surface-2)]"
      style={{ borderColor: 'var(--border)', background: 'var(--surface)', boxShadow: 'inset 3px 0 0 var(--accent)' }}
    >
      <span className="text-xl" aria-hidden>📨</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold">
          {pending.length === 1 ? `${city} sent you a trade offer` : `${pending.length} trade offers on the table`}
          {isNew && <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: 'var(--accent)', color: '#fff' }}>New</span>}
        </div>
        <div className="truncate text-xs text-[var(--text-sec)]">{newest.rationale}</div>
      </div>
      <span className="shrink-0 text-xs font-semibold" style={{ color: 'var(--accent)' }}>Review →</span>
    </Link>
  );
}
