'use client';

import { useRef, useEffect, useState } from 'react';
import Link from 'next/link';
import { useGameStore } from '@/lib/engine/store';
import { BoxScoreModal } from './BoxScoreModal';
import { PlayerModal } from './PlayerModal';
import { useSubscription } from '@/components/providers/SubscriptionProvider';
import { Button } from '@/components/ui/Button';
import type { GameResult } from '@/types';

/**
 * Horizontal scrollable game results ticker showing all the user's team games
 * with scores, colored green for wins, red for losses, neutral for unplayed.
 * Clicking a played game opens a box score modal.
 */
export function GameTicker() {
  const { schedule, teams, userTeamId, week, phase } = useGameStore();
  const { user, tier, signOut } = useSubscription();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedGame, setSelectedGame] = useState<GameResult | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

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

  function getTeamAbbr(id: string) {
    return teams.find(t => t.id === id)?.abbreviation ?? '???';
  }

  function getTeamColor(id: string) {
    return teams.find(t => t.id === id)?.primaryColor ?? '#666';
  }

  return (
    <>
      <div className="border-b border-[var(--border)] bg-[var(--bg)] flex items-stretch">
        {/* Scrollable game ticker */}
        <div
          ref={scrollRef}
          className="flex-1 flex overflow-x-auto no-scrollbar min-w-0"
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
                bgClass = 'bg-green-50';
                result = 'W';
              } else if (userScore < oppScore) {
                bgClass = 'bg-red-50';
                result = 'L';
              } else {
                bgClass = 'bg-amber-50';
                result = 'T';
              }
            }

            const isCurrentWeek = phase === 'regular' && game.week === week && !game.played;

            return (
              <div
                key={game.id}
                onClick={() => game.played && setSelectedGame(game)}
                className={`flex-shrink-0 flex flex-col items-center px-2 py-1 border-r border-[var(--border)] last:border-r-0 ${bgClass} ${isCurrentWeek ? 'ring-1 ring-inset ring-blue-500' : ''} ${game.played ? 'cursor-pointer hover:brightness-95 transition-all' : ''}`}
                style={{ minWidth: '72px' }}
              >
                {/* Away team row */}
                {(() => {
                  const awayWon = game.played && game.awayScore > game.homeScore;
                  return (
                    <div className={`flex items-center gap-1 w-full justify-between ${game.played && !awayWon ? 'opacity-50' : ''}`}>
                      <div className="flex items-center gap-1">
                        <div
                          className="w-3 h-3 rounded-sm flex items-center justify-center"
                          style={{ backgroundColor: getTeamColor(game.awayTeamId) }}
                        />
                        <span className={`text-[10px] font-bold ${game.awayTeamId === userTeamId ? 'text-blue-600' : ''} ${awayWon ? 'text-[var(--text)]' : ''}`}>
                          {getTeamAbbr(game.awayTeamId)}
                        </span>
                      </div>
                      <span className={`text-[10px] font-mono font-bold ${awayWon ? 'text-[var(--text)]' : ''}`}>
                        {game.played ? game.awayScore : ''}
                      </span>
                    </div>
                  );
                })()}
                {/* Home team row */}
                {(() => {
                  const homeWon = game.played && game.homeScore > game.awayScore;
                  return (
                    <div className={`flex items-center gap-1 w-full justify-between ${game.played && !homeWon ? 'opacity-50' : ''}`}>
                      <div className="flex items-center gap-1">
                        <div
                          className="w-3 h-3 rounded-sm flex items-center justify-center"
                          style={{ backgroundColor: getTeamColor(game.homeTeamId) }}
                        />
                        <span className={`text-[10px] font-bold ${game.homeTeamId === userTeamId ? 'text-blue-600' : ''} ${homeWon ? 'text-[var(--text)]' : ''}`}>
                          {getTeamAbbr(game.homeTeamId)}
                        </span>
                      </div>
                      <span className={`text-[10px] font-mono font-bold ${homeWon ? 'text-[var(--text)]' : ''}`}>
                        {game.played ? game.homeScore : ''}
                      </span>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>

        {/* Auth: Sign In or user pill — pinned to top-right */}
        <div className="flex items-center gap-2 px-3 border-l border-[var(--border)] shrink-0">
          {user ? (
            <>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[9px] font-bold">
                  {user.email?.[0]?.toUpperCase() ?? '?'}
                </div>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                  tier === 'elite' ? 'bg-amber-100 text-amber-700' :
                  tier === 'pro' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {tier === 'elite' ? 'Elite' : tier === 'pro' ? 'Pro' : 'Free'}
                </span>
              </div>
              <button
                onClick={signOut}
                className="text-[9px] text-[var(--text-sec)] hover:text-[var(--text)] transition-colors whitespace-nowrap"
              >
                Sign Out
              </button>
            </>
          ) : (
            <Link href="/login">
              <Button size="sm" variant="secondary" className="text-[10px] px-2 py-1 h-auto">Sign In</Button>
            </Link>
          )}
        </div>
      </div>

      {/* Box Score Modal */}
      <BoxScoreModal
        game={selectedGame}
        onClose={() => setSelectedGame(null)}
        onPlayerClick={(id) => {
          setSelectedGame(null);
          setSelectedPlayerId(id);
        }}
      />

      {/* Player Modal (when clicking a player in the box score) */}
      <PlayerModal
        playerId={selectedPlayerId}
        onClose={() => setSelectedPlayerId(null)}
      />
    </>
  );
}
