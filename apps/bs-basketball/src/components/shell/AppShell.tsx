'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { Button } from '@/components/ui/Button';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { Sidebar } from './Sidebar';
import { LegalLinks } from '@/components/legal/LegalPage';
import { SimToast } from '@/components/ui/Toast';
import { WhatsNew } from '@/components/ui/WhatsNew';
import { Booth } from '@/components/show/Booth';
import { GameSounds } from '@/components/ui/GameSounds';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { PlayerModalProvider } from '@/components/modals/PlayerModalProvider';
import { WatchLiveProvider, useWatchLive } from '@/components/live/WatchLiveProvider';
import { GameTicker } from '@/components/dashboard/GameTicker';
import { nextAction, userExpiringCount, type ActionKey, type NextAction } from '@/lib/ui/nextAction';
import { getBracket } from '@/lib/playoffs';
import { getDraft } from '@/lib/draft';
import { getGmFired } from '@/lib/approval';
import { isGodMode } from '@/lib/godMode/godMode';
import { capRoom } from '@/lib/freeAgency';
import { getTradeDeadlineDay } from '@/lib/rules/leagueRules';
import { setTeamLogos } from '@/lib/ui/teamLogos';
import type { BasketballTeam } from '@bs/sport-basketball';

type League = NonNullable<ReturnType<typeof useLeagueStore.getState>['league']>;

/**
 * Persistent app shell — football's GameShell layout:
 *
 *   sidebar (desktop) / slide-out drawer (mobile)
 *   ┌ sticky header ────────────────────────────────────────────┐
 *   │ ☰ │ schedule ticker (full width, every breakpoint)        │
 *   │ phase label            [primary] [secondary…] [team logo] │
 *   │ status line (phase-specific context)                      │
 *   └───────────────────────────────────────────────────────────┘
 *   page (shell-owned padding)
 *   mobile bottom action bar (thumb-reachable sim controls)
 *
 * Pre-league, the shell is minimal so the splash dominates.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { league, loading, continueLatest } = useLeagueStore();
  const pathname = usePathname() ?? '/';
  // True until the first restore attempt settles. The store's `loading` only
  // flips once the effect runs, so without this a deep link rendered one
  // "No league loaded." frame before the loading screen.
  const [booting, setBooting] = useState(!league);

  useEffect(() => {
    if (league) { setBooting(false); return; }
    void continueLatest().finally(() => setBooting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Publish the active league's per-team logo URLs so TeamLogo can render them.
  useEffect(() => {
    setTeamLogos((league?.teams ?? []) as ReadonlyArray<{ abbreviation: string; logoUrl?: string }>);
  }, [league]);

  // Deep link / refresh on an in-game page while the save loads: football's
  // SaveLoadScreen instead of a bare page that the sidebar then pops in around.
  if (!league && (loading || booting) && isGameRoute(pathname)) return <SaveLoadScreen />;

  // Pre-league: minimal shell so the splash page owns the screen.
  if (!league) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
        <main className="flex-1 bs-animate-fade">{children}</main>
        <footer className="px-4 pb-5 flex flex-col items-center">
          <LegalLinks className="justify-center" />
          <p className="text-[10px] text-[var(--text-sec)] mt-1.5 opacity-70">BS Hoops is a parody — not affiliated with the NBA.</p>
        </footer>
        <ErrorBanner />
      </div>
    );
  }

  return <LeagueShell league={league} pathname={pathname}>{children}</LeagueShell>;
}

/** Routes that only make sense with a league loaded (content/marketing pages excluded). */
const GAME_ROUTE_PREFIXES = [
  '/roster', '/re-sign', '/standings', '/stats', '/players', '/power-rankings', '/gm-rankings',
  '/playoffs', '/news', '/show', '/buzz', '/staff', '/finances', '/draft', '/free-agency',
  '/trade', '/transactions', '/awards', '/award-race', '/recap', '/history', '/settings',
  '/team/', '/player/', '/game/', '/coach/', '/compare', '/expansion', '/league', '/schedule',
  '/draft-preview', '/draft-recap', '/predictions',
];

function isGameRoute(pathname: string): boolean {
  return GAME_ROUTE_PREFIXES.some(p => pathname === p || pathname.startsWith(p.endsWith('/') ? p : `${p}/`));
}

/** Football's SaveLoadScreen: spinner + copy, with a Reload escape hatch if
 *  loading hangs. */
function SaveLoadScreen() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: 'var(--bg)' }}>
      <span className="text-2xl font-black tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}>BS HOOPS</span>
      <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" aria-hidden />
      <p className="text-sm text-[var(--text-sec)]" role="status">Loading your league…</p>
      {slow && (
        <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
          Taking a while? Reload
        </Button>
      )}
    </div>
  );
}

function LeagueShell({ league, pathname, children }: { league: League; pathname: string; children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const actions = useShellActions(league, pathname);

  // Direction of the current navigation, for the page transition — deeper
  // path → slide from the right, shallower → from the left, same depth →
  // plain fade. Tracked as derived state (updated during render when the path
  // changes) rather than a ref read during render.
  const [nav, setNav] = useState<{ prev: string | null; current: string }>({ prev: null, current: pathname });
  if (nav.current !== pathname) setNav({ prev: nav.current, current: pathname });
  const transitionClass = navTransitionClass(nav.current !== pathname ? nav.current : nav.prev, pathname);

  // Close the drawer on Escape (it's always mounted now, so it slides).
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const showBottomBar = actions.visible.length > 0;

  return (
    <PlayerModalProvider>
    <WatchLiveProvider>
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      {/* Desktop sidebar */}
      <div className="hidden md:flex md:sticky md:top-0 md:h-screen">
        <Sidebar league={league} pathname={pathname} />
      </div>

      {/* Mobile drawer — always mounted so it slides in AND out. */}
      <div
        className={`fixed inset-0 bg-black/40 z-40 md:hidden transition-opacity duration-200 ${drawerOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden
      />
      <div
        className={`fixed inset-y-0 left-0 z-50 md:hidden transform transition-transform duration-200 ease-in-out ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
        aria-hidden={!drawerOpen}
        inert={!drawerOpen}
      >
        <Sidebar league={league} pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
      </div>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="sticky top-0 z-30">
          <TickerRow onMenu={() => setDrawerOpen(true)} fallbackLabel={actions.phaseLabel} />
          <TopBar league={league} actions={actions} />
        </div>
        {isGodMode(league) && (
          <div className="px-4 py-1 text-center text-xs font-semibold border-b" style={{ background: 'color-mix(in srgb, #eab308 10%, transparent)', borderColor: 'color-mix(in srgb, #eab308 30%, transparent)', color: '#a16207' }}>
            🛠️ God Mode Active
          </div>
        )}
        <FiredBanner />
        <main key={pathname} className={`flex-1 ${transitionClass} ${showBottomBar ? 'pb-20 sm:pb-6' : 'pb-6'}`}>{children}</main>
      </div>

      {showBottomBar && <MobileActionBar actions={actions} />}

      <SimToast />
      <WhatsNew />
      {/* Marcus & Tony call-in on every in-game screen; replaces the feedback bubble. */}
      <Booth />
      <GameSounds />
      <ErrorBanner />
    </div>
    </WatchLiveProvider>
    </PlayerModalProvider>
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
// Next-action runner (shared by the top bar and the mobile bottom bar)
// ===========================================================================

interface ShellActions {
  phaseLabel: string;
  /** Primary first, then secondaries — already filtered for the current page. */
  visible: { key: ActionKey; label: string; primary: boolean }[];
  running: ActionKey | null;
  run: (key: ActionKey) => void;
  banner: string | null;
  userTeam: BasketballTeam | null;
}

/** Resolves once the browser has painted (rAF → next task); the timer covers
 *  background tabs where rAF is paused. Sims run synchronously on the main
 *  thread, so the busy spinner has to paint BEFORE the work starts. */
function afterPaint(): Promise<void> {
  return new Promise(resolve => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    requestAnimationFrame(() => setTimeout(finish, 0));
    setTimeout(finish, 150);
  });
}

function useShellActions(league: League, pathname: string): ShellActions {
  const store = useLeagueStore();
  const router = useRouter();
  const [running, setRunning] = useState<ActionKey | null>(null);
  const runningRef = useRef(false);

  const action: NextAction = nextAction(league);
  // EPIC-G: clean up redundant + miscued CTAs.
  //   1. Pre-team picker (`/rosters` without a userTeamId): the body says
  //      "Pick your team" — hide the primary and relabel the phase.
  //   2. Any goX action on its own destination page is a no-op.
  const onPickerPage = pathname === '/rosters' && !league.userTeamId;
  const redundant = (key: ActionKey) =>
    (key === 'goDraft' && pathname === '/draft') ||
    (key === 'goReSign' && pathname === '/re-sign') ||
    (key === 'goFreeAgency' && pathname === '/free-agency');
  const visible: ShellActions['visible'] = [];
  if (!onPickerPage && !redundant(action.primary)) visible.push({ key: action.primary, label: action.label, primary: true });
  for (const s of action.secondary ?? []) if (!redundant(s.key)) visible.push({ key: s.key, label: s.label, primary: false });

  const userTeam = league.userTeamId
    ? (league.teams.find(t => t.id === league.userTeamId) as BasketballTeam | undefined) ?? null
    : null;

  async function exec(key: ActionKey) {
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
      // Re-sign done → open the FA window (startNextSeason rolls rosters into the
      // preseason + stocks the pool) and land on the Free Agency page.
      case 'startFreeAgency': { const s = await store.startNextSeason(); if (s) router.push('/free-agency'); break; }
      // Inaugural imported draft finishes in place (no year roll), then on to FA (BUG-20).
      case 'finishInaugural': { await store.finishInauguralDraft(); router.push('/free-agency'); break; }
      case 'beginRegularSeason': { if (await store.beginRegularSeason()) router.push('/'); break; }
    }
  }

  // Football's useBusyAction: only the clicked button spins (label unchanged),
  // every sim control is locked while one runs, and the lock holds ≥500ms so
  // clicks queued during a synchronous sim land on a disabled button instead
  // of firing a second sim.
  function run(key: ActionKey) {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(key);
    const started = Date.now();
    void (async () => {
      try {
        await afterPaint();
        await exec(key);
      } finally {
        const left = 500 - (Date.now() - started);
        if (left > 0) await new Promise(r => setTimeout(r, left));
        runningRef.current = false;
        setRunning(null);
      }
    })();
  }

  return {
    phaseLabel: onPickerPage ? 'Pick a Team' : action.phaseLabel,
    visible,
    running,
    run,
    banner: bannerText(league, userTeam),
    userTeam,
  };
}

// ===========================================================================
// Header rows
// ===========================================================================

/** Full-width schedule ticker row (every breakpoint), hamburger in its first
 *  slot on mobile — football's GameTicker row. */
function TickerRow({ onMenu, fallbackLabel }: { onMenu: () => void; fallbackLabel: string }) {
  return (
    <div className="h-14 flex items-stretch border-b relative" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
      <button
        onClick={onMenu}
        aria-label="Open menu"
        className="md:hidden shrink-0 px-3 flex items-center justify-center border-r hover:bg-[var(--surface-2)] transition-colors"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <line x1="3" y1="5" x2="17" y2="5" />
          <line x1="3" y1="10" x2="17" y2="10" />
          <line x1="3" y1="15" x2="17" y2="15" />
        </svg>
      </button>
      <div className="hidden sm:flex items-center gap-2 text-xs text-[var(--text-sec)] px-3 border-r shrink-0" style={{ borderColor: 'var(--border)' }}>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> W</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> L</span>
      </div>
      <div className="flex-1 min-w-0 h-full">
        <GameTicker
          variant="bare"
          fallback={
            <Link href="/" className="flex items-center h-full px-3 gap-2 min-w-0">
              <span className="md:hidden text-base font-black tracking-tight shrink-0" style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}>BS HOOPS</span>
              <span className="text-sm text-[var(--text-sec)] font-semibold truncate">{fallbackLabel}</span>
            </Link>
          }
        />
      </div>
      {/* Right-edge fade hints that the strip scrolls. */}
      <div className="absolute right-0 top-0 bottom-0 w-6 pointer-events-none sm:hidden" style={{ background: 'linear-gradient(to left, var(--bg), transparent)' }} />
    </div>
  );
}

/** While a bulk sim runs, its button reads "Sim Week · 4/7" (football's
 *  "Week 7/18…" readout) so the long sims visibly advance. */
function actionLabel(a: ShellActions['visible'][number], running: ActionKey | null, progress: { done: number; total: number } | null): string {
  if (running !== a.key || !progress || progress.total <= 0) return a.label;
  return `${a.label} · ${progress.done}/${progress.total}`;
}

/** Phase label on the left, the next-action buttons on the right (they wrap
 *  instead of crushing the ticker), then the phase-specific status line. */
function TopBar({ league, actions }: { league: League; actions: ShellActions }) {
  const { visible, running, run, banner, userTeam, phaseLabel } = actions;
  const store = useLeagueStore();
  const locked = !!running || store.loading;
  const progress = store.simProgress;
  const { canWatch, watchLive } = useWatchLive();
  return (
    <header className="border-b" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <div className="min-h-12 flex flex-wrap items-center gap-2 px-3 md:px-6 py-2">
        <span className="text-sm font-semibold text-[var(--text-sec)] truncate min-w-0 mr-auto">
          {league.currentSeason} · {phaseLabel}
        </span>
        {canWatch && (
          // Football's red, pulsing Watch Live — on every page, not just Home.
          <span className="hidden sm:inline-flex">
            <Button size="sm" variant="danger" disabled={locked} onClick={() => void watchLive()} className="whitespace-nowrap">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-pulse" aria-hidden />
              Watch Live
            </Button>
          </span>
        )}
        {visible.length > 0 && (
          // Phones get these in the bottom action bar; keep the primary here
          // too so the header always says what's next.
          <div className="flex flex-wrap items-center justify-end gap-1.5 md:gap-2">
            {visible.map((a, i) => {
              const btn = (
                <Button
                  key={a.key}
                  size="sm"
                  variant={a.primary ? 'primary' : 'secondary'}
                  busy={running === a.key}
                  disabled={locked}
                  onClick={() => run(a.key)}
                  className="whitespace-nowrap"
                >
                  {actionLabel(a, running, progress)}
                </Button>
              );
              // Alternatives live in the bottom bar on phones. The wrapper does
              // the hiding — `hidden` on Button loses to its base inline-flex.
              return i === 0 ? btn : <span key={a.key} className="hidden sm:inline-flex">{btn}</span>;
            })}
          </div>
        )}
        {userTeam && (
          <Link href={`/team/${userTeam.id}`} className="shrink-0 hidden sm:block" title={`${userTeam.city} ${userTeam.name}`}>
            <TeamLogo abbreviation={userTeam.abbreviation} primaryColor={userTeam.primaryColor} secondaryColor={userTeam.secondaryColor} size="sm" />
          </Link>
        )}
      </div>

      {(banner || progress) && (
        <div className="px-3 md:px-6 py-1.5 border-t text-xs text-[var(--text-sec)] truncate" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
          {progress
            ? (
              <span className="font-semibold" style={{ color: 'var(--accent)' }}>
                {progress.total > 0
                  ? `⏩ Simming… Day ${league.currentTick} · ${progress.done} of ${progress.total} game days`
                  : `⏩ Simming the playoffs… ${progress.done} day${progress.done === 1 ? '' : 's'} played`}
              </span>
            )
            : banner}
        </div>
      )}
    </header>
  );
}

/** Football's thumb-reachable bottom bar on phones: the primary next action
 *  plus the first alternative, full width; any further alternatives sit in a
 *  "More" menu that opens upward and closes on an outside tap. */
function MobileActionBar({ actions }: { actions: ShellActions }) {
  const store = useLeagueStore();
  const { visible, running, run } = actions;
  const locked = !!running || store.loading;
  const progress = store.simProgress;
  const [moreOpen, setMoreOpen] = useState(false);
  const extra = visible.slice(2);
  return (
    <>
      {moreOpen && <div className="fixed inset-0 z-40 sm:hidden" onClick={() => setMoreOpen(false)} aria-hidden />}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 border-t px-3 py-2 flex items-center gap-2 sm:hidden"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        {visible.slice(0, 2).map(a => (
          <Button
            key={a.key}
            size="sm"
            variant={a.primary ? 'primary' : 'secondary'}
            busy={running === a.key}
            disabled={locked}
            onClick={() => run(a.key)}
            className="flex-1 whitespace-nowrap"
          >
            {actionLabel(a, running, progress)}
          </Button>
        ))}
        {extra.length > 0 && (
          <div className="relative">
            <Button
              size="sm"
              variant="secondary"
              busy={!!running && extra.some(a => a.key === running)}
              disabled={locked}
              onClick={() => setMoreOpen(o => !o)}
              className="whitespace-nowrap"
            >
              More ▴
            </Button>
            {moreOpen && (
              <div className="absolute right-0 bottom-full mb-2 w-52 rounded-xl border shadow-lg p-1.5 z-50" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                {extra.map(a => (
                  <button
                    key={a.key}
                    disabled={locked}
                    onClick={() => { setMoreOpen(false); run(a.key); }}
                    className="w-full text-left rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-[var(--surface-2)] disabled:opacity-50 transition-colors"
                  >
                    {actionLabel(a, running, progress)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/** Phase-specific context line under the top bar (football's status banner). */
function bannerText(league: League, userTeam: BasketballTeam | null): string | null {
  const rec = userTeam ? `${userTeam.record.wins}–${userTeam.record.losses}` : null;
  const money = (n: number) => `$${(n / 1e6).toFixed(1)}M`;

  const draft = getDraft(league);
  if (draft) {
    if (!draft.complete) {
      const slot = draft.picks[draft.currentPick];
      const onClock = slot ? league.teams.find(t => t.id === slot.teamId) : undefined;
      if (draft.lotteryRevealed === false) return `${draft.season} Draft · Lottery reveal`;
      return [
        `${draft.season} Draft`,
        slot ? `Round ${slot.round} · Pick #${slot.overall}` : null,
        onClock ? `${onClock.abbreviation} on the clock${onClock.id === league.userTeamId ? ' — you\'re up!' : ''}` : null,
      ].filter(Boolean).join(' · ');
    }
    if (!userTeam) return `${draft.season} Offseason`;
    const expiring = userExpiringCount(league, draft.season);
    const room = capRoom(league, userTeam.id);
    if (expiring > 0) return `${expiring} player${expiring === 1 ? '' : 's'} to re-sign · ${money(room)} cap space`;
    return `${league.freeAgentIds.length} free agents available · ${room >= 0 ? `${money(room)} cap space` : `${money(-room)} over the cap`}`;
  }

  const bracket = getBracket(league);
  if (bracket) {
    if (!userTeam) return `Playoffs${bracket.complete ? ' · Season complete' : ''}`;
    const seed = bracket.seedInfo[userTeam.id]?.seed;
    if (bracket.complete) {
      return `${rec} · ${bracket.championTeamId === userTeam.id ? '🏆 Champions' : 'Season complete'}`;
    }
    return `${rec} · ${seed ? `#${seed} seed` : 'Did not make the playoffs'}`;
  }

  if (!userTeam) return `${league.teams.length} teams · Day ${league.currentTick}`;

  const dayOf = (g: League['games'][number]) =>
    (g.sportData as { dayOfSeason?: number; isPlayoff?: boolean } | undefined);
  const regular = league.games.filter(g => !dayOf(g)?.isPlayoff);
  const lastDay = regular.reduce((m, g) => Math.max(m, dayOf(g)?.dayOfSeason ?? 0), 0);
  const remaining = regular.filter(
    g => g.status === 'scheduled' && (g.homeTeamId === userTeam.id || g.awayTeamId === userTeam.id),
  ).length;
  if (remaining === 0 && regular.length > 0) return `${rec} · Regular season complete`;
  const deadline = getTradeDeadlineDay(league);
  const deadlineNote = league.currentTick <= deadline
    ? `Trade deadline: Day ${deadline}`
    : 'Trade window closed';
  return [
    lastDay > 0 ? `Day ${league.currentTick} of ${lastDay}` : null,
    `Record ${rec}`,
    `${remaining} game${remaining === 1 ? '' : 's'} remaining`,
    deadlineNote,
  ].filter(Boolean).join(' · ');
}
