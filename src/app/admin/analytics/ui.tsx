'use client';

import type { ReactNode } from 'react';
import type { Change } from './businessMetrics';

/** Shared building blocks for the /admin/analytics sections. */

export function SectionHeading({ title, note }: { title: string; note?: ReactNode }) {
  return (
    <div className="mb-3">
      <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">{title}</h2>
      {note && <p className="text-xs text-gray-400 mt-1">{note}</p>}
    </div>
  );
}

export function Card({ title, right, children, className = '' }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-5 ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-3 mb-4">
          {title && <h3 className="text-sm font-bold text-gray-900">{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * A change against an earlier figure. Direction is carried by the arrow and
 * the words as well as the colour; `upIsGood={false}` is for numbers like
 * cancellations, where a rise is the bad news.
 */
export function Delta({
  change,
  vs,
  format = (n) => n.toLocaleString(),
  upIsGood = true,
}: {
  change: Change;
  /** What it is compared with, e.g. "vs previous 30d". */
  vs: string;
  /** How to print the size of the change (always given a positive number). */
  format?: (n: number) => string;
  upIsGood?: boolean;
}) {
  if (change.abs === 0) return <span className="text-xs text-gray-400">No change {vs}</span>;
  const up = change.abs > 0;
  const good = up === upIsGood;
  const pct = change.pct === null ? '' : ` (${Math.abs(change.pct) >= 10 ? '10x+' : `${Math.round(Math.abs(change.pct) * 100)}%`})`;
  return (
    <span className="text-xs text-gray-400">
      <span className={`font-semibold ${good ? 'text-emerald-700' : 'text-red-700'}`}>
        {up ? '▲' : '▼'} {format(Math.abs(change.abs))}{pct}
      </span>{' '}
      {vs}
    </span>
  );
}

/** One headline number. `value === null` means its query failed: a dash, never a fake zero. */
export function Tile({
  label,
  value,
  delta,
  sub,
  size = 'md',
}: {
  label: string;
  value: string | number | null;
  delta?: ReactNode;
  sub?: ReactNode;
  size?: 'md' | 'lg';
}) {
  const failed = value === null;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5" title={failed ? 'This number did not load — see the warning at the top' : undefined}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`${size === 'lg' ? 'text-3xl' : 'text-2xl'} font-bold tabular-nums ${failed ? 'text-gray-300' : 'text-gray-900'}`}>
        {failed ? '—' : typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      {delta && <div className="mt-1">{delta}</div>}
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

/** A two-or-three-way switch in a card header. */
export function Toggle<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
            value === o.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export interface RankedBar {
  label: string;
  value: number;
  /** Quiet extra text after the label, e.g. "2 subscribed". */
  note?: string;
}

/** Ranked horizontal bars on one baseline, largest first; all one colour because position already ranks them. */
export function RankedBars({ rows }: { rows: RankedBar[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-sm text-gray-700 truncate">{r.label}</span>
              {r.note && <span className="text-xs text-emerald-700 font-medium whitespace-nowrap">{r.note}</span>}
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full bg-blue-500" style={{ width: `${(r.value / max) * 100}%` }} />
            </div>
          </div>
          <div className="text-xs font-medium text-gray-500 w-12 text-right tabular-nums">{r.value.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}

/** A section that starts folded away: detail worth keeping, not worth scrolling past every visit. */
export function Collapsible({ title, note, defaultOpen = false, children }: { title: string; note?: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details open={defaultOpen} className="group">
      <summary className="flex items-center gap-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <span className="text-gray-400 text-xs transition-transform group-open:rotate-90">▶</span>
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{title}</span>
        {note && <span className="text-xs text-gray-400">{note}</span>}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
