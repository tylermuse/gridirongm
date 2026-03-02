'use client';

import { useState } from 'react';
import { useGameStore } from '@/lib/engine/store';
import { PlayerModal } from '@/components/game/PlayerModal';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { potentialLabel, potentialColor } from '@/lib/engine/development';
import { calculateDeadCap, calculateCapSavings } from '@/types';
import type { Player, Position } from '@/types';
import { POSITIONS } from '@/types';

function ratingColor(val: number): string {
  if (val >= 85) return 'text-green-400';
  if (val >= 70) return 'text-blue-400';
  if (val >= 55) return 'text-amber-400';
  return 'text-red-400';
}

function ratingBg(val: number): string {
  if (val >= 85) return 'bg-green-900/40';
  if (val >= 70) return 'bg-blue-900/40';
  if (val >= 55) return 'bg-amber-900/30';
  return 'bg-red-900/30';
}

const DEPTH_LABELS = ['Starter', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

type SortKey = 'name' | 'pos' | 'age' | 'ovr' | 'pot' | 'salary' | 'gp' | 'stat1' | 'stat2';

/** Returns the label columns for a specific position group */
function getStatColumns(pos: Position): [string, string] {
  switch (pos) {
    case 'QB': return ['Pass Yds', 'TD/INT'];
    case 'RB': return ['Rush Yds', 'Rush TD'];
    case 'WR': return ['Rec Yds', 'Rec TD'];
    case 'TE': return ['Rec Yds', 'Rec TD'];
    case 'OL': return ['GP', ''];
    case 'DL': return ['Tackles', 'Sacks'];
    case 'LB': return ['Tackles', 'Sacks'];
    case 'CB': return ['Tackles', 'INT'];
    case 'S': return ['Tackles', 'INT'];
    case 'K': return ['FG', 'XP'];
    case 'P': return ['GP', ''];
    default: return ['', ''];
  }
}

/** Returns stat values for a player */
function getStatValues(p: Player): [string, string] {
  const s = p.stats;
  switch (p.position) {
    case 'QB': return [String(s.passYards), `${s.passTDs}/${s.interceptions}`];
    case 'RB': return [String(s.rushYards), String(s.rushTDs)];
    case 'WR': return [String(s.receivingYards), String(s.receivingTDs)];
    case 'TE': return [String(s.receivingYards), String(s.receivingTDs)];
    case 'OL': return [String(s.gamesPlayed), ''];
    case 'DL': return [String(s.tackles), String(s.sacks)];
    case 'LB': return [String(s.tackles), String(s.sacks)];
    case 'CB': return [String(s.tackles), String(s.defensiveINTs)];
    case 'S': return [String(s.tackles), String(s.defensiveINTs)];
    case 'K': return [`${s.fieldGoalsMade}/${s.fieldGoalAttempts}`, `${s.extraPointsMade}/${s.extraPointAttempts}`];
    case 'P': return [String(s.gamesPlayed), ''];
    default: return ['', ''];
  }
}

/** Get generic stat columns for the "ALL" view */
function getGenericStat(p: Player): string {
  const s = p.stats;
  if (s.gamesPlayed === 0) return '—';
  switch (p.position) {
    case 'QB': return `${s.passYards} yd · ${s.passTDs} TD`;
    case 'RB': return `${s.rushYards} yd · ${s.rushTDs} TD`;
    case 'WR':
    case 'TE': return `${s.receivingYards} yd · ${s.receivingTDs} TD`;
    case 'DL':
    case 'LB': return `${s.tackles} tkl · ${s.sacks} sck`;
    case 'CB':
    case 'S': return `${s.tackles} tkl · ${s.defensiveINTs} INT`;
    case 'K': return `${s.fieldGoalsMade}/${s.fieldGoalAttempts} FG`;
    case 'OL':
    case 'P': return `${s.gamesPlayed} GP`;
    default: return '—';
  }
}

export default function RosterPage() {
  const {
    players, teams, userTeamId,
    releasePlayer, placeOnIR, activateFromIR,
    reorderDepthChart,
    phase, seasonHistory,
  } = useGameStore();

  const [filterPos, setFilterPos] = useState<Position | 'ALL'>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('ovr');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [viewMode, setViewMode] = useState<'roster' | 'depth' | 'injuries'>('roster');
  const [confirmRelease, setConfirmRelease] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  // Drag state for depth chart
  const [dragPosition, setDragPosition] = useState<Position | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const userTeam = teams.find(t => t.id === userTeamId);
  const roster = players
    .filter(p => p.teamId === userTeamId && !p.retired);

  // Depth position for each player
  function getDepthLabel(player: Player): string {
    const dc = userTeam?.depthChart[player.position];
    if (!dc) return '';
    const idx = dc.indexOf(player.id);
    return idx >= 0 ? (DEPTH_LABELS[idx] ?? `${idx + 1}th`) : '';
  }

  function getDepthIndex(player: Player): number {
    const dc = userTeam?.depthChart[player.position];
    if (!dc) return 999;
    const idx = dc.indexOf(player.id);
    return idx >= 0 ? idx : 999;
  }

  // Sort helpers
  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); }
  }

  const sortedRoster = [...roster]
    .filter(p => filterPos === 'ALL' || p.position === filterPos)
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'name': return dir * a.lastName.localeCompare(b.lastName);
        case 'pos': {
          const pi = POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position);
          return pi !== 0 ? pi : (b.ratings.overall - a.ratings.overall);
        }
        case 'age': return dir * (a.age - b.age);
        case 'ovr': return dir * (a.ratings.overall - b.ratings.overall);
        case 'pot': return dir * (a.potential - b.potential);
        case 'salary': return dir * (a.contract.salary - b.contract.salary);
        case 'gp': return dir * (a.stats.gamesPlayed - b.stats.gamesPlayed);
        default: return dir * (a.ratings.overall - b.ratings.overall);
      }
    });

  // Pro Bowl: players who made All-League 1st or 2nd team last season
  const lastSeason = seasonHistory.length > 0 ? seasonHistory[seasonHistory.length - 1] : null;
  const proBowlPlayerIds = new Set<string>();
  if (lastSeason) {
    for (const entry of (lastSeason.allLeagueFirst ?? [])) proBowlPlayerIds.add(entry.playerId);
    for (const entry of (lastSeason.allLeagueSecond ?? [])) proBowlPlayerIds.add(entry.playerId);
  }

  const injuredPlayers = roster.filter(p => p.injury && p.injury.weeksLeft > 0);
  const capSpace = userTeam ? Math.round((userTeam.salaryCap - userTeam.totalPayroll) * 10) / 10 : 0;
  const deadCapTotal = (userTeam?.deadCap ?? []).reduce((sum, dc) => sum + dc.amount, 0);

  // Depth chart helpers
  function getDepthGroup(position: Position): Player[] {
    const depthOrder = userTeam?.depthChart[position];
    const posPlayers = roster.filter(p => p.position === position);
    if (depthOrder && depthOrder.length > 0) {
      const ordered: Player[] = [];
      for (const pid of depthOrder) {
        const p = posPlayers.find(pl => pl.id === pid);
        if (p) ordered.push(p);
      }
      for (const p of posPlayers) {
        if (!ordered.includes(p)) ordered.push(p);
      }
      return ordered;
    }
    return posPlayers.sort((a, b) => b.ratings.overall - a.ratings.overall);
  }

  function handleDragStart(position: Position, index: number) {
    setDragPosition(position);
    setDragIndex(index);
  }
  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    setDragOverIndex(index);
  }
  function handleDragEnd() {
    if (dragPosition !== null && dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      const group = getDepthGroup(dragPosition);
      const ids = group.map(p => p.id);
      const [movedId] = ids.splice(dragIndex, 1);
      ids.splice(dragOverIndex, 0, movedId);
      reorderDepthChart(dragPosition, ids);
    }
    setDragPosition(null);
    setDragIndex(null);
    setDragOverIndex(null);
  }

  const positionGroups: Array<{ label: string; positions: Position[] }> = [
    { label: 'Offense', positions: ['QB', 'RB', 'WR', 'TE', 'OL'] },
    { label: 'Defense', positions: ['DL', 'LB', 'CB', 'S'] },
    { label: 'Special Teams', positions: ['K', 'P'] },
  ];

  const SortHeader = ({ k, children, className = '' }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th
      className={`py-2 px-2 text-xs font-bold uppercase tracking-wider cursor-pointer select-none hover:text-[var(--text)] transition-colors ${sortKey === k ? 'text-blue-400' : 'text-[var(--text-sec)]'} ${className}`}
      onClick={() => handleSort(k)}
    >
      {children}
      {sortKey === k && <span className="ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  );

  return (
    <GameShell>
      <div className="max-w-7xl mx-auto">
        {/* Header bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-2xl font-black">{userTeam?.city} {userTeam?.name} Roster</h2>
            <div className="flex items-center gap-4 text-sm text-[var(--text-sec)] mt-1">
              <span>{roster.length} players</span>
              <span className={capSpace > 10 ? 'text-green-400' : capSpace > 0 ? 'text-amber-400' : 'text-red-400'}>
                ${capSpace}M cap space
              </span>
              {deadCapTotal > 0 && (
                <span className="text-red-400">${Math.round(deadCapTotal * 10) / 10}M dead cap</span>
              )}
              {injuredPlayers.length > 0 && (
                <span className="text-red-400">{injuredPlayers.length} injured</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-1">
              {(['roster', 'depth', 'injuries'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1 text-xs rounded font-medium transition-colors capitalize ${viewMode === mode ? 'bg-blue-600 text-white' : 'text-[var(--text-sec)] hover:text-[var(--text)]'}`}
                >
                  {mode === 'injuries'
                    ? `Injuries${injuredPlayers.length > 0 ? ` (${injuredPlayers.length})` : ''}`
                    : mode === 'depth' ? 'Depth Chart' : 'Roster'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── ROSTER TABLE VIEW (BBGM-style) ── */}
        {viewMode === 'roster' && (
          <>
            {/* Position filter */}
            <div className="flex gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-1 mb-4 flex-wrap w-fit">
              <button
                onClick={() => setFilterPos('ALL')}
                className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${filterPos === 'ALL' ? 'bg-blue-600 text-white' : 'text-[var(--text-sec)] hover:text-[var(--text)]'}`}
              >
                ALL
              </button>
              {POSITIONS.map(pos => (
                <button
                  key={pos}
                  onClick={() => setFilterPos(pos)}
                  className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${filterPos === pos ? 'bg-blue-600 text-white' : 'text-[var(--text-sec)] hover:text-[var(--text)]'}`}
                >
                  {pos}
                </button>
              ))}
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <SortHeader k="name" className="text-left pl-3 w-48">Name</SortHeader>
                    <SortHeader k="pos" className="text-center w-12">Pos</SortHeader>
                    <SortHeader k="age" className="text-center w-10">Age</SortHeader>
                    <SortHeader k="ovr" className="text-center w-12">Ovr</SortHeader>
                    <th className="py-2 px-2 text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] text-center w-14">Pot</th>
                    <SortHeader k="salary" className="text-right w-20">Salary</SortHeader>
                    <th className="py-2 px-2 text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] text-center w-10">Yrs</th>
                    <th className="py-2 px-2 text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] text-center w-16">Role</th>
                    <SortHeader k="gp" className="text-center w-10">GP</SortHeader>
                    <th className="py-2 px-2 text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] text-left">
                      {filterPos !== 'ALL' ? getStatColumns(filterPos)[0] : 'Stats'}
                    </th>
                    {filterPos !== 'ALL' && getStatColumns(filterPos)[1] && (
                      <th className="py-2 px-2 text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] text-center">
                        {getStatColumns(filterPos)[1]}
                      </th>
                    )}
                    <th className="py-2 px-2 text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] text-center w-10">Mood</th>
                    <th className="py-2 px-2 text-xs font-bold uppercase tracking-wider text-[var(--text-sec)] text-right pr-3 w-20">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRoster.map((p, idx) => {
                    const isStarter = getDepthIndex(p) === 0;
                    const depthLabel = getDepthLabel(p);
                    const [stat1, stat2] = filterPos !== 'ALL' ? getStatValues(p) : [getGenericStat(p), ''];
                    const deadCap = calculateDeadCap(p.contract);
                    const capSav = calculateCapSavings(p.contract);

                    return (
                      <tr
                        key={p.id}
                        className={`border-t border-[var(--border)] transition-colors hover:bg-[var(--surface-2)] ${
                          isStarter ? '' : 'opacity-80'
                        }`}
                      >
                        {/* Name */}
                        <td className="py-2 px-2 pl-3">
                          <div className="flex items-center gap-1.5">
                            {proBowlPlayerIds.has(p.id) && <span className="text-amber-400 text-xs">★</span>}
                            <button
                              onClick={() => setSelectedPlayerId(p.id)}
                              className="font-semibold hover:text-blue-400 transition-colors truncate"
                            >
                              {p.firstName} {p.lastName}
                            </button>
                          </div>
                          {p.injury && (
                            <span className="text-[10px] text-red-400 block">
                              {p.injury.type} ({p.injury.weeksLeft}w)
                            </span>
                          )}
                        </td>

                        {/* Position */}
                        <td className="py-2 px-2 text-center">
                          <span className="text-xs font-bold text-[var(--text-sec)]">{p.position}</span>
                        </td>

                        {/* Age */}
                        <td className="py-2 px-2 text-center tabular-nums">{p.age}</td>

                        {/* OVR */}
                        <td className="py-2 px-2 text-center">
                          <span className={`font-black text-sm ${ratingColor(p.ratings.overall)} ${ratingBg(p.ratings.overall)} px-1.5 py-0.5 rounded`}>
                            {p.ratings.overall}
                          </span>
                        </td>

                        {/* Potential */}
                        <td className={`py-2 px-2 text-center text-xs font-medium ${potentialColor(p.potential, p.experience)}`}>
                          {potentialLabel(p.potential, p.experience)}
                        </td>

                        {/* Salary */}
                        <td className="py-2 px-2 text-right font-mono text-xs tabular-nums">
                          ${p.contract.salary}M
                        </td>

                        {/* Years left */}
                        <td className="py-2 px-2 text-center text-xs text-[var(--text-sec)] tabular-nums">
                          {p.contract.yearsLeft}
                        </td>

                        {/* Depth role */}
                        <td className="py-2 px-2 text-center">
                          <span className={`text-[10px] font-bold uppercase ${
                            isStarter ? 'text-green-400' : 'text-[var(--text-sec)]'
                          }`}>
                            {depthLabel}
                          </span>
                        </td>

                        {/* GP */}
                        <td className="py-2 px-2 text-center tabular-nums text-xs">
                          {p.stats.gamesPlayed}
                        </td>

                        {/* Stat 1 */}
                        <td className="py-2 px-2 text-left font-mono text-xs tabular-nums">
                          {stat1}
                        </td>

                        {/* Stat 2 (only in position-filtered view) */}
                        {filterPos !== 'ALL' && getStatColumns(filterPos)[1] && (
                          <td className="py-2 px-2 text-center font-mono text-xs tabular-nums">
                            {stat2}
                          </td>
                        )}

                        {/* Mood */}
                        <td className="py-2 px-2 text-center">
                          <span className={`text-xs ${
                            (p.mood ?? 70) >= 75 ? 'text-green-400' :
                            (p.mood ?? 70) >= 50 ? 'text-amber-400' :
                            'text-red-400'
                          }`}>
                            {(p.mood ?? 70) >= 75 ? '😊' : (p.mood ?? 70) >= 50 ? '😐' : '😠'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-2 px-2 text-right pr-3">
                          <Button
                            size="sm"
                            variant={confirmRelease === p.id ? 'danger' : 'ghost'}
                            onClick={() => {
                              if (confirmRelease === p.id) {
                                releasePlayer(p.id);
                                setConfirmRelease(null);
                              } else {
                                setConfirmRelease(p.id);
                              }
                            }}
                          >
                            {confirmRelease === p.id
                              ? (deadCap > 0 ? `Cut ($${deadCap}M dead)` : 'Confirm?')
                              : 'Cut'
                            }
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {sortedRoster.length === 0 && (
                <div className="text-center py-8 text-[var(--text-sec)] text-sm">
                  No players at this position.
                </div>
              )}
            </div>
          </>
        )}

        {/* ── DEPTH CHART VIEW ── */}
        {viewMode === 'depth' && (
          <div className="space-y-4">
            <p className="text-xs text-[var(--text-sec)]">
              Drag players to reorder the depth chart. ★ = All-League last season.
            </p>
            {positionGroups.map(group => (
              <Card key={group.label}>
                <CardHeader><CardTitle>{group.label}</CardTitle></CardHeader>
                <div className="space-y-0">
                  {group.positions.map(pos => {
                    const depthGroup = getDepthGroup(pos);
                    return (
                      <div key={pos} className="border-t border-[var(--border)] first:border-t-0">
                        <div className="flex items-center gap-2 py-2 px-2">
                          <div className="w-8 text-xs font-bold text-[var(--text-sec)]">{pos}</div>
                          <div className="flex-1 grid grid-cols-4 gap-2">
                            {Array.from({ length: Math.max(4, depthGroup.length) }).map((_, idx) => {
                              const player = depthGroup[idx];
                              if (!player) {
                                return <div key={idx} className="text-xs text-[var(--text-sec)] py-1 px-2">—</div>;
                              }
                              const isProBowl = proBowlPlayerIds.has(player.id);
                              const isDragging = dragPosition === pos && dragIndex === idx;
                              const isDragOver = dragPosition === pos && dragOverIndex === idx;
                              return (
                                <div
                                  key={player.id}
                                  draggable
                                  onDragStart={() => handleDragStart(pos, idx)}
                                  onDragOver={(e) => handleDragOver(e, idx)}
                                  onDragEnd={handleDragEnd}
                                  className={`bg-[var(--surface-2)] rounded-lg p-2 cursor-grab active:cursor-grabbing transition-all ${
                                    isDragging ? 'opacity-40 scale-95' : ''
                                  } ${isDragOver ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-[var(--bg)]' : ''}`}
                                >
                                  <div className="flex items-center justify-between mb-0.5">
                                    <span className="text-[10px] text-[var(--text-sec)]">
                                      {DEPTH_LABELS[idx] ?? `${idx + 1}th`}
                                    </span>
                                    <span className={`text-xs font-bold ${ratingColor(player.ratings.overall)}`}>
                                      {player.ratings.overall}
                                    </span>
                                  </div>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setSelectedPlayerId(player.id); }}
                                    className="text-xs font-semibold truncate block hover:text-blue-400 transition-colors"
                                  >
                                    {isProBowl && <span className="text-amber-400 mr-0.5">★</span>}
                                    {player.firstName[0]}. {player.lastName}
                                  </button>
                                  <div className="text-[10px] text-[var(--text-sec)] mt-0.5 truncate">
                                    {getGenericStat(player)}
                                  </div>
                                  {player.injury && (
                                    <div className="text-[10px] text-red-400">{player.injury.type} ({player.injury.weeksLeft}w)</div>
                                  )}
                                  {player.onIR && <div className="text-[10px] text-amber-400">IR</div>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* ── INJURIES VIEW ── */}
        {viewMode === 'injuries' && (
          <div className="space-y-4">
            {injuredPlayers.length === 0 ? (
              <Card>
                <div className="text-center py-12 text-[var(--text-sec)]">
                  <div className="text-4xl mb-3">💪</div>
                  <p>No players currently injured. Keep it up!</p>
                </div>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Injury Report ({injuredPlayers.length})</CardTitle>
                </CardHeader>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[var(--text-sec)] text-xs uppercase tracking-wider">
                      <th className="text-left pb-3 pl-2">Player</th>
                      <th className="text-center pb-3">Pos</th>
                      <th className="text-center pb-3">OVR</th>
                      <th className="text-center pb-3">Injury</th>
                      <th className="text-center pb-3">Status</th>
                      <th className="text-right pb-3 pr-2">{phase === 'regular' ? 'IR Action' : ''}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {injuredPlayers.map(p => (
                      <tr key={p.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors">
                        <td className="py-2.5 pl-2">
                          <button onClick={() => setSelectedPlayerId(p.id)} className="font-semibold hover:text-blue-400 transition-colors">
                            {proBowlPlayerIds.has(p.id) && <span className="text-amber-400 mr-1">★</span>}
                            {p.firstName} {p.lastName}
                          </button>
                        </td>
                        <td className="py-2.5 text-center text-xs font-bold text-[var(--text-sec)]">{p.position}</td>
                        <td className={`py-2.5 text-center font-bold ${ratingColor(p.ratings.overall)}`}>{p.ratings.overall}</td>
                        <td className="py-2.5 text-center">{p.injury?.type}</td>
                        <td className="py-2.5 text-center">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                            p.onIR ? 'bg-amber-900/30 text-amber-400' :
                            p.injury && p.injury.weeksLeft >= 4 ? 'bg-red-900/30 text-red-400' :
                            p.injury && p.injury.weeksLeft >= 2 ? 'bg-amber-900/30 text-amber-400' :
                            'bg-green-900/30 text-green-400'
                          }`}>
                            {p.onIR ? 'IR' : `${p.injury?.weeksLeft}w`}
                          </span>
                        </td>
                        <td className="py-2.5 text-right pr-2">
                          {p.onIR ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => activateFromIR(p.id)}
                              disabled={!!(p.injury && p.injury.weeksLeft > 2)}
                            >
                              Activate
                            </Button>
                          ) : p.injury && p.injury.weeksLeft >= 4 ? (
                            <Button size="sm" variant="secondary" onClick={() => placeOnIR(p.id)}>
                              Place on IR
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>
        )}
      </div>
      <PlayerModal playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />
    </GameShell>
  );
}
