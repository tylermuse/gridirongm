'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { Button } from '@/components/ui/Button';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { resolveLineup, validateBasketballLineup, buildDefaultBasketballLineup } from '@/lib/lineup';
import type { BasketballLineup, BasketballPlayer, BasketballPosition, BasketballTeam } from '@bs/sport-basketball';

/**
 * /team/[id]/lineup — set the starting five + bench rotation order (Phase 2D-7).
 *
 * Five position slots (each a player picker that swaps on conflict) plus an
 * ordered bench you reorder with ↑/↓. Validated live; save is blocked on
 * violations (position mismatches are warnings). The sim uses the saved lineup
 * via resolveLineup.
 */

const SLOTS: BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C'];

export default function LineupPage() {
  const params = useParams<{ teamId: string }>();
  const { league, loading, error } = useLeagueOrHydrate();
  const store = useLeagueStore();
  const router = useRouter();
  const [saved, setSaved] = useState(false);

  const team = useMemo<BasketballTeam | null>(() => {
    if (!league) return null;
    return (league.teams.find(t => t.id === params.teamId) as BasketballTeam | undefined) ?? null;
  }, [league, params.teamId]);

  const roster = useMemo<BasketballPlayer[]>(() => {
    if (!league || !team) return [];
    return team.playerIds.map(id => league.players[id] as BasketballPlayer).filter(Boolean);
  }, [league, team]);

  // Initial assignment from the resolved (saved-if-valid, else default) lineup.
  const [starters, setStarters] = useState<string[]>([]);
  const [bench, setBench] = useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);
  if (!initialized && team && roster.length > 0) {
    const base = resolveLineup(team, roster);
    const s = [...base.starters];
    const benchInit = roster
      .filter(p => !s.includes(p.id))
      .sort((a, b) => {
        const ia = base.bench.indexOf(a.id);
        const ib = base.bench.indexOf(b.id);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return b.ratings.overall - a.ratings.overall;
      })
      .map(p => p.id);
    setStarters(s);
    setBench(benchInit);
    setInitialized(true);
  }

  if (loading) return <Loading />;
  if (!league) return <NotFound message={error ?? 'No league loaded.'} />;
  if (!team) return <NotFound message="Team not found." />;

  const playerById = league.players as Record<string, BasketballPlayer>;
  const lineup: BasketballLineup = {
    starters: starters as BasketballLineup['starters'],
    bench: bench as BasketballLineup['bench'],
    backupsByPosition: { PG: null, SG: null, SF: null, PF: null, C: null },
    pace: team.sportData.lineup?.pace ?? team.sportData.pace ?? 'medium',
  };
  const validation = validateBasketballLineup(lineup, roster);

  function setStarter(slot: number, playerId: string) {
    setSaved(false);
    const existingSlot = starters.indexOf(playerId);
    const nextStarters = [...starters];
    if (existingSlot !== -1) {
      // Swap the two starter slots.
      nextStarters[existingSlot] = starters[slot];
      nextStarters[slot] = playerId;
      setStarters(nextStarters);
      return;
    }
    // Promote from bench: demoted starter goes to the bench.
    const demoted = starters[slot];
    nextStarters[slot] = playerId;
    setStarters(nextStarters);
    setBench(prev => {
      const without = prev.filter(id => id !== playerId);
      return demoted ? [...without, demoted] : without;
    });
  }

  function moveBench(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= bench.length) return;
    setSaved(false);
    const next = [...bench];
    [next[i], next[j]] = [next[j], next[i]];
    setBench(next);
  }

  async function save() {
    const ok = await store.saveLineup(team!.id, lineup);
    if (ok) setSaved(true);
  }

  function resetToDefault() {
    setSaved(false);
    const def = buildDefaultBasketballLineup(roster);
    const s = [...def.starters];
    const b = roster
      .filter(p => !s.includes(p.id))
      .sort((a, b2) => b2.ratings.overall - a.ratings.overall)
      .map(p => p.id);
    setStarters(s);
    setBench(b);
  }

  return (
    <main className="max-w-4xl mx-auto p-8">
      <Link href={`/team/${team.id}`} className="text-sm font-semibold opacity-70 hover:opacity-100">
        ← {team.city} {team.name}
      </Link>
      <header className="flex items-center gap-3 mt-2 mb-6">
        <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="lg" />
        <h1 className="text-3xl font-extrabold" style={{ color: 'var(--accent)' }}>Edit Lineup</h1>
      </header>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Starters */}
        <section className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <h2 className="px-3 py-2 font-bold border-b text-sm" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
            Starters
          </h2>
          <div className="p-3 space-y-2">
            {SLOTS.map((pos, i) => (
              <div key={pos} className="flex items-center gap-2">
                <span className="w-8 text-xs font-bold opacity-60">{pos}</span>
                <select
                  value={starters[i] ?? ''}
                  onChange={e => setStarter(i, e.target.value)}
                  className="flex-1 px-2 py-1.5 rounded-lg border bg-[var(--surface)] text-sm"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <option value="">— empty —</option>
                  {roster.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.firstName} {p.lastName} ({p.sportData.position} · {p.ratings.overall})
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </section>

        {/* Bench */}
        <section className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <h2 className="px-3 py-2 font-bold border-b text-sm" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
            Bench rotation
          </h2>
          <ol className="p-2">
            {bench.map((id, i) => {
              const p = playerById[id];
              if (!p) return null;
              return (
                <li key={id} className="flex items-center gap-2 px-2 py-1 text-sm">
                  <span className="w-5 text-xs opacity-40 tabular-nums text-right">{i + 1}</span>
                  <span className="font-semibold truncate flex-1">{p.firstName} {p.lastName}</span>
                  <span className="text-xs opacity-60 w-6">{p.sportData.position}</span>
                  <span className="text-xs tabular-nums w-7 text-right font-bold">{p.ratings.overall}</span>
                  <span className="flex gap-0.5">
                    <button onClick={() => moveBench(i, -1)} disabled={i === 0} className="w-6 h-6 rounded hover:bg-[var(--surface-2)] disabled:opacity-30" aria-label="Move up">↑</button>
                    <button onClick={() => moveBench(i, 1)} disabled={i === bench.length - 1} className="w-6 h-6 rounded hover:bg-[var(--surface-2)] disabled:opacity-30" aria-label="Move down">↓</button>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      {/* Validation */}
      {(validation.violations.length > 0 || validation.warnings.length > 0) && (
        <div className="mt-4 space-y-1">
          {validation.violations.map((v, i) => (
            <p key={`v${i}`} className="text-sm" style={{ color: '#dc2626' }}>✗ {v.message}</p>
          ))}
          {validation.warnings.map((w, i) => (
            <p key={`w${i}`} className="text-sm" style={{ color: '#f59e0b' }}>⚠ {w.message}</p>
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3 items-center">
        <Button variant="primary" disabled={!validation.valid || store.loading} onClick={() => void save()}>
          {store.loading ? 'Saving…' : 'Save Lineup'}
        </Button>
        <Button variant="ghost" onClick={resetToDefault}>Reset to default</Button>
        {saved && <span className="text-sm" style={{ color: 'var(--accent)' }}>✓ Saved — the sim will use this lineup.</span>}
        <Button variant="secondary" className="ml-auto" onClick={() => router.push(`/team/${team.id}`)}>Done</Button>
      </div>
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
