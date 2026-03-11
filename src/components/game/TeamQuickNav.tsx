'use client';

import Link from 'next/link';

const NAV_ITEMS = [
  { key: 'roster', label: 'Roster', href: '/roster' },
  { key: 'finances', label: 'Finances', href: '/finances' },
  { key: 'standings', label: 'Standings', href: '/standings' },
  { key: 'trades', label: 'Trades', href: '/trades' },
  { key: 'stats', label: 'Stats', href: '/stats' },
] as const;

type PageKey = (typeof NAV_ITEMS)[number]['key'];

export function TeamQuickNav({ currentPage }: { currentPage: PageKey }) {
  return (
    <div className="overflow-x-auto no-scrollbar mb-4 -mt-2">
      <div className="flex gap-1 whitespace-nowrap">
        {NAV_ITEMS.map(item => {
          const isCurrent = item.key === currentPage;
          return isCurrent ? (
            <span
              key={item.key}
              className="px-3 py-1 text-xs font-bold text-blue-600 bg-blue-50 rounded-full border border-blue-200"
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
          );
        })}
      </div>
    </div>
  );
}
