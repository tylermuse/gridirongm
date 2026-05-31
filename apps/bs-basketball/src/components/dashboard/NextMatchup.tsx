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
  league, team, onWatchLive, onGamePlan, loading,
}: {
  league: LeagueState;
  team: BasketballTeam;
  onWatchLive?: () => void;
  onGamePlan?: () => void;
  loading?: boolean;
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

  return (
    <div className="rounded-xl border bg-[var(--surface)] p-4 mb-6" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest opacity-60">
              {m.played ? 'Last game' : 'Next game'}
              {m.dayOfSeason != null ? ` · Day ${m.dayOfSeason}` : ''} · {m.isHome ? 'Home' : 'Away'}
            </span>
            {onGamePlan && (
              <button onClick={onGamePlan} className="text-[10px] font-bold rounded px-1.5 py-0.5 border hover:bg-[var(--surface-2)]" style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}>
                📋 Game Plan
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <TeamLogo abbreviation={opp.abbreviation} primaryColor={opp.primaryColor} secondaryColor={opp.secondaryColor} size="md" />
            <div className="min-w-0">
              <div className="font-bold leading-tight truncate">
                {m.isHome ? 'vs' : '@'} {opp.city} {opp.name}
              </div>
              <div className="text-xs text-[var(--text-sec)] tabular-nums">{opp.record.wins}–{opp.record.losses}</div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          {score && (
            <div className="text-lg font-black tabular-nums" style={{ color: won ? '#10b981' : '#dc2626' }}>
              {won ? 'W' : 'L'} {score.us}–{score.them}
            </div>
          )}
          {m.played ? (
            <Link href={`/game/${m.game.id}`} className="rounded-lg px-3 py-1.5 text-sm font-bold text-white active:scale-95" style={{ background: 'var(--accent)' }}>
              Box Score →
            </Link>
          ) : (
            <button
              onClick={onWatchLive}
              disabled={loading}
              className="rounded-lg px-3 py-1.5 text-sm font-bold text-white active:scale-95 disabled:opacity-60"
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
