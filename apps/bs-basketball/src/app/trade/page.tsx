'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { evaluateTrade, isExecutable, type TradeSideInput } from '@/lib/trade';
import { tradeWindowClosed } from '@/lib/sim/simRange';
import type { BasketballPlayer, BasketballTeam, TeamTradeOutcome } from '@bs/sport-basketball';

/**
 * /trade — two-team trade builder (Phase 2D-6).
 *
 * Pick a partner, check players from each roster into the deal, and watch the
 * live evaluation (legality, AI acceptance, value delta, cap math, warnings)
 * from the engine's evaluateBasketballTrade. Propose when it's legal + accepted.
 */
export default function TradePage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const store = useLeagueStore();

  const [targetId, setTargetId] = useState<string>('');
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [theirs, setTheirs] = useState<Set<string>>(new Set());
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const teamById = useMemo(() => {
    const m = new Map<string, BasketballTeam>();
    if (league) for (const t of league.teams) m.set(t.id, t as BasketballTeam);
    return m;
  }, [league]);

  const userTeamId = league?.userTeamId ?? null;

  const sides = useMemo<TradeSideInput[]>(() => {
    if (!userTeamId || !targetId) return [];
    return [
      { teamId: userTeamId as TradeSideInput['teamId'], playerIds: [...mine] as TradeSideInput['playerIds'] },
      { teamId: targetId as TradeSideInput['teamId'], playerIds: [...theirs] as TradeSideInput['playerIds'] },
    ];
  }, [userTeamId, targetId, mine, theirs]);

  const evaluation = useMemo(
    () => (league && sides.length === 2 ? evaluateTrade(league, sides) : null),
    [league, sides],
  );

  if (loading) return <Loading />;
  if (!league) return <NotFound message={error ?? 'No league loaded.'} />;

  if (!userTeamId) {
    return (
      <Shell>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <EmptyState icon="🔁" title="Spectating" message="Pick a team to build and propose trades." />
        </div>
      </Shell>
    );
  }

  const userTeam = teamById.get(userTeamId)!;
  const targetTeam = targetId ? teamById.get(targetId) : null;
  const playerById = league.players as Record<string, BasketballPlayer>;
  const window = tradeWindowClosed(league);
  const canExecute = !window.closed && evaluation ? isExecutable(evaluation, sides) : false;

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
    setResultMsg(null);
  }

  function addTo(set: Set<string>, setter: (s: Set<string>) => void, id: string) {
    if (set.has(id)) return;
    const next = new Set(set);
    next.add(id);
    setter(next);
    setResultMsg(null);
  }

  // Drag a roster row onto the trade block — routed to the correct side by the
  // dragstart payload. Click-to-toggle still works for touch / no-DnD.
  function onDropDeal(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const raw = e.dataTransfer.getData('application/json');
    if (!raw) return;
    try {
      const { id, side } = JSON.parse(raw) as { id: string; side: 'mine' | 'theirs' };
      if (side === 'mine') addTo(mine, setMine, id);
      else if (side === 'theirs') addTo(theirs, setTheirs, id);
    } catch {
      /* malformed payload — ignore */
    }
  }

  async function propose() {
    const ok = await store.executeTrade(sides);
    if (ok) {
      setResultMsg('✅ Trade executed.');
      setMine(new Set());
      setTheirs(new Set());
      setTargetId('');
    }
  }

  const userOutcome = evaluation?.perTeam.find(t => t.teamId === userTeamId) ?? null;
  const targetOutcome = evaluation && targetId ? evaluation.perTeam.find(t => t.teamId === targetId) ?? null : null;

  return (
    <Shell>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-2 font-bold">
          <TeamLogo abbreviation={userTeam.abbreviation} primaryColor={userTeam.primaryColor} secondaryColor={userTeam.secondaryColor} size="xs" />
          {userTeam.city}
        </div>
        <span className="opacity-50">↔</span>
        <select
          value={targetId}
          onChange={e => { setTargetId(e.target.value); setTheirs(new Set()); setResultMsg(null); }}
          className="px-2 py-1.5 rounded-lg border bg-[var(--surface)] text-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          <option value="">Select a trade partner…</option>
          {league.teams
            .filter(t => t.id !== userTeamId)
            .sort((a, b) => a.city.localeCompare(b.city))
            .map(t => <option key={t.id} value={t.id}>{t.city} {t.name}</option>)}
        </select>
      </div>

      {window.closed && (
        <div className="mb-5 px-4 py-2 rounded-lg text-sm border" style={{ borderColor: '#dc2626', background: 'color-mix(in srgb, #dc2626 8%, transparent)' }}>
          🔒 {window.reason} You can browse, but new trades can&apos;t be executed.
        </div>
      )}

      {resultMsg && (
        <div className="mb-5 px-4 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}>
          {resultMsg}
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_1fr_0.9fr] gap-5">
        <RosterColumn team={userTeam} playerById={playerById} season={league.currentSeason} selected={mine} onToggle={id => toggle(mine, setMine, id)} side="mine" />
        {targetTeam ? (
          <RosterColumn team={targetTeam} playerById={playerById} season={league.currentSeason} selected={theirs} onToggle={id => toggle(theirs, setTheirs, id)} side="theirs" />
        ) : (
          <div className="rounded-xl border bg-[var(--surface)] p-8 text-center text-sm text-[var(--text-sec)]" style={{ borderColor: 'var(--border)' }}>
            Select a trade partner to see their roster.
          </div>
        )}

        <div className="space-y-4 self-start">
          {/* Trade block (drop zone) */}
          <section
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDropDeal}
            className="rounded-xl border-2 border-dashed p-4 transition-colors"
            style={{
              borderColor: dragOver ? 'var(--accent)' : 'var(--border)',
              background: dragOver ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface)',
            }}
          >
            <h2 className="font-bold text-sm mb-2">Trade block</h2>
            <DealHalf label={`${userTeam.city} send`} ids={[...mine]} playerById={playerById} accent="#dc2626" onRemove={id => toggle(mine, setMine, id)} />
            <DealHalf label={`${targetTeam ? targetTeam.city + ' send' : 'You receive'}`} ids={[...theirs]} playerById={playerById} accent="#10b981" onRemove={id => toggle(theirs, setTheirs, id)} />
            {mine.size === 0 && theirs.size === 0 && (
              <p className="text-xs text-[var(--text-sec)] mt-1">Drag players here — or tap them in the rosters.</p>
            )}
          </section>

          {/* Evaluation */}
          <section className="rounded-xl border bg-[var(--surface)] p-4" style={{ borderColor: 'var(--border)' }}>
            <h2 className="font-bold text-sm mb-3">Evaluation</h2>
            {!evaluation || (mine.size === 0 && theirs.size === 0) ? (
              <p className="text-sm text-[var(--text-sec)]">Add players from each side to evaluate.</p>
            ) : (
              <>
                <div
                  className="text-sm font-semibold mb-3 px-2 py-1.5 rounded"
                  style={{
                    background: !evaluation.legal
                      ? 'color-mix(in srgb, #dc2626 14%, transparent)'
                      : evaluation.allAccept
                      ? 'color-mix(in srgb, #10b981 16%, transparent)'
                      : 'color-mix(in srgb, #f59e0b 16%, transparent)',
                  }}
                >
                  {evaluation.summary}
                </div>

                {userOutcome && <OutcomeBlock label={`${userTeam.city} (You)`} outcome={userOutcome} />}
                {targetOutcome && targetTeam && <OutcomeBlock label={targetTeam.city} outcome={targetOutcome} />}

                {evaluation.warnings.map((w, i) => (
                  <p key={i} className="text-xs mt-2" style={{ color: '#f59e0b' }}>⚠ {w}</p>
                ))}

                <Button variant="primary" className="w-full mt-4" disabled={!canExecute || store.loading} onClick={() => void propose()}>
                  {store.loading ? 'Processing…' : canExecute ? 'Propose Trade' : 'Not acceptable'}
                </Button>
              </>
            )}
          </section>
        </div>
      </div>
    </Shell>
  );
}

// ===========================================================================
// Components
// ===========================================================================

function RosterColumn({
  team, playerById, season, selected, onToggle, side,
}: {
  team: BasketballTeam;
  playerById: Record<string, BasketballPlayer>;
  season: number;
  selected: Set<string>;
  onToggle: (id: string) => void;
  side: 'mine' | 'theirs';
}) {
  const players = team.playerIds
    .map(id => playerById[id])
    .filter(Boolean)
    .sort((a, b) => b.ratings.overall - a.ratings.overall);

  return (
    <section className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      <h2 className="px-3 py-2 font-bold border-b text-sm flex items-center gap-2" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
        <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="xs" />
        {team.city}
      </h2>
      <ul className="max-h-[34rem] overflow-y-auto">
        {players.map(p => {
          const sel = selected.has(p.id);
          const salary = contractSalary(p, season);
          return (
            <li key={p.id}>
              <button
                draggable
                onDragStart={e => {
                  e.dataTransfer.setData('application/json', JSON.stringify({ id: p.id, side }));
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => onToggle(p.id)}
                className="w-full flex items-center gap-2 px-3 py-1.5 border-t text-left text-sm hover:bg-[var(--surface-2)] transition-colors cursor-grab active:cursor-grabbing"
                style={{ borderColor: 'var(--border)', background: sel ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : undefined }}
                title="Drag onto the trade block, or tap to add"
              >
                <span className="w-3 text-center text-xs opacity-30 select-none" aria-hidden>⠿</span>
                <span className="w-4 text-center" style={{ color: sel ? 'var(--accent)' : 'var(--text-sec)' }}>{sel ? '✓' : '+'}</span>
                <span className="font-semibold truncate flex-1">{p.firstName} {p.lastName}</span>
                <span className="text-xs opacity-60 w-6">{p.sportData.position}</span>
                <span className="text-xs tabular-nums w-7 text-right font-bold">{p.ratings.overall}</span>
                <span className="text-[10px] tabular-nums w-12 text-right opacity-60">{salary > 0 ? money(salary) : '—'}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function DealHalf({
  label, ids, playerById, accent, onRemove,
}: {
  label: string;
  ids: string[];
  playerById: Record<string, BasketballPlayer>;
  accent: string;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="mb-2">
      <div className="text-[10px] uppercase tracking-widest opacity-60 mb-1">{label}</div>
      {ids.length === 0 ? (
        <div className="text-xs opacity-40">—</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {ids.map(id => {
            const p = playerById[id];
            if (!p) return null;
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 text-xs font-semibold rounded-full pl-2 pr-1 py-0.5"
                style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)` }}
              >
                {p.firstName[0]}. {p.lastName}
                <button onClick={() => onRemove(id)} className="opacity-50 hover:opacity-100 px-0.5" title="Remove from deal">✕</button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OutcomeBlock({ label, outcome }: { label: string; outcome: TeamTradeOutcome }) {
  return (
    <div className="mb-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-bold">{label}</span>
        <span style={{ color: outcome.willAccept ? '#10b981' : '#dc2626' }}>
          {outcome.willAccept ? 'accepts' : 'rejects'}{!outcome.capCompliant ? ' · cap ✗' : ''}
        </span>
      </div>
      <div className="text-[var(--text-sec)]">{outcome.reasoning}</div>
      <div className="flex gap-3 mt-0.5 opacity-70">
        <span>out {money(outcome.capDetail.outgoingSalary)}</span>
        <span>in {money(outcome.capDetail.incomingSalary)}</span>
        <span>max {money(outcome.capDetail.maxIncomingAllowed)}</span>
      </div>
    </div>
  );
}

// ===========================================================================
// Helpers
// ===========================================================================

function contractSalary(p: BasketballPlayer, season: number): number {
  if (!p.contract) return 0;
  const y = p.contract.years.find(yr => yr.season === season);
  return y ? y.baseSalary + y.proratedBonus : 0;
}

function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n > 0) return `$${Math.round(n / 1000)}K`;
  return '$0';
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-6xl mx-auto p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">← Home</Link>
      <h1 className="text-4xl font-extrabold mt-2 mb-6" style={{ color: 'var(--accent)' }}>Trade</h1>
      {children}
    </main>
  );
}

function Loading() {
  return <main className="max-w-4xl mx-auto p-8"><p className="opacity-60">Loading…</p></main>;
}

function NotFound({ message }: { message: string }) {
  return (
    <main className="max-w-4xl mx-auto p-8">
      <p className="mb-4">{message}</p>
      <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>← Home</Link>
    </main>
  );
}
