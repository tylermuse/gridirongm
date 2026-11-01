'use client';

import type { ReactNode } from 'react';

/**
 * BS Hoops Badge.
 * Compact pill for inline status / labels.
 */

interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'orange' | 'green' | 'red' | 'amber' | 'blue';
  size?: 'sm' | 'md';
  className?: string;
}

const variants = {
  default: 'bg-[var(--surface-2)] text-[var(--text-sec)]',
  orange:  'bg-[var(--accent)] text-white',
  // Alpha tints rather than light pastels so the chips also read on the dark theme.
  green:   'bg-green-500/15 text-green-600',
  red:     'bg-red-500/15 text-red-600',
  amber:   'bg-amber-500/15 text-amber-600',
  blue:    'bg-blue-500/15 text-blue-600',
};

export function Badge({ children, variant = 'default', size = 'sm', className = '' }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center font-semibold rounded-full uppercase tracking-wide
        ${size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'}
        ${variants[variant]} ${className}
      `}
    >
      {children}
    </span>
  );
}
