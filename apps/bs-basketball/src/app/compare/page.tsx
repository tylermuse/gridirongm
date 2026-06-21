'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { PlayersTabs } from '@/components/players/PlayersTabs';
import {
  basketballUiMetadata,
  type BasketballPlayer,
  type BasketballTeam,
} from '@bs/sport-basketball';

/**
 * /compare — side-by-side player comparison (Tier 3.3).
 *
 * Pick two players (deep-linkable via ?a=&b=); per-game stats and every rating
 * are laid out in an [A | metric | B] table with the better side highlighted
 * and the gap shown. Higher is better for everything compared here.
 */

export default function ComparePage() {
  return (
    <Suspense fallback={<main className="max-w-4xl mx-auto p-8"><p className="opacity-60">Loading…</p></main>}>
      <CompareInner />
    </Suspense>
  );
}

function CompareInner() {
  const { league, loading, error } = useLeagueOrHydrate();
  const sp = useSearchParams();
  const [aId, setAId] = useState<string | null>(() => sp.get('a'));
  const [bId, setBId] = useState<string | null>(() => sp.get('b'));

  const players = useMemo(
    () => (league ? Object.values(league.players as Record<string, BasketballPlayer>) : []),
    [league],
  );
  const teamById = useMemo(() => {
    const m = new Map<string, BasketballTeam>();
    if (league) for (const t of league.teams) m.set(t.id, t as BasketballTeam);
    return m;
  }, [league]);

  if (loading) return <main className="max-w-4xl mx-auto p-8"><p className="opacity-60">Loading…</p></main>;
  if (!league) {
    return (
      <main className="max-w-4xl mx-auto p-8">
        <p className="mb-4">{error ?? 'No league loaded.'}</p>
        <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>← Home</Link>
      </main>
    );
  }

  const playerById = league.players as Record<string, BasketballPlayer>;
  const a = aId ? playerById[aId] ?? null : null;
  const b = bId ? playerById[bId] ?? null : null;

  return (
    <main className="max-w-4xl mx-auto p-5 sm:p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">← Home</Link>
      <div className="mt-2"><PlayersTabs /></div>
      <header className="flex flex-wrap items-baseline gap-3 mt-2 mb-6">
        <h1 className="text-3xl sm:text-4xl font-extrabold" style={{ color: 'var(--accent)' }}>Compare</h1>
        <p className="text-sm opacity-70">Two players, head to head.</p>
      </header>

      {/* Pickers + headers */}
      <div className="grid grid-cols-2 gap-3 sm:gap-6 mb-5">
        <PlayerSide player={a} team={teamFor(a, teamById)} onClear={() => setAId(null)} players={players} onPick={setAId} side="A" />
        <PlayerSide player={b} team={teamFor(b, teamById)} onClear={() => setBId(null)} players={players} onPick={setBId} side="B" />
      </div>

      {a && b ? (
        <>
          <CompareTable title="Per game" rows={statRows(a, b)} />
          <RatingsCompare a={a} b={b} />
        </>
      ) : (
        <div className="rounded-xl border border-dashed p-10 text-center text-[var(--text-sec)]" style={{ borderColor: 'var(--border)' }}>
          Pick {a || b ? 'one more player' : 'two players'} to see the comparison.
        </div>
      )}
    </main>
  );
}

function teamFor(p: BasketballPlayer | null, teamById: Map<string, BasketballTeam>): BasketballTeam | null {
  if (!p?.rosterSlot) return null;
  return teamById.get(p.rosterSlot.teamId) ?? null;
}

// ===========================================================================
// One side: picker when empty, header card when chosen
// ===========================================================================

function PlayerSide({
  player, team, players, onPick, onClear, side,
}: {
  player: BasketballPlayer | null;
  team: BasketballTeam | null;
  players: BasketballPlayer[];
  onPick: (id: string) => void;
  onClear: () => void;
  side: string;
}) {
  if (!player) return <PlayerPicker players={players} onPick={onPick} side={side} />;
  return (
    <div className="rounded-xl border bg-[var(--surface)] p-4 text-center relative" style={{ borderColor: 'var(--border)' }}>
      <button onClick={onClear} className="absolute top-2 right-2 text-xs text-[var(--text-sec)] hover:text-[var(--text)]" title="Change">✕</button>
      <div className="flex flex-col items-center gap-2">
        <PlayerAvatar
          firstName={player.firstName}
          lastName={player.lastName}
          primaryColor={team?.primaryColor ?? '#E66B00'}
          secondaryColor={team?.secondaryColor ?? '#fff'}
          photoUrl={player.sportData.photoUrl}
          size="lg"
        />
        <Link href={`/player/${player.id}`} className="font-bold leading-tight hover:underline">
          {player.firstName} {player.lastName}
        </Link>
        <div className="flex items-center gap-1.5 text-xs text-[var(--text-sec)]">
          {team && <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="xs" />}
          {player.sportData.position} · Age {player.age}
        </div>
        <div className="text-2xl font-black" style={{ color: 'var(--accent)', fontFamily: 'var(--font-display)' }}>
          {player.ratings.overall} <span className="text-[10px] uppercase tracking-widest opacity-60">OVR</span>
        </div>
      </div>
    </div>
  );
}

function PlayerPicker({ players, onPick, side }: { players: BasketballPlayer[]; onPick: (id: string) => void; side: string }) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return players
      .filter(p => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q))
      .sort((x, y) => y.ratings.overall - x.ratings.overall)
      .slice(0, 8);
  }, [players, query]);

  return (
    <div className="rounded-xl border border-dashed bg-[var(--surface)] p-4" style={{ borderColor: 'var(--border)' }}>
      <div className="text-[10px] uppercase tracking-widest opacity-50 mb-2 text-center">Player {side}</div>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search players…"
        className="w-full rounded-lg border px-3 py-2 text-sm bg-[var(--bg)]"
        style={{ borderColor: 'var(--border)' }}
      />
      {matches.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {matches.map(p => (
            <li key={p.id}>
              <button
                onClick={() => { onPick(p.id); setQuery(''); }}
                className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-left text-sm hover:bg-[var(--surface-2)]"
              >
                <span className="truncate">{p.firstName} {p.lastName} <span className="opacity-50">{p.sportData.position}</span></span>
                <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--accent)' }}>{p.ratings.overall}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ===========================================================================
// Comparison tables
// ===========================================================================

interface Row { label: string; aValue: number; bValue: number; aText: string; bText: string }

function CompareTable({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section className="mb-5 rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest opacity-60 border-b" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
        {title}
      </div>
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <tbody>
          {rows.map(r => {
            const aWins = r.aValue > r.bValue;
            const bWins = r.bValue > r.aValue;
            const gap = Math.abs(r.aValue - r.bValue);
            return (
              <tr key={r.label} className="border-t" style={{ borderColor: 'var(--border)' }}>
                <td className="px-3 py-2 text-right w-[38%]">
                  <span className="font-bold tabular-nums" style={{ color: aWins ? '#10b981' : 'var(--text)' }}>{r.aText}</span>
                  {aWins && gap > 0 && <span className="ml-1 text-[10px] text-[#10b981]">▲{fmtGap(gap)}</span>}
                </td>
                <td className="px-2 py-2 text-center text-[11px] uppercase tracking-widest text-[var(--text-sec)] w-[24%]">{r.label}</td>
                <td className="px-3 py-2 text-left w-[38%]">
                  {bWins && gap > 0 && <span className="mr-1 text-[10px] text-[#10b981]">▲{fmtGap(gap)}</span>}
                  <span className="font-bold tabular-nums" style={{ color: bWins ? '#10b981' : 'var(--text)' }}>{r.bText}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
    </section>
  );
}

function RatingsCompare({ a, b }: { a: BasketballPlayer; b: BasketballPlayer }) {
  const grouped = new Map<string, { key: string; label: string }[]>();
  for (const f of basketballUiMetadata.ratingFields) {
    if (!grouped.has(f.group)) grouped.set(f.group, []);
    grouped.get(f.group)!.push({ key: String(f.key), label: f.label });
  }
  const ra = a.ratings as unknown as Record<string, number>;
  const rb = b.ratings as unknown as Record<string, number>;
  return (
    <>
      {[...grouped.entries()].map(([group, fields]) => {
        const rows: Row[] = fields
          .filter(f => typeof ra[f.key] === 'number' && typeof rb[f.key] === 'number')
          .map(f => ({ label: f.label, aValue: ra[f.key], bValue: rb[f.key], aText: String(ra[f.key]), bText: String(rb[f.key]) }));
        if (rows.length === 0) return null;
        return <CompareTable key={group} title={group} rows={rows} />;
      })}
    </>
  );
}

// ===========================================================================
// Helpers
// ===========================================================================

function statRows(a: BasketballPlayer, b: BasketballPlayer): Row[] {
  const perGame = (p: BasketballPlayer, total: number) => (p.seasonStats.gamesPlayed ? total / p.seasonStats.gamesPlayed : 0);
  const pct = (m: number, att: number) => (att ? (m / att) * 100 : 0);
  const num = (label: string, aValue: number, bValue: number, fmt: (n: number) => string): Row =>
    ({ label, aValue, bValue, aText: fmt(aValue), bText: fmt(bValue) });
  const sa = a.seasonStats, sb = b.seasonStats;
  const one = (n: number) => n.toFixed(1);
  const asPct = (n: number) => `${Math.round(n)}%`;
  return [
    num('GP', sa.gamesPlayed, sb.gamesPlayed, n => String(n)),
    num('PPG', perGame(a, sa.points), perGame(b, sb.points), one),
    num('RPG', perGame(a, sa.totalRebounds), perGame(b, sb.totalRebounds), one),
    num('APG', perGame(a, sa.assists), perGame(b, sb.assists), one),
    num('SPG', perGame(a, sa.steals), perGame(b, sb.steals), one),
    num('BPG', perGame(a, sa.blocks), perGame(b, sb.blocks), one),
    num('FG%', pct(sa.fieldGoalsMade, sa.fieldGoalsAttempted), pct(sb.fieldGoalsMade, sb.fieldGoalsAttempted), asPct),
    num('3P%', pct(sa.threePointsMade, sa.threePointsAttempted), pct(sb.threePointsMade, sb.threePointsAttempted), asPct),
    num('FT%', pct(sa.freeThrowsMade, sa.freeThrowsAttempted), pct(sb.freeThrowsMade, sb.freeThrowsAttempted), asPct),
  ];
}

function fmtGap(gap: number): string {
  return gap >= 10 ? String(Math.round(gap)) : gap.toFixed(gap < 1 ? 1 : 0);
}
