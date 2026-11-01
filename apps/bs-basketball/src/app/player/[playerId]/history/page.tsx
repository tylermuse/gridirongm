'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { effPerGame } from '@/components/modals/PlayerCardSections';
import { ratingHex } from '@/lib/ui/ratingColor';
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
  // OVR change vs the previous logged season (oldest → newest), then shown
  // newest first.
  const ascending = [...log].sort((a, b) => a.season - b.season);
  const rows = ascending
    .map((e, i) => ({ ...e, ovrDelta: i > 0 ? e.overall - ascending[i - 1].overall : null }))
    .reverse();
  const showPer = log.some(e => typeof e.per === 'number');

  return (
    <main className="max-w-3xl mx-auto p-3 sm:p-5 md:p-8">
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
                <th className="px-3 py-2 text-right" title="Change vs the previous season">OVR Δ</th>
                <th className="px-3 py-2 text-right">GP</th>
                <th className="px-3 py-2 text-right">PPG</th>
                <th className="px-3 py-2 text-right">RPG</th>
                <th className="px-3 py-2 text-right">APG</th>
                {showPer && <th className="px-3 py-2 text-right" title="Per-game efficiency">PER</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(e => (
                <tr key={e.season} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-3 py-1.5 font-semibold">{e.season}</td>
                  <td className="px-3 py-1.5 text-right">{e.age}</td>
                  <td className="px-3 py-1.5 text-right font-bold tabular-nums" style={{ color: ratingHex(e.overall) }}>{e.overall}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {e.ovrDelta === null || e.ovrDelta === 0 ? (
                      <span className="text-[var(--text-sec)]">—</span>
                    ) : (
                      <span className={`font-semibold ${e.ovrDelta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {e.ovrDelta > 0 ? '+' : ''}{e.ovrDelta}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right">{e.gamesPlayed}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{e.ppg.toFixed(1)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{e.rpg.toFixed(1)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{e.apg.toFixed(1)}</td>
                  {showPer && (
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {typeof e.per === 'number' ? e.per.toFixed(1) : '—'}
                    </td>
                  )}
                </tr>
              ))}
              {careerGames > 0 && (
                <tr className="border-t-2" style={{ borderColor: 'var(--accent)' }}>
                  <td className="px-3 py-1.5 font-bold">Career</td>
                  <td className="px-3 py-1.5" />
                  <td className="px-3 py-1.5" />
                  <td className="px-3 py-1.5" />
                  <td className="px-3 py-1.5 text-right font-semibold">{careerGames}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{(career.points / careerGames).toFixed(1)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{(career.totalRebounds / careerGames).toFixed(1)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{(career.assists / careerGames).toFixed(1)}</td>
                  {showPer && (
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{effPerGame(career).toFixed(1)}</td>
                  )}
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
  return <main className="max-w-3xl mx-auto p-3 sm:p-5 md:p-8"><p className="opacity-60">Loading…</p></main>;
}

function NotFound({ message }: { message: string }) {
  return (
    <main className="max-w-3xl mx-auto p-3 sm:p-5 md:p-8">
      <p className="mb-4">{message}</p>
      <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>← Home</Link>
    </main>
  );
}
