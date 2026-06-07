'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Toggle between the player search and the head-to-head compare tool — Compare
 *  lives under Players rather than its own nav item. */
const TABS = [
  { href: '/players', emoji: '🔎', label: 'Players' },
  { href: '/compare', emoji: '⚖️', label: 'Compare' },
];

export function PlayersTabs() {
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
