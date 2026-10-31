'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useGameStore, flushToStorage } from '@/lib/engine/store';
import { Button } from '@/components/ui/Button';
import { useBusyAction } from '@/components/ui/useBusyAction';
import { GamePlanModal } from './GamePlanModal';
// TradeProposalPopup disabled — user prefers checking trades inline

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
  } = useGameStore();

  const [newProposalIds, setNewProposalIds] = useState<string[]>([]);
  const [showGamePlanModal, setShowGamePlanModal] = useState(false);
  const nextGamePlan = useGameStore(s => s.nextGamePlan);
  const setNextGamePlan = useGameStore(s => s.setNextGamePlan);
  const isSpectator = useGameStore(s => s.isSpectator ?? false);
  const isFired = useGameStore(s => !!s.firedState?.fired);
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

  // Auto-redirect to playoffs when phase transitions (post-hydration only)
  useEffect(() => {
    if (stablePhaseRef.current === null) return; // still hydrating
    if (stablePhaseRef.current !== 'playoffs' && phase === 'playoffs') {
      router.push('/playoffs');
    }
    stablePhaseRef.current = phase;
  }, [phase, router]);

  // Auto-redirect to playoffs page when Championship completes
  useEffect(() => {
    if (stableSBRef.current === null) return; // still hydrating
    if (!stableSBRef.current && superBowlDone) {
      router.push('/playoffs');
    }
    stableSBRef.current = superBowlDone;
  }, [superBowlDone, router]);
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

  // Phase banner context
  let bannerText = '';
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
  } else if (phase === 'playoffs') {
    if (playoffSeeds && userTeamId) {
      const acSeed = playoffSeeds.AC.indexOf(userTeamId);
      const ncSeed = playoffSeeds.NC.indexOf(userTeamId);
      const seed = acSeed >= 0 ? acSeed + 1 : ncSeed >= 0 ? ncSeed + 1 : null;
      const conf = acSeed >= 0 ? 'AC' : ncSeed >= 0 ? 'NC' : null;
      if (seed && conf) {
        bannerText = `${conf} Seed #${seed}`;
        if (nextPlayoffGame) {
          const opp = nextPlayoffGame.homeTeamId === userTeamId ? nextPlayoffGame.awayTeamId : nextPlayoffGame.homeTeamId;
          const oppTeam = teams.find(t => t.id === opp);
          if (oppTeam) bannerText += ` · Next: vs ${oppTeam.abbreviation}`;
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
  } else if (phase === 'draft') {
    const currentPickTeam = teams.find(t => t.id === draftOrder[0]);
    const totalPicks = teams.length * 7;
    const pickNum = totalPicks - draftOrder.length + 1;
    const round = Math.ceil(pickNum / teams.length);
    bannerText = `Round ${round} · Pick #${pickNum}${currentPickTeam ? ` · ${currentPickTeam.abbreviation} on the clock` : ''}`;
  } else if (phase === 'freeAgency') {
    const remaining = freeAgents.length;
    const capSpace = userTeam ? (userTeam.salaryCap - userTeam.totalPayroll) : 0;
    bannerText = `Day ${faDay} of 30 · ${remaining} free agent${remaining !== 1 ? 's' : ''} available · $${Math.round(capSpace * 10) / 10}M cap space`;
  }

  return (
    <>
      {/* On the live game page, the TopBar row is empty on mobile (all phase
          sim buttons are hidden). The hamburger moved into the GameTicker to
          free that vertical space — hide the header on mobile only when the
          user is inside a game, so phone screens don't waste 56px. */}
      <header className={`${pathname.startsWith('/game/') ? 'hidden md:block' : ''} border-b border-[var(--border)] bg-[var(--surface)]`}>
        <div className="h-14 flex items-center justify-between px-3 md:px-6">
          <div className="flex items-center gap-2 text-sm text-[var(--text-sec)]">
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

          <div className="flex items-center gap-1 md:gap-2 flex-wrap justify-end">
            {phase === 'preseason' && (
              <>
                <Button onClick={() => {
                  const before = useGameStore.getState().phase;
                  useGameStore.getState().simPreseasonWeek();
                  const after = useGameStore.getState().phase;
                  console.log('[TopBar.sim-preseason]', { before, after });
                  if (after === 'regular') router.push('/roster');
                }} size="sm" className="active:scale-95 transition-transform">
                  Sim Preseason Game
                </Button>
                <Button onClick={() => {
                  const before = useGameStore.getState().phase;
                  useGameStore.getState().skipPreseason();
                  const after = useGameStore.getState().phase;
                  console.log('[TopBar.skip-preseason]', { before, after });
                  router.push('/roster');
                }} size="sm" variant="secondary" className="active:scale-95 transition-transform">
                  Skip to Regular Season
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
                {!isSpectator && (
                  <span title={nextGamePlan
                    ? `Plan: ${100 - nextGamePlan.passRate}R/${nextGamePlan.passRate}P · ${nextGamePlan.aggressiveness} · RZ ${nextGamePlan.redZoneStrategy}${nextGamePlan.blitzRate !== undefined ? ` · Blitz ${nextGamePlan.blitzRate}%` : ''}${nextGamePlan.coverage ? ` · ${nextGamePlan.coverage}` : ''}`
                    : 'Set a default game plan that applies to every simmed game'}>
                    <Button
                      onClick={() => setShowGamePlanModal(true)}
                      variant="secondary"
                      size="sm"
                      className="active:scale-95 transition-transform"
                    >
                      📋 Plan{nextGamePlan ? ' ✓' : ''}
                    </Button>
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
                      Watch Live
                    </Button>
                  );
                })()}
                {rosterOverBy > 0 && (
                  <span
                    className="hidden sm:inline text-[11px] font-semibold text-red-600 whitespace-nowrap"
                    title="The active roster must be at 53 before the regular season starts. Use Auto-cut to 53 on the Roster page, or release / demote players to the practice squad."
                  >
                    Roster {53 + rosterOverBy}/53 · cut {rosterOverBy} to sim
                  </span>
                )}
                <Button
                  onClick={() => runSim('sim-week', handleSimWeek)}
                  size="sm"
                  className="active:scale-95 transition-transform"
                  busy={simBusy === 'sim-week'}
                  disabled={weekAllPlayed || rosterOverBy > 0 || !!simBusy || !!simProgress}
                >
                  Sim Week {week}
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
                    Sim to Deadline
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
                      Sim Next Game
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
                      Sim Remaining
                    </Button>
                  </>
                )}
                {superBowlDone && (
                  <Button
                    onClick={async () => {
                      const store = useGameStore.getState();
                      if (store.phase !== 'resigning') {
                        store.advanceToResigning();
                      }
                      await flushToStorage();
                      // A firing blocks the offseason: stay put and let
                      // FiredModal (in GameShell) offer the way forward.
                      if (useGameStore.getState().firedState?.fired) return;
                      router.push('/re-sign');
                    }}
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
                  onClick={async () => {
                    const store = useGameStore.getState();
                    if (store.phase !== 'freeAgency') {
                      store.advanceToFreeAgency();
                    }
                    await flushToStorage();
                    router.push('/free-agency');
                  }}
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
                  <Button onClick={async () => {
                    try {
                      const store = useGameStore.getState();
                      if (store.phase !== 'draft') {
                        store.advanceToDraft();
                      }
                      await flushToStorage();
                    } catch (err) {
                      console.error('[AdvanceToDraft] error:', err);
                    }
                    window.location.href = '/draft';
                  }} variant="secondary" size="sm">
                    <span className="hidden sm:inline">Advance to Draft</span>
                    <span className="sm:hidden">Draft</span>
                    {' '}→
                  </Button>
                ) : (
                  <Button
                    onClick={async () => {
                      if (!window.confirm('End free agency early? AI teams will stop making moves and you\'ll advance to the draft.')) return;
                      try {
                        const store = useGameStore.getState();
                        store.advanceToDraft();
                        await flushToStorage();
                      } catch (err) {
                        console.error('[EndFAEarly] advanceToDraft error:', err);
                      }
                      window.location.href = '/draft';
                    }}
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
                {draftOrder.length > 0 ? (
                  <>
                    {draftOrder[0] !== userTeamId && (
                      <Button onClick={() => runSim('draft-pick', simDraftPick)} size="sm" variant="secondary" busy={simBusy === 'draft-pick'} disabled={!!simBusy}>
                        Sim Pick
                      </Button>
                    )}
                    {draftOrder[0] !== userTeamId && (
                      <Button onClick={() => runSim('draft-to-mine', simToUserDraftPick)} size="sm" variant="secondary" busy={simBusy === 'draft-to-mine'} disabled={!!simBusy}>
                        Sim to My Pick
                      </Button>
                    )}
                    <Button
                      onClick={() => runSim('draft-all', async () => {
                        simToEndDraft({ skipAdvance: true });
                        await flushToStorage();
                        router.push('/draft-recap');
                      })}
                      size="sm"
                      busy={simBusy === 'draft-all'}
                      disabled={!!simBusy}
                    >
                      Auto-Draft All
                    </Button>
                  </>
                ) : (
                  <>
                    <Link href="/draft-recap">
                      <Button size="sm" variant="secondary">
                        Draft Recap
                      </Button>
                    </Link>
                    <Button size="sm" onClick={async () => {
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
                    }}>
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
          <div className="px-3 md:px-6 py-1.5 bg-[var(--surface-2)] border-t border-[var(--border)] text-xs text-[var(--text-sec)] truncate">
            {bannerText}
          </div>
        )}
      </header>

      {/* Mobile bottom action bar — thumb-accessible */}
      {phase === 'regular' && !pathname.startsWith('/game/') && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--surface)] border-t border-[var(--border)] px-3 py-2 flex items-center justify-center gap-2 sm:hidden safe-bottom">
          {rosterOverBy > 0 && (
            <span className="text-[11px] font-semibold text-red-600 leading-tight shrink-0">
              Cut {rosterOverBy}<br />to sim
            </span>
          )}
          <Button
            onClick={() => runSim('sim-week', handleSimWeek)}
            size="sm"
            className="flex-1 active:scale-95 transition-transform"
            busy={simBusy === 'sim-week'}
            disabled={weekAllPlayed || rosterOverBy > 0 || !!simBusy || !!simProgress}
          >
            {simProgress ? `Wk ${simProgress.week}/${simProgress.total}` : `Sim Week ${week}`}
          </Button>
          <Button
            onClick={() => runSim('sim-season', handleSimSeason)}
            size="sm"
            variant="secondary"
            className="flex-1 active:scale-95 transition-transform"
            busy={simBusy === 'sim-season'}
            disabled={!!simProgress || rosterOverBy > 0 || !!simBusy}
          >
            {simProgress ? `${simProgress.week}/${simProgress.total}...` : 'Sim Season'}
          </Button>
          {pendingTradeCount > 0 && !pathname.startsWith('/trades') && (
            <Link href="/trades">
              <Button size="sm" variant="secondary">
                Trades ({pendingTradeCount})
              </Button>
            </Link>
          )}
        </div>
      )}

      {/* Trade proposal popup — disabled, user prefers inline notifications */}

      {/* Game Plan modal — set the persistent default that simmed games use */}
      {showGamePlanModal && (
        <GamePlanModal
          opponentName={(() => {
            // Show next opponent if there is one, otherwise just "Default"
            const userTeam = teams.find(t => t.id === userTeamId);
            const next = schedule.find(g => !g.played && g.week >= week && (g.homeTeamId === userTeamId || g.awayTeamId === userTeamId));
            if (!next || !userTeam) return 'Default';
            const oppId = next.homeTeamId === userTeamId ? next.awayTeamId : next.homeTeamId;
            const opp = teams.find(t => t.id === oppId);
            return opp ? `${opp.city} ${opp.name}` : 'Default';
          })()}
          onConfirm={(plan) => {
            setNextGamePlan(plan);
            setShowGamePlanModal(false);
          }}
          onCancel={() => setShowGamePlanModal(false)}
        />
      )}
    </>
  );
}
