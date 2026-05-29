'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import {
  basketballUiMetadata,
  type BasketballPlayer,
  type BasketballRatings,
  type BasketballTeam,
} from '@bs/sport-basketball';

/**
 * /player/[playerId] — full player card.
 *
 * Reads basketballUiMetadata.ratingFields to lay out every rating by group
 * (Shooting / Playmaking / Defense / Athletic / Mental). Each rating gets a
 * color-coded bar so the eye can scan strengths quickly.
 */

export default function PlayerPage() {
  const params = useParams<{ playerId: string }>();
  const { league, loading, error } = useLeagueOrHydrate();

  const player: BasketballPlayer | null = useMemo(() => {
    if (!league) return null;
    const map = league.players as Record<string, BasketballPlayer>;
    return map[params.playerId] ?? null;
  }, [league, params.playerId]);

  const team: BasketballTeam | null = useMemo(() => {
    if (!league || !player?.rosterSlot) return null;
    return (league.teams.find(t => t.id === player.rosterSlot!.teamId) as BasketballTeam | undefined) ?? null;
  }, [league, player]);

  if (loading) return <Loading />;
  if (!league) return <NotFound message={error ?? 'No league loaded.'} backHref="/" backLabel="Home" />;
  if (!player) return <NotFound message="Player not found." backHref="/league" backLabel="League" />;

  // Group ratings by category as declared in basketballUiMetadata
  const grouped = new Map<string, { key: string; label: string }[]>();
  for (const f of basketballUiMetadata.ratingFields) {
    const group = f.group;
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)!.push({ key: String(f.key), label: f.label });
  }

  return (
    <main className="max-w-4xl mx-auto p-8">
      {team && (
        <Link href={`/team/${team.id}`} className="text-sm font-semibold opacity-70 hover:opacity-100">
          ← {team.city} {team.name}
        </Link>
      )}

      <header className="flex flex-wrap items-center gap-4 mt-2 mb-6">
        <div>
          <h1 className="text-4xl font-extrabold">{player.firstName} {player.lastName}</h1>
          <p className="text-sm opacity-70">
            {player.sportData.position} · Age {player.age}
            {team && ` · ${team.city} ${team.name}`}
            {' · '}<span className="capitalize">{player.sportData.starTier}</span>
            {player.sportData.yearsInLeague > 0 ? ` · Yr ${player.sportData.yearsInLeague}` : ' · Rookie'}
          </p>
        </div>
        <div
          className="ml-auto text-5xl font-extrabold px-4 py-1 rounded-lg"
          style={{
            background: 'var(--accent)',
            color: '#fff',
          }}
          title="Overall rating"
        >
          {player.ratings.overall}
        </div>
      </header>

      {/* Physical / basics row */}
      <section className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-6">
        <Stat label="Height" value={`${Math.floor(player.ratings.height / 12)}'${player.ratings.height % 12}"`} />
        <Stat label="Wingspan" value={`${player.ratings.wingspan}"`} />
        <Stat label="Potential" value={player.development.potential} />
        <Stat label="Trajectory" value={player.development.currentTrajectory} />
        <Stat label="Hand" value={player.sportData.shootingHand} />
        <Stat label="Two-way" value={player.sportData.isTwoWay ? 'Yes' : 'No'} />
      </section>

      {/* Ratings grouped */}
      <section className="grid sm:grid-cols-2 gap-6">
        {[...grouped.entries()].map(([group, fields]) => (
          <div
            key={group}
            className="p-4 rounded border"
            style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}
          >
            <h2 className="text-sm font-bold uppercase tracking-wide mb-3 opacity-70">{group}</h2>
            <ul className="space-y-2">
              {fields.map(f => {
                const v = (player.ratings as unknown as Record<string, number>)[f.key];
                if (typeof v !== 'number') return null;
                return (
                  <li key={f.key} className="flex items-center gap-3">
                    <span className="w-12 text-xs opacity-60">{f.label}</span>
                    <div className="flex-1 h-2 rounded-full" style={{ background: 'var(--border)' }}>
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${v}%`,
                          background: ratingColor(v),
                        }}
                      />
                    </div>
                    <span className="w-8 text-right text-sm font-semibold">{v}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>
    </main>
  );
}

// ===========================================================================
// Helpers
// ===========================================================================

function ratingColor(v: number): string {
  if (v >= 90) return '#10b981'; // green
  if (v >= 80) return '#84cc16'; // lime
  if (v >= 70) return '#eab308'; // yellow
  if (v >= 60) return '#f97316'; // orange
  return '#dc2626';              // red
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-2 rounded border" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
      <div className="text-base font-bold" style={{ color: 'var(--accent)' }}>{value}</div>
      <div className="text-xs opacity-70 uppercase tracking-wide">{label}</div>
    </div>
  );
}

// Suppress unused warning for type-only imports used in narrowing
void ({} as BasketballRatings);

function Loading() {
  return <main className="max-w-4xl mx-auto p-8"><p className="opacity-60">Loading…</p></main>;
}

function NotFound({ message, backHref, backLabel }: { message: string; backHref: string; backLabel: string }) {
  return (
    <main className="max-w-4xl mx-auto p-8">
      <p className="mb-4">{message}</p>
      <Link href={backHref} className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
        ← Back to {backLabel}
      </Link>
    </main>
  );
}
