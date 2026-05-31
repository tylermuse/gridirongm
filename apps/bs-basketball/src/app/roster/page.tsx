'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { EmptyState } from '@/components/ui/EmptyState';
import { PlayerModal } from '@/components/modals/PlayerModal';
import { resolveLineup } from '@/lib/lineup';
import { teamCap, fmtMoney } from '@/lib/dashboard/summary';
import { regularSeasonStatsByPlayer, statsForPlayer } from '@/lib/stats/seasonStats';
import type { BasketballPlayer, BasketballPosition, BasketballTeam } from '@bs/sport-basketball';

/**
 * /roster — the user team's roster (P0.1). A dedicated, richer view than the
 * generic /team/[id] browse: position-composition bar, position filter pills,
 * and a sortable table with role + contract columns.
 */

const POSITIONS: BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C'];
const POS_COLORS: Record<BasketballPosition, string> = {
  PG: '#06b6d4', SG: '#10b981', SF: '#f59e0b', PF: '#f97316', C: '#8b5cf6',
};
const TARGET_ROSTER = 15;
const MIN_ROSTER = 13;

type SortKey = 'position' | 'name' | 'age' | 'overall' | 'potential' | 'gp';

export default function RosterPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const [filter, setFilter] = useState<BasketballPosition | 'ALL'>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('position');
  const [sortDesc, setSortDesc] = useState(false);
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null);

  const team = useMemo<BasketballTeam | null>(() => {
    if (!league?.userTeamId) return null;
    return (league.teams.find(t => t.id === league.userTeamId) as BasketballTeam | undefined) ?? null;
  }, [league]);

  const roster = useMemo<BasketballPlayer[]>(() => {
    if (!league || !team) return [];
    const players = league.players as Record<string, BasketballPlayer>;
    return team.playerIds.map(id => players[id]).filter((p): p is BasketballPlayer => !!p);
  }, [league, team]);

  // Season stats are aggregated from box scores — player.seasonStats isn't kept.
  const statsMap = useMemo(() => (league ? regularSeasonStatsByPlayer(league) : new Map()), [league]);

  // Role per player, derived from the resolved lineup.
  const roleById = useMemo(() => {
    const m = new Map<string, 'Starter' | 'Rotation' | 'Bench'>();
    if (team && roster.length) {
      const lineup = resolveLineup(team, roster);
      lineup.starters.forEach(id => id && m.set(id, 'Starter'));
      lineup.bench.slice(0, 5).forEach(id => m.set(id, 'Rotation'));
    }
    return m;
  }, [team, roster]);

  const counts = useMemo(() => {
    const c: Record<BasketballPosition, number> = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
    for (const p of roster) c[p.sportData.position]++;
    return c;
  }, [roster]);

  const rows = useMemo(() => {
    const filtered = filter === 'ALL' ? roster : roster.filter(p => p.sportData.position === filter);
    const dir = sortDesc ? -1 : 1;
    return [...filtered].sort((a, b) => {
      let d = 0;
      switch (sortKey) {
        case 'position': d = POSITIONS.indexOf(a.sportData.position) - POSITIONS.indexOf(b.sportData.position); break;
        case 'name': d = a.lastName.localeCompare(b.lastName); break;
        case 'age': d = a.age - b.age; break;
        case 'overall': d = a.ratings.overall - b.ratings.overall; break;
        case 'potential': d = a.development.potential - b.development.potential; break;
        case 'gp': d = statsForPlayer(statsMap, a.id).gamesPlayed - statsForPlayer(statsMap, b.id).gamesPlayed; break;
      }
      return d * dir;
    });
  }, [roster, filter, sortKey, sortDesc, statsMap]);

  if (loading) return <Shell><p className="opacity-60">Loading…</p></Shell>;
  if (!league) return <Shell><p>{error ?? 'No league loaded.'}</p></Shell>;
  if (!team) {
    return (
      <Shell>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <EmptyState icon="👥" title="No team yet" message="Pick a team from the League page to manage its roster." />
        </div>
      </Shell>
    );
  }

  const cap = teamCap(league, team);
  const sizeBadge = roster.length > TARGET_ROSTER
    ? { text: `Cut to ${TARGET_ROSTER}`, color: '#dc2626' }
    : roster.length < MIN_ROSTER
    ? { text: 'Sign a free agent', color: '#f59e0b' }
    : { text: `${roster.length} / ${TARGET_ROSTER}`, color: 'var(--text-sec)' };

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDesc(d => !d);
    else { setSortKey(key); setSortDesc(key === 'overall' || key === 'potential' || key === 'gp'); }
  }

  return (
    <Shell>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="lg" />
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-black" style={{ fontFamily: 'var(--font-display)' }}>
            {team.city} {team.name} Roster
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-sec)]">
            <span className="tabular-nums font-semibold">{team.record.wins}–{team.record.losses}</span>
            <span>·</span>
            <span className="tabular-nums">{cap.capRoom >= 0 ? `${fmtMoney(cap.capRoom)} room` : `${fmtMoney(-cap.capRoom)} over`}</span>
          </div>
        </div>
        <span className="ml-auto text-xs font-bold rounded-full px-3 py-1" style={{ background: `color-mix(in srgb, ${sizeBadge.color} 16%, transparent)`, color: sizeBadge.color }}>
          {sizeBadge.text}
        </span>
        <Link href="/trade" className="text-xs font-semibold rounded-lg border px-3 py-1.5 hover:bg-[var(--surface-2)]" style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}>
          Trade →
        </Link>
      </div>

      {/* Position composition bar */}
      <div className="mb-4">
        <div className="flex h-3 rounded-full overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
          {POSITIONS.map(pos => counts[pos] > 0 && (
            <div key={pos} title={`${pos}: ${counts[pos]}`} style={{ width: `${(counts[pos] / roster.length) * 100}%`, background: POS_COLORS[pos] }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-[var(--text-sec)]">
          {POSITIONS.map(pos => (
            <span key={pos} className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: POS_COLORS[pos] }} />
              {pos} {counts[pos]}
            </span>
          ))}
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {(['ALL', ...POSITIONS] as const).map(p => (
          <button
            key={p}
            onClick={() => setFilter(p)}
            className="text-xs font-bold rounded-full px-3 py-1 border transition active:scale-95"
            style={filter === p
              ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }
              : { borderColor: 'var(--border)', color: 'var(--text-sec)' }}
          >
            {p}{p !== 'ALL' ? ` ${counts[p as BasketballPosition]}` : ` ${roster.length}`}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-[var(--surface)] overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[var(--text-sec)] text-xs border-b" style={{ borderColor: 'var(--border)' }}>
              <Th onClick={() => toggleSort('name')} active={sortKey === 'name'} desc={sortDesc} align="left">Name</Th>
              <Th onClick={() => toggleSort('position')} active={sortKey === 'position'} desc={sortDesc} align="left">Pos</Th>
              <Th onClick={() => toggleSort('age')} active={sortKey === 'age'} desc={sortDesc}>Age</Th>
              <Th onClick={() => toggleSort('overall')} active={sortKey === 'overall'} desc={sortDesc}>OVR</Th>
              <Th onClick={() => toggleSort('potential')} active={sortKey === 'potential'} desc={sortDesc}>POT</Th>
              <th className="px-3 py-2 text-right">Contract</th>
              <th className="px-3 py-2 text-left">Role</th>
              <Th onClick={() => toggleSort('gp')} active={sortKey === 'gp'} desc={sortDesc}>GP</Th>
              <th className="px-3 py-2 text-right">PPG</th>
              <th className="px-3 py-2 text-right">RPG</th>
              <th className="px-3 py-2 text-right">APG</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(p => {
              const s = statsForPlayer(statsMap, p.id);
              const gp = s.gamesPlayed;
              const per = (v: number) => (gp > 0 ? (v / gp).toFixed(1) : '—');
              const role = roleById.get(p.id) ?? 'Bench';
              return (
                <tr key={p.id} className="border-t hover:bg-[var(--surface-2)] transition-colors" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-3 py-2">
                    <button onClick={() => setModalPlayerId(p.id)} className="font-semibold hover:underline text-left" style={{ color: 'var(--accent)' }}>
                      {p.firstName} {p.lastName}
                    </button>
                  </td>
                  <td className="px-3 py-2"><span className="font-mono text-xs" style={{ color: POS_COLORS[p.sportData.position] }}>{p.sportData.position}</span></td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.age}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold" style={{ color: ovrColor(p.ratings.overall) }}>{p.ratings.overall}</td>
                  <td className="px-3 py-2 text-right tabular-nums opacity-70">{p.development.potential}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-xs">{contractLabel(p, league.currentSeason)}</td>
                  <td className="px-3 py-2"><RoleBadge role={role} /></td>
                  <td className="px-3 py-2 text-right tabular-nums">{gp}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{per(s.points)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{per(s.totalRebounds)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{per(s.assists)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <PlayerModal playerId={modalPlayerId} onClose={() => setModalPlayerId(null)} />
    </Shell>
  );
}

// ===========================================================================
// Bits
// ===========================================================================

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-5xl mx-auto p-5 sm:p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">← Home</Link>
      <div className="mt-2">{children}</div>
    </main>
  );
}

function Th({ children, onClick, active, desc, align = 'right' }: { children: React.ReactNode; onClick: () => void; active: boolean; desc: boolean; align?: 'left' | 'right' }) {
  return (
    <th className={`px-3 py-2 ${align === 'left' ? 'text-left' : 'text-right'}`}>
      <button onClick={onClick} className="inline-flex items-center gap-1 hover:text-[var(--text)] font-semibold">
        {children}{active && <span aria-hidden>{desc ? '▼' : '▲'}</span>}
      </button>
    </th>
  );
}

function RoleBadge({ role }: { role: 'Starter' | 'Rotation' | 'Bench' }) {
  const meta = role === 'Starter' ? { c: '#10b981' } : role === 'Rotation' ? { c: '#f59e0b' } : { c: 'var(--text-sec)' };
  return <span className="text-xs font-semibold" style={{ color: meta.c }}>{role}</span>;
}

function ovrColor(v: number): string {
  if (v >= 90) return '#10b981';
  if (v >= 80) return '#84cc16';
  if (v >= 70) return '#eab308';
  if (v >= 60) return '#f97316';
  return '#dc2626';
}

function contractLabel(p: BasketballPlayer, season: number): string {
  if (!p.contract) return '—';
  const cur = p.contract.years.find(y => y.season === season);
  const yearsLeft = p.contract.years.filter(y => y.season >= season).length;
  const salary = cur ? cur.baseSalary + cur.proratedBonus : 0;
  if (salary <= 0) return '—';
  return `${fmtMoney(salary)} · ${yearsLeft}y`;
}
