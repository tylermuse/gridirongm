'use client';

import { useMemo, useState } from 'react';
import { depthChart, ROLE_LABEL, ROLE_COLOR, type PositionDepth } from '@/lib/roster/depthChart';
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
 * roster: each spot's ordered depth, a health read, and role tags. Collapsible
 * so it doesn't crowd the lineup table.
 */
export function DepthChart({ roster, starterIds, onName }: { roster: BasketballPlayer[]; starterIds: string[]; onName: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const chart = useMemo(() => depthChart(roster, starterIds), [roster, starterIds]);

  return (
    <div className="rounded-xl border bg-[var(--surface)] mt-4 overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-[var(--surface-2)] transition-colors">
        <span className="text-sm font-bold">Depth by position</span>
        <span className="text-xs text-[var(--text-sec)]">starter → backups, with two-way / reserve tags</span>
        <span className="ml-auto text-[var(--text-sec)]">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px" style={{ background: 'var(--border)' }}>
          {chart.map(col => (
            <div key={col.position} className="bg-[var(--surface)] p-3">
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
                      <button onClick={() => onName(e.player.id)} className="w-full flex items-center gap-2 text-sm px-1 py-0.5 rounded hover:bg-[var(--surface-2)] transition-colors text-left">
                        <span className="w-4 text-xs tabular-nums text-[var(--text-sec)]">{i + 1}</span>
                        <span className="flex-1 truncate">{e.player.firstName[0]}. {e.player.lastName}</span>
                        <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 shrink-0" style={{ background: `color-mix(in srgb, ${ROLE_COLOR[e.role]} 16%, transparent)`, color: ROLE_COLOR[e.role] }}>{ROLE_LABEL[e.role]}</span>
                        <span className="tabular-nums text-xs font-bold w-7 text-right">{e.player.ratings.overall}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
