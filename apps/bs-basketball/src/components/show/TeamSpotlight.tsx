'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { PlayerModal } from '@/components/modals/PlayerModal';
import { PlayerName } from '@/components/modals/PlayerModalProvider';
import { speakLines, stopSpeech, isSpeechSupported } from '@/lib/ui/speech';
import { buildSpotlight, SPOTLIGHT_HOSTS, type SpotlightEpisode, type SpotlightExchange, type SpotlightStory, type StoryCategory } from '@/lib/show/spotlight';
import type { BasketballLeagueState } from '@/lib/persistence/db';

const CAT_TONE: Record<StoryCategory, ChipTone> = {
  Statement: 'blue', Upset: 'red', Breakout: 'green', Streak: 'amber', Discipline: 'violet', 'MVP Race': 'accent', Rivalry: 'red', 'Your Team': 'accent',
  Record: 'blue', 'By the Numbers': 'slate', 'Star Watch': 'green', Cap: 'amber', 'Young Core': 'green', 'Playoff Picture': 'violet', Injury: 'red', AI: 'violet',
};

/** Categories that should surface the small purple "AI" badge in the header.
 *  No data source feeds AI topics yet, so this is a ready-but-dormant hook. */
const AI_CATEGORIES = new Set<StoryCategory>(['AI']);

/** Analyst (left, blue) / take (right, red) chat bubble — mirrors football's
 *  DebateBubble styling so the two shows read identically. */
function HostBubble({ ex }: { ex: SpotlightExchange }) {
  const host = SPOTLIGHT_HOSTS[ex.voice as 'analyst' | 'take'];
  const left = ex.voice === 'analyst';
  return (
    <div className={`flex gap-3 ${left ? '' : 'flex-row-reverse'}`}>
      <div className="shrink-0 pt-1">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-lg ${left ? 'bg-blue-100' : 'bg-red-100'}`} aria-hidden>{host.avatar}</div>
      </div>
      <div className={`flex-1 max-w-[85%] ${left ? '' : 'ml-auto'}`}>
        <div className={`text-[10px] font-bold uppercase tracking-wide mb-0.5 ${left ? 'text-blue-600' : 'text-right text-red-600'}`}>{host.name}</div>
        <div className={`rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${left ? 'bg-blue-50 border border-blue-200 rounded-tl-sm' : 'bg-red-50 border border-red-200 rounded-tr-sm'}`}>
          &ldquo;{ex.line}&rdquo;
        </div>
      </div>
    </div>
  );
}

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
  return <SpotlightCard episode={episode} stories={stories} compact={compact} league={league} />;
}

function SpotlightCard({ episode, stories, compact, league }: { episode: SpotlightEpisode; stories: SpotlightStory[]; compact: boolean; league: BasketballLeagueState | null }) {
  const playerName = (id?: string): string => {
    const p = id ? (league?.players as Record<string, { firstName: string; lastName: string }> | undefined)?.[id] : undefined;
    return p ? `${p.firstName} ${p.lastName}` : 'The Player';
  };
  const router = useRouter();
  const [open, setOpen] = useState<Set<string>>(() => new Set(stories.length ? [stories[0].id] : []));
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const allOpen = stories.every(s => open.has(s.id));
  const hasAi = stories.some(s => AI_CATEGORIES.has(s.category));

  // Stop any narration when this card unmounts.
  useEffect(() => () => stopSpeech(), []);

  function toggleListen() {
    if (playing) { stopSpeech(); setPlaying(false); return; }
    const lines = stories.flatMap(s => s.exchanges.map(ex => ({ text: ex.line, voice: (ex.voice === 'analyst' ? 'analyst' : 'take') as 'analyst' | 'take' })));
    setPlaying(true);
    speakLines(lines, () => setPlaying(false));
  }

  const toggle = (id: string) => setOpen(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const expandAll = () => setOpen(allOpen ? new Set() : new Set(stories.map(s => s.id)));

  return (
    <section className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      <div className="px-4 sm:px-5 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--accent) 6%, var(--surface-2))' }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-lg" aria-hidden>🎙️</span>
          <span className="font-black tracking-tight">Team Spotlight</span>
          <span className="text-xs text-[var(--text-sec)]">· Week {episode.week}</span>
          {hasAi && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-1.5 py-0.5 bg-purple-100 text-purple-700">
              ✨ AI
            </span>
          )}
          {isSpeechSupported() && (
            <button
              onClick={toggleListen}
              className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 hover:opacity-80 transition-opacity"
              style={{ background: 'color-mix(in srgb, var(--accent) 16%, transparent)', color: 'var(--accent)' }}
              title={playing ? 'Stop narration' : 'Read this episode aloud'}
            >
              {playing ? '⏹ Stop' : '🎧 Listen'}
            </button>
          )}
        </div>
        <p className="text-xs text-[var(--text-sec)] mt-1">
          with <span className="font-semibold text-blue-600">{SPOTLIGHT_HOSTS.analyst.name} {SPOTLIGHT_HOSTS.analyst.avatar}</span> &amp; <span className="font-semibold text-red-600">{SPOTLIGHT_HOSTS.take.name} {SPOTLIGHT_HOSTS.take.avatar}</span>
          {stories.length > 1 && <button onClick={expandAll} className="ml-2 font-semibold hover:underline" style={{ color: 'var(--accent)' }}>{allOpen ? 'Collapse all' : 'Expand all'}</button>}
        </p>
      </div>

      {!compact && episode.intro.length > 0 && (
        <div className="px-4 sm:px-5 pt-4 pb-3 space-y-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-sec)]">Cold open</div>
          {episode.intro.map((ex, i) => <HostBubble key={i} ex={ex} />)}
        </div>
      )}

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
                      // Player tweet variant.
                      if (ex.voice === 'player') {
                        const name = playerName(story.playerId);
                        const handle = '@' + name.toLowerCase().replace(/[^a-z]/g, '');
                        return (
                          <div key={i} className="flex justify-center my-1">
                            <div className="rounded-2xl px-4 pt-3 pb-3 text-white shadow-lg max-w-[400px] w-full" style={{ background: '#15202b' }}>
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="h-9 w-9 rounded-full grid place-items-center text-base" style={{ background: '#38444d' }} aria-hidden>🏀</span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1 text-sm font-bold leading-tight"><PlayerName playerId={story.playerId}>{name}</PlayerName><span style={{ color: '#1d9bf0' }}>✓</span></div>
                                  <div className="text-xs text-[#8899a6]">{handle}</div>
                                </div>
                              </div>
                              <div className="text-[15px] leading-snug">{ex.line}</div>
                              <div className="flex gap-6 mt-2 text-xs text-[#8899a6]">💬 🔁 ❤️</div>
                            </div>
                          </div>
                        );
                      }
                      // Fan-pulse variant.
                      if (ex.voice === 'fan') {
                        return (
                          <div key={i} className="text-center my-1">
                            <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#059669' }}>Fan Pulse</div>
                            <div className="inline-block rounded-xl px-4 py-2 text-sm italic mt-0.5" style={{ background: 'color-mix(in srgb, #10b981 12%, transparent)', border: '1px solid color-mix(in srgb, #10b981 30%, transparent)', color: '#047857' }}>{ex.line}</div>
                          </div>
                        );
                      }
                      return <HostBubble key={i} ex={ex} />;
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

      {!compact && episode.outro.length > 0 && (
        <div className="px-4 sm:px-5 pt-4 pb-4 space-y-2.5 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-sec)]">Sign-off</div>
          {episode.outro.map((ex, i) => <HostBubble key={i} ex={ex} />)}
        </div>
      )}

      {compact && (
        <div className="px-4 sm:px-5 py-2.5 border-t text-center" style={{ borderColor: 'var(--border)' }}>
          <Link href="/show" className="text-xs font-bold hover:underline" style={{ color: 'var(--accent)' }}>Watch the full show →</Link>
        </div>
      )}

      <PlayerModal playerId={modalPlayerId} onClose={() => setModalPlayerId(null)} />
    </section>
  );
}
