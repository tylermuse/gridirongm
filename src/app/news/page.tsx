'use client';

import { useState } from 'react';
import { useGameStore } from '@/lib/engine/store';
import { PlayerModal } from '@/components/game/PlayerModal';
import { GameShell } from '@/components/game/GameShell';
import { Badge } from '@/components/ui/Badge';

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

type FilterTab = 'all' | 'myteam' | 'transactions' | 'injuries';

export default function NewsPage() {
  const { newsItems, teams, players, userTeamId, season, week } = useGameStore();
  const [filter, setFilter] = useState<FilterTab>('all');
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

        {filtered.length === 0 ? (
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
