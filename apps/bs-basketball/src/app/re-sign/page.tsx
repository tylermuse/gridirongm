'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { ExtendModal } from '@/components/modals/ExtendModal';
import { OffseasonStepper } from '@/components/shell/OffseasonStepper';
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
  const askingTotal = expiring.reduce((s, p) => s + extensionMarket(p, season).marketSalary, 0);
  const afterAll = room - askingTotal;

  return (
    <Shell>
      <OffseasonStepper active="resign" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <CapTile label="Cap Space" value={money(room)} color={room > 10_000_000 ? '#10b981' : room > 0 ? '#d97706' : '#dc2626'} />
        <CapTile label="Players Asking" value={money(askingTotal)} color="#d97706" />
        <CapTile label={afterAll >= 0 ? 'Room if all re-sign' : 'Over if all re-sign'} value={money(Math.abs(afterAll))} color={afterAll >= 0 ? '#10b981' : '#dc2626'} />
        <CapTile label="In a contract year" value={String(expiring.length)} color="var(--accent)" />
      </div>
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
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold truncate">{p.firstName} {p.lastName}</span>
                      {(() => { const s = reSignStance(p, userTeam, season); return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: s.bg, color: s.fg }}>{s.label}</span>; })()}
                    </div>
                    <div className="text-xs text-[var(--text-sec)]">
                      {p.sportData.position} · Age {p.age} · {p.ratings.overall} OVR · expiring {money(salary)}/yr
                    </div>
                    {(() => { const log = lastSeasonLine(p); return log ? <div className="text-[11px] text-[var(--text-sec)] tabular-nums">Last season: {log}</div> : null; })()}
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

      <div className="mt-6 flex justify-end">
        <Link href="/draft" className="rounded-lg px-4 py-2 text-sm font-bold text-white" style={{ background: 'var(--accent)' }}>
          Continue to Draft →
        </Link>
      </div>

      <ExtendModal playerId={extendId} onClose={() => setExtendId(null)} />
    </Shell>
  );
}

function CapTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      <div className="text-lg font-black tabular-nums" style={{ color }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide opacity-60">{label}</div>
    </div>
  );
}

/** Previous (just-completed) season's box-line, from the player's season log. */
function lastSeasonLine(p: BasketballPlayer): string | null {
  const log = p.sportData.seasonLog;
  const last = log && log.length ? log[log.length - 1] : null;
  if (!last || !last.gamesPlayed) return null;
  return `${last.ppg} PPG · ${last.rpg} RPG · ${last.apg} APG · ${last.gamesPlayed} GP`;
}

/** Deterministic re-sign posture — surfaces who's reluctant before you make an
 *  offer. Players on a struggling team are likelier to test the market. */
function reSignStance(p: BasketballPlayer, team: BasketballTeam, season: number): { label: string; bg: string; fg: string } {
  let h = 2166136261;
  const key = `${p.id}-${season}`;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  const roll = (h >>> 0) % 100;
  const teamGood = team.record.wins >= 41;
  if (!teamGood && roll < 35) return { label: 'Wants to test FA', bg: 'color-mix(in srgb,#d97706 16%,transparent)', fg: '#b45309' };
  if (teamGood && roll < 55) return { label: 'Eager to stay', bg: 'color-mix(in srgb,#10b981 16%,transparent)', fg: '#059669' };
  return { label: 'Will listen', bg: 'var(--surface-2)', fg: 'var(--text-sec)' };
}

function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n > 0) return `$${Math.round(n / 1000)}K`;
  return '$0';
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-5xl mx-auto p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">← Home</Link>
      <h1 className="text-2xl font-black uppercase tracking-tight mt-2 mb-4">Re-signing Window</h1>
      {children}
    </main>
  );
}
