'use client';

import { useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { ratingColor } from '@/lib/ui/ratingColor';
import { basketballTradeValue, type BasketballPlayer, type BasketballStats } from '@bs/sport-basketball';

/**
 * Sortable trade roster table (parity with football's SortableTradeTable) —
 * Pos / Player / OVR / Age / Salary / Yrs / Pts, with a checkbox to add to the
 * deal. Keeps drag support so the trade block still works. Selected rows tint
 * with the brand accent.
 */

type SortKey = 'pos' | 'name' | 'ovr' | 'age' | 'salary' | 'yrs' | 'pts';

function salaryFor(p: BasketballPlayer, season: number): number {
  const y = p.contract?.years.find(yr => yr.season === season);
  return y ? y.baseSalary + y.proratedBonus : 0;
}
function yearsLeft(p: BasketballPlayer, season: number): number {
  return p.contract ? p.contract.years.filter(y => y.season >= season).length : 0;
}
function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n > 0) return `$${Math.round(n / 1000)}K`;
  return '—';
}

export function SortableTradeTable({
  players, season, selected, onToggle, side, statsMap,
}: {
  players: BasketballPlayer[];
  season: number;
  selected: Set<string>;
  onToggle: (id: string) => void;
  side: 'mine' | 'theirs';
  /** BUG-26: per-player season stats. When provided, the table renders a
   *  PPG/RPG/APG column so users can evaluate trades without clicking each
   *  player into their card. Football-parity. */
  statsMap?: Map<string, BasketballStats>;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('pts');
  const [dir, setDir] = useState<1 | -1>(-1);

  const rows = players.map(p => ({
    p,
    salary: salaryFor(p, season),
    yrs: yearsLeft(p, season),
    pts: basketballTradeValue(p, { season }),
  }));
  rows.sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'pos': cmp = a.p.sportData.position.localeCompare(b.p.sportData.position); break;
      case 'name': cmp = `${a.p.lastName}`.localeCompare(b.p.lastName); break;
      case 'ovr': cmp = a.p.ratings.overall - b.p.ratings.overall; break;
      case 'age': cmp = a.p.age - b.p.age; break;
      case 'salary': cmp = a.salary - b.salary; break;
      case 'yrs': cmp = a.yrs - b.yrs; break;
      default: cmp = a.pts - b.pts;
    }
    return cmp * dir;
  });

  function sort(k: SortKey) {
    if (k === sortKey) setDir(d => (d === 1 ? -1 : 1));
    else { setSortKey(k); setDir(k === 'name' || k === 'pos' ? 1 : -1); }
  }
  const arrow = (k: SortKey) => (k === sortKey ? (dir === 1 ? ' ↑' : ' ↓') : '');
  const th = (k: SortKey, label: string, className = '') => (
    <th onClick={() => sort(k)} className={`py-1.5 cursor-pointer hover:text-[var(--text)] select-none ${className}`}>{label}{arrow(k)}</th>
  );

  return (
    <div className="overflow-x-auto max-h-[350px] overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10 text-[var(--text-sec)] text-[10px] uppercase tracking-wider" style={{ background: 'var(--surface)' }}>
          <tr>
            <th className="w-6"></th>
            {th('pos', 'Pos', 'text-center')}
            {th('name', 'Player', 'text-left')}
            {th('ovr', 'OVR', 'text-center')}
            {th('age', 'Age', 'text-center')}
            {statsMap && <th className="py-1.5 text-right pr-2 hidden md:table-cell" title="Points / Rebounds / Assists per game">PPG/R/A</th>}
            {th('salary', 'Sal', 'text-right')}
            {th('yrs', 'Yrs', 'text-center')}
            {th('pts', 'Pts', 'text-right pr-2')}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ p, salary, yrs, pts }) => {
            const sel = selected.has(p.id);
            return (
              <tr
                key={p.id}
                draggable
                onDragStart={e => { e.dataTransfer.setData('application/json', JSON.stringify({ id: p.id, side, kind: 'player' })); e.dataTransfer.effectAllowed = 'copy'; }}
                onClick={() => onToggle(p.id)}
                className="border-t cursor-pointer hover:bg-[var(--surface-2)] transition-colors"
                style={{ borderColor: 'var(--border)', background: sel ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : undefined }}
              >
                <td className="text-center"><input type="checkbox" checked={sel} readOnly className="accent-[var(--accent)] pointer-events-none" /></td>
                <td className="text-center py-1.5"><Chip>{p.sportData.position}</Chip></td>
                <td className="py-1.5 font-semibold truncate hover:text-[var(--accent)]">{p.firstName} {p.lastName}</td>
                <td className={`text-center font-bold tabular-nums ${ratingColor(p.ratings.overall)}`}>{p.ratings.overall}</td>
                <td className="text-center tabular-nums text-[var(--text-sec)]">{p.age}</td>
                {statsMap && (() => {
                  const s = statsMap.get(p.id);
                  const gp = s?.gamesPlayed ?? 0;
                  const log = (p.sportData.seasonLog ?? []) as Array<{ gamesPlayed: number; ppg: number; rpg: number; apg: number }>;
                  const last = log.length ? log[log.length - 1] : null;
                  let text: string;
                  let muted = false;
                  if (gp > 0 && s) {
                    text = `${(s.points / gp).toFixed(1)}/${(s.totalRebounds / gp).toFixed(1)}/${(s.assists / gp).toFixed(1)}`;
                  } else if (last) {
                    text = `${last.ppg.toFixed(1)}/${last.rpg.toFixed(1)}/${last.apg.toFixed(1)}`;
                    muted = true;
                  } else {
                    text = '—';
                    muted = true;
                  }
                  return (
                    <td className={`text-right pr-2 tabular-nums hidden md:table-cell ${muted ? 'text-[var(--text-sec)]' : ''}`}>
                      {text}
                    </td>
                  );
                })()}
                <td className="text-right tabular-nums text-[var(--text-sec)]">{money(salary)}</td>
                <td className="text-center tabular-nums text-[var(--text-sec)]">{yrs || '—'}</td>
                <td className="text-right pr-2 font-bold tabular-nums" style={{ color: 'var(--accent)' }}>~{pts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
