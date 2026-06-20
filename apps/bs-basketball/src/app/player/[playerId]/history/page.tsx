'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { EmptyState } from '@/components/ui/EmptyState';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';

/**
 * /player/[id]/history — year-by-year ratings + production (Phase 2E-1),
 * read from the seasonLog snapshots captured at each rollover.
 */
export default function PlayerHistoryPage() {
  const params = useParams<{ playerId: string }>();
  const { league, loading, error } = useLeagueOrHydrate();

  const player = useMemo<BasketballPlayer | null>(() => {
    if (!league) return null;
    return ((league.players as Record<string, BasketballPlayer>)[params.playerId]) ?? null;
  }, [league, params.playerId]);

  const team = useMemo<BasketballTeam | null>(() => {
    if (!league || !player?.rosterSlot) return null;
    return (league.teams.find(t => t.id === player.rosterSlot!.teamId) as BasketballTeam | undefined) ?? null;
  }, [league, player]);

  if (loading) return <Loading />;
  if (!league) return <NotFound message={error ?? 'No league loaded.'} />;
  if (!player) return <NotFound message="Player not found." />;

  const log = player.sportData.seasonLog ?? [];
  const career = player.careerStats;
  const careerGames = career.gamesPlayed || 0;

  return (
    <main className="max-w-3xl mx-auto p-8">
      <Link href={`/player/${player.id}`} className="text-sm font-semibold opacity-70 hover:opacity-100">
        ← {player.firstName} {player.lastName}
      </Link>
      <header className="flex items-center gap-3 mt-2 mb-6">
        <PlayerAvatar firstName={player.firstName} lastName={player.lastName} primaryColor={team?.primaryColor ?? '#444'} secondaryColor={team?.secondaryColor ?? '#fff'} photoUrl={player.sportData.photoUrl} size="lg" />
        <h1 className="text-3xl font-extrabold" style={{ color: 'var(--accent)' }}>Career History</h1>
      </header>

      {log.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <EmptyState icon="📈" title="No seasons logged yet" message="Year-by-year history appears after the player finishes a season and the league rolls forward." />
        </div>
      ) : (
        <div className="rounded-xl border bg-[var(--surface)] overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm">
            <thead className="text-xs opacity-70">
              <tr>
                <th className="px-3 py-2 text-left">Season</th>
                <th className="px-3 py-2 text-right">Age</th>
                <th className="px-3 py-2 text-right">OVR</th>
                <th className="px-3 py-2 text-right">GP</th>
                <th className="px-3 py-2 text-right">PPG</th>
                <th className="px-3 py-2 text-right">RPG</th>
                <th className="px-3 py-2 text-right">APG</th>
              </tr>
            </thead>
            <tbody>
              {[...log].sort((a, b) => b.season - a.season).map(e => (
                <tr key={e.season} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-3 py-1.5 font-semibold">{e.season}</td>
                  <td className="px-3 py-1.5 text-right">{e.age}</td>
                  <td className="px-3 py-1.5 text-right font-bold" style={{ color: 'var(--accent)' }}>{e.overall}</td>
                  <td className="px-3 py-1.5 text-right">{e.gamesPlayed}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{e.ppg.toFixed(1)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{e.rpg.toFixed(1)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{e.apg.toFixed(1)}</td>
                </tr>
              ))}
              {careerGames > 0 && (
                <tr className="border-t-2" style={{ borderColor: 'var(--accent)' }}>
                  <td className="px-3 py-1.5 font-bold">Career</td>
                  <td className="px-3 py-1.5" />
                  <td className="px-3 py-1.5" />
                  <td className="px-3 py-1.5 text-right font-semibold">{careerGames}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{(career.points / careerGames).toFixed(1)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{(career.totalRebounds / careerGames).toFixed(1)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{(career.assists / careerGames).toFixed(1)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function Loading() {
  return <main className="max-w-3xl mx-auto p-8"><p className="opacity-60">Loading…</p></main>;
}

function NotFound({ message }: { message: string }) {
  return (
    <main className="max-w-3xl mx-auto p-8">
      <p className="mb-4">{message}</p>
      <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>← Home</Link>
    </main>
  );
}
