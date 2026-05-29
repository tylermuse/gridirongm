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
  green:   'bg-green-100 text-green-700',
  red:     'bg-red-100 text-red-700',
  amber:   'bg-amber-100 text-amber-700',
  blue:    'bg-blue-100 text-blue-700',
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
