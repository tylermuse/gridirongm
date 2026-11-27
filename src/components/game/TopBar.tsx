'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useGameStore, flushToStorage } from '@/lib/engine/store';
import { isDraftOver } from '@/lib/engine/draftStatus';
import { Button } from '@/components/ui/Button';
import { useBusyAction, afterPaint } from '@/components/ui/useBusyAction';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { ActionBar, type BarAction } from '@/components/mobile/m2';
// TradeProposalPopup disabled — user prefers checking trades inline

/** Phone header title per route (longest prefix wins). */
const PAGE_TITLES: [string, string][] = ([
  ['/standings', 'Standings'], ['/playoffs', 'Playoffs'], ['/stats', 'Stats'],
  ['/gm-rankings', 'Rankings'], ['/players', 'Player Search'], ['/player', 'Player'],
  ['/news', 'News'], ['/history', 'History'], ['/roster', 'Roster'], ['/staff', 'Staff'],
  ['/finances', 'Finances'], ['/re-sign', 'Re-signing'], ['/draft-preview', 'Draft Preview'],
  ['/draft-recap', 'Draft Recap'], ['/draft', 'Draft'], ['/free-agency', 'Free Agency'],
  ['/trades', 'Trades'], ['/settings', 'Settings'], ['/qb-pyramid', 'QB Pyramid'],
  ['/expansion', 'Expansion'], ['/awards', 'Awards'], ['/schedule', 'Schedule'],
  ['/team', 'Team'], ['/coach-contracts', 'Coach Contracts'], ['/coach', 'Coach'],
  ['/power-rankings', 'Power Rankings'], ['/recap', 'Recap'], ['/post-draft-cuts', 'Roster Cuts'],
  ['/mock-draft', 'Mock Draft'], ['/gm', 'GM'],
] as [string, string][]).sort((a, b) => b[0].length - a[0].length);

function pageTitleFor(pathname: string): string {
  if (pathname === '/') return 'Dashboard';
  return PAGE_TITLES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? 'BS Football';
}

export function TopBar({ onMenuToggle }: { onMenuToggle?: () => void } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    phase,
    week,
    season,
    schedule,
    teams,
    userTeamId,
    playoffBracket,
    playoffSeeds,
    freeAgents,
    faDay,
    draftOrder,
    resigningPlayers,
    tradeProposals,
    suppressTradePopups,
    leagueSettings,
    simWeek,
    simNextPlayoffGame,
    simPlayoffRound,
    simAllPlayoffGames,
    advanceToResigning,
    advanceToDraft,
    advanceToFreeAgency,
    simDraftPick,
    simToUserDraftPick,
    simToEndDraft,
    startNewSeason,
    currentDraftYear,
    advanceFADay,
    advanceFAWeek,
  } = useGameStore();

  const [newProposalIds, setNewProposalIds] = useState<string[]>([]);
  // Draft-stuck fix: disables the Start-New-Season button + shows a spinner on
  // first tap so a slow mobile Safari main thread can't register a double-tap.
  const [isStartingSeason, setIsStartingSeason] = useState(false);
  const isSpectator = useGameStore(s => s.isSpectator ?? false);
  const isFired = useGameStore(s => !!s.firedState?.fired);
  // Over when every pick is made or the class has run out with picks left (a
  // league with more picks than prospects). Reading only the pick order left
  // such a draft "in progress" for good: no Draft Recap, no Start New Season.
  const draftOver = useGameStore(s => s.phase === 'draft' && isDraftOver(s));
  const stablePhaseRef = useRef<string | null>(null);
  const superBowlDone = !!playoffBracket?.find(m => m.id === 'championship')?.winnerId;
  const stableSBRef = useRef<boolean | null>(null);

  // Wait for store hydration to stabilize before tracking phase transitions.
  // After 500ms, record the "stable" phase. Only redirect on changes AFTER that.
  useEffect(() => {
    const t = setTimeout(() => {
      stablePhaseRef.current = phase;
      stableSBRef.current = superBowlDone;
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A live game commits itself the moment it ends (End Game included), and the game page has its own final
  // score + "Continue →" to the playoffs — redirecting from there skipped the final whistle (QA 11/8)
  const onGamePage = !!pathname?.startsWith('/game/');

  // Auto-redirect to playoffs when phase transitions (post-hydration only)
  useEffect(() => {
    if (stablePhaseRef.current === null) return; // still hydrating
    if (stablePhaseRef.current !== 'playoffs' && phase === 'playoffs' && !onGamePage) {
      router.push('/playoffs');
    }
    stablePhaseRef.current = phase;
  }, [phase, router, onGamePage]);

  // Auto-redirect to playoffs page when Championship completes
  useEffect(() => {
    if (stableSBRef.current === null) return; // still hydrating
    if (!stableSBRef.current && superBowlDone && !onGamePage) {
      router.push('/playoffs');
    }
    stableSBRef.current = superBowlDone;
  }, [superBowlDone, router, onGamePage]);
  const nextPlayoffGame = playoffBracket
    ?.filter(m => !m.winnerId && m.homeTeamId && m.awayTeamId)
    .sort((a, b) => a.round - b.round)[0];
  // The user's next playoff game, once both teams are set — the playoff
  // counterpart of this week's regular-season game for Watch Live.
  const userPlayoffGame = playoffBracket?.find(m =>
    !m.winnerId && m.homeTeamId && m.awayTeamId &&
    (m.homeTeamId === userTeamId || m.awayTeamId === userTeamId));

  // simPlayoffRound always skips the user's matchup (so it can be watched live),
  // so when that's the only game left in the round the button did nothing — the
  // top dead click on /playoffs. Swap it for a "Sim My Game" action instead.
  const currentRoundOpen = nextPlayoffGame
    ? playoffBracket!.filter(m => !m.winnerId && m.homeTeamId && m.awayTeamId && m.round === nextPlayoffGame.round)
    : [];
  const onlyUserGameLeftInRound = currentRoundOpen.length > 0 &&
    currentRoundOpen.every(m => m.homeTeamId === userTeamId || m.awayTeamId === userTeamId);

  const userTeam = teams.find(t => t.id === userTeamId);
  const maxWeek = schedule.length > 0 ? Math.max(...schedule.map(g => g.week)) : 18;

  const pendingTradeCount = tradeProposals.filter(p => p.status === 'pending').length;

  const weeklyRecapCount = useGameStore(s => s.weeklyRecaps.length);
  // Shared sim lock: paints a busy state before the (synchronous) sim runs and
  // disables every sim button until it's done, so queued clicks can't re-sim.
  const { busy: simBusy, run: runSim } = useBusyAction();

  const thisWeekGames = schedule.filter(g => g.week === week);
  const weekAllPlayed = thisWeekGames.length > 0 && thisWeekGames.every(g => g.played);
  // Mirrors simWeek's opening-week roster gate in the store: over 53 going into
  // the first simmed week, simWeek refuses (one deduped alert, then silence) —
  // the Sim Week dead/rage clicks on /roster. Disable the sim and say why.
  const rosterOverBy = phase === 'regular' && !isSpectator && userTeam && (week === 1 || weeklyRecapCount === 0)
    ? Math.max(0, userTeam.roster.length - 53)
    : 0;

  // Free agency → draft reloads the page, so the free-agency screen never
  // re-renders in the draft phase (the "Something Went Wrong" flash). A reload
  // reads the league back from disk, though: if the browser refused the save,
  // that would return the player to their last good save and throw away
  // everything since (player report 2026-11-17, four times in an hour). In
  // that case stay in this page load and navigate in-app instead.
  const goToDraft = useCallback((saved: boolean) => {
    if (saved) window.location.href = '/draft';
    else router.push('/draft');
  }, [router]);

  const handleSimWeek = useCallback(async () => {
    const beforeIds = new Set(useGameStore.getState().tradeProposals.filter(p => p.status === 'pending').map(p => p.id));
    simWeek();
    const afterState = useGameStore.getState();
    if (!afterState.suppressTradePopups) {
      const afterProposals = afterState.tradeProposals.filter(p => p.status === 'pending');
      const newIds = afterProposals.filter(p => !beforeIds.has(p.id)).map(p => p.id);
      if (newIds.length > 0) {
        setNewProposalIds(newIds);
      }
    }
    // Auto-redirect to playoffs when regular season ends
    if (afterState.phase === 'playoffs') {
      await flushToStorage();
      router.push('/playoffs');
    }
  }, [simWeek, router]);

  const handleSimToDeadline = useCallback(async () => {
    const deadlineWeek = (leagueSettings?.tradeDeadlineWeek ?? 12) + 1;
    // simToWeek computes all weeks in a single set() call — no stale state
    useGameStore.getState().simToWeek(deadlineWeek);
    if (useGameStore.getState().phase === 'playoffs') {
      await flushToStorage();
      router.push('/playoffs');
    }
  }, [leagueSettings, router]);

  const [simProgress, setSimProgress] = useState<{ week: number; total: number } | null>(null);

  const handleSimSeason = useCallback(async () => {
    const store = useGameStore.getState();
    const beforeIds = new Set(store.tradeProposals.map(p => p.id));
    const max = Math.max(...store.schedule.map(g => g.week));

    // Sim week by week with async yields for UI updates
    for (let safety = 0; safety < 30; safety++) {
      const s = useGameStore.getState();
      if (s.phase !== 'regular' || s.week > max) break;
      setSimProgress({ week: s.week, total: max });
      s.simWeek();
      await new Promise(r => setTimeout(r, 0));
    }
    setSimProgress(null);

    // Auto-reject any trade proposals generated during the bulk sim
    const afterState = useGameStore.getState();
    const newProposals = afterState.tradeProposals.filter(p => !beforeIds.has(p.id) && p.status === 'pending');
    for (const p of newProposals) {
      afterState.respondToTradeProposal(p.id, false);
    }
    if (useGameStore.getState().phase === 'playoffs') {
      await flushToStorage();
      router.push('/playoffs');
    }
  }, [router]);

  const handleSimPreseason = useCallback(() => {
    const before = useGameStore.getState().phase;
    useGameStore.getState().simPreseasonWeek();
    const after = useGameStore.getState().phase;
    console.log('[TopBar.sim-preseason]', { before, after });
    if (after === 'regular') router.push('/roster');
  }, [router]);

  const handleSkipPreseason = useCallback(() => {
    const before = useGameStore.getState().phase;
    useGameStore.getState().skipPreseason();
    const after = useGameStore.getState().phase;
    console.log('[TopBar.skip-preseason]', { before, after });
    router.push('/roster');
  }, [router]);

  const handleAdvanceToResigning = useCallback(async () => {
    const store = useGameStore.getState();
    if (store.phase !== 'resigning') {
      store.advanceToResigning();
    }
    await flushToStorage();
    // A firing blocks the offseason: stay put and let
    // FiredModal (in GameShell) offer the way forward.
    if (useGameStore.getState().firedState?.fired) return;
    router.push('/re-sign');
  }, [router]);

  const handleAdvanceToFreeAgency = useCallback(async () => {
    const store = useGameStore.getState();
    if (store.phase !== 'freeAgency') {
      store.advanceToFreeAgency();
    }
    await flushToStorage();
    router.push('/free-agency');
  }, [router]);

  const handleAdvanceToDraft = useCallback(async () => {
    let saved = true;
    try {
      const store = useGameStore.getState();
      if (store.phase !== 'draft') {
        store.advanceToDraft();
      }
      saved = await flushToStorage();
    } catch (err) {
      console.error('[AdvanceToDraft] error:', err);
    }
    goToDraft(saved);
  }, [goToDraft]);

  const handleEndFAEarly = useCallback(async () => {
    if (!window.confirm('End free agency early? AI teams will stop making moves and you\'ll advance to the draft.')) return;
    let saved = true;
    try {
      const store = useGameStore.getState();
      store.advanceToDraft();
      saved = await flushToStorage();
    } catch (err) {
      console.error('[EndFAEarly] advanceToDraft error:', err);
    }
    goToDraft(saved);
  }, [goToDraft]);

  const handleAutoDraftAll = useCallback(async () => {
    simToEndDraft({ skipAdvance: true });
    await flushToStorage();
    router.push('/draft-recap');
  }, [simToEndDraft, router]);

  const handleStartNewSeason = useCallback(async () => {
    if (isStartingSeason) return;
    setIsStartingSeason(true);
    try {
      await afterPaint();
      // 5/16 instrumentation widening (bige08676 + marioalsosa
      // cross-tester). Outer try/catch + router.push guarantee
      // even on startNewSeason crash.
      try {
        startNewSeason();
      } catch (err) {
        console.error('[TopBar] startNewSeason escaped its own catch:', err);
        try {
          localStorage.setItem('gg-rollover-outer-error', JSON.stringify({
            ts: new Date().toISOString(),
            source: 'TopBar',
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack?.split('\n').slice(0, 6).join('\n') : undefined,
          }));
        } catch { /* best-effort */ }
      }
      try { await flushToStorage(); } catch (err) { console.error('[TopBar] flushToStorage failed', err); }
      router.push('/roster');
    } finally {
      setIsStartingSeason(false);
    }
  }, [isStartingSeason, startNewSeason, router]);

  // Phase banner context
  let bannerText = '';
  // Phones: the one fact that matters this phase, shown under the page title.
  let phoneFacts = '';
  if (phase === 'regular') {
    const wins = userTeam?.record.wins ?? 0;
    const losses = userTeam?.record.losses ?? 0;
    const ties = userTeam?.record.ties ?? 0;
    const gamesPlayed = wins + losses + ties;
    const totalGames = maxWeek - 1; // 18-week season = 17 games (1 bye)
    const gamesLeft = totalGames - gamesPlayed;
    const dl = leagueSettings?.tradeDeadlineWeek ?? 12;
    const tradeDeadlineNote = week <= dl + 1 ? '' : ' · Trade window closed';
    // Check for bye week
    const userWeekGames = schedule.filter(g => g.week === week && (g.homeTeamId === userTeamId || g.awayTeamId === userTeamId));
    const isBye = userWeekGames.length === 0;
    const recordStr = ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
    bannerText = `Week ${week} of ${maxWeek}${isBye ? ' — BYE WEEK' : ''} · Record: ${recordStr} · ${gamesLeft} game${gamesLeft !== 1 ? 's' : ''} remaining${tradeDeadlineNote}`;
    phoneFacts = `Week ${week}${isBye ? ' · Bye' : ''}`;
  } else if (phase === 'playoffs') {
    if (playoffSeeds && userTeamId) {
      const acSeed = playoffSeeds.AC.indexOf(userTeamId);
      const ncSeed = playoffSeeds.NC.indexOf(userTeamId);
      const seed = acSeed >= 0 ? acSeed + 1 : ncSeed >= 0 ? ncSeed + 1 : null;
      const conf = acSeed >= 0 ? 'AC' : ncSeed >= 0 ? 'NC' : null;
      if (seed && conf) {
        bannerText = `${conf} Seed #${seed}`;
        phoneFacts = `${conf} Seed #${seed}`;
        if (nextPlayoffGame) {
          const opp = nextPlayoffGame.homeTeamId === userTeamId ? nextPlayoffGame.awayTeamId : nextPlayoffGame.homeTeamId;
          const oppTeam = teams.find(t => t.id === opp);
          if (oppTeam) bannerText += ` · Next: ${nextPlayoffGame.homeTeamId === userTeamId ? 'vs' : '@'} ${oppTeam.abbreviation}`;
        } else if (superBowlDone) {
          bannerText += ' · Season Complete';
        }
      } else {
        bannerText = superBowlDone ? 'Playoffs Complete' : 'Playoffs In Progress';
      }
    }
  } else if (phase === 'resigning') {
    const remaining = resigningPlayers.length;
    const capSpace = userTeam ? (userTeam.salaryCap - userTeam.totalPayroll) : 0;
    bannerText = `${remaining} player${remaining !== 1 ? 's' : ''} to re-sign · $${Math.round(capSpace * 10) / 10}M cap space`;
    phoneFacts = `${remaining} to re-sign · $${Math.round(capSpace * 10) / 10}M cap`;
  } else if (phase === 'draft' && draftOver) {
    // Was "Round 8 · Pick #225" after the last pick of a 224-pick draft.
    bannerText = 'Draft complete · Start the new season when you are ready';
    phoneFacts = 'Complete';
  } else if (phase === 'draft') {
    const currentPickTeam = teams.find(t => t.id === draftOrder[0]);
    const totalPicks = teams.length * 7;
    const pickNum = totalPicks - draftOrder.length + 1;
    const round = Math.ceil(pickNum / teams.length);
    bannerText = `Round ${round} · Pick #${pickNum}${currentPickTeam ? ` · ${currentPickTeam.abbreviation} on the clock` : ''}`;
    phoneFacts = `Rd ${round} · Pick ${pickNum}`;
  } else if (phase === 'freeAgency') {
    const remaining = freeAgents.length;
    const capSpace = userTeam ? (userTeam.salaryCap - userTeam.totalPayroll) : 0;
    bannerText = `Day ${faDay} of 30 · ${remaining} free agent${remaining !== 1 ? 's' : ''} available · $${Math.round(capSpace * 10) / 10}M cap space`;
    phoneFacts = `Day ${faDay} · $${Math.round(capSpace * 10) / 10}M cap`;
  }

  const phaseLabel = ({
    preseason: 'Preseason', regular: 'Regular Season', playoffs: 'Playoffs', resigning: 'Re-signing',
    draft: 'Draft', freeAgency: 'Free Agency', offseason: 'Offseason',
  } as Record<string, string>)[phase] ?? '';
  if (phase === 'preseason') phoneFacts = `Game ${useGameStore.getState().preseasonWeek ?? 1}`;

  // ── Phone action bar ──────────────────────────────────────────────────
  // One sticky bar at the bottom carries the phase's actions. The dashboard
  // gets the roomy two-row version with a hint under each button; inner pages
  // get one tight row so the bar costs as little of the screen as possible.
  const isHome = pathname === '/';
  const onGame = pathname.startsWith('/game/');
  const deadlineWeek = leagueSettings?.tradeDeadlineWeek ?? 12;
  const barActions: BarAction[] = [];
  let barNotice: React.ReactNode = null;

  if (onGame) {
    // The live game owns the whole screen.
  } else if (phase === 'preseason') {
    barActions.push(
      { key: 'skip-pre', label: isHome ? 'Skip to Regular Season' : 'Skip →', variant: 'soft', onClick: handleSkipPreseason },
      { key: 'sim-pre', label: isHome ? 'Sim Preseason Game' : 'Sim Game', variant: 'primary', onClick: handleSimPreseason, grow: 1.2 },
    );
  } else if (phase === 'regular') {
    const userGame = schedule.find(g =>
      g.week === week && !g.played && (g.homeTeamId === userTeamId || g.awayTeamId === userTeamId));
    const opp = userGame
      ? teams.find(t => t.id === (userGame.homeTeamId === userTeamId ? userGame.awayTeamId : userGame.homeTeamId))
      : undefined;
    if (userGame && !isSpectator) {
      barActions.push({
        key: 'watch-live',
        label: <><span aria-hidden="true" className="mr-1">▶</span>{isHome ? 'Watch Live' : 'Live'}</>,
        variant: 'soft',
        onClick: () => router.push(`/game/${userGame.id}`),
        grow: isHome ? 0.8 : 0.7,
      });
    }
    barActions.push({
      key: 'sim-week',
      label: simProgress
        ? `Wk ${simProgress.week}/${simProgress.total}`
        : isHome ? `Sim Week ${week}` : `Sim Wk ${week}`,
      sub: userGame && opp
        ? `${userGame.homeTeamId === userTeamId ? 'vs' : '@'} ${opp.abbreviation}`
        : weekAllPlayed ? 'Week complete' : 'Bye week',
      variant: 'primary',
      onClick: () => runSim('sim-week', handleSimWeek),
      busy: simBusy === 'sim-week',
      disabled: weekAllPlayed || rosterOverBy > 0 || !!simBusy || !!simProgress,
      grow: isHome ? 1.2 : 1,
    });
    if (week <= deadlineWeek + 1) {
      barActions.push({
        key: 'sim-deadline',
        label: isHome ? 'Sim to Deadline' : 'To Deadline',
        sub: `Through Wk ${deadlineWeek}`,
        variant: 'outline',
        onClick: () => runSim('sim-deadline', handleSimToDeadline),
        busy: simBusy === 'sim-deadline',
        disabled: !!simBusy || !!simProgress,
      });
    }
    barActions.push({
      key: 'sim-season',
      label: simProgress ? `Week ${simProgress.week}/${simProgress.total}…` : 'Sim Season',
      sub: 'To playoffs',
      variant: 'outline',
      onClick: () => runSim('sim-season', handleSimSeason),
      busy: simBusy === 'sim-season',
      disabled: !!simProgress || rosterOverBy > 0 || !!simBusy,
    });
    // The dashboard lists pending offers under Needs attention already.
    const showTrades = !isSpectator && pendingTradeCount > 0 && !isHome && !pathname.startsWith('/trades');
    if (rosterOverBy > 0 || showTrades) {
      barNotice = (
        <div className="flex items-center justify-between gap-3">
          {rosterOverBy > 0 && (
            <span className="text-red-600">Roster {53 + rosterOverBy}/53 · cut {rosterOverBy} to sim</span>
          )}
          {showTrades && (
            <Link href="/trades" className="ml-auto text-blue-600">
              {pendingTradeCount} trade offer{pendingTradeCount !== 1 ? 's' : ''} →
            </Link>
          )}
        </div>
      );
    }
  } else if (phase === 'playoffs') {
    if (superBowlDone) {
      barActions.push({
        key: 'to-resign', label: 'Advance to Re-signing →', variant: 'primary',
        onClick: handleAdvanceToResigning, disabled: isFired,
      });
    } else {
      if (!isSpectator && userPlayoffGame) {
        barActions.push({
          key: 'watch-live',
          label: <><span aria-hidden="true" className="mr-1">▶</span>{isHome ? 'Watch Live' : 'Live'}</>,
          variant: 'soft',
          onClick: () => router.push(`/game/${userPlayoffGame.id}`),
          grow: isHome ? 0.8 : 0.7,
        });
      }
      barActions.push(
        {
          key: 'playoff-next', label: isHome ? 'Sim Next Game' : 'Next Game', variant: 'primary',
          onClick: () => runSim('playoff-next', simNextPlayoffGame),
          busy: simBusy === 'playoff-next', disabled: !nextPlayoffGame || !!simBusy, grow: isHome ? 1.2 : 1,
        },
        {
          key: 'playoff-round', label: onlyUserGameLeftInRound ? 'Sim My Game' : 'Sim Round', variant: 'outline',
          onClick: () => runSim('playoff-round', onlyUserGameLeftInRound ? simNextPlayoffGame : simPlayoffRound),
          busy: simBusy === 'playoff-round', disabled: !nextPlayoffGame || !!simBusy,
        },
        {
          key: 'playoff-all', label: isHome ? 'Sim Remaining' : 'Sim All', sub: 'To the title game', variant: 'outline',
          onClick: () => runSim('playoff-all', simAllPlayoffGames),
          busy: simBusy === 'playoff-all', disabled: !nextPlayoffGame || !!simBusy,
        },
      );
    }
  } else if (phase === 'resigning') {
    const done = resigningPlayers.length === 0;
    if (!pathname.startsWith('/re-sign')) {
      barActions.push({ key: 'go-resign', label: 'Go to Re-signing', variant: done ? 'soft' : 'primary', href: '/re-sign' });
    }
    barActions.push({
      key: 'to-fa',
      label: done ? 'Advance to Free Agency →' : 'Skip to Free Agency',
      variant: done ? 'primary' : 'soft',
      onClick: handleAdvanceToFreeAgency,
      grow: done ? 1.3 : 1,
    });
  } else if (phase === 'freeAgency') {
    const onFA = pathname.startsWith('/free-agency');
    if (faDay >= 30) {
      if (!onFA) barActions.push({ key: 'go-fa', label: 'Go to Free Agency', variant: 'soft', href: '/free-agency' });
      barActions.push({ key: 'to-draft', label: 'Advance to Draft →', variant: 'primary', onClick: handleAdvanceToDraft, grow: 1.3 });
    } else if (onFA && !isSpectator) {
      // The page's "Skip Day →" / "Skip Week ⏩" live down here on phones,
      // with Skip Day as the main action under the thumb.
      barActions.push(
        { key: 'end-fa', label: 'End FA Early', variant: 'soft', onClick: handleEndFAEarly, disabled: !!simBusy },
        {
          key: 'fa-week', label: 'Skip Week ⏩', variant: 'outline',
          onClick: () => runSim('fa-week', advanceFAWeek),
          busy: simBusy === 'fa-week', disabled: !!simBusy,
        },
        {
          key: 'fa-day', label: 'Skip Day →', variant: 'primary',
          onClick: () => runSim('fa-day', advanceFADay),
          busy: simBusy === 'fa-day', disabled: !!simBusy, grow: 1.2,
        },
      );
    } else {
      barActions.push({ key: 'end-fa', label: 'End FA Early', variant: 'outline', onClick: handleEndFAEarly });
      if (!onFA) barActions.push({ key: 'go-fa', label: 'Go to Free Agency', variant: 'primary', href: '/free-agency', grow: 1.3 });
    }
  } else if (phase === 'draft') {
    const onDraft = pathname === '/draft';
    const userOnClock = draftOrder[0] === userTeamId;
    if (draftOver) {
      barActions.push(
        { key: 'recap', label: 'Draft Recap', variant: 'soft', href: '/draft-recap' },
        { key: 'new-season', label: 'Start New Season →', variant: 'primary', onClick: handleStartNewSeason, busy: isStartingSeason, grow: 1.4 },
      );
    } else if (userOnClock && onDraft && !isSpectator) {
      // The draft page draws its own bar here: Trade pick / Draft <player>.
    } else if (userOnClock) {
      barActions.push({ key: 'go-draft', label: "You're on the clock — Go to Draft", variant: 'primary', href: '/draft' });
    } else {
      if (onDraft) {
        barActions.push({
          key: 'draft-all', label: 'Auto All', variant: 'outline',
          onClick: () => runSim('draft-all', handleAutoDraftAll), busy: simBusy === 'draft-all', disabled: !!simBusy,
        });
      } else {
        barActions.push({ key: 'go-draft', label: 'Go to Draft', variant: 'soft', href: '/draft' });
      }
      barActions.push(
        {
          key: 'draft-to-mine', label: 'To My Pick', variant: 'soft',
          onClick: () => runSim('draft-to-mine', simToUserDraftPick), busy: simBusy === 'draft-to-mine', disabled: !!simBusy,
        },
        {
          key: 'draft-pick', label: 'Sim Pick', variant: 'primary',
          onClick: () => runSim('draft-pick', simDraftPick), busy: simBusy === 'draft-pick', disabled: !!simBusy, grow: 1.2,
        },
      );
    }
  }

  const barRows: BarAction[][] = isHome && barActions.length >= 4
    ? [barActions.slice(0, 2), barActions.slice(2)]
    : [barActions];

  return (
    <>
      {/* On the live game page, the TopBar row is empty on mobile (all phase
          sim buttons are hidden). The hamburger moved into the GameTicker to
          free that vertical space — hide the header on mobile only when the
          user is inside a game, so phone screens don't waste 56px. */}
      <header className={`${pathname.startsWith('/game/') ? 'hidden md:block' : ''} border-b border-[var(--border)] bg-[var(--surface)]`}>
        {/* Phones: page header — title, where the league is, your team. The
            phase actions live in the sticky bar at the bottom of the screen. */}
        <div className="sm:hidden flex items-center justify-between gap-3 px-4 py-2.5">
          <div className="min-w-0">
            <div className="font-display text-[22px] leading-none truncate">{pageTitleFor(pathname)}</div>
            <div className="mt-1 text-xs text-[var(--text-sec)] truncate">
              Season {phase === 'draft' ? (currentDraftYear ?? season) : season}
              {phoneFacts && <> · {phoneFacts}</>}
              {phaseLabel && <> · <span className="font-semibold text-blue-600">{phaseLabel}</span></>}
            </div>
          </div>
          {userTeam && !isSpectator && (
            <TeamLogo
              abbreviation={userTeam.abbreviation}
              primaryColor={userTeam.primaryColor}
              secondaryColor={userTeam.secondaryColor}
              logoUrl={userTeam.logoUrl}
              size="lg"
              className="shrink-0 rounded-lg"
            />
          )}
        </div>
        <div className="hidden sm:flex h-14 items-center justify-between gap-2 px-3 md:px-6">
          <div className="flex items-center gap-2 text-sm text-[var(--text-sec)] shrink-0">
            <span className="hidden sm:inline">
              {phase === 'preseason' && `Preseason Game ${(useGameStore.getState().preseasonWeek ?? 1)}`}
              {phase === 'regular' && `Week ${week} · Regular Season`}
              {phase === 'playoffs' && 'Playoffs'}
              {phase === 'resigning' && 'Re-signing Window'}
              {phase === 'draft' && `Draft · Season ${currentDraftYear ?? season}`}
              {phase === 'freeAgency' && 'Free Agency'}
              {phase === 'offseason' && 'Offseason'}
            </span>
          </div>

          {/* One row on phones, always: extra actions scroll sideways rather than
              wrapping and pushing the page further down. */}
          <div className="flex items-center gap-1 md:gap-2 flex-nowrap sm:flex-wrap sm:justify-end min-w-0 overflow-x-auto sm:overflow-visible no-scrollbar [&_button]:whitespace-nowrap [&>*]:shrink-0">
            {phase === 'preseason' && (
              <>
                <Button onClick={handleSimPreseason} size="sm" className="active:scale-95 transition-transform">
                  <span className="hidden sm:inline">Sim Preseason Game</span>
                  <span className="sm:hidden">Sim Game</span>
                </Button>
                <Button onClick={handleSkipPreseason} size="sm" variant="secondary" className="active:scale-95 transition-transform">
                  <span className="hidden sm:inline">Skip to Regular Season</span>
                  <span className="sm:hidden">Skip →</span>
                </Button>
              </>
            )}
            {phase === 'regular' && !pathname.startsWith('/game/') && (
              <>
                {/* Hidden on /trades itself: there it was a link to the page
                    you're already on — 80 dead clicks/week. */}
                {!isSpectator && pendingTradeCount > 0 && !pathname.startsWith('/trades') && (
                  <span className="hidden sm:inline">
                    <Link href="/trades">
                      <Button size="sm" variant="secondary">
                        Trades ({pendingTradeCount})
                      </Button>
                    </Link>
                  </span>
                )}
                {/* 5/25 (tofftanaut 5/8 msg 1502199098504253492): Watch Live
                    entry point in the TopBar score row when the user team
                    has an unplayed game this week. Sibling button on /roster
                    covers the roster surface. */}
                {!isSpectator && (() => {
                  const userGame = schedule.find(g =>
                    g.week === week && !g.played &&
                    (g.homeTeamId === userTeamId || g.awayTeamId === userTeamId));
                  if (!userGame) return null;
                  return (
                    <Button
                      onClick={() => router.push(`/game/${userGame.id}`)}
                      size="sm"
                      className="active:scale-95 transition-transform bg-red-600 hover:bg-red-700 text-white"
                    >
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-pulse mr-1.5 align-middle" />
                      <span className="hidden sm:inline">Watch Live</span>
                      <span className="sm:hidden">Live</span>
                    </Button>
                  );
                })()}
                {rosterOverBy > 0 && (
                  <span
                    className="hidden sm:inline text-[11px] font-semibold text-red-600 whitespace-nowrap"
                    title="The active roster must be at 53 before you can sim. Use Trim to 53 on the Roster page (IR and practice squad first), or release / demote players yourself."
                  >
                    Roster {53 + rosterOverBy}/53 · cut {rosterOverBy} to sim
                  </span>
                )}
                {/* Same three sim actions as the phone thumb bar below:
                    Sim Week · To Deadline · Sim Season. */}
                <Button
                  onClick={() => runSim('sim-week', handleSimWeek)}
                  size="sm"
                  className="active:scale-95 transition-transform"
                  busy={simBusy === 'sim-week'}
                  disabled={weekAllPlayed || rosterOverBy > 0 || !!simBusy || !!simProgress}
                >
                  <span className="hidden sm:inline">Sim Week {week}</span>
                  <span className="sm:hidden">Sim Wk {week}</span>
                </Button>
                {week <= (leagueSettings?.tradeDeadlineWeek ?? 12) + 1 && (
                  <Button
                    onClick={() => runSim('sim-deadline', handleSimToDeadline)}
                    variant="secondary"
                    size="sm"
                    busy={simBusy === 'sim-deadline'}
                    disabled={!!simBusy}
                    className="active:scale-95 transition-transform"
                  >
                    <span className="hidden sm:inline">Sim to Deadline</span>
                    <span className="sm:hidden">To Deadline</span>
                  </Button>
                )}
                <Button
                  onClick={() => runSim('sim-season', handleSimSeason)}
                  variant="secondary"
                  size="sm"
                  busy={simBusy === 'sim-season'}
                  disabled={!!simProgress || rosterOverBy > 0 || !!simBusy}
                  className="active:scale-95 transition-transform"
                >
                  {simProgress ? `Week ${simProgress.week}/${simProgress.total}...` : 'Sim Season'}
                </Button>
              </>
            )}
            {phase === 'playoffs' && (
              <>
                {!superBowlDone && !pathname.startsWith('/game/') && (
                  <>
                    {!isSpectator && userPlayoffGame && (
                      <Button
                        onClick={() => router.push(`/game/${userPlayoffGame.id}`)}
                        size="sm"
                        className="active:scale-95 transition-transform bg-red-600 hover:bg-red-700 text-white"
                      >
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-pulse mr-1.5 align-middle" />
                        Watch Live
                      </Button>
                    )}
                    <Button
                      onClick={() => runSim('playoff-next', simNextPlayoffGame)}
                      size="sm"
                      busy={simBusy === 'playoff-next'}
                      disabled={!nextPlayoffGame || !!simBusy}
                      className="active:scale-95 transition-transform"
                    >
                      <span className="hidden sm:inline">Sim Next Game</span>
                      <span className="sm:hidden">Next Game</span>
                    </Button>
                    <Button
                      onClick={() => runSim('playoff-round', onlyUserGameLeftInRound ? simNextPlayoffGame : simPlayoffRound)}
                      size="sm"
                      variant="secondary"
                      busy={simBusy === 'playoff-round'}
                      disabled={!nextPlayoffGame || !!simBusy}
                      className="active:scale-95 transition-transform"
                    >
                      {onlyUserGameLeftInRound ? 'Sim My Game' : 'Sim Round'}
                    </Button>
                    <Button
                      onClick={() => runSim('playoff-all', simAllPlayoffGames)}
                      size="sm"
                      variant="secondary"
                      busy={simBusy === 'playoff-all'}
                      disabled={!nextPlayoffGame || !!simBusy}
                      className="active:scale-95 transition-transform"
                    >
                      <span className="hidden sm:inline">Sim Remaining</span>
                      <span className="sm:hidden">Sim All</span>
                    </Button>
                  </>
                )}
                {superBowlDone && (
                  <Button
                    onClick={handleAdvanceToResigning}
                    disabled={isFired}
                    size="sm"
                    className="relative z-20"
                  >
                    <span className="hidden sm:inline">Advance to Re-signing</span>
                    <span className="sm:hidden">Re-signing</span>
                    {' '}→
                  </Button>
                )}
              </>
            )}
            {phase === 'resigning' && (
              <>
                {!pathname.startsWith('/re-sign') && (
                  <Link href="/re-sign">
                    <Button size="sm">
                      Go to Re-signing
                    </Button>
                  </Link>
                )}
                <Button
                  onClick={handleAdvanceToFreeAgency}
                  variant="secondary"
                  size="sm"
                >
                  {resigningPlayers.length === 0 ? (<><span className="hidden sm:inline">Advance to Free Agency</span><span className="sm:hidden">Free Agency</span>{' '}→</>) : (<><span className="hidden sm:inline">Skip to Free Agency</span><span className="sm:hidden">FA →</span></>)}
                </Button>
              </>
            )}
            {phase === 'freeAgency' && (
              <>
                {!pathname.startsWith('/free-agency') && (
                  <Link href="/free-agency">
                    <Button size="sm">
                      Go to Free Agency
                    </Button>
                  </Link>
                )}
                {faDay >= 30 ? (
                  <Button onClick={handleAdvanceToDraft} variant="secondary" size="sm">
                    <span className="hidden sm:inline">Advance to Draft</span>
                    <span className="sm:hidden">Draft</span>
                    {' '}→
                  </Button>
                ) : (
                  <Button
                    onClick={handleEndFAEarly}
                    variant="secondary"
                    size="sm"
                  >
                    <span className="hidden sm:inline">End Free Agency Early</span>
                    <span className="sm:hidden">End FA Early</span>
                  </Button>
                )}
              </>
            )}
            {phase === 'draft' && (
              <>
                {!pathname.startsWith('/draft') && (
                  <Link href="/draft">
                    <Button size="sm">
                      Go to Draft
                    </Button>
                  </Link>
                )}
                {!draftOver ? (
                  <>
                    {draftOrder[0] !== userTeamId && (
                      <Button onClick={() => runSim('draft-pick', simDraftPick)} size="sm" variant="secondary" busy={simBusy === 'draft-pick'} disabled={!!simBusy}>
                        Sim Pick
                      </Button>
                    )}
                    {draftOrder[0] !== userTeamId && (
                      <Button onClick={() => runSim('draft-to-mine', simToUserDraftPick)} size="sm" variant="secondary" busy={simBusy === 'draft-to-mine'} disabled={!!simBusy}>
                        <span className="hidden sm:inline">Sim to My Pick</span>
                        <span className="sm:hidden">To My Pick</span>
                      </Button>
                    )}
                    <Button
                      onClick={() => runSim('draft-all', handleAutoDraftAll)}
                      size="sm"
                      variant="secondary"
                      busy={simBusy === 'draft-all'}
                      disabled={!!simBusy}
                    >
                      <span className="hidden sm:inline">Auto-Draft All</span>
                      <span className="sm:hidden">Auto All</span>
                    </Button>
                  </>
                ) : (
                  <>
                    <Link href="/draft-recap">
                      <Button size="sm" variant="secondary">
                        Draft Recap
                      </Button>
                    </Link>
                    <Button size="sm" busy={isStartingSeason} onClick={handleStartNewSeason}>
                      <span className="hidden sm:inline">Start New Season</span>
                      <span className="sm:hidden">New Season</span>
                      {' '}→
                    </Button>
                  </>
                )}
              </>
            )}

          </div>
        </div>

        {/* Phase context banner */}
        {bannerText && (
          <div className="hidden sm:block px-3 md:px-6 py-1.5 bg-[var(--surface-2)] border-t border-[var(--border)] text-xs text-[var(--text-sec)] truncate">
            {bannerText}
          </div>
        )}
      </header>

      {/* Phones: the sticky action bar owns this phase's actions. */}
      <ActionBar rows={barRows} notice={barNotice} compact={!isHome} />

      {/* Trade proposal popup — disabled, user prefers inline notifications */}

    </>
  );
}
