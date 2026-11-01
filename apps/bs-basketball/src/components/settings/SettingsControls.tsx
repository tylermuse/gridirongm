'use client';

/**
 * Small shared controls for the Settings surfaces (football parity: every
 * toggle and link-button gets a hover state instead of a static inline style).
 *
 *   - SettingsChoice: the big two-up "pick one" tile (Light / Dark, Muted / On,
 *     Grows yearly / Flat cap).
 *   - settingsLinkClass: Button-primitive styling for a next/link, so a link
 *     that reads as a button (Sign in, See Premium, Open expansion) looks and
 *     hovers exactly like <Button> without nesting a <button> in an <a>.
 */

import type { ReactNode } from 'react';

export function SettingsChoice({
  active, onClick, icon, label, disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon?: ReactNode;
  label: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
      className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold transition active:scale-95 disabled:opacity-40 ${
        active
          ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
          : 'border-[var(--border)] text-[var(--text-sec)] hover:text-[var(--text)] hover:border-[var(--accent)] hover:bg-[var(--surface-2)]'
      }`}
    >
      {icon && <span aria-hidden className="text-base">{icon}</span>}
      {label}
    </button>
  );
}

const LINK_BASE = 'inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]';

const LINK_VARIANTS = {
  primary: 'bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-white shadow-md shadow-[var(--accent-glow)] hover:shadow-lg',
  secondary: 'bg-[var(--surface-2)] hover:bg-[var(--border)] text-[var(--text)]',
} as const;

const LINK_SIZES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
} as const;

/** Class string that makes a <Link> look like the Button primitive. */
export function settingsLinkClass(variant: keyof typeof LINK_VARIANTS = 'primary', size: keyof typeof LINK_SIZES = 'md'): string {
  return `${LINK_BASE} ${LINK_VARIANTS[variant]} ${LINK_SIZES[size]}`;
}
