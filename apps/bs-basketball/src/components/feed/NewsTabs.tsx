'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/news', label: 'News', icon: '📰' },
  { href: '/recap', label: 'Recap', icon: '🎙️' },
] as const;

/** Shared News / Recap pill strip at the top of /news and /recap (football
 *  parity — football's NewsTabs). Lets users flip between the league news feed
 *  and the season recap without going back through the nav. */
export function NewsTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="News sections" className="flex bg-[var(--surface-2)] rounded-lg p-0.5 mb-4 w-fit">
      {TABS.map(t => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-bold transition-colors ${
              active
                ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm'
                : 'text-[var(--text-sec)] hover:text-[var(--text)] hover:bg-[var(--border)]/50'
            }`}
          >
            <span aria-hidden>{t.icon}</span> {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
