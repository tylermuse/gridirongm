'use client';

import { useRef, useEffect } from 'react';
import { useGameStore } from '@/lib/engine/store';

/**
 * Horizontal scrollable game results ticker showing all the user's team games
 * with scores, colored green for wins, red for losses, neutral for unplayed.
 * Similar to play.football-gm.com's top bar.
 */
export function GameTicker() {
  const { schedule, teams, userTeamId, week, phase } = useGameStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // All games involving the user's team, sorted by week
  const userGames = schedule
    .filter(g => g.homeTeamId === userTeamId || g.awayTeamId === userTeamId)
    .sort((a, b) => a.week - b.week);

  // Auto-scroll to current/most recent game
  useEffect(() => {
    if (!scrollRef.current) return;
    const currentIdx = userGames.findIndex(g => !g.played);
    const scrollToIdx = currentIdx > 0 ? currentIdx - 1 : currentIdx >= 0 ? currentIdx : userGames.length - 1;
    const child = scrollRef.current.children[scrollToIdx] as HTMLElement | undefined;
    if (child) {
      child.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
    }
  }, [week, phase, userGames.length]);

  if (userGames.length === 0) return null;

  function getTeamAbbr(id: string) {
    return teams.find(t => t.id === id)?.abbreviation ?? '???';
  }

  function getTeamColor(id: string) {
    return teams.find(t => t.id === id)?.primaryColor ?? '#666';
  }

  return (
    <div className="border-b border-[var(--border)] bg-[var(--bg)]">
      <div
        ref={scrollRef}
        className="flex overflow-x-auto no-scrollbar"
        style={{ scrollbarWidth: 'none' }}
      >
        {userGames.map((game) => {
          const isHome = game.homeTeamId === userTeamId;
          const oppId = isHome ? game.awayTeamId : game.homeTeamId;
          const userScore = isHome ? game.homeScore : game.awayScore;
          const oppScore = isHome ? game.awayScore : game.homeScore;

          let bgClass = 'bg-[var(--surface)]'; // unplayed
          let result = '';
          if (game.played) {
            if (userScore > oppScore) {
              bgClass = 'bg-green-900/30';
              result = 'W';
            } else if (userScore < oppScore) {
              bgClass = 'bg-red-900/30';
              result = 'L';
            } else {
              bgClass = 'bg-amber-900/30';
              result = 'T';
            }
          }

          const isCurrentWeek = phase === 'regular' && game.week === week && !game.played;

          return (
            <div
              key={game.id}
              className={`flex-shrink-0 flex flex-col items-center px-2 py-1 border-r border-[var(--border)] last:border-r-0 ${bgClass} ${isCurrentWeek ? 'ring-1 ring-inset ring-blue-500' : ''}`}
              style={{ minWidth: '72px' }}
            >
              {/* Away team row */}
              <div className="flex items-center gap-1 w-full justify-between">
                <div className="flex items-center gap-1">
                  <div
                    className="w-3 h-3 rounded-sm flex items-center justify-center"
                    style={{ backgroundColor: getTeamColor(game.awayTeamId) }}
                  />
                  <span className={`text-[10px] font-bold ${game.awayTeamId === userTeamId ? 'text-blue-400' : ''}`}>
                    {getTeamAbbr(game.awayTeamId)}
                  </span>
                </div>
                <span className="text-[10px] font-mono font-bold">
                  {game.played ? game.awayScore : ''}
                </span>
              </div>
              {/* Home team row */}
              <div className="flex items-center gap-1 w-full justify-between">
                <div className="flex items-center gap-1">
                  <div
                    className="w-3 h-3 rounded-sm flex items-center justify-center"
                    style={{ backgroundColor: getTeamColor(game.homeTeamId) }}
                  />
                  <span className={`text-[10px] font-bold ${game.homeTeamId === userTeamId ? 'text-blue-400' : ''}`}>
                    {getTeamAbbr(game.homeTeamId)}
                  </span>
                </div>
                <span className="text-[10px] font-mono font-bold">
                  {game.played ? game.homeScore : ''}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
