'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';

/**
 * /team/[teamId] — team detail with roster table.
 *
 * v1: sortable table (default OVR desc). Click a row → /player/[playerId].
 */

interface TeamSportData {
  conference: string;
  division: string;
}

type SortKey = 'overall' | 'age' | 'position' | 'name';

const SORTABLE: { key: SortKey; label: string; align?: 'left' | 'right' }[] = [
  { key: 'name',     label: 'Name',     align: 'left' },
  { key: 'position', label: 'Pos',      align: 'left' },
  { key: 'age',      label: 'Age',      align: 'right' },
  { key: 'overall',  label: 'OVR',      align: 'right' },
];

export default function TeamPage() {
  const params = useParams<{ teamId: string }>();
  const { league, loading, error } = useLeagueOrHydrate();
  const [sortKey, setSortKey] = useState<SortKey>('overall');
  const [sortDesc, setSortDesc] = useState(true);

  const team: BasketballTeam | null = useMemo(() => {
    if (!league) return null;
    return (league.teams.find(t => t.id === params.teamId) as BasketballTeam | undefined) ?? null;
  }, [league, params.teamId]);

  const roster: BasketballPlayer[] = useMemo(() => {
    if (!league || !team) return [];
    return team.playerIds
      .map(pid => league.players[pid] as BasketballPlayer | undefined)
      .filter((p): p is BasketballPlayer => !!p);
  }, [league, team]);

  const sorted = useMemo(() => {
    const arr = [...roster];
    arr.sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case 'overall':  diff = a.ratings.overall - b.ratings.overall; break;
        case 'age':      diff = a.age - b.age; break;
        case 'position': diff = a.sportData.position.localeCompare(b.sportData.position); break;
        case 'name':     diff = `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`); break;
      }
      return sortDesc ? -diff : diff;
    });
    return arr;
  }, [roster, sortKey, sortDesc]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDesc(d => !d);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  if (loading) return <Loading />;
  if (!league) return <NotFound message={error ?? 'No league loaded.'} />;
  if (!team) return <NotFound message="Team not found in this league." />;

  const sd = team.sportData as TeamSportData;

  return (
    <main className="max-w-4xl mx-auto p-8">
      <Link href="/league" className="text-sm font-semibold opacity-70 hover:opacity-100">
        ← League
      </Link>

      <header className="flex items-center gap-4 mt-2 mb-6">
        <div
          className="w-14 h-14 rounded-lg flex items-center justify-center font-extrabold text-2xl"
          style={{ background: team.primaryColor, color: team.secondaryColor }}
        >
          {team.abbreviation.slice(0, 3)}
        </div>
        <div>
          <h1 className="text-4xl font-extrabold">{team.city} {team.name}</h1>
          <p className="text-sm opacity-70">
            {sd.conference} Conference · {sd.division} Division
          </p>
        </div>
      </header>

      <section className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-6">
        <Stat label="Players" value={roster.length} />
        <Stat label="Avg OVR" value={roster.length ? avg(roster.map(p => p.ratings.overall)).toFixed(1) : '—'} />
        <Stat label="Avg Age" value={roster.length ? avg(roster.map(p => p.age)).toFixed(1) : '—'} />
        <Stat label="Stars (85+)" value={roster.filter(p => p.ratings.overall >= 85).length} />
        <Stat label="Wins" value={team.record.wins} />
      </section>

      <section className="rounded border" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--muted)' }}>
            <tr>
              {SORTABLE.map(col => (
                <th
                  key={col.key}
                  className={`px-3 py-2 cursor-pointer select-none ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                  onClick={() => toggleSort(col.key)}
                >
                  {col.label}
                  {sortKey === col.key && <span className="ml-1 opacity-60">{sortDesc ? '▼' : '▲'}</span>}
                </th>
              ))}
              <th className="px-3 py-2 text-right opacity-60">3PT</th>
              <th className="px-3 py-2 text-right opacity-60">DEF</th>
              <th className="px-3 py-2 text-right opacity-60">REB</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => (
              <tr key={p.id} className="border-t hover:bg-black/5" style={{ borderColor: 'var(--border)' }}>
                <td className="px-3 py-2">
                  <Link
                    href={`/player/${p.id}`}
                    className="font-semibold hover:underline"
                    style={{ color: 'var(--accent)' }}
                  >
                    {p.firstName} {p.lastName}
                  </Link>
                </td>
                <td className="px-3 py-2">{p.sportData.position}</td>
                <td className="px-3 py-2 text-right">{p.age}</td>
                <td className="px-3 py-2 text-right font-bold">{p.ratings.overall}</td>
                <td className="px-3 py-2 text-right opacity-70">{p.ratings.threePoint}</td>
                <td className="px-3 py-2 text-right opacity-70">{Math.round((p.ratings.perimeterDefense + p.ratings.interiorDefense) / 2)}</td>
                <td className="px-3 py-2 text-right opacity-70">{p.ratings.rebounding}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

// ===========================================================================
// Helpers
// ===========================================================================

function avg(nums: number[]): number {
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-2 rounded border" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
      <div className="text-lg font-extrabold" style={{ color: 'var(--accent)' }}>{value}</div>
      <div className="text-xs opacity-70 uppercase tracking-wide">{label}</div>
    </div>
  );
}

function Loading() {
  return <main className="max-w-4xl mx-auto p-8"><p className="opacity-60">Loading…</p></main>;
}

function NotFound({ message }: { message: string }) {
  return (
    <main className="max-w-4xl mx-auto p-8">
      <p className="mb-4">{message}</p>
      <Link href="/league" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
        ← Back to league
      </Link>
    </main>
  );
}
