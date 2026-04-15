'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore } from '@/lib/engine/store';
import { PlayerModal } from '@/components/game/PlayerModal';
import { GameShell } from '@/components/game/GameShell';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { POSITIONS } from '@/types';
import type { Player, Position } from '@/types';

function ratingColor(val: number): string {
  if (val >= 85) return 'text-green-600';
  if (val >= 70) return 'text-blue-600';
  if (val >= 55) return 'text-amber-600';
  return 'text-red-600';
}

type SortKey = 'name' | 'team' | 'pos' | 'age' | 'ovr' | 'pot' | 'salary' | 'years';
type SortDir = 'asc' | 'desc';
type ContractFilter = 'any' | 'expiring' | 'under_contract' | 'free_agent';

const PAGE_SIZE = 50;

export default function PlayersPage() {
  const router = useRouter();
  const { players, teams, userTeamId, freeAgents } = useGameStore();

  // Filters
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState<Set<Position>>(new Set());
  const [ovrMin, setOvrMin] = useState(40);
  const [ovrMax, setOvrMax] = useState(99);
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(45);
  const [contractFilter, setContractFilter] = useState<ContractFilter>('any');
  const [teamFilter, setTeamFilter] = useState<string>('all');

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('ovr');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Pagination
  const [page, setPage] = useState(0);

  // Player modal
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const teamMap = useMemo(() => {
    const m = new Map<string, typeof teams[0]>();
    for (const t of teams) m.set(t.id, t);
    return m;
  }, [teams]);

  const faSet = useMemo(() => new Set(freeAgents), [freeAgents]);

  const togglePos = useCallback((pos: Position) => {
    setPosFilter(prev => {
      const next = new Set(prev);
      if (next.has(pos)) next.delete(pos); else next.add(pos);
      return next;
    });
    setPage(0);
  }, []);

  const handleSort = useCallback((key: SortKey) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        return prev;
      }
      setSortDir(key === 'name' || key === 'team' || key === 'pos' ? 'asc' : 'desc');
      return key;
    });
    setPage(0);
  }, []);

  const filtered = useMemo(() => {
    const searchLower = search.toLowerCase();
    return players.filter(p => {
      if (p.retired) return false;
      const ovr = p.ratings.overall;
      if (ovr < ovrMin || ovr > ovrMax) return false;
      if (p.age < ageMin || p.age > ageMax) return false;
      if (posFilter.size > 0 && !posFilter.has(p.position)) return false;
      if (searchLower && !(`${p.firstName} ${p.lastName}`).toLowerCase().includes(searchLower)) return false;

      const isFa = !p.teamId || faSet.has(p.id);
      if (contractFilter === 'free_agent' && !isFa) return false;
      if (contractFilter === 'expiring' && (isFa || p.contract.yearsLeft > 1)) return false;
      if (contractFilter === 'under_contract' && (isFa || p.contract.yearsLeft <= 1)) return false;

      if (teamFilter !== 'all') {
        if (teamFilter === 'fa') return isFa;
        return p.teamId === teamFilter;
      }
      return true;
    });
  }, [players, search, posFilter, ovrMin, ovrMax, ageMin, ageMax, contractFilter, teamFilter, faSet]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'name': return dir * (`${a.firstName} ${a.lastName}`).localeCompare(`${b.firstName} ${b.lastName}`);
        case 'team': {
          const ta = a.teamId ? (teamMap.get(a.teamId)?.abbreviation ?? '') : 'ZZZ';
          const tb = b.teamId ? (teamMap.get(b.teamId)?.abbreviation ?? '') : 'ZZZ';
          return dir * ta.localeCompare(tb);
        }
        case 'pos': return dir * a.position.localeCompare(b.position);
        case 'age': return dir * (a.age - b.age);
        case 'ovr': return dir * (a.ratings.overall - b.ratings.overall);
        case 'pot': return dir * (a.potential - b.potential);
        case 'salary': return dir * (a.contract.salary - b.contract.salary);
        case 'years': return dir * (a.contract.yearsLeft - b.contract.yearsLeft);
        default: return 0;
      }
    });
    return arr;
  }, [filtered, sortKey, sortDir, teamMap]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageItems = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' \u25B2' : ' \u25BC';
  };

  const sortedTeams = useMemo(() =>
    [...teams].sort((a, b) => a.abbreviation.localeCompare(b.abbreviation)),
    [teams],
  );

  return (
    <GameShell>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-4">Player Search</h1>

        {/* Filters */}
        <Card className="mb-4 p-4">
          <div className="space-y-3">
            {/* Row 1: Search + Team + Contract */}
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="text-xs font-medium text-gray-500 mb-1 block">Search</label>
                <input
                  type="text"
                  placeholder="Player name..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(0); }}
                  className="w-full px-3 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div className="min-w-[140px]">
                <label className="text-xs font-medium text-gray-500 mb-1 block">Team</label>
                <select
                  value={teamFilter}
                  onChange={e => { setTeamFilter(e.target.value); setPage(0); }}
                  className="w-full px-2 py-1.5 text-sm border rounded-md"
                >
                  <option value="all">All Teams</option>
                  <option value="fa">Free Agents</option>
                  {sortedTeams.map(t => (
                    <option key={t.id} value={t.id}>{t.abbreviation} — {t.city} {t.name}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-[140px]">
                <label className="text-xs font-medium text-gray-500 mb-1 block">Contract</label>
                <select
                  value={contractFilter}
                  onChange={e => { setContractFilter(e.target.value as ContractFilter); setPage(0); }}
                  className="w-full px-2 py-1.5 text-sm border rounded-md"
                >
                  <option value="any">Any</option>
                  <option value="expiring">Expiring</option>
                  <option value="under_contract">Under Contract</option>
                  <option value="free_agent">Free Agent</option>
                </select>
              </div>
            </div>

            {/* Row 2: Position toggles */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Position</label>
              <div className="flex flex-wrap gap-1">
                {POSITIONS.map(pos => (
                  <button
                    key={pos}
                    onClick={() => togglePos(pos)}
                    className={`px-2 py-0.5 text-xs font-medium rounded-full border transition-colors ${
                      posFilter.has(pos)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
                {posFilter.size > 0 && (
                  <button
                    onClick={() => { setPosFilter(new Set()); setPage(0); }}
                    className="px-2 py-0.5 text-xs text-red-600 hover:text-red-800"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Row 3: OVR + Age sliders */}
            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-500 whitespace-nowrap">OVR</label>
                <input type="number" min={0} max={99} value={ovrMin}
                  onChange={e => { setOvrMin(+e.target.value); setPage(0); }}
                  className="w-14 px-1 py-0.5 text-xs border rounded text-center"
                />
                <span className="text-xs text-gray-400">—</span>
                <input type="number" min={0} max={99} value={ovrMax}
                  onChange={e => { setOvrMax(+e.target.value); setPage(0); }}
                  className="w-14 px-1 py-0.5 text-xs border rounded text-center"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-500 whitespace-nowrap">Age</label>
                <input type="number" min={18} max={50} value={ageMin}
                  onChange={e => { setAgeMin(+e.target.value); setPage(0); }}
                  className="w-14 px-1 py-0.5 text-xs border rounded text-center"
                />
                <span className="text-xs text-gray-400">—</span>
                <input type="number" min={18} max={50} value={ageMax}
                  onChange={e => { setAgeMax(+e.target.value); setPage(0); }}
                  className="w-14 px-1 py-0.5 text-xs border rounded text-center"
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Results count */}
        <div className="text-sm text-gray-500 mb-2">
          {sorted.length.toLocaleString()} player{sorted.length !== 1 ? 's' : ''} found
          {totalPages > 1 && ` — page ${page + 1} of ${totalPages}`}
        </div>

        {/* Table */}
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-3 py-2 cursor-pointer hover:text-gray-800 select-none" onClick={() => handleSort('name')}>
                  Player{sortIcon('name')}
                </th>
                <th className="px-3 py-2 cursor-pointer hover:text-gray-800 select-none" onClick={() => handleSort('team')}>
                  Team{sortIcon('team')}
                </th>
                <th className="px-3 py-2 cursor-pointer hover:text-gray-800 select-none" onClick={() => handleSort('pos')}>
                  Pos{sortIcon('pos')}
                </th>
                <th className="px-3 py-2 cursor-pointer hover:text-gray-800 select-none text-center" onClick={() => handleSort('age')}>
                  Age{sortIcon('age')}
                </th>
                <th className="px-3 py-2 cursor-pointer hover:text-gray-800 select-none text-center" onClick={() => handleSort('ovr')}>
                  OVR{sortIcon('ovr')}
                </th>
                <th className="px-3 py-2 cursor-pointer hover:text-gray-800 select-none text-center" onClick={() => handleSort('pot')}>
                  POT{sortIcon('pot')}
                </th>
                <th className="px-3 py-2 cursor-pointer hover:text-gray-800 select-none text-right" onClick={() => handleSort('salary')}>
                  Salary{sortIcon('salary')}
                </th>
                <th className="px-3 py-2 cursor-pointer hover:text-gray-800 select-none text-center" onClick={() => handleSort('years')}>
                  Yrs{sortIcon('years')}
                </th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(p => {
                const team = p.teamId ? teamMap.get(p.teamId) : null;
                const isFa = !p.teamId || faSet.has(p.id);
                const isUserTeam = p.teamId === userTeamId;
                return (
                  <tr
                    key={p.id}
                    className="border-b hover:bg-blue-50/50 cursor-pointer transition-colors"
                    onClick={() => setSelectedPlayerId(p.id)}
                  >
                    <td className="px-3 py-2 font-medium whitespace-nowrap">
                      {p.firstName} {p.lastName}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {team ? (
                        <span className="inline-flex items-center gap-1">
                          <TeamLogo
                            abbreviation={team.abbreviation}
                            primaryColor={team.primaryColor}
                            secondaryColor={team.secondaryColor}
                            size="xs"
                            logoUrl={team.logoUrl}
                          />
                          <span className="text-xs text-gray-600">{team.abbreviation}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">FA</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block bg-gray-100 rounded px-1.5 py-0.5 text-xs font-medium">
                        {p.position}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">{p.age}</td>
                    <td className={`px-3 py-2 text-center font-bold ${ratingColor(p.ratings.overall)}`}>
                      {p.ratings.overall}
                    </td>
                    <td className={`px-3 py-2 text-center ${ratingColor(p.potential)}`}>
                      {p.potential}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      {isFa ? '—' : `$${p.contract.salary.toFixed(1)}M`}
                    </td>
                    <td className="px-3 py-2 text-center text-xs">
                      {isFa ? '—' : `${p.contract.yearsLeft}yr`}
                    </td>
                    <td className="px-3 py-2 text-right" onClick={e => e.stopPropagation()}>
                      {!isUserTeam && !isFa && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => router.push(`/trades?team=${p.teamId}&target=${p.id}`)}
                        >
                          Trade
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {pageItems.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-gray-400">
                    No players match your filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(0)}>
              First
            </Button>
            <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              Prev
            </Button>
            <span className="text-sm text-gray-600 px-2">
              {page + 1} / {totalPages}
            </span>
            <Button size="sm" variant="secondary" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
            <Button size="sm" variant="secondary" disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>
              Last
            </Button>
          </div>
        )}
      </div>

      {/* Player detail modal */}
      {selectedPlayerId && (
        <PlayerModal playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />
      )}
    </GameShell>
  );
}
