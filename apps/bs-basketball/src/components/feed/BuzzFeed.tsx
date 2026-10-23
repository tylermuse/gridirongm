'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { buildBuzz, type BuzzPost } from '@/lib/social/buzz';
import { EmptyState } from '@/components/ui/EmptyState';
import type { BasketballLeagueState } from '@/lib/persistence/db';

/**
 * Shared "Hoops Buzz" social timeline. Rendered by both /buzz and the News
 * page's Social tab — the posts come from the single `buildBuzz` generator so
 * the two views can never drift.
 */
export function BuzzFeed({
  league,
  onPlayer,
  myTeamOnly = false,
}: {
  league: BasketballLeagueState;
  onPlayer: (id: string) => void;
  /** Restrict to posts about the user's players. */
  myTeamOnly?: boolean;
}) {
  const router = useRouter();
  const posts = useMemo(() => {
    const all = buildBuzz(league);
    if (!myTeamOnly || !league.userTeamId) return all;
    return all.filter(p => {
      if (!p.playerId) return false;
      const pl = league.players[p.playerId as keyof typeof league.players] as { rosterSlot?: { teamId?: string } } | undefined;
      return pl?.rosterSlot?.teamId === league.userTeamId;
    });
  }, [league, myTeamOnly]);

  if (posts.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <EmptyState icon="🔇" title="The timeline is quiet" message="Sim some games and make some moves — the takes will follow." />
      </div>
    );
  }

  const totalLikes = posts.reduce((s, p) => s + p.likes, 0);
  const totalReposts = posts.reduce((s, p) => s + p.reposts, 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-[var(--text-sec)] tabular-nums">
        <span><span className="font-semibold text-[var(--foreground)]">{posts.length}</span> posts</span>
        <span>❤️ <span className="font-semibold text-[var(--foreground)]">{fmtCount(totalLikes)}</span> likes</span>
        <span>🔁 <span className="font-semibold text-[var(--foreground)]">{fmtCount(totalReposts)}</span> reposts</span>
      </div>
      <ul className="space-y-3">
        {posts.map(p => (
          <BuzzPostCard key={p.id} post={p} onPlayer={onPlayer} onGame={id => router.push(`/game/${id}`)} />
        ))}
      </ul>
    </div>
  );
}

export function BuzzPostCard({ post, onPlayer, onGame }: { post: BuzzPost; onPlayer: (id: string) => void; onGame: (id: string) => void }) {
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

export function fmtCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}
