'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { Badge } from '@/components/ui/Badge';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { Sidebar } from './Sidebar';
import { nextAction, type ActionKey } from '@/lib/ui/nextAction';
import type { BasketballTeam } from '@bs/sport-basketball';

/**
 * Persistent app shell (Tier 1.1 + 1.2).
 *
 * League loaded → a sectioned sidebar (desktop) / slide-out drawer (mobile) +
 * a slim, phase-aware top bar whose primary CTA is always "the next thing to
 * do". Pre-league, the shell is minimal so the splash dominates.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { league, continueLatest } = useLeagueStore();
  const pathname = usePathname() ?? '/';
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (league) return;
    void continueLatest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-league: minimal shell so the splash page owns the screen.
  if (!league) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
        <main className="flex-1 bs-animate-fade">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      {/* Desktop sidebar */}
      <div className="hidden md:flex md:sticky md:top-0 md:h-screen">
        <Sidebar league={league} pathname={pathname} />
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setDrawerOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-50 md:hidden bs-animate-fade">
            <Sidebar league={league} pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </>
      )}

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar league={league} onMenu={() => setDrawerOpen(true)} />
        <main key={pathname} className="flex-1 bs-animate-fade">{children}</main>
        <Footer />
      </div>
    </div>
  );
}

// ===========================================================================
// Slim, phase-aware top bar
// ===========================================================================

function TopBar({
  league, onMenu,
}: {
  league: NonNullable<ReturnType<typeof useLeagueStore.getState>['league']>;
  onMenu: () => void;
}) {
  const store = useLeagueStore();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const action = nextAction(league);
  const played = league.games.filter(g => g.status === 'played').length;
  const total = league.games.length;
  const userTeam = league.userTeamId
    ? (league.teams.find(t => t.id === league.userTeamId) as BasketballTeam | undefined) ?? null
    : null;

  async function run(key: ActionKey) {
    setMenuOpen(false);
    switch (key) {
      case 'simDay': await store.simDay(); break;
      case 'simWeek': await store.simRange('week'); break;
      case 'simDeadline': await store.simRange('deadline'); break;
      case 'simSeason': await store.simRange('season'); break;
      case 'simPlayoffDay': await store.simPlayoffDay(); break;
      case 'simDraftToUser': await store.simDraftToUser(); break;
      case 'goDraft': router.push('/draft'); break;
      case 'startPlayoffs': { if (await store.startPlayoffs()) router.push('/playoffs'); break; }
      case 'enterOffseason': { if (await store.enterOffseason()) router.push('/draft'); break; }
      case 'startNextSeason': { const s = await store.startNextSeason(); if (s) router.push('/'); break; }
    }
  }

  return (
    <header
      className="sticky top-0 z-30 h-14 border-b backdrop-blur flex items-center gap-3 px-4"
      style={{ background: 'color-mix(in srgb, var(--bg) 88%, transparent)', borderColor: 'var(--border)' }}
    >
      <button onClick={onMenu} aria-label="Menu" className="md:hidden w-9 h-9 -ml-1 inline-flex items-center justify-center rounded-lg hover:bg-[var(--surface-2)]">
        <span className="text-xl leading-none">☰</span>
      </button>
      <Link href="/" className="md:hidden text-lg font-black tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}>
        BS HOOPS
      </Link>

      <Badge variant="orange" size="md">Day {league.currentTick}</Badge>
      <span className="hidden sm:inline text-xs text-[var(--text-sec)] tabular-nums">{played} / {total} games</span>

      <div className="ml-auto flex items-center gap-2">
        {/* Phase-aware primary CTA (+ secondary dropdown) */}
        <div className="relative inline-flex">
          <button
            onClick={() => void run(action.primary)}
            disabled={store.loading}
            className="px-4 py-2 rounded-lg font-bold text-sm transition disabled:opacity-50 text-white"
            style={{ background: 'var(--accent)', borderTopRightRadius: action.secondary ? 0 : undefined, borderBottomRightRadius: action.secondary ? 0 : undefined }}
          >
            {store.loading ? 'Working…' : `${action.label} →`}
          </button>
          {action.secondary && (
            <button
              onClick={() => setMenuOpen(o => !o)}
              disabled={store.loading}
              aria-label="More sim options"
              className="px-2 py-2 rounded-r-lg font-bold text-sm text-white border-l border-white/25 disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              ▾
            </button>
          )}
          {menuOpen && action.secondary && (
            <div className="absolute right-0 top-full mt-1 w-52 rounded-lg border bg-[var(--surface)] shadow-lg overflow-hidden z-40" style={{ borderColor: 'var(--border)' }}>
              {action.secondary.map(s => (
                <button
                  key={s.key}
                  onClick={() => void run(s.key)}
                  className="w-full text-left px-3 py-2 text-sm font-semibold hover:bg-[var(--surface-2)]"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {userTeam && (
          <Link href={`/team/${userTeam.id}`} className="hidden sm:block" title={`${userTeam.city} ${userTeam.name}`}>
            <TeamLogo abbreviation={userTeam.abbreviation} primaryColor={userTeam.primaryColor} secondaryColor={userTeam.secondaryColor} size="sm" />
          </Link>
        )}
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t mt-12" style={{ borderColor: 'var(--border)' }}>
      <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between text-xs text-[var(--text-sec)]">
        <span>
          <span className="font-black" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}>BS HOOPS</span>{' '}
          · built on the BS multi-sport adapter
        </span>
        <span className="opacity-60 hidden sm:inline">parody · not affiliated with the NBA</span>
      </div>
    </footer>
  );
}
