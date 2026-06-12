'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { Button } from '@/components/ui/Button';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { Sidebar } from './Sidebar';
import { SimToast } from '@/components/ui/Toast';
import { WhatsNew } from '@/components/ui/WhatsNew';
import { GameSounds } from '@/components/ui/GameSounds';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { GameTicker } from '@/components/dashboard/GameTicker';
import { nextAction, type ActionKey } from '@/lib/ui/nextAction';
import { getBracket } from '@/lib/playoffs';
import { getGmFired } from '@/lib/approval';
import { setTeamLogos } from '@/lib/ui/teamLogos';
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

  // Direction of the current navigation, for the page transition. Read the
  // previous path (held in a ref) during render — deeper path → slide from the
  // right, shallower → from the left, same depth → plain fade.
  const prevPathRef = useRef<string | null>(null);
  const transitionClass = navTransitionClass(prevPathRef.current, pathname);
  useEffect(() => { prevPathRef.current = pathname; }, [pathname]);

  useEffect(() => {
    if (league) return;
    void continueLatest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Publish the active league's per-team logo URLs so TeamLogo can render them.
  useEffect(() => {
    setTeamLogos((league?.teams ?? []) as ReadonlyArray<{ abbreviation: string; logoUrl?: string }>);
  }, [league]);

  // Pre-league: minimal shell so the splash page owns the screen.
  if (!league) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
        <main className="flex-1 bs-animate-fade">{children}</main>
        <ErrorBanner />
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
        <FiredBanner />
        <main key={pathname} className={`flex-1 ${transitionClass}`}>{children}</main>
        <Footer />
      </div>

      <SimToast />
      <WhatsNew />
      <GameSounds />
      <ErrorBanner />
    </div>
  );
}

/** Persistent "you were fired" banner across every page (home shows the full
 *  openings UI, so it's suppressed there). */
function FiredBanner() {
  const league = useLeagueStore(s => s.league);
  const pathname = usePathname() ?? '/';
  if (!league || pathname === '/' || league.userTeamId) return null;
  const fired = getGmFired(league);
  if (!fired) return null;
  return (
    <div className="px-4 py-2 text-sm font-semibold text-white flex flex-wrap items-center gap-2" style={{ background: '#dc2626' }}>
      <span>📉 You were fired by the {fired.teamName}.</span>
      <Link href="/" className="underline hover:no-underline">Pick a new GM job →</Link>
    </div>
  );
}

/** Path "depth" = number of segments ('/' is 0, '/team/x' is 2). */
function pathDepth(path: string): number {
  return path === '/' ? 0 : path.split('/').filter(Boolean).length;
}

/** Pick the page-transition class from where we came vs where we're going. */
function navTransitionClass(prev: string | null, current: string): string {
  if (!prev || prev === current) return 'bs-animate-fade';
  const delta = pathDepth(current) - pathDepth(prev);
  if (delta > 0) return 'bs-animate-slide-right';
  if (delta < 0) return 'bs-animate-slide-left';
  return 'bs-animate-fade';
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
  const pathname = usePathname() ?? '/';

  const action = nextAction(league);
  // "Go to Draft" is a redundant no-op while you're already on the board.
  const secondary = (action.secondary ?? []).filter(s => !(s.key === 'goDraft' && pathname === '/draft'));
  const userTeam = league.userTeamId
    ? (league.teams.find(t => t.id === league.userTeamId) as BasketballTeam | undefined) ?? null
    : null;
  const banner = bannerText(league, userTeam);

  async function run(key: ActionKey) {
    switch (key) {
      case 'simDay': await store.simDay(); break;
      case 'simWeek': await store.simRange('week'); break;
      case 'simDeadline': await store.simRange('deadline'); break;
      case 'simSeason': await store.simRange('season'); break;
      case 'simPlayoffDay': await store.simPlayoffDay(); break;
      case 'simPlayoffRound': await store.simPlayoffRound(); break;
      case 'simAllPlayoffs': await store.simAllPlayoffs(); break;
      case 'simDraftToUser': await store.simDraftToUser(); break;
      case 'simDraftPick': await store.simDraftPick(); break;
      case 'simDraftAll': await store.simDraftAll(); break;
      case 'goDraft': router.push('/draft'); break;
      case 'goReSign': router.push('/re-sign'); break;
      case 'goFreeAgency': router.push('/free-agency'); break;
      case 'startPlayoffs': { if (await store.startPlayoffs()) router.push('/playoffs'); break; }
      case 'enterOffseason': { if (await store.enterOffseason()) router.push('/draft'); break; }
      case 'startNextSeason': { const s = await store.startNextSeason(); if (s) router.push('/'); break; }
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      {/* Main row */}
      <div className="h-14 flex items-center gap-2 px-3 md:px-6">
        <button onClick={onMenu} aria-label="Menu" className="md:hidden w-9 h-9 -ml-1 inline-flex items-center justify-center rounded-lg hover:bg-[var(--surface-2)]">
          <span className="text-xl leading-none">☰</span>
        </button>
        <Link href="/" className="md:hidden text-base font-black tracking-tight mr-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}>
          BS HOOPS
        </Link>

        {/* Schedule ticker (left/center) — replaces the static phase label, with
            the phase label as a fallback when there's no schedule (offseason). */}
        <div className="hidden sm:block flex-1 min-w-0 h-full">
          <GameTicker
            variant="bare"
            fallback={
              <span className="flex items-center h-full text-sm text-[var(--text-sec)] font-semibold">
                {action.phaseLabel}
              </span>
            }
          />
        </div>

        {/* Controls (right) */}
        <div className="ml-auto flex items-center gap-1.5 md:gap-2 flex-wrap justify-end">
          <Button size="sm" disabled={store.loading} onClick={() => void run(action.primary)} className="active:scale-95">
            {store.loading ? 'Working…' : action.label}
          </Button>
          {secondary.map(s => (
            <Button key={s.key} size="sm" variant="secondary" disabled={store.loading} onClick={() => void run(s.key)} className="hidden sm:inline-flex active:scale-95">
              {s.label}
            </Button>
          ))}
          {userTeam && (
            <Link href={`/team/${userTeam.id}`} className="ml-1" title={`${userTeam.city} ${userTeam.name}`}>
              <TeamLogo abbreviation={userTeam.abbreviation} primaryColor={userTeam.primaryColor} secondaryColor={userTeam.secondaryColor} size="sm" />
            </Link>
          )}
        </div>
      </div>

      {/* Status banner */}
      {banner && (
        <div className="px-3 md:px-6 py-1.5 border-t text-xs text-[var(--text-sec)] truncate" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
          {banner}
        </div>
      )}
    </header>
  );
}

/** Context line under the top bar — the user team's record + games left / seed. */
function bannerText(
  league: NonNullable<ReturnType<typeof useLeagueStore.getState>['league']>,
  userTeam: BasketballTeam | null,
): string | null {
  if (!userTeam) return `${league.teams.length} teams · Day ${league.currentTick}`;
  const rec = `${userTeam.record.wins}–${userTeam.record.losses}`;
  const bracket = getBracket(league);
  if (bracket) {
    const seed = bracket.seedInfo[userTeam.id]?.seed;
    if (bracket.complete) {
      const champ = bracket.championTeamId === userTeam.id;
      return `${userTeam.city} ${userTeam.name} · ${rec} · ${champ ? '🏆 Champions' : 'Season complete'}`;
    }
    return `${userTeam.city} ${userTeam.name} · ${rec} · ${seed ? `#${seed} seed` : 'did not make the playoffs'}`;
  }
  const remaining = league.games.filter(
    g => g.status === 'scheduled' && (g.homeTeamId === userTeam.id || g.awayTeamId === userTeam.id),
  ).length;
  return `${userTeam.city} ${userTeam.name} · ${rec}${remaining > 0 ? ` · ${remaining} games remaining` : ''}`;
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
