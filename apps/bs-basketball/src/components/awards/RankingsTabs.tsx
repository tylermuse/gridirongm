'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Segmented strip over power rankings / award race / awards / GM rankings
 *  (football parity — football's RankingsTabs). Hoops splits the live race
 *  (/award-race) from the decided ceremony (/awards), so both get a tab.
 *  Short labels below `sm` keep all four on one phone-width row. */
const TABS = [
  { href: '/power-rankings', emoji: '💪', label: 'Power Rankings', short: 'Power' },
  { href: '/award-race', emoji: '🎖️', label: 'Award Race', short: 'Race' },
  { href: '/awards', emoji: '🏆', label: 'Awards', short: 'Awards' },
  { href: '/gm-rankings', emoji: '🏅', label: 'GM Rankings', short: 'GM' },
] as const;

export function RankingsTabs() {
  const path = usePathname();
  return (
    <nav aria-label="Rankings" className="max-w-full overflow-x-auto no-scrollbar mb-4">
      <div className="flex bg-[var(--surface-2)] rounded-lg p-0.5 w-fit">
        {TABS.map(t => {
          const active = path === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? 'page' : undefined}
              // Hover fill matches SegmentedControl's: the track itself is
              // surface-2, so a surface-2 hover would be invisible.
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-bold whitespace-nowrap transition-colors ${
                active
                  ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm'
                  : 'text-[var(--text-sec)] hover:text-[var(--text)] hover:bg-[var(--border)]/50'
              }`}
            >
              <span aria-hidden>{t.emoji}</span>
              <span className="sm:hidden">{t.short}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
