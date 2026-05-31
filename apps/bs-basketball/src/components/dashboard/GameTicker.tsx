'use client';

import Link from 'next/link';
import { useRef, useEffect, useMemo } from 'react';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { TeamLogo } from '@/components/ui/TeamLogo';
import type { BaseGameResult } from '@bs/core/adapter';
import type { BasketballStats, BasketballTeam } from '@bs/sport-basketball';

/**
 * Horizontal, scrollable strip of every game on the user team's schedule
 * (Tier 1.3). Wins are green, losses red, unplayed neutral; the current day is
 * ringed. Auto-scrolls to the next game; played games link to the box score.
 *
 * Two variants:
 *   - 'card' (default): self-contained card with a "Your Schedule" header.
 *   - 'bare': just the cell strip, sized to fill its container — used in the
 *     top bar. When there's no schedule to show, renders `fallback` instead of
 *     nothing so the top bar can fall back to the phase label.
 */
export function GameTicker({
  variant = 'card',
  fallback = null,
}: {
  variant?: 'card' | 'bare';
  fallback?: React.ReactNode;
} = {}) {
  const { league } = useLeagueStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  const userId = league?.userTeamId ?? null;
  const teamById = useMemo(() => {
    const m = new Map<string, BasketballTeam>();
    if (league) for (const t of league.teams) m.set(t.id, t as BasketballTeam);
    return m;
  }, [league]);

  const games = useMemo(() => {
    if (!league || !userId) return [];
    const day = (g: BaseGameResult<BasketballStats>) =>
      (g.sportData as { dayOfSeason?: number } | undefined)?.dayOfSeason ?? 0;
    return league.games
      .filter(g => g.homeTeamId === userId || g.awayTeamId === userId)
      .sort((a, b) => day(a) - day(b));
  }, [league, userId]);

  // Auto-scroll to the next unplayed game (or the end if the season's done).
  useEffect(() => {
    if (!scrollRef.current) return;
    const idx = games.findIndex(g => g.status !== 'played');
    const target = idx > 0 ? idx - 1 : idx >= 0 ? idx : games.length - 1;
    const child = scrollRef.current.children[target] as HTMLElement | undefined;
    child?.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
  }, [games]);

  if (!league || !userId || games.length === 0) return <>{fallback}</>;
  const currentDay = league.currentTick;
  const bare = variant === 'bare';

  const cells = games.map(g => {
    const isHome = g.homeTeamId === userId;
    const oppId = isHome ? g.awayTeamId : g.homeTeamId;
    const opp = teamById.get(oppId);
    const played = g.status === 'played' && !!g.finalScore;
    const day = (g.sportData as { dayOfSeason?: number; isPlayoff?: boolean } | undefined);
    const isPlayoff = !!day?.isPlayoff;
    const userScore = played ? (isHome ? g.finalScore!.home : g.finalScore!.away) : 0;
    const oppScore = played ? (isHome ? g.finalScore!.away : g.finalScore!.home) : 0;
    const won = played && userScore > oppScore;
    const isCurrent = !played && (day?.dayOfSeason ?? 0) >= currentDay;

    const bg = played
      ? won ? 'color-mix(in srgb, #10b981 14%, var(--surface))' : 'color-mix(in srgb, #dc2626 12%, var(--surface))'
      : 'var(--surface)';

    const inner = (
      <div
        className={`shrink-0 flex flex-col items-center justify-center border-r text-center ${bare ? 'h-full px-2.5 py-1' : 'px-2 py-1.5'}`}
        style={{
          minWidth: bare ? '72px' : '76px',
          borderColor: 'var(--border)',
          background: bg,
          boxShadow: isCurrent ? 'inset 0 0 0 2px var(--accent)' : undefined,
        }}
      >
        <div className="flex items-center gap-1 text-[10px] text-[var(--text-sec)] leading-none">
          <span>{isHome ? 'vs' : '@'}</span>
          {opp && <TeamLogo abbreviation={opp.abbreviation} primaryColor={opp.primaryColor} secondaryColor={opp.secondaryColor} size="xs" />}
        </div>
        <div className="text-xs font-bold mt-0.5 leading-none">{opp?.abbreviation ?? '—'}</div>
        {played ? (
          <div className="text-[11px] font-black tabular-nums mt-0.5" style={{ color: won ? '#10b981' : '#dc2626' }}>
            {won ? 'W' : 'L'} {userScore}-{oppScore}
          </div>
        ) : (
          <div className="text-[10px] text-[var(--text-sec)] mt-0.5">{isPlayoff ? 'PO' : `D${day?.dayOfSeason ?? ''}`}</div>
        )}
      </div>
    );

    return played
      ? <Link key={g.id} href={`/game/${g.id}`}>{inner}</Link>
      : <div key={g.id}>{inner}</div>;
  });

  if (bare) {
    return (
      <div ref={scrollRef} className="flex items-stretch h-full overflow-x-auto no-scrollbar" style={{ scrollbarWidth: 'none' }}>
        {cells}
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
        <span className="text-xs font-bold uppercase tracking-widest opacity-70">Your Schedule</span>
        <span className="flex items-center gap-2 text-[10px] text-[var(--text-sec)]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> W</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> L</span>
        </span>
      </div>
      <div ref={scrollRef} className="flex overflow-x-auto no-scrollbar" style={{ scrollbarWidth: 'none' }}>
        {cells}
      </div>
    </div>
  );
}
