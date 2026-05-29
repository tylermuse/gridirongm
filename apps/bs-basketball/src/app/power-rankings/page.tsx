'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import type { BasketballTeam } from '@bs/sport-basketball';

/**
 * /power-rankings — all 30 teams ranked by a derived power score.
 *
 * powerScore = winPct*100 + pointDiff/10 + recentForm*2. Each card carries
 * auto-generated commentary tailored to the team's stat signature. The user's
 * team is highlighted with an accent border.
 */

interface TeamSportData { conference: string; division: string }

function powerScore(team: BasketballTeam): number {
  const games = team.record.wins + team.record.losses;
  const winPct = games > 0 ? team.record.wins / games : 0.5;
  const pointDiff = team.record.pointsFor - team.record.pointsAgainst;
  const recentForm = team.record.streak.slice(-5).filter(c => c === 'W').length;
  return winPct * 100 + pointDiff / 10 + recentForm * 2;
}

function commentary(team: BasketballTeam): string {
  const games = team.record.wins + team.record.losses;
  if (games === 0) return 'Yet to tip off the season.';
  const pdPerGame = (team.record.pointsFor - team.record.pointsAgainst) / games;
  const winPct = team.record.wins / games;
  const last6 = team.record.streak.slice(-6);
  const wins6 = last6.filter(c => c === 'W').length;
  const losses6 = last6.length - wins6;

  if (wins6 >= 5) return `Hot streak — ${wins6}-${losses6} over the last ${last6.length}.`;
  if (last6.length >= 5 && wins6 <= 1) return `Ice cold — ${wins6}-${losses6} over the last ${last6.length}.`;
  if (pdPerGame >= 6) return `Outscoring opponents by ${pdPerGame.toFixed(1)}/game.`;
  if (pdPerGame <= -6) return `Outscored by ${(-pdPerGame).toFixed(1)}/game.`;
  if (winPct >= 0.65) return 'Among the league’s elite.';
  if (winPct <= 0.35) return 'Lottery-bound trajectory.';
  return 'Holding steady in the pack.';
}

export default function PowerRankingsPage() {
  const { league, loading, error } = useLeagueOrHydrate();

  const ranked = useMemo(() => {
    if (!league) return [] as { team: BasketballTeam; score: number }[];
    return (league.teams as BasketballTeam[])
      .map(team => ({ team, score: powerScore(team) }))
      .sort((a, b) => b.score - a.score);
  }, [league]);

  if (loading) return <main className="max-w-3xl mx-auto p-8"><p className="opacity-60">Loading…</p></main>;
  if (!league) {
    return (
      <main className="max-w-3xl mx-auto p-8">
        <p className="mb-4">{error ?? 'No league loaded.'}</p>
        <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>← Home</Link>
      </main>
    );
  }

  const gamesPlayed = league.games.filter(g => g.status === 'played').length;

  return (
    <main className="max-w-3xl mx-auto p-5 sm:p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">← Home</Link>
      <header className="flex flex-wrap items-baseline gap-3 mt-2 mb-6">
        <h1 className="text-3xl sm:text-4xl font-extrabold" style={{ color: 'var(--accent)' }}>
          Power Rankings
        </h1>
        <span className="text-sm text-[var(--text-sec)]">
          Season {league.currentSeason} · Day {league.currentTick}
        </span>
      </header>

      {gamesPlayed === 0 && (
        <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <EmptyState
            icon="📊"
            title="Rankings update once games are played"
            message="It’s preseason — every team starts level. Sim some games to see the board move."
          />
        </div>
      )}

      <ol className="space-y-2">
        {ranked.map(({ team, score }, i) => {
          const sd = team.sportData as TeamSportData;
          const isUser = league.userTeamId === team.id;
          return (
            <li key={team.id}>
              <Link
                href={`/team/${team.id}`}
                className={`flex items-center gap-4 p-3 rounded-xl border bg-[var(--surface)] transition-all hover:shadow-lg hover:shadow-[var(--accent-glow)] ${
                  isUser ? 'border-[var(--accent)] border-2' : 'border-[var(--border)] hover:border-[var(--accent)]'
                }`}
              >
                <div
                  className="w-9 text-center text-3xl font-black shrink-0"
                  style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}
                >
                  {i + 1}
                </div>
                <TeamLogo
                  abbreviation={team.abbreviation}
                  primaryColor={team.primaryColor}
                  secondaryColor={team.secondaryColor}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-bold truncate flex items-center gap-2">
                    {team.city} {team.name}
                    {isUser && <Badge variant="orange" size="sm">You</Badge>}
                  </div>
                  <div className="text-xs text-[var(--text-sec)] truncate">
                    {sd.conference} · {commentary(team)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-sm font-semibold tabular-nums">{score.toFixed(1)}</div>
                  <div className="text-xs text-[var(--text-sec)]">{team.record.wins}–{team.record.losses}</div>
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
