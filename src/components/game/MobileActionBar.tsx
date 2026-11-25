'use client';

/**
 * Phone action bar: the current phase's actions (sim, advance, draft…) pinned
 * to the bottom of the screen, where a thumb can reach them. Desktop keeps the
 * same buttons in the top bar; this renders below `sm` only.
 *
 * Publishes its height as `--action-bar-h` on <html>, so page padding and the
 * Booth launcher can sit clear of it whatever its height is right now.
 */

import { useLayoutEffect, useRef } from 'react';
import Link from 'next/link';

export interface BarAction {
  key: string;
  label: React.ReactNode;
  variant?: 'primary' | 'soft' | 'outline' | 'live';
  onClick?: () => void;
  /** Renders as a link instead of a button. */
  href?: string;
  busy?: boolean;
  disabled?: boolean;
  /** Relative width within its row (default 1). */
  grow?: number;
}

const VARIANTS: Record<NonNullable<BarAction['variant']>, string> = {
  primary: 'bg-blue-600 text-white shadow-sm shadow-blue-600/30 active:bg-blue-700',
  soft: 'bg-[var(--surface-2)] text-[var(--text)] active:bg-[var(--border)]',
  outline: 'bg-[var(--surface)] text-[var(--text)] border border-[var(--border)] active:bg-[var(--surface-2)]',
  live: 'bg-red-600 text-white active:bg-red-700',
};

function BarButton({ action }: { action: BarAction }) {
  const { label, variant = 'soft', onClick, href, busy = false, disabled = false, grow = 1 } = action;
  const cls = `min-w-0 h-11 rounded-lg px-1.5 flex items-center justify-center gap-1 text-center text-xs font-bold leading-tight touch-manipulation transition-colors ${VARIANTS[variant]} ${
    busy ? 'opacity-75 cursor-progress' : ''
  } ${disabled && !busy ? 'opacity-40 pointer-events-none' : ''}`;
  const body = (
    <>
      {busy && (
        // Compositor-driven, so it keeps spinning while a synchronous sim runs.
        <span aria-hidden="true" className="inline-block w-3 h-3 shrink-0 rounded-full border-2 border-current border-t-transparent animate-spin" />
      )}
      {/* One line on most phones; a second line rather than a cut-off
          label on the narrowest ones. */}
      <span className="line-clamp-2">{label}</span>
    </>
  );
  const style = { flex: `${grow} 1 0%` };
  if (href) return <Link href={href} className={cls} style={style}>{body}</Link>;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cls}
      style={style}
    >
      {body}
    </button>
  );
}

/** Up to four actions share a row; more wrap onto a second row. */
export function MobileActionBar({ actions, notice }: { actions: BarAction[]; notice?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const hasContent = actions.length > 0 || !!notice;

  useLayoutEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    if (!el) {
      root.style.removeProperty('--action-bar-h');
      return;
    }
    const publish = () => {
      // display:none at sm and up, so offsetHeight is 0 there.
      if (el.offsetHeight > 0) root.style.setProperty('--action-bar-h', `${el.offsetHeight}px`);
      else root.style.removeProperty('--action-bar-h');
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--action-bar-h');
    };
  }, [hasContent]);

  if (!hasContent) return null;

  const rows = actions.length > 4
    ? [actions.slice(0, Math.ceil(actions.length / 2)), actions.slice(Math.ceil(actions.length / 2))]
    : [actions];

  return (
    <div
      ref={ref}
      className="fixed bottom-0 inset-x-0 z-40 sm:hidden bg-[var(--surface)] border-t border-[var(--border)] px-3 pt-2 action-bar-safe-bottom"
    >
      {notice && <div className="mb-1.5 text-[11px] font-semibold leading-tight">{notice}</div>}
      <div className="flex flex-col gap-1.5">
        {rows.filter(r => r.length > 0).map((row, i) => (
          <div key={i} className="flex items-stretch gap-1.5">
            {row.map(a => <BarButton key={a.key} action={a} />)}
          </div>
        ))}
      </div>
    </div>
  );
}
