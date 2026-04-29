'use client';

import { useRef, useEffect, useState } from 'react';
import Link from 'next/link';
import { useGameStore } from '@/lib/engine/store';
import { BoxScoreModal } from './BoxScoreModal';
import { PlayerModal } from './PlayerModal';
import { useSubscription } from '@/components/providers/SubscriptionProvider';
import { Button } from '@/components/ui/Button';
import { TeamLogo } from '@/components/ui/TeamLogo';
import type { GameResult } from '@/types';

/**
 * Horizontal scrollable game results ticker showing all the user's team games
 * with scores, colored green for wins, red for losses, neutral for unplayed.
 * Clicking a played game opens a box score modal.
 */
export function GameTicker({ onMenuToggle }: { onMenuToggle?: () => void } = {}) {
  const { schedule, teams, userTeamId, week, phase, playoffBracket } = useGameStore();
  const { user, tier, isFoundingMember, signOut } = useSubscription();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedGame, setSelectedGame] = useState<GameResult | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  // All games involving the user's team, sorted by week
  // Include playoff matchups as pseudo-GameResult entries
  const playoffGames: typeof schedule = (playoffBracket ?? [])
    .filter(m => m.homeTeamId && m.awayTeamId && (m.homeTeamId === userTeamId || m.awayTeamId === userTeamId))
    .map(m => ({
      id: m.id,
      week: 18 + m.round, // place after regular season (week 19-22)
      season: 0,
      homeTeamId: m.homeTeamId!,
      awayTeamId: m.awayTeamId!,
      homeScore: m.homeScore ?? 0,
      awayScore: m.awayScore ?? 0,
      played: !!m.winnerId,
      playerStats: {},
    }));

  const userGames = [
    ...schedule.filter(g => g.homeTeamId === userTeamId || g.awayTeamId === userTeamId),
    ...playoffGames,
  ].sort((a, b) => a.week - b.week);

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

  function getTeamSecondaryColor(id: string) {
    return teams.find(t => t.id === id)?.secondaryColor ?? '#fff';
  }

  function getTeamLogoUrl(id: string) {
    return teams.find(t => t.id === id)?.logoUrl;
  }

  return (
    <>
      <div className="border-b border-[var(--border)] bg-[var(--bg)] flex items-stretch relative">
        {/* Right edge fade to hint more content */}
        <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-[var(--bg)] to-transparent pointer-events-none z-10 sm:hidden" />
        {/* Mobile menu toggle — replaces the leftmost ticker slot so the
            dedicated TopBar hamburger row can collapse. */}
        {onMenuToggle && (
          <button
            onClick={onMenuToggle}
            aria-label="Toggle menu"
            className="md:hidden shrink-0 px-3 flex items-center justify-center border-r border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-colors"
          >
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="5" x2="17" y2="5" />
              <line x1="3" y1="10" x2="17" y2="10" />
              <line x1="3" y1="15" x2="17" y2="15" />
            </svg>
          </button>
        )}
        {/* Scrollable game ticker */}
        {/* W/L Legend */}
        <div className="hidden sm:flex items-center gap-2 text-xs text-[var(--text-sec)] pr-3 border-r border-[var(--border)] shrink-0 pl-3">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> W</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> L</span>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 flex overflow-x-auto no-scrollbar min-w-0 snap-x snap-mandatory sm:snap-none"
          style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
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
                bgClass = 'bg-green-100 ticker-win';
                result = 'W';
              } else if (userScore < oppScore) {
                bgClass = 'bg-red-100 ticker-loss';
                result = 'L';
              } else {
                bgClass = 'bg-amber-50 ticker-tie';
                result = 'T';
              }
            }

            const isCurrentWeek = phase === 'regular' && game.week === week && !game.played;
            const isUserGame = game.homeTeamId === userTeamId || game.awayTeamId === userTeamId;

            // Tooltip content
            const tooltipLine1 = `Week ${game.week}`;
            const tooltipLine2 = game.played
              ? `${getTeamAbbr(game.awayTeamId)} ${game.awayScore} - ${game.homeScore} ${getTeamAbbr(game.homeTeamId)}`
              : `${getTeamAbbr(game.awayTeamId)} @ ${getTeamAbbr(game.homeTeamId)}`;

            return (
              <div
                key={game.id}
                onClick={() => game.played && setSelectedGame(game)}
                className={`group relative flex-shrink-0 flex flex-col items-center px-2 py-1 border-r border-[var(--border)] last:border-r-0 snap-center ${isUserGame ? `${bgClass} font-bold` : `${bgClass} opacity-60`} ${isCurrentWeek ? 'ring-2 ring-[var(--accent)] bg-[var(--accent)]/5' : ''} ${game.played ? 'cursor-pointer hover:brightness-95 transition-all' : ''}`}
                style={{ minWidth: '72px' }}
                title={game.played ? `${result} ${userScore}-${oppScore} ${isHome ? 'vs' : '@'} ${getTeamAbbr(oppId)}` : `Week ${game.week} ${isHome ? 'vs' : '@'} ${getTeamAbbr(oppId)}`}
              >
                {/* Hover tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded bg-[var(--surface)] border border-[var(--border)] shadow-lg text-[10px] text-[var(--text)] whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                  <div className="font-bold">{tooltipLine1}</div>
                  <div className="text-[var(--text-sec)]">{tooltipLine2}</div>
                </div>
                {/* W/L letter overlay — only on user-team played games */}
                {game.played && isUserGame && result && (
                  <div className={`absolute top-0 right-0 text-[8px] font-black px-0.5 rounded-bl ${
                    result === 'W' ? 'text-green-700 bg-green-200' : result === 'L' ? 'text-red-700 bg-red-200' : 'text-amber-700 bg-amber-200'
                  }`}>
                    {result}
                  </div>
                )}
                {/* Away team row */}
                {(() => {
                  const awayWon = game.played && game.awayScore > game.homeScore;
                  return (
                    <div className={`flex items-center gap-1 w-full justify-between ${game.played && !awayWon ? 'opacity-50' : ''}`}>
                      <div className="flex items-center gap-1">
                        <TeamLogo
                          abbreviation={getTeamAbbr(game.awayTeamId)}
                          primaryColor={getTeamColor(game.awayTeamId)}
                          secondaryColor={getTeamSecondaryColor(game.awayTeamId)}
                          logoUrl={getTeamLogoUrl(game.awayTeamId)}
                          size="xs"
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
                        <TeamLogo
                          abbreviation={getTeamAbbr(game.homeTeamId)}
                          primaryColor={getTeamColor(game.homeTeamId)}
                          secondaryColor={getTeamSecondaryColor(game.homeTeamId)}
                          logoUrl={getTeamLogoUrl(game.homeTeamId)}
                          size="xs"
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

        {/* W/L legend */}
        <div className="hidden sm:flex items-center gap-1.5 px-2 border-l border-[var(--border)] shrink-0">
          <span className="w-2 h-2 rounded-full bg-green-400" /><span className="text-[9px] text-[var(--text-sec)]">W</span>
          <span className="w-2 h-2 rounded-full bg-red-400" /><span className="text-[9px] text-[var(--text-sec)]">L</span>
        </div>

        {/* Auth: Sign In or user pill — pinned to top-right */}
        <div className="flex items-center gap-2 px-2 sm:px-3 border-l border-[var(--border)] shrink-0">
          {user ? (
            <>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[9px] font-bold">
                  {user.email?.[0]?.toUpperCase() ?? '?'}
                </div>
                {isFoundingMember ? (
                  <span className="hidden sm:inline text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    ⭐ Founder
                  </span>
                ) : (
                  <span className={`hidden sm:inline text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                    tier === 'premium' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {tier === 'premium' ? 'Premium' : 'Free'}
                  </span>
                )}
              </div>
              <button
                onClick={signOut}
                className="hidden sm:inline text-[9px] text-[var(--text-sec)] hover:text-[var(--text)] transition-colors whitespace-nowrap"
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
