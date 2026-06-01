'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * SectionHeader — a consistent title row with an optional action link
 * ("View All →"). Standardizes the header treatment football uses across
 * every card/section.
 */
export function SectionHeader({ title, action, icon }: { title: ReactNode; action?: { label: string; href: string }; icon?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <h3 className="text-sm font-bold tracking-tight flex items-center gap-1.5">
        {icon && <span aria-hidden>{icon}</span>}
        {title}
      </h3>
      {action && (
        <Link href={action.href} className="text-xs font-semibold hover:underline shrink-0" style={{ color: 'var(--accent)' }}>
          {action.label}
        </Link>
      )}
    </div>
  );
}
