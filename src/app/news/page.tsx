'use client';

import React, { useState, useEffect } from 'react';
import { useGameStore } from '@/lib/engine/store';
import { PlayerModal } from '@/components/game/PlayerModal';
import { GameShell } from '@/components/game/GameShell';
import { Badge } from '@/components/ui/Badge';
import type { SocialPost } from '@/types';

const NEWS_BADGE: Record<string, { label: string; color: string; bg: string; icon: string; border: string }> = {
  injury:      { label: 'Injury',      color: 'text-orange-700', bg: 'bg-orange-50',  icon: '🏥', border: 'border-l-orange-400' },
  trade:       { label: 'Trade',       color: 'text-purple-700', bg: 'bg-purple-50',  icon: '🔄', border: 'border-l-purple-400' },
  signing:     { label: 'Signing',     color: 'text-blue-700',   bg: 'bg-blue-50',    icon: '✍️', border: 'border-l-blue-400' },
  release:     { label: 'Released',    color: 'text-red-600',    bg: 'bg-red-50',     icon: '✂️', border: 'border-l-red-400' },
  performance: { label: 'Performance', color: 'text-green-700',  bg: 'bg-green-50',   icon: '📊', border: 'border-l-green-400' },
  milestone:   { label: 'Milestone',   color: 'text-amber-700',  bg: 'bg-amber-50',   icon: '⭐', border: 'border-l-amber-400' },
  system:      { label: 'League',      color: 'text-gray-700',   bg: 'bg-gray-50',    icon: '📰', border: 'border-l-gray-400' },
  quote:       { label: 'Quote',       color: 'text-indigo-700', bg: 'bg-indigo-50',  icon: '💬', border: 'border-l-indigo-400' },
  rumor:       { label: 'Rumor',       color: 'text-teal-700',   bg: 'bg-teal-50',    icon: '👀', border: 'border-l-teal-400' },
  coaching:    { label: 'Coaching',    color: 'text-red-700',    bg: 'bg-red-50',     icon: '🏈', border: 'border-l-red-400' },
  recap:       { label: 'Recap',      color: 'text-sky-700',    bg: 'bg-sky-50',     icon: '🏟️', border: 'border-l-sky-400' },
};

/** Detect sub-type overrides from headline text */
function resolveNewsBadge(type: string, headline: string) {
  const h = headline.toLowerCase();
  if (h.includes('fires') || h.includes('fired'))
    return { label: 'Fired', icon: '🚫', color: 'text-red-700', bg: 'bg-red-50', border: 'border-l-red-500' };
  if (h.includes('hires') || h.includes('hired') || h.includes('names'))
    return { label: 'Hired', icon: '✅', color: 'text-green-700', bg: 'bg-green-50', border: 'border-l-green-500' };
  if (h.includes('retires') || h.includes('retirement'))
    return { label: 'Retired', icon: '👋', color: 'text-gray-700', bg: 'bg-gray-100', border: 'border-l-gray-400' };
  if (h.includes('draft') || h.includes('selects'))
    return { label: 'Draft', icon: '🎯', color: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-l-indigo-500' };
  return NEWS_BADGE[type] ?? NEWS_BADGE.system;
}

type FilterTab = 'all' | 'myteam' | 'transactions' | 'injuries' | 'social';

export default function NewsPage() {
  const { newsItems, teams, players, userTeamId, season, week, socialPosts, schedule } = useGameStore();
  const [filter, setFilter] = useState<FilterTab>('all');

  // Backfill social posts for existing saves that simmed before this feature
  useEffect(() => {
    if (filter === 'social' && (!socialPosts || socialPosts.length === 0) && schedule.some(g => g.played)) {
      import('@/lib/engine/social').then(({ generateSocialPosts }) => {
        const userTeam = teams.find(t => t.id === userTeamId);
        const roster = players.filter(p => p.teamId === userTeamId && !p.retired);
        if (!userTeam) return;
        const userGames = schedule.filter(g => g.played && (g.homeTeamId === userTeamId || g.awayTeamId === userTeamId));
        const posts = generateSocialPosts({ team: userTeam, roster, allTeams: teams, players, season, week, games: userGames });
        if (posts.length > 0) {
          useGameStore.setState({ socialPosts: posts });
        }
      });
    }
  }, [filter, socialPosts, schedule, teams, players, userTeamId, season, week]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const sorted = [...newsItems].sort((a, b) => {
    if (b.season !== a.season) return b.season - a.season;
    return b.week - a.week;
  });

  const filtered = sorted.filter(item => {
    if (filter === 'myteam') return item.isUserTeam;
    if (filter === 'transactions') return ['signing', 'release', 'trade'].includes(item.type);
    if (filter === 'injuries') return item.type === 'injury';
    return true;
  });

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'myteam', label: 'My Team' },
    { key: 'transactions', label: 'Transactions' },
    { key: 'injuries', label: 'Injuries' },
    { key: 'social', label: 'Social' },
  ];

  function teamAbbr(teamId?: string) {
    if (!teamId) return null;
    return teams.find(t => t.id === teamId)?.abbreviation ?? null;
  }

  function teamColor(teamId?: string) {
    if (!teamId) return '#666';
    return teams.find(t => t.id === teamId)?.primaryColor ?? '#666';
  }

  return (
    <GameShell>
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-black mb-6">League News</h2>

        {/* Filter tabs */}
        <div className="flex gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-1 mb-6 w-fit">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => {
                setFilter(tab.key);
                if (tab.key === 'myteam') {
                  useGameStore.setState({ newsLastReadWeek: week, newsLastReadSeason: season });
                }
              }}
              className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${
                filter === tab.key ? 'bg-blue-600 text-white' : 'text-[var(--text-sec)] hover:text-[var(--text)]'
              }`}
            >
              {tab.label}
              {tab.key === 'myteam' && newsItems.filter(n => n.isUserTeam).length > 0 && (
                <span className="ml-1.5 bg-blue-100 text-blue-600 rounded-full px-1.5 text-[10px]">
                  {newsItems.filter(n => n.isUserTeam).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {filter === 'social' ? (
          <div className="space-y-3">
            {(socialPosts ?? [])
              .filter(p => p.timestamp.season === season)
              .sort((a, b) => b.timestamp.week - a.timestamp.week || b.likes - a.likes)
              .slice(0, 30)
              .map(post => (
                <SocialPostCard key={post.id} post={post} onPlayerClick={setSelectedPlayerId} />
              ))
            }
            {(socialPosts ?? []).filter(p => p.timestamp.season === season).length === 0 && (
              <div className="text-center py-8 text-[var(--text-sec)]">
                <div className="text-3xl mb-2">📱</div>
                <p className="text-sm">No social posts yet. Simulate some games to see what your players and fans are saying.</p>
              </div>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-[var(--text-sec)]">
            No news items yet. Simulate games to see league news.
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(item => {
              const badge = resolveNewsBadge(item.type, item.headline);
              return (
                <div
                  key={item.id}
                  className={`rounded-xl border border-l-[3px] p-4 transition-colors ${badge.border} ${
                    item.isUserTeam
                      ? 'border-r-blue-500/40 border-t-blue-500/40 border-b-blue-500/40 bg-blue-500/5'
                      : 'border-r-[var(--border)] border-t-[var(--border)] border-b-[var(--border)] bg-[var(--surface)]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${badge.bg} ${badge.color}`}>
                          <span>{badge.icon}</span>
                          {badge.label}
                        </span>
                        {item.teamId && (
                          <span
                            className="text-xs font-bold px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: teamColor(item.teamId) + '33', color: teamColor(item.teamId) }}
                          >
                            {teamAbbr(item.teamId)}
                          </span>
                        )}
                        {item.isUserTeam && <Badge variant="blue" size="sm">Your Team</Badge>}
                        <span className="text-xs text-[var(--text-sec)] ml-auto shrink-0">
                          S{item.season}{item.week > 0 ? ` Wk${item.week}` : ' Offseason'}
                        </span>
                      </div>

                      <p className="text-sm">{item.headline}</p>

                      {item.body && (
                        <div className="mt-2 text-xs text-[var(--text-sec)] space-y-1 leading-relaxed whitespace-pre-line">
                          {item.body.split('\n').map((line, i) => {
                            if (line.startsWith('KEY PERFORMERS:')) return <div key={i} className="font-bold text-[var(--text)] uppercase text-[10px] tracking-wider mt-1">{line}</div>;
                            if (line.startsWith('\u2022 ')) return <div key={i} className="ml-2">{line}</div>;
                            if (line.startsWith('POSTGAME:')) return <div key={i} className="italic text-[var(--text)] mt-1">{line.replace('POSTGAME: ', '')}</div>;
                            if (line.startsWith('FANS:')) return <div key={i} className="text-[var(--text-sec)] mt-1">{line.replace('FANS: ', '\uD83D\uDCE3 ')}</div>;
                            if (line.trim() === '') return null;
                            return <div key={i}>{line}</div>;
                          })}
                        </div>
                      )}

                      {/* Player links */}
                      {item.playerIds && item.playerIds.length > 0 && (
                        <div className="flex gap-2 mt-1.5">
                          {item.playerIds.map(pid => {
                            const p = players.find(pl => pl.id === pid);
                            if (!p) return null;
                            return (
                              <button key={pid} onClick={() => setSelectedPlayerId(pid)} className="text-xs text-blue-600 hover:underline">
                                {p.firstName} {p.lastName}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <PlayerModal playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />
    </GameShell>
  );
}

function SocialPostCard({ post, onPlayerClick }: { post: SocialPost; onPlayerClick?: (id: string) => void }) {
  const borderColor = post.author.type === 'media' && post.author.personId === 'tony_blaze' ? 'border-l-red-400'
    : post.author.type === 'media' && post.author.personId === 'marcus_cole' ? 'border-l-blue-400'
    : post.author.type === 'team' ? 'border-l-green-400'
    : '';

  return (
    <div className={`bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 ${borderColor ? `border-l-[3px] ${borderColor}` : ''}`}>
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-2">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0 ${
          post.author.type === 'media' ? 'bg-gray-800 text-white' :
          post.author.type === 'team' ? 'bg-blue-600 text-white' :
          post.author.type === 'fan' ? 'bg-amber-100' :
          'bg-[var(--surface-2)]'
        }`}>
          {post.author.avatar === 'media_tony' ? '🔥' :
           post.author.avatar === 'media_marcus' ? '🤓' :
           post.author.avatar === 'team' ? '🏈' :
           post.author.avatar === 'fan' ? '📣' :
           post.author.type === 'player' ? '🏈' : post.author.avatar}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            {post.author.type === 'player' && post.author.playerId ? (
              <button onClick={() => onPlayerClick?.(post.author.playerId!)} className="text-sm font-bold hover:text-blue-600 truncate">
                {post.author.name}
              </button>
            ) : (
              <span className="text-sm font-bold truncate">{post.author.name}</span>
            )}
            {post.author.verified && (
              <svg className="w-4 h-4 text-blue-500 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.415-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .494.083.964.237 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484zm-6.616-3.334l-4.334 6.5c-.145.217-.382.334-.625.334-.143 0-.288-.04-.416-.126l-.115-.094-2.415-2.415c-.293-.293-.293-.768 0-1.06s.768-.294 1.06 0l1.77 1.767 3.825-5.74c.23-.345.696-.436 1.04-.207.346.23.44.696.21 1.04z"/></svg>
            )}
          </div>
          <div className="text-[10px] text-[var(--text-sec)]">{post.author.handle} · Week {post.timestamp.week}</div>
        </div>
      </div>

      {/* Post text */}
      <p className="text-sm leading-relaxed text-[var(--text)] mb-2">{post.text}</p>

      {/* Engagement */}
      <div className="flex items-center gap-4 text-[10px] text-[var(--text-sec)]">
        <span>♡ {post.likes >= 1000 ? `${(post.likes / 1000).toFixed(1)}K` : post.likes}</span>
        <span>🔁 {post.reposts >= 1000 ? `${(post.reposts / 1000).toFixed(1)}K` : post.reposts}</span>
        <span>💬 {post.replies >= 1000 ? `${(post.replies / 1000).toFixed(1)}K` : post.replies}</span>
      </div>

      {/* Action shortcut */}
      {post.action && (
        <button
          onClick={() => {
            if (post.action!.type === 'viewPlayer' && post.action!.playerId) onPlayerClick?.(post.action!.playerId);
          }}
          className="text-xs text-blue-600 hover:underline mt-1.5 block"
        >
          {post.action.label} →
        </button>
      )}
    </div>
  );
}
