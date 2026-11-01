'use client';

import type { ReactNode } from 'react';
import { TeamQuickNav, type QuickNavKey } from './TeamQuickNav';

/**
 * Football's page header: optional team quick-nav pills, then a heavy
 * uppercase display title (`text-2xl font-black font-display uppercase
 * tracking-tight`), an optional subtitle line and a right-aligned slot for
 * page controls. One header style for every page instead of a per-page mix.
 */
export function PageHeader({
  title, subtitle, right, quickNav, className = 'mb-5',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  quickNav?: QuickNavKey;
  className?: string;
}) {
  return (
    <div className={className}>
      {quickNav && <TeamQuickNav current={quickNav} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-black font-display uppercase tracking-tight leading-tight">{title}</h1>
          {subtitle && <div className="text-sm text-[var(--text-sec)] mt-0.5">{subtitle}</div>}
        </div>
        {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
      </div>
    </div>
  );
}
