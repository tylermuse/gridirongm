'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Segmented strip over power rankings / award race / GM rankings (parity). */
const TABS = [
  { href: '/power-rankings', emoji: '💪', label: 'Power Rankings' },
  { href: '/awards', emoji: '🎖️', label: 'Award Race' },
  { href: '/gm-rankings', emoji: '🏅', label: 'GM Rankings' },
];

export function RankingsTabs() {
  const path = usePathname();
  return (
    <div className="flex bg-[var(--surface-2)] rounded-lg p-0.5 mb-4 w-fit">
      {TABS.map(t => {
        const active = path === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-bold transition-colors"
            style={active ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' } : { color: 'var(--text-sec)' }}
          >
            <span aria-hidden>{t.emoji}</span> {t.label}
          </Link>
        );
      })}
    </div>
  );
}
