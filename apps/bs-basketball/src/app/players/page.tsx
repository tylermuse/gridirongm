'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { PlayerModal } from '@/components/modals/PlayerModal';
import { PlayersTabs } from '@/components/players/PlayersTabs';
import type { BasketballPlayer, BasketballPosition, BasketballTeam } from '@bs/sport-basketball';

/**
 * /players — league-wide, filterable, sortable player database (P1 #11).
 * Filter by name / position / team / contract status / OVR floor; sort any
 * column; paginated. Per-row link to the player and a Compare entry point.
 */

const POSITIONS: BasketballPosition[] = ['PG', 'SG', 'SF', 'PF', 'C'];
type SortKey = 'overall' | 'potential' | 'age' | 'name';
type Status = 'all' | 'signed' | 'free_agent' | 'expiring';
const PAGE = 50;

export default function PlayersPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const [q, setQ] = useState('');
  const [pos, setPos] = useState<BasketballPosition | 'ALL'>('ALL');
  const [teamId, setTeamId] = useState<string>('ALL');
  const [status, setStatus] = useState<Status>('all');
  const [minOvr, setMinOvr] = useState(0);
  const [minPot, setMinPot] = useState(0);
  const [maxAge, setMaxAge] = useState(42);
  const [sortKey, setSortKey] = useState<SortKey>('overall');
  const [desc, setDesc] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null);

  const teamById = useMemo(() => {
    const m = new Map<string, BasketballTeam>();
    if (league) for (const t of league.teams) m.set(t.id, t as BasketballTeam);
    return m;
  }, [league]);

  const rows = useMemo(() => {
    if (!league) return [];
    const season = league.currentSeason;
    const all = Object.values(league.players as Record<string, BasketballPlayer>);
    const ql = q.trim().toLowerCase();
    const filtered = all.filter(p => {
      if (ql && !`${p.firstName} ${p.lastName}`.toLowerCase().includes(ql)) return false;
      if (pos !== 'ALL' && p.sportData.position !== pos) return false;
      if (teamId === 'FA' ? !!p.rosterSlot : teamId !== 'ALL' && p.rosterSlot?.teamId !== teamId) return false;
      if (p.ratings.overall < minOvr) return false;
      if (p.development.potential < minPot) return false;
      if (p.age > maxAge) return false;
      if (status === 'free_agent' && p.rosterSlot) return false;
      if (status === 'signed' && !p.rosterSlot) return false;
      if (status === 'expiring') {
        const yrs = p.contract ? p.contract.years.filter(y => y.season >= season).length : 0;
        if (yrs !== 1) return false;
      }
      return true;
    });
    const dir = desc ? -1 : 1;
    filtered.sort((a, b) => {
      let d = 0;
      switch (sortKey) {
        case 'overall': d = a.ratings.overall - b.ratings.overall; break;
        case 'potential': d = a.development.potential - b.development.potential; break;
        case 'age': d = a.age - b.age; break;
        case 'name': d = a.lastName.localeCompare(b.lastName); break;
      }
      return d * dir;
    });
    return filtered;
  }, [league, q, pos, teamId, status, minOvr, minPot, maxAge, sortKey, desc]);

  if (loading) return <Shell><p className="opacity-60">Loading…</p></Shell>;
  if (!league) return <Shell><p>{error ?? 'No league loaded.'}</p></Shell>;

  const season = league.currentSeason;
  const teams = [...(league.teams as BasketballTeam[])].sort((a, b) => a.city.localeCompare(b.city));

  function toggleSort(key: SortKey) {
    if (sortKey === key) setDesc(d => !d);
    else { setSortKey(key); setDesc(key !== 'name' && key !== 'age'); }
    setLimit(PAGE);
  }

  return (
    <Shell>
      <PlayersTabs />
      <h1 className="text-3xl sm:text-4xl font-black mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}>Player Search</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-3">
        <input value={q} onChange={e => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Search name…" className="rounded-lg border px-3 py-1.5 text-sm bg-[var(--bg)]" style={{ borderColor: 'var(--border)' }} />
        <select value={teamId} onChange={e => { setTeamId(e.target.value); setLimit(PAGE); }} className="rounded-lg border px-2 py-1.5 text-sm bg-[var(--surface)]" style={{ borderColor: 'var(--border)' }}>
          <option value="ALL">All teams</option>
          <option value="FA">Free agents</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.city} {t.name}</option>)}
        </select>
        <select value={status} onChange={e => { setStatus(e.target.value as Status); setLimit(PAGE); }} className="rounded-lg border px-2 py-1.5 text-sm bg-[var(--surface)]" style={{ borderColor: 'var(--border)' }}>
          <option value="all">Any status</option>
          <option value="signed">Signed</option>
          <option value="free_agent">Free agent</option>
          <option value="expiring">Expiring</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-[var(--text-sec)]">
          OVR ≥ <input type="range" min={0} max={95} value={minOvr} onChange={e => { setMinOvr(Number(e.target.value)); setLimit(PAGE); }} /> <span className="tabular-nums w-6">{minOvr}</span>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-[var(--text-sec)]">
          POT ≥ <input type="range" min={0} max={95} value={minPot} onChange={e => { setMinPot(Number(e.target.value)); setLimit(PAGE); }} /> <span className="tabular-nums w-6">{minPot}</span>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-[var(--text-sec)]">
          Age ≤ <input type="range" min={19} max={42} value={maxAge} onChange={e => { setMaxAge(Number(e.target.value)); setLimit(PAGE); }} /> <span className="tabular-nums w-6">{maxAge}</span>
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {(['ALL', ...POSITIONS] as const).map(p => (
          <button key={p} onClick={() => { setPos(p); setLimit(PAGE); }} className="text-xs font-bold rounded-full px-3 py-1 border transition active:scale-95"
            style={pos === p ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : { borderColor: 'var(--border)', color: 'var(--text-sec)' }}>{p}</button>
        ))}
        <span className="ml-auto text-xs text-[var(--text-sec)] self-center">{rows.length} players</span>
      </div>

      {/* Table — MOBILE-4: progressive column hiding on phone (drop Team /
          Age / POT below sm; drop Status below md). Keeps Name + Pos + OVR
          legible at 390px without the side-scroll fight. */}
      <div className="rounded-xl border bg-[var(--surface)] overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full text-sm">
          <thead><tr className="text-[var(--text-sec)] text-xs border-b" style={{ borderColor: 'var(--border)' }}>
            <Th onClick={() => toggleSort('name')} active={sortKey === 'name'} desc={desc} align="left">Name</Th>
            <th className="px-3 py-2 text-left hidden sm:table-cell">Team</th>
            <th className="px-3 py-2 text-left">Pos</th>
            <Th onClick={() => toggleSort('age')} active={sortKey === 'age'} desc={desc} className="hidden sm:table-cell">Age</Th>
            <Th onClick={() => toggleSort('overall')} active={sortKey === 'overall'} desc={desc}>OVR</Th>
            <Th onClick={() => toggleSort('potential')} active={sortKey === 'potential'} desc={desc} className="hidden sm:table-cell">POT</Th>
            <th className="px-3 py-2 text-right hidden md:table-cell">Status</th>
          </tr></thead>
          <tbody>
            {rows.slice(0, limit).map(p => {
              const team = p.rosterSlot ? teamById.get(p.rosterSlot.teamId) : null;
              const yrs = p.contract ? p.contract.years.filter(y => y.season >= season).length : 0;
              return (
                <tr key={p.id} className="border-t hover:bg-[var(--surface-2)] transition-colors" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-3 py-1.5">
                    <button onClick={() => setModalPlayerId(p.id)} className="font-semibold hover:underline text-left" style={{ color: 'var(--accent)' }}>{p.firstName} {p.lastName}</button>
                  </td>
                  <td className="px-3 py-1.5 hidden sm:table-cell">{team ? <span className="inline-flex items-center gap-1.5"><TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="xs" />{team.abbreviation}</span> : <span className="text-[var(--text-sec)]">FA</span>}</td>
                  <td className="px-3 py-1.5">{p.sportData.position}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums hidden sm:table-cell">{p.age}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-bold" style={{ color: ovrColor(p.ratings.overall) }}>{p.ratings.overall}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums opacity-70 hidden sm:table-cell">{p.development.potential}</td>
                  <td className="px-3 py-1.5 text-right text-xs text-[var(--text-sec)] hidden md:table-cell">{!p.rosterSlot ? 'Free agent' : yrs <= 1 ? 'Expiring' : `${yrs}y left`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <div className="text-center mt-3">
          <button onClick={() => setLimit(l => l + PAGE)} className="text-sm font-semibold rounded-lg border px-4 py-2 hover:bg-[var(--surface-2)]" style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}>
            Show more ({rows.length - limit} more)
          </button>
        </div>
      )}

      <PlayerModal playerId={modalPlayerId} onClose={() => setModalPlayerId(null)} />
    </Shell>
  );
}

function Th({ children, onClick, active, desc, align = 'right', className = '' }: { children: React.ReactNode; onClick: () => void; active: boolean; desc: boolean; align?: 'left' | 'right'; className?: string }) {
  return (
    <th className={`px-3 py-2 ${align === 'left' ? 'text-left' : 'text-right'} ${className}`}>
      <button onClick={onClick} className="inline-flex items-center gap-1 hover:text-[var(--text)] font-semibold">{children}{active && <span aria-hidden>{desc ? '▼' : '▲'}</span>}</button>
    </th>
  );
}

function ovrColor(v: number): string {
  if (v >= 90) return '#10b981';
  if (v >= 80) return '#84cc16';
  if (v >= 70) return '#eab308';
  if (v >= 60) return '#f97316';
  return '#dc2626';
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-4xl mx-auto p-5 sm:p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">← Home</Link>
      <div className="mt-2">{children}</div>
    </main>
  );
}
