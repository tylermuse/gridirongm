'use client';

import Link from 'next/link';

/**
 * Football's team quick-nav: a pill row above the team-facing pages so you can
 * hop between Roster / Finances / Standings / Trade / Stats without the sidebar
 * (the main way around on a phone).
 */
const NAV_ITEMS = [
  { key: 'roster', label: 'Roster', href: '/roster' },
  { key: 'finances', label: 'Finances', href: '/finances' },
  { key: 'standings', label: 'Standings', href: '/standings' },
  { key: 'trade', label: 'Trade', href: '/trade' },
  { key: 'stats', label: 'Stats', href: '/stats' },
] as const;

export type QuickNavKey = (typeof NAV_ITEMS)[number]['key'];

export function TeamQuickNav({ current }: { current: QuickNavKey }) {
  return (
    <nav aria-label="Team pages" className="overflow-x-auto no-scrollbar mb-3">
      <div className="flex gap-1 whitespace-nowrap">
        {NAV_ITEMS.map(item => (
          item.key === current ? (
            <span
              key={item.key}
              aria-current="page"
              className="px-3 py-1 text-xs font-bold rounded-full border"
              style={{
                color: 'var(--accent)',
                background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)',
              }}
            >
              {item.label}
            </span>
          ) : (
            <Link
              key={item.key}
              href={item.href}
              className="px-3 py-1 text-xs font-medium text-[var(--text-sec)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] rounded-full transition-colors"
            >
              {item.label}
            </Link>
          )
        ))}
      </div>
    </nav>
  );
}
