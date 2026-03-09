'use client';

import { useState } from 'react';
import { useGameStore } from '@/lib/engine/store';
import { PlayerModal } from '@/components/game/PlayerModal';
import { GameShell } from '@/components/game/GameShell';
import { Badge } from '@/components/ui/Badge';
import type { NewsItem } from '@/types';

const TYPE_ICONS: Record<NewsItem['type'], string> = {
  injury: '🏥',
  trade: '🔄',
  signing: '✍️',
  release: '📋',
  performance: '⭐',
  milestone: '🏆',
  system: 'ℹ️',
  quote: '🎤',
  rumor: '👀',
};

const TYPE_LABELS: Record<NewsItem['type'], string> = {
  injury: 'Injury',
  trade: 'Trade',
  signing: 'Signing',
  release: 'Release',
  performance: 'Performance',
  milestone: 'Milestone',
  system: 'System',
  quote: 'Coach Quote',
  rumor: 'Trade Rumor',
};

type FilterTab = 'all' | 'myteam' | 'transactions' | 'injuries';

export default function NewsPage() {
  const { newsItems, teams, players, userTeamId } = useGameStore();
  const [filter, setFilter] = useState<FilterTab>('all');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const userTeam = teams.find(t => t.id === userTeamId);

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
              onClick={() => setFilter(tab.key)}
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
            {filtered.map(item => (
              <div
                key={item.id}
                className={`rounded-xl border p-4 transition-colors ${
                  item.isUserTeam
                    ? 'border-blue-500/40 bg-blue-500/5'
                    : 'border-[var(--border)] bg-[var(--surface)]'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Team color accent */}
                  {item.teamId && (
                    <div
                      className="w-2 self-stretch rounded-full shrink-0"
                      style={{ backgroundColor: teamColor(item.teamId) }}
                    />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">{TYPE_ICONS[item.type]}</span>
                      <Badge variant="default" size="sm">{TYPE_LABELS[item.type]}</Badge>
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
            ))}
          </div>
        )}
      </div>
      <PlayerModal playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />
    </GameShell>
  );
}
