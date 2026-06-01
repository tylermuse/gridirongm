'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { buildBuzz, type BuzzPost } from '@/lib/social/buzz';
import { PlayerModal } from '@/components/modals/PlayerModal';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * /buzz — "Hoops Buzz" social timeline (parity audit #14). A derived feed of
 * fictional reporter / fan reactions to league moments and roster moves.
 */
export default function BuzzPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const router = useRouter();
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null);
  const posts = useMemo(() => buildBuzz(league), [league]);

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
        <h1 className="text-3xl sm:text-4xl font-extrabold" style={{ color: 'var(--accent)' }}>Hoops Buzz</h1>
        <span className="text-sm text-[var(--text-sec)]">What the timeline is saying</span>
      </header>

      {posts.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <EmptyState icon="🔇" title="The timeline is quiet" message="Sim some games and make some moves — the takes will follow." />
        </div>
      ) : (
        <ul className="space-y-3">
          {posts.map(p => (
            <PostCard key={p.id} post={p} onPlayer={setModalPlayerId} onGame={id => router.push(`/game/${id}`)} />
          ))}
        </ul>
      )}

      <PlayerModal playerId={modalPlayerId} onClose={() => setModalPlayerId(null)} />
    </main>
  );
}

function PostCard({ post, onPlayer, onGame }: { post: BuzzPost; onPlayer: (id: string) => void; onGame: (id: string) => void }) {
  const clickable = !!post.playerId || !!post.gameId;
  const onClick = () => {
    if (post.playerId) onPlayer(post.playerId);
    else if (post.gameId) onGame(post.gameId);
  };
  return (
    <li
      onClick={clickable ? onClick : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      className={`flex gap-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] ${
        clickable ? 'cursor-pointer hover:border-[var(--accent)] transition-colors' : ''
      }`}
    >
      <div
        className="shrink-0 h-11 w-11 rounded-full grid place-items-center text-xl"
        style={{ background: `color-mix(in srgb, ${post.accent} 22%, var(--surface-2))` }}
        aria-hidden
      >
        {post.avatar}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm">
          <span className="font-bold truncate">{post.author}</span>
          {post.verified && <span className="text-[var(--accent)]" aria-label="verified">✓</span>}
          <span className="text-[var(--text-sec)] truncate">{post.handle}</span>
          <span className="text-[var(--text-sec)]">· Day {Math.floor(post.day)}</span>
        </div>
        <p className="text-sm mt-0.5 leading-snug">{post.body}</p>
        <div className="flex gap-5 mt-2 text-xs text-[var(--text-sec)] tabular-nums">
          <span>🔁 {fmtCount(post.reposts)}</span>
          <span>❤️ {fmtCount(post.likes)}</span>
        </div>
      </div>
    </li>
  );
}

function fmtCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}
