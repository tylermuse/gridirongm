'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { ExtendModal } from '@/components/modals/ExtendModal';
import { OffseasonStepper } from '@/components/shell/OffseasonStepper';
import { contractYearsLeft } from '@/lib/roster/playerActions';
import { extensionMarket } from '@/lib/roster/extension';
import { resignProjection, hasSalaryForSeason, salaryForSeason, type ResignDecision } from '@/lib/roster/resignProjection';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';

/**
 * /re-sign — cap-management window (parity with football). Each expiring player
 * can be Re-signed or Let Walk; the projected NEXT-season cap space depletes as
 * you commit money and recovers as you let players go. Resolved decisions move to
 * a section below with an Undo for walks.
 */
export default function ReSignPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const store = useLeagueStore();
  const [extendId, setExtendId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, ResignDecision>>({});

  const season = league?.currentSeason ?? 0;
  const userTeam = useMemo<BasketballTeam | null>(() => {
    if (!league?.userTeamId) return null;
    return (league.teams.find(t => t.id === league.userTeamId) as BasketballTeam | undefined) ?? null;
  }, [league]);

  // Candidate pool = the expiring players flagged when the offseason began
  // (stable across re-signs); fall back to a live computation for older saves.
  const candidates = useMemo(() => {
    if (!league || !userTeam) return [] as BasketballPlayer[];
    const flagged = (league.sportData as { pendingResign?: string[] }).pendingResign;
    const ids = flagged?.length
      ? flagged
      : userTeam.playerIds.filter(id => {
          const p = league.players[id] as BasketballPlayer | undefined;
          return !!p && !!p.contract && contractYearsLeft(p, season) <= 1;
        });
    const byId = league.players as Record<string, BasketballPlayer>;
    return ids
      .map(id => byId[id])
      .filter((p): p is BasketballPlayer => !!p)
      .sort((a, b) => b.ratings.overall - a.ratings.overall);
  }, [league, userTeam, season]);

  if (loading) return <Shell><p className="opacity-60">Loading…</p></Shell>;
  if (!league) return <Shell><p>{error ?? 'No league loaded.'}</p></Shell>;
  if (!userTeam) return <Shell><p className="text-sm text-[var(--text-sec)]">You&apos;re spectating — pick a team to manage contracts.</p></Shell>;

  const nextSeason = season + 1;
  const proj = resignProjection(league, userTeam, decisions);

  const active = candidates.filter(p => !hasSalaryForSeason(p, nextSeason) && decisions[p.id] !== 'walk');
  const resigned = candidates.filter(p => hasSalaryForSeason(p, nextSeason));
  const walking = candidates.filter(p => !hasSalaryForSeason(p, nextSeason) && decisions[p.id] === 'walk');

  const setWalk = (id: string) => setDecisions(d => ({ ...d, [id]: 'walk' }));
  const undoWalk = (id: string) => setDecisions(d => { const n = { ...d }; delete n[id]; return n; });

  function letWalk(p: BasketballPlayer) {
    if (p.ratings.overall >= 78 && !window.confirm(`Let ${p.firstName} ${p.lastName} (${p.ratings.overall} OVR) walk to free agency?`)) return;
    setWalk(p.id);
  }
  async function resignAll() {
    if (!window.confirm(`Re-sign all ${active.length} expiring players at their market ask?`)) return;
    for (const p of active) {
      const m = extensionMarket(p, season);
      await store.extendPlayer(p.id, { years: m.desiredYears, salaryPerYear: m.marketSalary });
    }
  }
  function letAllWalk() {
    if (!window.confirm(`Let all ${active.length} expiring players walk to free agency?`)) return;
    setDecisions(d => { const n = { ...d }; for (const p of active) n[p.id] = 'walk'; return n; });
  }

  const spaceColor = proj.projectedSpace > 10_000_000 ? '#10b981' : proj.projectedSpace > 0 ? '#d97706' : '#dc2626';

  return (
    <Shell>
      <OffseasonStepper active="resign" />

      {/* Live projected NEXT-season cap — depletes as you re-sign. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <CapTile label={`Projected ${nextSeason} Cap Space`} value={money(proj.projectedSpace)} color={spaceColor} />
        <CapTile label="Committed payroll" value={money(proj.committed)} color="var(--text)" />
        <CapTile label="Room if all re-signed" value={money(proj.roomIfAllReSigned)} color={proj.roomIfAllReSigned >= 0 ? '#10b981' : '#dc2626'} />
        <CapTile label={proj.apron.text} value={proj.overTaxBy > 0 ? `tax +${money(proj.overTaxBy)}` : '—'} color={proj.apron.color} />
      </div>

      {/* Roster composition — depth per position after your decisions (players you
          let walk drop off), so you can see whether you can afford to lose one. */}
      {(() => {
        const POS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
        const depth: Record<string, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
        for (const id of userTeam.playerIds) {
          if (decisions[id] === 'walk') continue;
          const p = league.players[id] as BasketballPlayer | undefined;
          if (p) depth[p.sportData.position]++;
        }
        const kept = Object.values(depth).reduce((a, b) => a + b, 0);
        return (
          <div className="rounded-xl border bg-[var(--surface)] px-4 py-3 mb-4" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-[10px] uppercase tracking-widest text-[var(--text-sec)]">Roster after decisions</span>
              <span className="text-xs text-[var(--text-sec)]">{kept} players</span>
            </div>
            <div className="grid grid-cols-5 gap-3">
              {POS.map(pos => {
                const n = depth[pos];
                const color = n >= 3 ? '#10b981' : n >= 2 ? '#d97706' : '#dc2626';
                return (
                  <div key={pos}>
                    <div className="flex justify-between text-xs mb-0.5"><span className="font-bold">{pos}</span><span className="tabular-nums" style={{ color }}>{n}</span></div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, (n / 3) * 100)}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <p className="text-sm font-semibold mr-auto rounded-lg px-3 py-1.5" style={{ background: 'color-mix(in srgb, #d97706 14%, transparent)', color: '#b45309' }}>
            ⚠ Decide on {active.length} expiring player{active.length === 1 ? '' : 's'} — anyone not re-signed walks to free agency.
          </p>
          <button onClick={() => void resignAll()} disabled={store.loading} className="text-xs font-bold rounded-lg px-3 py-1.5 text-white disabled:opacity-40" style={{ background: 'var(--accent)' }}>Re-sign All ({active.length})</button>
          <button onClick={letAllWalk} className="text-xs font-bold rounded-lg px-3 py-1.5 border" style={{ borderColor: '#dc2626', color: '#dc2626' }}>Let All Walk ({active.length})</button>
        </div>
      )}

      {/* Active decisions */}
      {active.length === 0 && resigned.length === 0 && walking.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <EmptyState icon="🖊️" title="No expiring contracts" message="Nobody's in their walk year — your books are settled for now." />
        </div>
      ) : (
        <section className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          {active.map(p => {
            const ask = extensionMarket(p, season);
            const stance = willingness(p, userTeam, season);
            return (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 border-t first:border-t-0" style={{ borderColor: 'var(--border)' }}>
                <PlayerAvatar firstName={p.firstName} lastName={p.lastName} primaryColor={userTeam.primaryColor} secondaryColor={userTeam.secondaryColor} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold truncate">{p.firstName} {p.lastName}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: stance.bg, color: stance.fg }}>{stance.label}</span>
                  </div>
                  <div className="text-xs text-[var(--text-sec)]">{p.sportData.position} · Age {p.age} · {p.ratings.overall} OVR{lastSeasonLine(p) ? ` · ${lastSeasonLine(p)}` : ''}</div>
                </div>
                <div className="text-right shrink-0 hidden sm:block">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--text-sec)]">asks · costs next yr</div>
                  <div className="text-sm font-semibold tabular-nums">{money(ask.marketSalary)}/yr · {ask.desiredYears}y · <span style={{ color: '#dc2626' }}>−{money(ask.marketSalary)}</span></div>
                </div>
                <button onClick={() => setExtendId(p.id)} className="shrink-0 text-sm font-bold rounded-lg px-3 py-1.5" style={{ background: 'var(--accent)', color: '#fff' }}>Re-sign</button>
                <button onClick={() => letWalk(p)} className="shrink-0 text-sm font-semibold rounded-lg px-2.5 py-1.5 border" style={{ borderColor: 'var(--border)', color: 'var(--text-sec)' }}>Let Walk</button>
              </div>
            );
          })}
        </section>
      )}

      {/* Resolved decisions */}
      {(resigned.length > 0 || walking.length > 0) && (
        <section className="mt-4">
          <h2 className="text-[10px] uppercase tracking-widest text-[var(--text-sec)] mb-2">Decisions ({resigned.length + walking.length})</h2>
          <div className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            {resigned.map(p => (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2 border-t first:border-t-0 text-sm" style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, #10b981 7%, transparent)' }}>
                <span className="text-[#059669] font-bold">✓</span>
                <span className="font-semibold flex-1 truncate">{p.firstName} {p.lastName}</span>
                <span className="text-xs text-[var(--text-sec)] tabular-nums">Re-signed · −{money(salaryForSeason(p, nextSeason))}/yr</span>
              </div>
            ))}
            {walking.map(p => (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2 border-t first:border-t-0 text-sm" style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, #dc2626 6%, transparent)' }}>
                <span className="text-[#dc2626] font-bold">↪</span>
                <span className="font-semibold flex-1 truncate">{p.firstName} {p.lastName}</span>
                <span className="text-xs text-[#dc2626]">Walking to FA</span>
                <button onClick={() => undoWalk(p.id)} className="text-xs font-semibold hover:underline" style={{ color: 'var(--accent)' }}>Undo</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 flex justify-end">
        <Link href="/post-draft-cuts" className="rounded-lg px-4 py-2 text-sm font-bold text-white" style={{ background: 'var(--accent)' }}>
          Continue to Roster Cuts →
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
  const per = last.per ?? Math.round((last.ppg + last.rpg + last.apg) * 10) / 10;
  return `${last.ppg}/${last.rpg}/${last.apg} · ${per} PER`;
}

/** Real re-sign posture from team success + ask vs current pay + role/age. */
function willingness(p: BasketballPlayer, team: BasketballTeam, season: number): { label: string; bg: string; fg: string } {
  const cur = (p.contract?.years.find(y => y.season === season)?.baseSalary ?? 0) + (p.contract?.years.find(y => y.season === season)?.proratedBonus ?? 0);
  const ask = extensionMarket(p, season).marketSalary;
  const teamGood = team.record.wins >= 41;
  if (!teamGood && p.ratings.overall >= 76) return { label: 'Wants to test FA', bg: 'color-mix(in srgb,#d97706 16%,transparent)', fg: '#b45309' };
  if (ask > cur * 1.25) return { label: 'Seeking a raise', bg: 'color-mix(in srgb,#3b82f6 16%,transparent)', fg: '#2563eb' };
  if (teamGood || (p.age <= 24 && (p.development?.potential ?? 0) - p.ratings.overall >= 4)) return { label: 'Eager to stay', bg: 'color-mix(in srgb,#10b981 16%,transparent)', fg: '#059669' };
  return { label: 'Open to staying', bg: 'var(--surface-2)', fg: 'var(--text-sec)' };
}

function money(n: number): string {
  if (n === 0) return '$0';
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  return a >= 1_000_000 ? `${sign}$${(a / 1_000_000).toFixed(1)}M` : `${sign}$${Math.round(a / 1000)}K`;
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
