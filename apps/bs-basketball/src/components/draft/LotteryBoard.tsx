'use client';

import { useState } from 'react';
import { TeamLogo } from '@/components/ui/TeamLogo';
import type { LotteryRevealCard } from '@/lib/draft';

/**
 * Static, reviewable lottery results board (pick #1 → #14). Shows what each
 * team was slated to receive going in — its pre-lottery seed and No. 1 odds —
 * next to where it actually landed and how far it moved. Complements the
 * one-time reveal ceremony, which is easy to miss in the moment.
 */

function MovementTag({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-[var(--text-sec)]">— held</span>;
  const up = delta > 0;
  return (
    <span style={{ color: up ? '#10b981' : '#dc2626' }} className="font-semibold">
      {up ? '▲' : '▼'} {Math.abs(delta)} {up ? 'up' : 'down'}
    </span>
  );
}

export function LotteryBoard({ cards }: { cards: LotteryRevealCard[] }) {
  const [open, setOpen] = useState(false);
  if (cards.length === 0) return null;

  return (
    <section className="rounded-xl border bg-[var(--surface)] overflow-hidden mb-4" style={{ borderColor: 'var(--border)' }}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-left" style={{ background: 'var(--muted)' }}>
        <span className="font-bold text-sm">🎰 Lottery results</span>
        <span className="text-xs text-[var(--text-sec)]">— odds vs. where the balls fell</span>
        <span className="ml-auto text-xs opacity-60">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wide text-[var(--text-sec)]" style={{ background: 'var(--surface-2)' }}>
              <tr>
                <th className="text-left px-3 py-1.5 w-14">Pick</th>
                <th className="text-left px-3 py-1.5">Team</th>
                <th className="text-right px-3 py-1.5">Pre-lottery</th>
                <th className="text-right px-3 py-1.5">No. 1 odds</th>
                <th className="text-right px-3 py-1.5">Result</th>
              </tr>
            </thead>
            <tbody>
              {cards.map(c => (
                <tr
                  key={c.overall}
                  className="border-t"
                  style={{ borderColor: 'var(--border)', background: c.isUser ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : undefined }}
                >
                  <td className="px-3 py-1.5 font-black tabular-nums">{c.overall}</td>
                  <td className="px-3 py-1.5">
                    <span className="inline-flex items-center gap-2">
                      <TeamLogo abbreviation={c.team.abbreviation} primaryColor={c.team.primaryColor} secondaryColor={c.team.secondaryColor} size="xs" />
                      <span className="font-semibold">{c.team.city} {c.team.name}</span>
                      {c.isUser && <span className="text-[10px] font-bold" style={{ color: 'var(--accent)' }}>YOU</span>}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-sec)]">seeded {c.expectedSlot}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-sec)]">{c.oddsPct.toFixed(1)}%</td>
                  <td className="px-3 py-1.5 text-right tabular-nums"><MovementTag delta={c.delta} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
