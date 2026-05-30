'use client';

/**
 * BS Hoops Button primitive.
 *
 * Variants:
 *   - primary: orange CTA. Use sparingly — one per page max.
 *   - secondary: gray fill, default action.
 *   - ghost: transparent, hover-only fill. Use for tertiary nav/actions.
 *   - danger: red. Destructive actions only (delete save, etc).
 *
 * Sizes: sm (table actions), md (default), lg (hero CTAs).
 */

import type { ReactNode } from 'react';

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
  title?: string;
}

const variants = {
  primary:   'bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-white shadow-md shadow-[var(--accent-glow)] hover:shadow-lg',
  secondary: 'bg-[var(--surface-2)] hover:bg-[var(--border)] text-[var(--text)]',
  ghost:     'hover:bg-[var(--surface-2)] text-[var(--text-sec)]',
  danger:    'bg-red-600 hover:bg-red-500 text-white',
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

export function Button({
  children, onClick, variant = 'primary', size = 'md',
  disabled, className = '', type = 'button', title,
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        inline-flex items-center justify-center gap-2 font-semibold rounded-lg
        transition-all duration-150 active:scale-[0.98]
        disabled:opacity-40 disabled:pointer-events-none
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]
        focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]
        ${variants[variant]} ${sizes[size]} ${className}
      `}
    >
      {children}
    </button>
  );
}
