'use client';

/**
 * Mobile v2 design system (experiment).
 *
 * Small set of phone-first building blocks taken from the "BS Football Mobile
 * v2" design: quiet cards with uppercase micro-labels, Barlow Condensed for
 * titles and numbers, tinted rating badges, and one sticky action bar at the
 * bottom of the screen that owns the page's main actions.
 *
 * Everything here is meant to render below the `sm` breakpoint only; callers
 * add `sm:hidden` (the action bar and sheet already do).
 */

import { useEffect, useLayoutEffect, useRef } from 'react';
import Link from 'next/link';

/* ── Text ─────────────────────────────────────────────────────────────── */

/** Uppercase, letter-spaced micro-label that titles a card or a control. */
export function M2Label({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`m2-label ${className}`}>{children}</div>;
}

/* ── Surfaces ─────────────────────────────────────────────────────────── */

export function M2Card({
  children, className = '', selected = false, onClick,
}: {
  children: React.ReactNode;
  className?: string;
  /** Draws the accent outline used for the picked row in a list. */
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl bg-[var(--surface)] border ${
        selected ? 'border-blue-600 ring-1 ring-blue-600' : 'border-[var(--border)]'
      } ${onClick ? 'cursor-pointer active:bg-[var(--surface-2)] transition-colors' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

/* ── Ratings ──────────────────────────────────────────────────────────── */

/** Same bands as the tables' `ratingColor`, as a tinted tile + text pair. */
export function ovrTone(ovr: number): { text: string; tile: string; bar: string } {
  if (ovr >= 80) return { text: 'text-green-600', tile: 'bg-green-500/15 text-green-600', bar: 'bg-green-500' };
  if (ovr >= 65) return { text: 'text-blue-600', tile: 'bg-blue-500/15 text-blue-600', bar: 'bg-blue-600' };
  if (ovr >= 50) return { text: 'text-amber-600', tile: 'bg-amber-500/15 text-amber-600', bar: 'bg-amber-500' };
  return { text: 'text-red-600', tile: 'bg-red-500/15 text-red-600', bar: 'bg-red-500' };
}

/** Square rating tile. Pass `text` to show something other than the number
 *  (free-tier screens show a coarse bucket instead of the exact rating). */
export function OvrBadge({ ovr, text, className = '' }: { ovr: number; text?: string; className?: string }) {
  if (text) {
    return (
      <span className={`inline-flex items-center justify-center rounded-md px-2 h-8 text-[10px] font-bold uppercase tracking-wide bg-[var(--surface-2)] text-[var(--text-sec)] ${className}`}>
        {text}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center justify-center rounded-md min-w-9 h-8 px-1.5 text-[15px] font-extrabold tabular-nums ${ovrTone(ovr).tile} ${className}`}>
      {ovr}
    </span>
  );
}

/**
 * A rating shown as a span on a track: wide while a player is an unknown,
 * narrowing to a tick once scouted.
 */
export function RangeBar({
  lo, hi, min = 40, max = 99, strong = false, className = '',
}: {
  lo: number;
  hi: number;
  min?: number;
  max?: number;
  /** Accent fill (selected / known); otherwise a neutral grey span. */
  strong?: boolean;
  className?: string;
}) {
  const span = Math.max(1, max - min);
  const left = Math.max(0, Math.min(100, ((lo - min) / span) * 100));
  const right = Math.max(0, Math.min(100, ((hi - min) / span) * 100));
  const width = Math.max(4, right - left);
  return (
    <div className={`relative h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden ${className}`}>
      <div
        className={`absolute inset-y-0 rounded-full ${strong ? 'bg-blue-600' : 'bg-slate-400'}`}
        style={{ left: `${Math.min(left, 100 - width)}%`, width: `${width}%` }}
      />
    </div>
  );
}

/** Thin 0–100 meter with a tone, for interest / progress read-outs. */
export function Meter({ pct, tone = 'blue', className = '' }: { pct: number; tone?: 'blue' | 'green' | 'amber' | 'red'; className?: string }) {
  const fill = { blue: 'bg-blue-600', green: 'bg-green-500', amber: 'bg-amber-500', red: 'bg-red-500' }[tone];
  return (
    <div className={`h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden ${className}`}>
      <div className={`h-full rounded-full transition-all ${fill}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

/* ── Choices ──────────────────────────────────────────────────────────── */

/** Tappable choice chip. `accent` tints the active one, `solid` fills it. */
export function Chip({
  children, active = false, onClick, tone = 'accent', disabled = false, className = '',
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  tone?: 'accent' | 'solid';
  disabled?: boolean;
  className?: string;
}) {
  const on = tone === 'solid'
    ? 'bg-[var(--text)] text-[var(--surface)]'
    : 'bg-blue-600/15 text-blue-600';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`h-11 flex-1 min-w-0 rounded-lg text-sm font-bold tabular-nums transition-colors touch-manipulation disabled:opacity-40 ${
        active ? on : 'bg-[var(--surface-2)] text-[var(--text)] active:bg-[var(--border)]'
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** Underlined text tabs that sit above a list. */
export function UnderlineTabs<T extends string>({
  tabs, value, onChange, className = '',
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={`flex items-center gap-4 overflow-x-auto no-scrollbar ${className}`}>
      {tabs.map(t => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`shrink-0 pb-1.5 pt-1 text-sm whitespace-nowrap border-b-2 transition-colors ${
            value === t.id
              ? 'border-blue-600 text-[var(--text)] font-bold'
              : 'border-transparent text-[var(--text-sec)] font-medium'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ── Sticky action bar ────────────────────────────────────────────────── */

export interface BarAction {
  key: string;
  label: React.ReactNode;
  /** Small second line: where the action goes or stops. */
  sub?: React.ReactNode;
  variant?: 'primary' | 'soft' | 'outline' | 'live';
  onClick?: () => void;
  /** Renders as a link instead of a button. */
  href?: string;
  busy?: boolean;
  disabled?: boolean;
  /** Relative width within its row (default 1). */
  grow?: number;
}

const BAR_VARIANTS: Record<NonNullable<BarAction['variant']>, string> = {
  primary: 'bg-blue-600 text-white shadow-sm shadow-blue-600/30 active:bg-blue-700',
  soft: 'bg-[var(--surface-2)] text-[var(--text)] active:bg-[var(--border)]',
  outline: 'bg-[var(--surface)] text-[var(--text)] border border-[var(--border)] active:bg-[var(--surface-2)]',
  live: 'bg-red-600 text-white active:bg-red-700',
};

function BarButton({ action, compact }: { action: BarAction; compact: boolean }) {
  const { label, sub, variant = 'soft', onClick, href, busy = false, disabled = false, grow = 1 } = action;
  const cls = `min-w-0 rounded-lg px-2 flex flex-col items-center justify-center text-center leading-tight touch-manipulation transition-colors ${
    compact ? 'h-11 text-xs' : sub ? 'h-12 text-sm' : 'h-11 text-sm'
  } font-bold ${BAR_VARIANTS[variant]} ${busy ? 'opacity-75 cursor-progress' : ''} ${
    disabled && !busy ? 'opacity-40 pointer-events-none' : ''
  }`;
  const body = (
    <>
      <span className="flex items-center gap-1.5 max-w-full">
        {busy && (
          <span aria-hidden="true" className="inline-block w-3 h-3 shrink-0 rounded-full border-2 border-current border-t-transparent animate-spin" />
        )}
        <span className="truncate">{label}</span>
      </span>
      {sub && !compact && <span className="text-[10px] font-medium opacity-75 truncate max-w-full">{sub}</span>}
    </>
  );
  if (href) {
    return <Link href={href} className={cls} style={{ flex: `${grow} 1 0%` }}>{body}</Link>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cls}
      style={{ flex: `${grow} 1 0%` }}
    >
      {body}
    </button>
  );
}

// Bars currently on screen (the shell's, or a page's own). The tallest one
// sets --action-bar-h; with none mounted the variable is removed.
const liveBars = new Set<HTMLElement>();
function publishBarHeight() {
  const root = document.documentElement;
  let h = 0;
  liveBars.forEach(el => { h = Math.max(h, el.offsetHeight); });
  if (h > 0) root.style.setProperty('--action-bar-h', `${h}px`);
  else root.style.removeProperty('--action-bar-h');
}

/**
 * The one sticky bar at the bottom of a phone screen. Rows of actions, an
 * optional notice line above them. Publishes its height as `--action-bar-h` on
 * <html> so page padding and floating buttons can clear it.
 */
export function ActionBar({
  rows, notice, compact = false, owner = 'shell',
}: {
  rows: BarAction[][];
  notice?: React.ReactNode;
  /** One tight row of short labels (inner pages) instead of roomy two-line buttons. */
  compact?: boolean;
  /** Who is drawing the bar; a page's own bar replaces the shell's. */
  owner?: 'shell' | 'page';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const visibleRows = rows.filter(r => r.length > 0);
  const hasContent = visibleRows.length > 0 || !!notice;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    liveBars.add(el);
    publishBarHeight();
    const ro = new ResizeObserver(publishBarHeight);
    ro.observe(el);
    return () => {
      ro.disconnect();
      liveBars.delete(el);
      publishBarHeight();
    };
  }, [hasContent]);

  if (!hasContent) return null;

  return (
    <div
      ref={ref}
      data-m2-bar={owner}
      className="m2-bar fixed bottom-0 inset-x-0 z-40 sm:hidden bg-[var(--surface)] border-t border-[var(--border)] px-3 pt-2 safe-bottom"
    >
      {notice && <div className="mb-1.5 text-[11px] font-semibold leading-tight">{notice}</div>}
      <div className="flex flex-col gap-1.5">
        {visibleRows.map((row, i) => (
          <div key={i} className="flex items-stretch gap-1.5">
            {row.map(a => <BarButton key={a.key} action={a} compact={compact} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Bottom sheet ─────────────────────────────────────────────────────── */

/** Modal sheet that slides up over the page; tap the backdrop or ✕ to close. */
export function BottomSheet({
  open, onClose, label, children,
}: {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the dialog. */
  label: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] sm:hidden" role="dialog" aria-modal="true" aria-label={label}>
      <div className="absolute inset-0 bg-slate-900/45" onClick={onClose} />
      <div className="m2-sheet absolute inset-x-0 bottom-0 max-h-[88svh] overflow-y-auto rounded-t-2xl bg-[var(--surface)] shadow-2xl px-4 pt-2 safe-bottom">
        <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-[var(--border)]" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}
