'use client';

import Link from 'next/link';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { nextMatchup } from '@/lib/dashboard/summary';
import type { BasketballTeam } from '@bs/sport-basketball';
import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

/**
 * Next-matchup card (P0.4). Shows the team's upcoming game (or its most recent
 * result when the slate is done), with a Box Score / Watch link.
 */
export function NextMatchupCard({
  league, team, onWatchLive, onGamePlan, loading, className = 'mb-6',
}: {
  league: LeagueState;
  team: BasketballTeam;
  onWatchLive?: () => void;
  onGamePlan?: () => void;
  loading?: boolean;
  className?: string;
}) {
  const m = nextMatchup(league, team.id);
  if (!m || !m.opponent) return null;

  const opp = m.opponent;
  const score = m.played && m.game.finalScore
    ? (m.isHome
        ? { us: m.game.finalScore.home, them: m.game.finalScore.away }
        : { us: m.game.finalScore.away, them: m.game.finalScore.home })
    : null;
  const won = score ? score.us > score.them : false;

  // Football's next-game card: a soft accent gradient, the opponent's logo at
  // full size, the matchup in a heavy headline and one big Watch Live button.
  return (
    <div
      className={`rounded-xl border overflow-hidden ${className}`}
      style={{
        borderColor: 'color-mix(in srgb, var(--accent) 30%, var(--border))',
        background: 'linear-gradient(to right, var(--surface), color-mix(in srgb, var(--accent) 7%, var(--surface)))',
      }}
    >
      <div className="p-4 sm:p-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <TeamLogo abbreviation={opp.abbreviation} primaryColor={opp.primaryColor} secondaryColor={opp.secondaryColor} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-wider font-medium text-[var(--text-sec)]">
                {m.played ? 'Last game' : 'Next game'}
                {m.dayOfSeason != null ? ` · Day ${m.dayOfSeason}` : ''} · {m.isHome ? 'Home' : 'Away'}
              </span>
              {onGamePlan && (
                <button onClick={onGamePlan} className="text-[10px] font-bold rounded px-1.5 py-0.5 border hover:bg-[var(--surface-2)] transition-colors" style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}>
                  📋 Game Plan
                </button>
              )}
            </div>
            <div className="text-lg font-black mt-0.5 leading-tight truncate">
              {m.isHome ? 'vs' : '@'} {opp.city} {opp.name}
            </div>
            <div className="text-sm text-[var(--text-sec)] font-medium tabular-nums">{opp.record.wins}–{opp.record.losses}</div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          {score && (
            <div className="text-lg font-black tabular-nums" style={{ color: won ? '#10b981' : '#dc2626' }}>
              {won ? 'W' : 'L'} {score.us}–{score.them}
            </div>
          )}
          {m.played ? (
            <Link href={`/game/${m.game.id}`} className="rounded-lg px-4 sm:px-6 py-2.5 text-sm sm:text-base font-bold text-white active:scale-95 transition-all hover:brightness-110" style={{ background: 'var(--accent)' }}>
              Box Score →
            </Link>
          ) : (
            <button
              onClick={onWatchLive}
              disabled={loading}
              className="rounded-lg px-4 sm:px-6 py-2.5 text-sm sm:text-base font-bold text-white active:scale-95 transition-all hover:brightness-110 disabled:opacity-60"
              style={{ background: 'var(--accent)' }}
            >
              {loading ? 'Loading…' : '▶ Watch Live'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
