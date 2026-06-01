'use client';

import type { ReactNode } from 'react';

/**
 * Category Chip — a colored, rounded label for editorial categories
 * (Playoffs, Free Agency, MVP Race, …). Distinct from Badge (status pills):
 * a Chip is tinted by a category color and reads as a topic tag.
 */
export type ChipTone = 'accent' | 'green' | 'amber' | 'red' | 'blue' | 'violet' | 'slate';

const TONE: Record<ChipTone, string> = {
  accent: 'var(--accent)',
  green: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
  blue: '#3b82f6',
  violet: '#8b5cf6',
  slate: '#64748b',
};

export function Chip({ children, tone = 'slate', className = '' }: { children: ReactNode; tone?: ChipTone; className?: string }) {
  const c = TONE[tone];
  return (
    <span
      className={`inline-flex items-center font-bold rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${className}`}
      style={{ background: `color-mix(in srgb, ${c} 16%, transparent)`, color: c }}
    >
      {children}
    </span>
  );
}
