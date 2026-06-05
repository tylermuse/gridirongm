'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { PlayerModal } from '@/components/modals/PlayerModal';
import { buildSpotlight, SPOTLIGHT_HOSTS, type SpotlightEpisode, type SpotlightStory, type StoryCategory } from '@/lib/show/spotlight';
import type { BasketballLeagueState } from '@/lib/persistence/db';

const CAT_TONE: Record<StoryCategory, ChipTone> = {
  Statement: 'blue', Upset: 'red', Breakout: 'green', Streak: 'amber', Discipline: 'violet', 'MVP Race': 'accent', Rivalry: 'red', 'Your Team': 'accent',
};

/**
 * Team Spotlight — a two-persona talk show rendered as chat bubbles inside an
 * accordion of storylines. `compact` renders the dashboard module (latest
 * episode, first story open, link to the full show); otherwise the full surface.
 */
export function TeamSpotlight({ league, compact = false }: { league: BasketballLeagueState | null; compact?: boolean }) {
  const episode = useMemo(() => buildSpotlight(league), [league]);
  if (!episode) return null;
  // Dashboard embeds the top few storylines (user team first); /show shows all.
  const stories = compact ? episode.stories.slice(0, 3) : episode.stories;
  return <SpotlightCard episode={episode} stories={stories} compact={compact} />;
}

function SpotlightCard({ episode, stories, compact }: { episode: SpotlightEpisode; stories: SpotlightStory[]; compact: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<Set<string>>(() => new Set(stories.length ? [stories[0].id] : []));
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null);
  const allOpen = stories.every(s => open.has(s.id));

  const toggle = (id: string) => setOpen(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const expandAll = () => setOpen(allOpen ? new Set() : new Set(stories.map(s => s.id)));

  return (
    <section className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      <div className="px-4 sm:px-5 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--accent) 6%, var(--surface-2))' }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-lg" aria-hidden>🎙️</span>
          <span className="font-black tracking-tight">Team Spotlight</span>
          <span className="text-xs text-[var(--text-sec)]">· Week {episode.week}</span>
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5" style={{ background: 'color-mix(in srgb, var(--accent) 16%, transparent)', color: 'var(--accent)' }}>
            🎧 Listen <span className="opacity-60">AI</span>
          </span>
        </div>
        <p className="text-xs text-[var(--text-sec)] mt-1">
          with {SPOTLIGHT_HOSTS.analyst.name} {SPOTLIGHT_HOSTS.analyst.avatar} &amp; {SPOTLIGHT_HOSTS.take.name} {SPOTLIGHT_HOSTS.take.avatar}
          {stories.length > 1 && <button onClick={expandAll} className="ml-2 font-semibold hover:underline" style={{ color: 'var(--accent)' }}>{allOpen ? 'Collapse all' : 'Expand all'}</button>}
        </p>
      </div>

      <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {stories.map(story => {
          const isOpen = open.has(story.id);
          return (
            <div key={story.id} style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => toggle(story.id)} className="w-full flex items-center gap-2 px-4 sm:px-5 py-3 text-left hover:bg-[var(--surface-2)] transition-colors">
                <Chip tone={CAT_TONE[story.category]}>{story.category}</Chip>
                <span className="flex-1 text-sm font-semibold leading-snug min-w-0">{story.headline}</span>
                <span className="text-[var(--text-sec)] shrink-0 transition-transform duration-200" style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }}>▸</span>
              </button>

              <div className="grid transition-all duration-200 ease-out" style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}>
                <div className="overflow-hidden">
                  <div className="px-4 sm:px-5 pb-4 space-y-2.5">
                    {story.exchanges.map((ex, i) => {
                      const host = SPOTLIGHT_HOSTS[ex.voice];
                      const left = ex.voice === 'analyst';
                      return (
                        <div key={i} className={`flex items-end gap-2 ${left ? '' : 'flex-row-reverse'}`}>
                          <span className="shrink-0 h-8 w-8 rounded-full grid place-items-center text-base" style={{ background: left ? 'color-mix(in srgb, #3b82f6 20%, var(--surface-2))' : 'color-mix(in srgb, #ef4444 20%, var(--surface-2))' }} aria-hidden>{host.avatar}</span>
                          <div className={`min-w-0 max-w-[85%] ${left ? '' : 'text-right'}`}>
                            <div className="text-[10px] font-bold text-[var(--text-sec)] px-1">{host.name}</div>
                            <div
                              className={`text-sm leading-snug rounded-2xl px-3 py-2 ${left ? 'rounded-bl-sm' : 'rounded-br-sm font-semibold'}`}
                              style={{ background: left ? 'color-mix(in srgb, #3b82f6 12%, var(--surface-2))' : 'color-mix(in srgb, #ef4444 12%, var(--surface-2))', color: 'var(--text)' }}
                            >
                              {ex.line}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {(story.playerId || story.gameId) && (
                      <button
                        onClick={() => story.playerId ? setModalPlayerId(story.playerId) : story.gameId && router.push(`/game/${story.gameId}`)}
                        className="text-xs font-semibold hover:underline" style={{ color: 'var(--accent)' }}
                      >
                        {story.playerId ? 'View player →' : 'View box score →'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {compact && (
        <div className="px-4 sm:px-5 py-2.5 border-t text-center" style={{ borderColor: 'var(--border)' }}>
          <Link href="/show" className="text-xs font-bold hover:underline" style={{ color: 'var(--accent)' }}>Watch the full show →</Link>
        </div>
      )}

      <PlayerModal playerId={modalPlayerId} onClose={() => setModalPlayerId(null)} />
    </section>
  );
}
