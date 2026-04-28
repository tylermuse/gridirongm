'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/power-rankings', label: 'Power Rankings', icon: '💪' },
  { href: '/awards', label: 'Award Race', icon: '🎖️' },
] as const;

/** Shared tab bar at the top of /power-rankings and /awards. Lets users
 *  flip between team-strength and player-award views without going back
 *  through the sidebar. (Tyler 4/27 PM consolidation.) */
export function RankingsTabs() {
  const pathname = usePathname();
  return (
    <div className="flex bg-[var(--surface-2)] rounded-lg p-0.5 mb-4 w-fit">
      {TABS.map(t => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-bold transition-colors ${
              active
                ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm'
                : 'text-[var(--text-sec)] hover:text-[var(--text)]'
            }`}
          >
            <span>{t.icon}</span> {t.label}
          </Link>
        );
      })}
    </div>
  );
}
