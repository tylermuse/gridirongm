'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { PlayerModal } from '@/components/modals/PlayerModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { buildDraftRecap, type DraftRecap, type RecapPick } from '@/lib/draft';

/**
 * /draft-recap — post-draft grades. Your haul, the biggest steals (players who
 * fell past their board value) and reaches, and the full graded results.
 */
export default function DraftRecapPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const [modalId, setModalId] = useState<string | null>(null);
  const recap = useMemo<DraftRecap | null>(() => (league ? buildDraftRecap(league) : null), [league]);

  if (loading) return <Shell><p className="opacity-60">Loading…</p></Shell>;
  if (!league) return <Shell><p>{error ?? 'No league loaded.'}</p></Shell>;

  if (!recap) {
    return (
      <Shell>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <EmptyState icon="🎬" title="No draft to recap yet" message="Finish a draft and the grades, steals, and reaches show up here." />
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {recap.userPicks.length > 0 && (
        <Group title="Your haul">
          {recap.userPicks.map(p => <PickRow key={p.overall} pick={p} onClick={() => setModalId(p.player.id)} />)}
        </Group>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Group title="💰 Biggest steals">
          {recap.steals.length === 0 && <Empty />}
          {recap.steals.slice(0, 6).map(p => <PickRow key={p.overall} pick={p} onClick={() => setModalId(p.player.id)} />)}
        </Group>
        <Group title="🎈 Biggest reaches">
          {recap.reaches.length === 0 && <Empty />}
          {recap.reaches.slice(0, 6).map(p => <PickRow key={p.overall} pick={p} onClick={() => setModalId(p.player.id)} />)}
        </Group>
      </div>

      <Group title={`Full results (${recap.picks.length})`}>
        <div className="max-h-[34rem] overflow-y-auto">
          {recap.picks.map(p => <PickRow key={p.overall} pick={p} onClick={() => setModalId(p.player.id)} />)}
        </div>
      </Group>

      <PlayerModal playerId={modalId} onClose={() => setModalId(null)} />
    </Shell>
  );
}

function PickRow({ pick, onClick }: { pick: RecapPick; onClick: () => void }) {
  const tag = pick.delta >= 6 ? 'steal' : pick.delta <= -6 ? 'reach' : null;
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2 border-t first:border-t-0 text-left text-sm hover:bg-[var(--surface-2)] transition-colors"
      style={{ borderColor: 'var(--border)', background: pick.isUser ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : undefined }}
    >
      <span className="w-7 text-xs tabular-nums text-[var(--text-sec)]">#{pick.overall}</span>
      <span className="min-w-0 flex-1">
        <span className="font-semibold truncate block">
          {pick.player.firstName} {pick.player.lastName}
          {pick.isUser && <span className="ml-1.5 text-[10px] font-bold" style={{ color: 'var(--accent)' }}>YOU</span>}
        </span>
        <span className="text-xs text-[var(--text-sec)] truncate">
          {pick.player.sportData.position} · {pick.teamLabel}
          {tag && <span className="ml-1.5" style={{ color: tag === 'steal' ? '#10b981' : '#dc2626' }}>· {tag} ({pick.delta > 0 ? '+' : ''}{pick.delta})</span>}
        </span>
      </span>
      <span className="text-base font-black tabular-nums" style={{ color: 'var(--accent)' }}>{pick.player.ratings.overall}</span>
      <span className="w-9 text-center text-sm font-black px-1.5 py-0.5 rounded" style={{ color: pick.gradeColor, border: `1px solid ${pick.gradeColor}` }}>{pick.grade}</span>
    </button>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-[var(--surface)] overflow-hidden mb-4" style={{ borderColor: 'var(--border)' }}>
      <h2 className="px-3 py-2 font-bold border-b text-sm" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>{title}</h2>
      <div>{children}</div>
    </section>
  );
}

function Empty() {
  return <p className="px-3 py-3 text-xs text-[var(--text-sec)]">None — the board went chalk.</p>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-3xl mx-auto p-8">
      <Link href="/draft" className="text-sm font-semibold opacity-70 hover:opacity-100">← Draft</Link>
      <h1 className="text-3xl font-extrabold mt-2 mb-4" style={{ color: 'var(--accent)' }}>Draft Recap</h1>
      {children}
    </main>
  );
}
