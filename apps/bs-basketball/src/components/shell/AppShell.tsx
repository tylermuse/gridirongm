'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { Badge } from '@/components/ui/Badge';

/**
 * Persistent app shell.
 *
 * Top bar: BS HOOPS wordmark (always visible) + primary nav (League /
 * Standings / My Team) + day badge when a league is loaded.
 *
 * The nav links only render once a league is in memory — pre-league the
 * shell is minimal so the splash page can dominate.
 *
 * Auto-hydrate: on first mount, try to load the most recent saved league
 * from Dexie. That way the nav has data to render against even on a hard
 * refresh.
 */

export function AppShell({ children }: { children: ReactNode }) {
  const { league, continueLatest } = useLeagueStore();
  const pathname = usePathname() ?? '/';

  // Auto-hydrate once at app load.
  useEffect(() => {
    if (league) return;
    void continueLatest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isHome = pathname === '/';
  const userTeamId = league?.userTeamId ?? null;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      <TopBar
        league={league}
        userTeamId={userTeamId}
        pathname={pathname}
        isHome={isHome}
      />

      <main key={pathname} className="flex-1 bs-animate-fade">{children}</main>

      <Footer />
    </div>
  );
}

// ===========================================================================
// TopBar
// ===========================================================================

function TopBar({
  league, userTeamId, pathname, isHome,
}: {
  league: ReturnType<typeof useLeagueStore.getState>['league'];
  userTeamId: string | null;
  pathname: string;
  isHome: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const day = league?.currentTick;
  const playedCount = league?.games.filter(g => g.status === 'played').length ?? 0;
  const totalGames = league?.games.length ?? 0;

  const navItems: { href: string; label: string; active: boolean; emphasis?: boolean }[] = league
    ? [
        { href: '/league',    label: 'League',    active: pathname.startsWith('/league') },
        { href: '/standings', label: 'Standings', active: pathname.startsWith('/standings') },
        { href: '/power-rankings', label: 'Power', active: pathname.startsWith('/power-rankings') },
        { href: '/playoffs',  label: 'Playoffs',  active: pathname.startsWith('/playoffs') },
        { href: '/news',      label: 'News',      active: pathname.startsWith('/news') },
        ...(userTeamId
          ? [{ href: `/team/${userTeamId}`, label: 'My Team', active: pathname === `/team/${userTeamId}`, emphasis: true }]
          : []),
      ]
    : [];

  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur"
      style={{
        background: 'color-mix(in srgb, var(--bg) 88%, transparent)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="max-w-6xl mx-auto px-5 py-3 flex items-center gap-4 sm:gap-6">
        <Link href="/" className="flex items-baseline gap-2 group">
          <span
            className="text-2xl font-black tracking-tight leading-none"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--accent)',
            }}
          >
            BS HOOPS
          </span>
          <span className="text-[10px] uppercase tracking-widest opacity-50 hidden sm:inline">
            GM
          </span>
        </Link>

        {league && (
          <>
            {/* Desktop nav */}
            <nav className="hidden sm:flex items-center gap-1 ml-2">
              {navItems.map(item => (
                <NavLink key={item.href} {...item} />
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-3">
              {!isHome && (
                <span className="hidden sm:inline text-xs text-[var(--text-sec)]">
                  {playedCount} / {totalGames} games
                </span>
              )}
              <Badge variant="orange" size="md">
                {day ? `Day ${day}` : 'Day 1'}
              </Badge>
              {/* Hamburger (mobile only) */}
              <button
                onClick={() => setMenuOpen(o => !o)}
                aria-label="Menu"
                aria-expanded={menuOpen}
                className="sm:hidden w-11 h-11 -mr-2 inline-flex items-center justify-center rounded-lg text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors"
              >
                <span className="text-xl leading-none">{menuOpen ? '✕' : '☰'}</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Mobile dropdown menu */}
      {league && menuOpen && (
        <nav
          className="sm:hidden border-t bs-animate-fade"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
        >
          <div className="max-w-6xl mx-auto px-3 py-2 flex flex-col">
            {navItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center min-h-11 px-3 rounded-md text-base font-semibold transition ${
                  item.active
                    ? 'text-[var(--accent)] bg-[var(--surface-2)]'
                    : 'text-[var(--text-sec)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}

function NavLink({
  href, label, active, emphasis,
}: {
  href: string; label: string; active?: boolean; emphasis?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`
        px-3 py-1.5 rounded-md text-sm font-semibold transition
        ${active
          ? 'text-[var(--accent)] bg-[var(--surface-2)]'
          : 'text-[var(--text-sec)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'}
        ${emphasis ? 'border border-[var(--accent)]' : ''}
      `}
    >
      {label}
    </Link>
  );
}

// ===========================================================================
// Footer
// ===========================================================================

function Footer() {
  return (
    <footer
      className="border-t mt-12"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between text-xs text-[var(--text-sec)]">
        <span>
          <span className="font-black" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}>
            BS HOOPS
          </span>{' '}
          · built on the BS multi-sport adapter
        </span>
        <span className="opacity-60 hidden sm:inline">
          parody · not affiliated with the NBA
        </span>
      </div>
    </footer>
  );
}
