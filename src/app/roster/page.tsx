'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useGameStore } from '@/lib/engine/store';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { potentialLabel, potentialColor } from '@/lib/engine/development';
import type { Player, Position } from '@/types';
import { POSITIONS } from '@/types';

function ratingColor(val: number): string {
  if (val >= 85) return 'text-green-400';
  if (val >= 70) return 'text-blue-400';
  if (val >= 55) return 'text-amber-400';
  return 'text-red-400';
}

const DEPTH_LABELS = ['Starter', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

export default function RosterPage() {
  const {
    players, teams, userTeamId,
    releasePlayer, placeOnIR, activateFromIR,
    reorderDepthChart, resetDepthChart,
    phase,
  } = useGameStore();

  const [filterPos, setFilterPos] = useState<Position | 'ALL'>('ALL');
  const [sortBy, setSortBy] = useState<'overall' | 'age' | 'salary'>('overall');
  const [viewMode, setViewMode] = useState<'depth' | 'table' | 'injuries'>('depth');
  const [confirmRelease, setConfirmRelease] = useState<string | null>(null);
  const [autoSort, setAutoSort] = useState(true);

  const userTeam = teams.find(t => t.id === userTeamId);
  const depthChart = userTeam?.depthChart;

  const roster = players
    .filter(p => p.teamId === userTeamId && !p.retired)
    .sort((a, b) => {
      if (sortBy === 'overall') return b.ratings.overall - a.ratings.overall;
      if (sortBy === 'age') return a.age - b.age;
      return b.contract.salary - a.contract.salary;
    });

  const filteredRoster = roster.filter(p => filterPos === 'ALL' || p.position === filterPos);

  // Build depth chart groups - use stored depth chart if available, otherwise sort by OVR
  function getDepthGroup(position: Position): Player[] {
    if (autoSort) {
      return roster.filter(p => p.position === position).sort((a, b) => b.ratings.overall - a.ratings.overall);
    }
    if (depthChart) {
      const ids = depthChart[position] ?? [];
      const mapped = ids.map(id => roster.find(p => p.id === id)).filter(Boolean) as Player[];
      // Add any players not in chart (e.g., newly signed)
      const extra = roster.filter(p => p.position === position && !ids.includes(p.id));
      return [...mapped, ...extra];
    }
    return roster.filter(p => p.position === position).sort((a, b) => b.ratings.overall - a.ratings.overall);
  }

  const injuredPlayers = roster.filter(p => p.injury && p.injury.weeksLeft > 0);

  const offenseRows: Array<{ label: string; position: Position }> = [
    { label: 'QB', position: 'QB' },
    { label: 'RB', position: 'RB' },
    { label: 'WR', position: 'WR' },
    { label: 'TE', position: 'TE' },
    { label: 'OL', position: 'OL' },
  ];

  const defenseRows: Array<{ label: string; position: Position }> = [
    { label: 'DL', position: 'DL' },
    { label: 'LB', position: 'LB' },
    { label: 'CB', position: 'CB' },
    { label: 'S', position: 'S' },
  ];

  const specialRows: Array<{ label: string; position: Position }> = [
    { label: 'K', position: 'K' },
    { label: 'P', position: 'P' },
  ];

  function movePlayer(position: Position, fromIndex: number, toIndex: number) {
    const group = getDepthGroup(position);
    const newIds = group.map(p => p.id);
    const [moved] = newIds.splice(fromIndex, 1);
    newIds.splice(toIndex, 0, moved);
    reorderDepthChart(position, newIds);
  }

  function renderDepthSection(title: string, rows: Array<{ label: string; position: Position }>) {
    return (
      <Card>
        <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
        <div className="space-y-0">
          {rows.map(row => {
            const group = getDepthGroup(row.position);
            return (
              <div key={row.label} className="border-t border-[var(--border)] first:border-t-0">
                <div className="flex items-center gap-2 py-2 px-2">
                  <div className="w-8 text-xs font-bold text-[var(--text-sec)]">{row.label}</div>
                  <div className="flex-1 grid grid-cols-4 gap-2">
                    {Array.from({ length: Math.max(4, group.length) }).map((_, idx) => {
                      const player = group[idx];
                      if (!player) {
                        return (
                          <div key={idx} className="text-xs text-[var(--text-sec)] py-1 px-2">—</div>
                        );
                      }
                      const prevOvr = player.ratingHistory.length >= 1
                        ? player.ratingHistory[player.ratingHistory.length - 1].overall
                        : null;
                      const ovrDelta = prevOvr !== null ? player.ratings.overall - prevOvr : 0;
                      return (
                        <div key={player.id} className="bg-[var(--surface-2)] rounded-lg p-2">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-[10px] text-[var(--text-sec)]">
                              {DEPTH_LABELS[idx] ?? `${idx + 1}th`}
                            </span>
                            <div className="flex items-center gap-1">
                              {ovrDelta !== 0 && (
                                <span className={`text-[10px] ${ovrDelta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {ovrDelta > 0 ? `+${ovrDelta}` : ovrDelta}
                                </span>
                              )}
                              <span className={`text-xs font-bold ${ratingColor(player.ratings.overall)}`}>
                                {player.ratings.overall}
                              </span>
                            </div>
                          </div>
                          <Link
                            href={`/player/${player.id}`}
                            className="text-xs font-semibold truncate block hover:text-blue-400 transition-colors"
                          >
                            {player.firstName[0]}. {player.lastName}
                          </Link>
                          <div className="text-[10px] text-[var(--text-sec)] mt-0.5">
                            ${player.contract.salary}M · {player.contract.yearsLeft}yr
                          </div>
                          {player.injury && (
                            <div className="text-[10px] text-red-400">{player.injury.type} ({player.injury.weeksLeft}w)</div>
                          )}
                          {player.onIR && <div className="text-[10px] text-amber-400">IR</div>}
                          {/* Up/down arrows for PRD-13 */}
                          {!autoSort && (
                          <div className="flex gap-0.5 mt-1">
                            <button
                              onClick={() => movePlayer(row.position, idx, idx - 1)}
                              disabled={idx === 0}
                              className="flex-1 text-[10px] py-0.5 rounded bg-[var(--surface)] hover:bg-blue-600/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                              title="Move up"
                            >
                              ↑
                            </button>
                            <button
                              onClick={() => movePlayer(row.position, idx, idx + 1)}
                              disabled={idx >= group.length - 1}
                              className="flex-1 text-[10px] py-0.5 rounded bg-[var(--surface)] hover:bg-blue-600/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                              title="Move down"
                            >
                              ↓
                            </button>
                          </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {!autoSort && (
                    <button
                      onClick={() => resetDepthChart(row.position)}
                      className="text-[10px] text-[var(--text-sec)] hover:text-[var(--text)] transition-colors px-1 shrink-0"
                      title="Reset to OVR order"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    );
  }

  return (
    <GameShell>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h2 className="text-2xl font-black">Roster</h2>
            <div className="text-sm text-[var(--text-sec)]">
              {roster.length} players
              {injuredPlayers.length > 0 && (
                <span className="ml-2 text-red-400">{injuredPlayers.length} injured</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-1">
              {(['depth', 'table', 'injuries'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1 text-xs rounded font-medium transition-colors capitalize ${viewMode === mode ? 'bg-blue-600 text-white' : 'text-[var(--text-sec)] hover:text-[var(--text)]'}`}
                >
                  {mode === 'injuries'
                    ? `Injuries${injuredPlayers.length > 0 ? ` (${injuredPlayers.length})` : ''}`
                    : mode === 'depth' ? 'Depth Chart' : 'Table'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {viewMode === 'depth' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-[var(--text-sec)]">
                {autoSort
                  ? 'Auto-sorted by overall rating. Uncheck to manually reorder.'
                  : 'Use ↑↓ arrows to reorder. Click Reset to restore OVR ranking. Depth chart order affects simulation.'}
              </p>
              <label className="flex items-center gap-2 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={autoSort}
                  onChange={() => setAutoSort(!autoSort)}
                  className="accent-blue-500"
                />
                <span className="text-xs font-medium">Auto-sort by rating</span>
              </label>
            </div>
            {renderDepthSection('Offense', offenseRows)}
            {renderDepthSection('Defense', defenseRows)}
            {renderDepthSection('Special Teams', specialRows)}
          </div>
        )}

        {viewMode === 'table' && (
          <>
            <div className="flex items-center justify-end mb-4">
              <div className="flex gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-1 flex-wrap">
                <button
                  onClick={() => setFilterPos('ALL')}
                  className={`px-2 py-1 text-xs rounded font-medium transition-colors ${filterPos === 'ALL' ? 'bg-blue-600 text-white' : 'text-[var(--text-sec)] hover:text-[var(--text)]'}`}
                >
                  ALL
                </button>
                {POSITIONS.map(pos => (
                  <button
                    key={pos}
                    onClick={() => setFilterPos(pos)}
                    className={`px-2 py-1 text-xs rounded font-medium transition-colors ${filterPos === pos ? 'bg-blue-600 text-white' : 'text-[var(--text-sec)] hover:text-[var(--text)]'}`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>

            <Card>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[var(--text-sec)] text-xs uppercase tracking-wider">
                    <th className="text-left pb-3 pl-2">Player</th>
                    <th className="text-center pb-3">Pos</th>
                    <th className="text-center pb-3 cursor-pointer hover:text-[var(--text)]" onClick={() => setSortBy('age')}>Age</th>
                    <th className="text-center pb-3 cursor-pointer hover:text-[var(--text)]" onClick={() => setSortBy('overall')}>OVR</th>
                    <th className="text-center pb-3">POT</th>
                    <th className="text-center pb-3">SPD</th>
                    <th className="text-center pb-3">STR</th>
                    <th className="text-center pb-3">AWR</th>
                    <th className="text-right pb-3 cursor-pointer hover:text-[var(--text)]" onClick={() => setSortBy('salary')}>Salary</th>
                    <th className="text-right pb-3">Yrs</th>
                    <th className="text-right pb-3 pr-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRoster.map(p => (
                    <tr key={p.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors">
                      <td className="py-2.5 pl-2">
                        <Link href={`/player/${p.id}`} className="font-semibold hover:text-blue-400 transition-colors">
                          {p.firstName} {p.lastName}
                        </Link>
                        {p.injury && (
                          <span className="block text-xs text-red-400">{p.injury.type} ({p.injury.weeksLeft}w)</span>
                        )}
                      </td>
                      <td className="py-2.5 text-center">
                        <Badge variant="default">{p.position}</Badge>
                      </td>
                      <td className="py-2.5 text-center">{p.age}</td>
                      <td className={`py-2.5 text-center font-bold ${ratingColor(p.ratings.overall)}`}>
                        {p.ratings.overall}
                      </td>
                      <td className={`py-2.5 text-center text-xs ${potentialColor(p.potential, p.experience)}`}>
                        {potentialLabel(p.potential, p.experience)}
                      </td>
                      <td className={`py-2.5 text-center ${ratingColor(p.ratings.speed)}`}>
                        {p.ratings.speed}
                      </td>
                      <td className={`py-2.5 text-center ${ratingColor(p.ratings.strength)}`}>
                        {p.ratings.strength}
                      </td>
                      <td className={`py-2.5 text-center ${ratingColor(p.ratings.awareness)}`}>
                        {p.ratings.awareness}
                      </td>
                      <td className="py-2.5 text-right font-mono">
                        ${p.contract.salary}M
                      </td>
                      <td className="py-2.5 text-right text-[var(--text-sec)]">
                        {p.contract.yearsLeft}
                      </td>
                      <td className="py-2.5 text-right pr-2">
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
                          {confirmRelease === p.id ? 'Confirm?' : 'Cut'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}

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
                          <Link href={`/player/${p.id}`} className="font-semibold hover:text-blue-400 transition-colors">
                            {p.firstName} {p.lastName}
                          </Link>
                        </td>
                        <td className="py-2.5 text-center"><Badge>{p.position}</Badge></td>
                        <td className={`py-2.5 text-center font-bold ${ratingColor(p.ratings.overall)}`}>{p.ratings.overall}</td>
                        <td className="py-2.5 text-center">{p.injury?.type}</td>
                        <td className="py-2.5 text-center">
                          <Badge variant={p.injury && p.injury.weeksLeft >= 4 ? 'red' : p.injury && p.injury.weeksLeft >= 2 ? 'default' : 'green'}>
                            {p.onIR ? 'IR' : `${p.injury?.weeksLeft}w`}
                          </Badge>
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
    </GameShell>
  );
}
