'use client';

import { useMemo } from 'react';
import { depthChart, ROLE_LABEL, ROLE_COLOR, type PositionDepth } from '@/lib/roster/depthChart';
import { OvrChip, TwoWayChip } from '@/components/roster/RosterCells';
import type { BasketballPlayer } from '@bs/sport-basketball';

const POS_COLORS: Record<string, string> = {
  PG: '#06b6d4', SG: '#10b981', SF: '#f59e0b', PF: '#f97316', C: '#8b5cf6',
};
const HEALTH: Record<PositionDepth['health'], { label: string; color: string }> = {
  thin: { label: 'Thin', color: '#ef4444' },
  ok: { label: 'OK', color: '#f59e0b' },
  deep: { label: 'Deep', color: '#10b981' },
};

/**
 * Per-position depth chart (parity audit #21) — the positional lens on the
 * roster: each spot's ordered depth, a health read, and role tags. Lives in the
 * roster page's Depth tab, so it renders expanded (no collapse toggle).
 */
export function DepthChart({ roster, starterIds, onName }: { roster: BasketballPlayer[]; starterIds: string[]; onName: (id: string) => void }) {
  const chart = useMemo(() => depthChart(roster, starterIds), [roster, starterIds]);

  return (
    <div className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-4 py-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
        <span className="text-sm font-bold">Depth by position</span>
        <span className="text-xs text-[var(--text-sec)]">starter → backups, with rotation / reserve tags</span>
      </div>

      {/* Five positions: 2-up on tablets (the odd fifth spans the row so there's
          no empty grey sixth cell), all five across from lg. */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-px" style={{ background: 'var(--border)' }}>
        {chart.map(col => (
          <div key={col.position} className="bg-[var(--surface)] p-3 sm:last:odd:col-span-2 lg:last:odd:col-span-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-black text-sm" style={{ color: POS_COLORS[col.position] }}>{col.position}</span>
              <span className="text-[10px] font-bold rounded px-1.5 py-0.5" style={{ background: `color-mix(in srgb, ${HEALTH[col.health].color} 16%, transparent)`, color: HEALTH[col.health].color }}>{HEALTH[col.health].label}</span>
              <span className="ml-auto text-[10px] text-[var(--text-sec)]">{col.entries.length}</span>
            </div>
            {col.entries.length === 0 ? (
              <p className="text-xs text-[var(--text-sec)]">No one listed here.</p>
            ) : (
              <ol className="space-y-1">
                {col.entries.map((e, i) => (
                  <li key={e.player.id}>
                    <button
                      onClick={() => onName(e.player.id)}
                      className="group w-full flex items-center gap-2 text-sm px-1 py-1 rounded hover:bg-[var(--surface-2)] transition-colors text-left"
                    >
                      <span className="w-4 text-xs tabular-nums text-[var(--text-sec)]">{i + 1}</span>
                      <span className="flex-1 min-w-0 flex items-center gap-1">
                        <span className={`truncate group-hover:text-[var(--accent)] transition-colors ${e.isStarter ? 'font-semibold' : ''}`}>
                          {e.player.firstName[0]}. {e.player.lastName}
                        </span>
                        <TwoWayChip player={e.player} />
                      </span>
                      <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 shrink-0" style={{ background: `color-mix(in srgb, ${ROLE_COLOR[e.role]} 16%, transparent)`, color: ROLE_COLOR[e.role] }}>{ROLE_LABEL[e.role]}</span>
                      <OvrChip value={e.player.ratings.overall} className="shrink-0" />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
