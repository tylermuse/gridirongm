'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { ExtendModal } from '@/components/modals/ExtendModal';
import { contractYearsLeft } from '@/lib/roster/playerActions';
import { extensionMarket } from '@/lib/roster/extension';
import { capRoom } from '@/lib/freeAgency';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';

/**
 * /re-sign — extend your own players before their deals expire. Lists everyone
 * in their contract year with the extension ask; the row opens the same
 * ExtendModal the roster uses. Re-signing keeps a player off the open market.
 */
export default function ReSignPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const [extendId, setExtendId] = useState<string | null>(null);

  const season = league?.currentSeason ?? 0;
  const userTeam = useMemo<BasketballTeam | null>(() => {
    if (!league?.userTeamId) return null;
    return (league.teams.find(t => t.id === league.userTeamId) as BasketballTeam | undefined) ?? null;
  }, [league]);

  const expiring = useMemo(() => {
    if (!league || !userTeam) return [];
    return userTeam.playerIds
      .map(id => league.players[id] as BasketballPlayer | undefined)
      .filter((p): p is BasketballPlayer => !!p && !!p.contract && contractYearsLeft(p, season) <= 1)
      .sort((a, b) => b.ratings.overall - a.ratings.overall);
  }, [league, userTeam, season]);

  if (loading) return <Shell><p className="opacity-60">Loading…</p></Shell>;
  if (!league) return <Shell><p>{error ?? 'No league loaded.'}</p></Shell>;
  if (!userTeam) return <Shell><p className="text-sm text-[var(--text-sec)]">You&apos;re spectating — pick a team to manage contracts.</p></Shell>;

  const room = capRoom(league, userTeam.id);

  return (
    <Shell>
      <p className="text-sm text-[var(--text-sec)] mb-2">
        {userTeam.city} · cap room {money(room)} · {expiring.length} player{expiring.length === 1 ? '' : 's'} in a contract year.
      </p>
      {expiring.length > 0 && (
        <p className="text-sm font-semibold mb-4 rounded-lg px-3 py-2" style={{ background: 'color-mix(in srgb, #d97706 14%, transparent)', color: '#b45309' }}>
          ⚠ Any expiring player you don&apos;t re-sign will walk to free agency when the next season starts.
        </p>
      )}

      {expiring.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <EmptyState icon="🖊️" title="No expiring contracts" message="Nobody's in their walk year — your books are settled for now." />
        </div>
      ) : (
        <section className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <ul>
            {expiring.map(p => {
              const cur = p.contract!.years.find(y => y.season === season);
              const salary = cur ? cur.baseSalary + cur.proratedBonus : 0;
              const ask = extensionMarket(p, season);
              return (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2.5 border-t first:border-t-0" style={{ borderColor: 'var(--border)' }}>
                  <PlayerAvatar firstName={p.firstName} lastName={p.lastName} primaryColor={userTeam.primaryColor} secondaryColor={userTeam.secondaryColor} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{p.firstName} {p.lastName}</div>
                    <div className="text-xs text-[var(--text-sec)]">
                      {p.sportData.position} · Age {p.age} · {p.ratings.overall} OVR · expiring {money(salary)}/yr
                    </div>
                  </div>
                  <div className="text-right shrink-0 hidden sm:block">
                    <div className="text-[10px] uppercase tracking-wide text-[var(--text-sec)]">asks</div>
                    <div className="text-sm font-semibold tabular-nums">{money(ask.marketSalary)}/yr · {ask.desiredYears}y</div>
                  </div>
                  <button
                    onClick={() => setExtendId(p.id)}
                    className="shrink-0 text-sm font-bold rounded-lg px-3 py-1.5"
                    style={{ background: 'var(--accent)', color: '#fff' }}
                  >
                    Re-sign
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <ExtendModal playerId={extendId} onClose={() => setExtendId(null)} />
    </Shell>
  );
}

function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n > 0) return `$${Math.round(n / 1000)}K`;
  return '$0';
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-3xl mx-auto p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">← Home</Link>
      <h1 className="text-3xl font-extrabold mt-2 mb-4" style={{ color: 'var(--accent)' }}>Re-sign Players</h1>
      {children}
    </main>
  );
}
