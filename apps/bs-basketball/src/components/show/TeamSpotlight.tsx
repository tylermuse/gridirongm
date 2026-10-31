'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { PlayerModal } from '@/components/modals/PlayerModal';
import { PlayerName } from '@/components/modals/PlayerModalProvider';
import { ShowAudioPlayer } from '@/components/show/ShowAudioPlayer';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { buildSpotlight, SPOTLIGHT_HOSTS, type SpotlightEpisode, type SpotlightExchange, type SpotlightStory, type StoryCategory } from '@/lib/show/spotlight';
import { useBoothStore } from '@/lib/show/booth';
import type { BasketballLeagueState } from '@/lib/persistence/db';
import type { PlayerId } from '@bs/core/adapter';

const CAT_TONE: Record<StoryCategory, ChipTone> = {
  Statement: 'blue', Upset: 'red', Breakout: 'green', Streak: 'amber', Discipline: 'violet', 'MVP Race': 'accent', Rivalry: 'red', 'Your Team': 'accent',
  Record: 'blue', 'By the Numbers': 'slate', 'Star Watch': 'green', Cap: 'amber', 'Young Core': 'green', 'Playoff Picture': 'violet', Injury: 'red', AI: 'violet',
};

/** Leading icon per storyline row — football's topics each carry one. */
const CAT_ICON: Record<StoryCategory, string> = {
  Statement: '💪', Upset: '😱', Breakout: '🚀', Streak: '🔥', Discipline: '🛡️', 'MVP Race': '🏆', Rivalry: '⚔️', 'Your Team': '🏀',
  Record: '📊', 'By the Numbers': '🔢', 'Star Watch': '⭐', Cap: '💰', 'Young Core': '🌱', 'Playoff Picture': '🎯', Injury: '🩹', AI: '✨',
};

/** Stable fake engagement for a player post, so the counts don't reshuffle on every render. */
function engagement(seed: string): { replies: number; reposts: number; likesK: number } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return { replies: 50 + (h % 500), reposts: 200 + ((h >>> 9) % 2000), likesK: 5 + ((h >>> 20) % 30) };
}

const VERIFIED_PATH = 'M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.415-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .494.083.964.237 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484zm-6.616-3.334l-4.334 6.5c-.145.217-.382.334-.625.334-.143 0-.288-.04-.416-.126l-.115-.094-2.415-2.415c-.293-.293-.293-.768 0-1.06s.768-.294 1.06 0l1.77 1.767 3.825-5.74c.23-.345.696-.436 1.04-.207.346.23.44.696.21 1.04z';

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
  const team = league?.userTeamId ? (league.teams as { id: string; city?: string; name?: string }[]).find(t => t.id === league.userTeamId) : undefined;
  const teamName = team ? `${team.city ?? ''} ${team.name ?? ''}`.trim() : 'league';
  return <SpotlightCard episode={episode} stories={stories} compact={compact} league={league} teamName={teamName} />;
}

function SpotlightCard({ episode, stories, compact, league, teamName }: { episode: SpotlightEpisode; stories: SpotlightStory[]; compact: boolean; league: BasketballLeagueState | null; teamName: string }) {
  const playerName = (id?: string): string => {
    const p = id ? (league?.players as Record<string, { firstName: string; lastName: string }> | undefined)?.[id] : undefined;
    return p ? `${p.firstName} ${p.lastName}` : 'The Player';
  };
  const playerTeam = (id?: string) => {
    const p = id ? league?.players[id as PlayerId] : undefined;
    const tid = p?.rosterSlot?.teamId;
    return { p, team: tid ? league?.teams.find(t => t.id === tid) : undefined };
  };
  const boothMounted = useBoothStore(s => s.mounted);
  const openBooth = useBoothStore(s => s.setOpen);
  const router = useRouter();
  const [open, setOpen] = useState<Set<string>>(() => new Set(stories.length ? [stories[0].id] : []));
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null);
  // Dashboard: the "Listen" pill mounts the player (and starts it). /show: the
  // player is always shown above the storylines.
  const [listening, setListening] = useState(false);
  const allOpen = stories.every(s => open.has(s.id));
  const hasAi = stories.some(s => AI_CATEGORIES.has(s.category));

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
          {compact && (
            <button
              onClick={() => setListening(v => !v)}
              className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 hover:opacity-80 transition-opacity"
              style={{ background: 'color-mix(in srgb, var(--accent) 16%, transparent)', color: 'var(--accent)' }}
              title={listening ? 'Close the player' : 'Listen to this episode'}
              aria-expanded={listening}
            >
              {listening ? '⏹ Stop' : '🎧 Listen'}
            </button>
          )}
        </div>
        <p className="text-xs text-[var(--text-sec)] mt-1">
          with <span className="font-semibold text-blue-600">{SPOTLIGHT_HOSTS.analyst.name} {SPOTLIGHT_HOSTS.analyst.avatar}</span> &amp; <span className="font-semibold text-red-600">{SPOTLIGHT_HOSTS.take.name} {SPOTLIGHT_HOSTS.take.avatar}</span>
          {stories.length > 1 && <button onClick={expandAll} className="ml-2 font-semibold hover:underline" style={{ color: 'var(--accent)' }}>{allOpen ? 'Collapse all' : 'Expand all'}</button>}
        </p>
      </div>

      {(!compact || listening) && (
        <div className="px-4 sm:px-5 pt-3 pb-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          <ShowAudioPlayer episode={episode} teamName={teamName} compact={compact} autoStart={compact} onClose={compact ? () => setListening(false) : undefined} />
        </div>
      )}

      {!compact && episode.intro.length > 0 && (
        <div className="px-4 sm:px-5 pt-4 pb-3 space-y-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-sec)]">Cold open</div>
          {episode.intro.map((ex, i) => <HostBubble key={i} ex={ex} />)}
        </div>
      )}

      {/* Storylines as their own bordered cards, icon + badge + chevron —
          the same accordion treatment as football's Team Spotlight. */}
      <div className="px-4 sm:px-5 py-4 space-y-2">
        {stories.map(story => {
          const isOpen = open.has(story.id);
          return (
            <div key={story.id} className="border rounded-lg overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => toggle(story.id)} aria-expanded={isOpen} className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-[var(--surface-2)] transition-colors">
                <span className="text-base shrink-0" aria-hidden>{CAT_ICON[story.category]}</span>
                {/* Badge stacks over the headline on phones so the headline keeps the full width. */}
                <span className="flex-1 min-w-0 flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
                  <Chip tone={CAT_TONE[story.category]}>{story.category}</Chip>
                  <span className="text-sm font-bold leading-snug">{story.headline}</span>
                </span>
                <svg
                  className={`w-4 h-4 shrink-0 text-[var(--text-sec)] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              <div className="grid transition-all duration-200 ease-out" style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}>
                <div className="overflow-hidden">
                  <div className="px-3 pb-3 space-y-2.5">
                    {story.exchanges.map((ex, i) => {
                      // Player tweet variant.
                      if (ex.voice === 'player') {
                        const name = playerName(story.playerId);
                        const handle = '@' + name.toLowerCase().replace(/[^a-z]/g, '');
                        const { p, team } = playerTeam(story.playerId);
                        const stats = engagement(`${story.id}:${i}`);
                        return (
                          <div key={i} className="flex justify-center my-3">
                            <div className="rounded-2xl px-4 pt-3 pb-3 text-white shadow-lg max-w-[400px] w-full" style={{ background: '#15202b' }}>
                              <div className="flex items-center gap-2.5 mb-2">
                                {p ? (
                                  <PlayerAvatar
                                    firstName={p.firstName} lastName={p.lastName}
                                    primaryColor={team?.primaryColor ?? '#38444d'} secondaryColor={team?.secondaryColor ?? '#fff'}
                                    photoUrl={(p.sportData as { photoUrl?: string } | undefined)?.photoUrl} size="sm"
                                  />
                                ) : (
                                  <span className="h-9 w-9 rounded-full grid place-items-center text-base shrink-0" style={{ background: '#38444d' }} aria-hidden>🏀</span>
                                )}
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1 text-sm font-bold leading-tight">
                                    <PlayerName playerId={story.playerId}>{name}</PlayerName>
                                    <svg className="w-4 h-4 text-blue-400 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-label="Verified"><path d={VERIFIED_PATH} /></svg>
                                  </div>
                                  <div className="text-xs text-[#8899a6]">{handle}</div>
                                </div>
                              </div>
                              <div className="text-[15px] leading-snug text-white/95 mb-2">{ex.line}</div>
                              <div className="flex items-center gap-5 text-xs text-[#8899a6] pt-1.5 border-t border-gray-700/50">
                                <span>💬 {stats.replies}</span>
                                <span>🔁 {stats.reposts}</span>
                                <span>❤️ {stats.likesK}K</span>
                              </div>
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

      {/* Football's "Call in to the show" row — opens the Booth the shell already mounts. */}
      {boothMounted && (
        <div className="px-4 sm:px-5 pb-4">
          <button
            onClick={() => openBooth(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-left border rounded-lg hover:bg-[var(--surface-2)] transition-colors"
            style={{ borderColor: 'var(--border)' }}
          >
            <span className="flex" aria-hidden>
              <span className="w-6 h-6 text-[10px] bg-blue-600 text-white rounded-full flex items-center justify-center font-extrabold tracking-tight ring-2 ring-[var(--surface)]">MC</span>
              <span className="-ml-0.5 w-6 h-6 text-[10px] bg-orange-600 text-orange-950 rounded-full flex items-center justify-center font-extrabold tracking-tight ring-2 ring-[var(--surface)]">TB</span>
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold">Call in to the show</span>
              <span className="block text-xs text-[var(--text-sec)] truncate">Ask Marcus &amp; Tony anything. Get both takes.</span>
            </span>
            <span className="text-xs font-semibold shrink-0" style={{ color: 'var(--accent)' }}>Open the booth</span>
          </button>
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
