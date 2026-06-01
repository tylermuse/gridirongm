'use client';

/**
 * NewsFeed — vertical list of derived "league moments".
 *
 * Pure derivation from league state via buildFeed(). Items render as cards with
 * an event icon, a category chip, a team-color chip, and a season·day tag.
 * Game items deep-link to the box score; player items open a PlayerModal. The
 * full (uncapped) view groups items under day headers.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildFeed, type FeedItem, type FeedKind } from '@/lib/feed/buildFeed';
import { PlayerModal } from '@/components/modals/PlayerModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { TeamLogo } from '@/components/ui/TeamLogo';
import type { BasketballLeagueState } from '@/lib/persistence/db';
import type { BasketballTeam } from '@bs/sport-basketball';

interface NewsFeedProps {
  league: BasketballLeagueState | null;
  /** Cap the number of items shown (e.g. sidebar). Omit for the full feed. */
  max?: number;
  /** Optional predicate to scope the feed (e.g. just the user team's moments). */
  filter?: (item: FeedItem) => boolean;
}

const CAT: Record<FeedKind, { label: string; tone: ChipTone }> = {
  big_game: { label: 'Statement', tone: 'blue' },
  career_night: { label: 'Breakout', tone: 'green' },
  streak: { label: 'Streak', tone: 'amber' },
  upset: { label: 'Upset', tone: 'red' },
  injury: { label: 'Injury', tone: 'red' },
  suspension: { label: 'Discipline', tone: 'violet' },
  fine: { label: 'Fine', tone: 'violet' },
  schedule_notice: { label: 'Schedule', tone: 'slate' },
};

export function NewsFeed({ league, max, filter }: NewsFeedProps) {
  const router = useRouter();
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null);

  const teamById = useMemo(() => {
    const m = new Map<string, BasketballTeam>();
    if (league) for (const t of league.teams) m.set(t.id, t as BasketballTeam);
    return m;
  }, [league]);

  const items = useMemo(() => {
    let all = buildFeed(league);
    if (filter) all = all.filter(filter);
    return max ? all.slice(0, max) : all;
  }, [league, max, filter]);

  const season = league?.currentSeason ?? 0;
  const grouped = !max; // full view groups by day

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <EmptyState icon="🌙" title="Quiet night in the league" message="Sim some games to see moments here." />
      </div>
    );
  }

  const onActivate = (item: FeedItem) => {
    if (item.playerId) setModalPlayerId(item.playerId);
    else if (item.gameId) router.push(`/game/${item.gameId}`);
  };

  const renderCard = (item: FeedItem) => {
    const clickable = !!item.gameId || !!item.playerId;
    const cat = CAT[item.kind];
    const team = item.teamId ? teamById.get(item.teamId) : undefined;
    return (
      <div
        key={item.id}
        onClick={clickable ? () => onActivate(item) : undefined}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        onKeyDown={clickable ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(item); } } : undefined}
        className={`flex items-start gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] ${
          clickable ? 'cursor-pointer hover:border-[var(--accent)] hover:shadow-lg hover:shadow-[var(--accent-glow)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]' : ''
        }`}
      >
        <span className="text-2xl leading-none shrink-0 mt-0.5" aria-hidden>{item.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <Chip tone={cat.tone}>{cat.label}</Chip>
            {team && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-1.5 py-0.5" style={{ background: `color-mix(in srgb, ${team.primaryColor} 18%, transparent)`, color: team.primaryColor }}>
                <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="xs" />
                {team.abbreviation}
              </span>
            )}
            <span className="ml-auto text-[10px] uppercase tracking-widest text-[var(--text-sec)] tabular-nums">S{season} · Day {Math.floor(item.day)}</span>
          </div>
          <p className="text-sm font-semibold leading-snug">{item.headline}</p>
        </div>
        {clickable && <span className="text-[var(--text-sec)] shrink-0 self-center">→</span>}
      </div>
    );
  };

  if (!grouped) {
    return (
      <>
        <div className="space-y-2">{items.map(renderCard)}</div>
        <PlayerModal playerId={modalPlayerId} onClose={() => setModalPlayerId(null)} />
      </>
    );
  }

  // Group by day (newest first), each under a day header.
  const byDay = new Map<number, FeedItem[]>();
  for (const item of items) {
    const d = Math.floor(item.day);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(item);
  }
  const days = [...byDay.keys()].sort((a, b) => b - a);

  return (
    <>
      <div className="space-y-4">
        {days.map(d => (
          <div key={d}>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-sec)] mb-1.5 px-1">Day {d}</div>
            <div className="space-y-2">{byDay.get(d)!.map(renderCard)}</div>
          </div>
        ))}
      </div>
      <PlayerModal playerId={modalPlayerId} onClose={() => setModalPlayerId(null)} />
    </>
  );
}
