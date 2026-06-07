'use client';

import { useState } from 'react';
import { TeamLogo } from '@/components/ui/TeamLogo';
import type { LotteryRevealCard } from '@/lib/draft';

/**
 * Reviewable lottery results board (pick #1 → #14): each team's pre-lottery seed
 * and No. 1 odds next to where it actually landed and how far it moved. Open by
 * default and shown prominently — the one-time reveal ceremony is easy to miss.
 * During the reveal it fills in live: pass `revealedThrough` (the overall being
 * revealed, 14 → 1) and rows that haven't surfaced yet stay locked.
 */

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function MovementTag({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-[var(--text-sec)]">— held</span>;
  const up = delta > 0;
  const n = Math.abs(delta);
  const label = up ? (n >= 3 ? `JUMPED ${n}` : `up ${n}`) : (n >= 3 ? `FELL ${n}` : `down ${n}`);
  return <span style={{ color: up ? '#10b981' : '#dc2626' }} className="font-bold">{up ? '▲' : '▼'} {label}</span>;
}

export function LotteryBoard({
  cards, revealedThrough, defaultOpen = true,
}: {
  cards: LotteryRevealCard[];
  revealedThrough?: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (cards.length === 0) return null;

  const live = revealedThrough !== undefined;
  const isRevealed = (c: LotteryRevealCard) => !live || c.overall >= revealedThrough;

  // Team seeded to each pick slot by its pre-lottery odds — used to project who
  // "should" land at an un-revealed pick before the balls drop.
  const seededBySlot = new Map(cards.map(c => [c.expectedSlot, c] as const));

  // Summary highlights (only once the board is fully settled).
  const jump = [...cards].sort((a, b) => b.delta - a.delta)[0];
  const fall = [...cards].sort((a, b) => a.delta - b.delta)[0];
  const you = cards.find(c => c.isUser);

  return (
    <section className="rounded-xl border bg-[var(--surface)] overflow-hidden mb-4" style={{ borderColor: 'var(--border)' }}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-left" style={{ background: 'var(--muted)' }}>
        <span className="font-bold text-sm">🎰 Lottery Results</span>
        <span className="text-xs text-[var(--text-sec)]">— projected odds vs. where the balls fell</span>
        <span className="ml-auto text-xs opacity-60">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <>
          {!live && (jump || you) && (
            <div className="px-4 py-2 text-xs border-b flex flex-wrap gap-x-4 gap-y-1" style={{ borderColor: 'var(--border)' }}>
              {jump && jump.delta > 0 && <span><span className="text-[#10b981] font-bold">▲ Biggest jump:</span> {jump.team.city} (up {jump.delta} to #{jump.overall})</span>}
              {fall && fall.delta < 0 && <span><span className="text-[#dc2626] font-bold">▼ Biggest fall:</span> {fall.team.city} (down {Math.abs(fall.delta)} to #{fall.overall})</span>}
              {you && <span style={{ color: 'var(--accent)' }} className="font-bold">You: seeded {ordinal(you.expectedSlot)} → landed {ordinal(you.overall)}</span>}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wide text-[var(--text-sec)]" style={{ background: 'var(--surface-2)' }}>
                <tr>
                  <th className="text-left px-3 py-1.5 w-14">Pick</th>
                  <th className="text-left px-3 py-1.5">Team</th>
                  <th className="text-right px-3 py-1.5">Pre-lottery seed</th>
                  <th className="text-right px-3 py-1.5">No. 1 odds</th>
                  <th className="text-right px-3 py-1.5">Movement</th>
                </tr>
              </thead>
              <tbody>
                {cards.map(c => {
                  const revealed = isRevealed(c);
                  return (
                    <tr
                      key={c.overall}
                      className="border-t transition-colors"
                      style={{ borderColor: 'var(--border)', background: revealed && c.isUser ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : live && c.overall === revealedThrough ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : undefined }}
                    >
                      <td className="px-3 py-1.5 font-black tabular-nums">{c.overall}</td>
                      {revealed ? (
                        <>
                          <td className="px-3 py-1.5">
                            <span className="inline-flex items-center gap-2">
                              <TeamLogo abbreviation={c.team.abbreviation} primaryColor={c.team.primaryColor} secondaryColor={c.team.secondaryColor} size="xs" />
                              <span className="font-semibold">{c.team.city} {c.team.name}</span>
                              {c.isUser && <span className="text-[10px] font-bold" style={{ color: 'var(--accent)' }}>YOU</span>}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-sec)]">seeded {ordinal(c.expectedSlot)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-sec)]">{c.oddsPct.toFixed(1)}%</td>
                          <td className="px-3 py-1.5 text-right tabular-nums"><MovementTag delta={c.delta} /></td>
                        </>
                      ) : (() => {
                        // Un-revealed: project the team seeded to this slot by odds.
                        const proj = seededBySlot.get(c.overall);
                        return (
                          <>
                            <td className="px-3 py-1.5 opacity-55">
                              {proj ? (
                                <span className="inline-flex items-center gap-2">
                                  <TeamLogo abbreviation={proj.team.abbreviation} primaryColor={proj.team.primaryColor} secondaryColor={proj.team.secondaryColor} size="xs" />
                                  <span className="font-semibold italic">{proj.team.city} {proj.team.name}</span>
                                  <span className="text-[10px] uppercase tracking-wide">projected</span>
                                </span>
                              ) : <span className="opacity-60">🔒 awaiting reveal…</span>}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-sec)] opacity-60">{proj ? `seeded ${ordinal(proj.expectedSlot)}` : ''}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-sec)] opacity-60">{proj ? `${proj.oddsPct.toFixed(1)}%` : ''}</td>
                            <td className="px-3 py-1.5 text-right text-[var(--text-sec)] opacity-50">—</td>
                          </>
                        );
                      })()}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
