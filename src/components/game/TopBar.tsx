'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useGameStore } from '@/lib/engine/store';
import { Button } from '@/components/ui/Button';
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
  } = useGameStore();

  const [newProposalIds, setNewProposalIds] = useState<string[]>([]);
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

  const userTeam = teams.find(t => t.id === userTeamId);
  const maxWeek = schedule.length > 0 ? Math.max(...schedule.map(g => g.week)) : 18;

  const pendingTradeCount = tradeProposals.filter(p => p.status === 'pending').length;

  const handleSimWeek = useCallback(() => {
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
      router.push('/playoffs');
    }
  }, [simWeek, router]);

  const handleSimToDeadline = useCallback(() => {
    const deadlineWeek = (leagueSettings?.tradeDeadlineWeek ?? 12) + 1;
    // simToWeek computes all weeks in a single set() call — no stale state
    useGameStore.getState().simToWeek(deadlineWeek);
    if (useGameStore.getState().phase === 'playoffs') {
      router.push('/playoffs');
    }
  }, [leagueSettings, router]);

  const handleSimSeason = useCallback(() => {
    const store = useGameStore.getState();
    const beforeIds = new Set(store.tradeProposals.map(p => p.id));
    const max = Math.max(...store.schedule.map(g => g.week));
    // simToWeek computes all weeks in a single set() call — no stale state
    useGameStore.getState().simToWeek(max + 1);
    // Auto-reject any trade proposals generated during the bulk sim
    const afterState = useGameStore.getState();
    const newProposals = afterState.tradeProposals.filter(p => !beforeIds.has(p.id) && p.status === 'pending');
    if (newProposals.length > 0) {
      for (const p of newProposals) {
        afterState.respondToTradeProposal(p.id, false);
      }
    }
    if (useGameStore.getState().phase === 'playoffs') {
      router.push('/playoffs');
    }
  }, [router]);

  // Phase banner context
  let bannerText = '';
  if (phase === 'regular') {
    const wins = userTeam?.record.wins ?? 0;
    const losses = userTeam?.record.losses ?? 0;
    const gamesLeft = maxWeek - week + 1;
    const dl = leagueSettings?.tradeDeadlineWeek ?? 12;
    const tradeDeadlineNote = week <= dl + 1 ? '' : ' · Trade window closed';
    bannerText = `Week ${week} of ${maxWeek} · Record: ${wins}-${losses} · ${gamesLeft} game${gamesLeft !== 1 ? 's' : ''} remaining${tradeDeadlineNote}`;
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
      <header className="border-b border-[var(--border)] bg-[var(--surface)] sticky top-0 z-10">
        <div className="h-14 flex items-center justify-between px-3 md:px-6">
          <div className="flex items-center gap-2 text-sm text-[var(--text-sec)]">
            {onMenuToggle && (
              <button
                onClick={onMenuToggle}
                className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--surface-2)] transition-colors"
                aria-label="Toggle menu"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="3" y1="5" x2="17" y2="5" />
                  <line x1="3" y1="10" x2="17" y2="10" />
                  <line x1="3" y1="15" x2="17" y2="15" />
                </svg>
              </button>
            )}
            <span className="hidden sm:inline">
              {phase === 'regular' && `Week ${week} · Regular Season`}
              {phase === 'playoffs' && 'Playoffs'}
              {phase === 'resigning' && 'Re-signing Window'}
              {phase === 'draft' && `Draft · Season ${season}`}
              {phase === 'freeAgency' && 'Free Agency'}
              {phase === 'offseason' && 'Offseason'}
            </span>
          </div>

          <div className="flex items-center gap-1 md:gap-2 flex-wrap justify-end">
            {phase === 'regular' && !pathname.startsWith('/game/') && (
              <>
                {pendingTradeCount > 0 && (
                  <span className="hidden sm:inline">
                    <Link href="/trades">
                      <Button size="sm" variant="secondary">
                        Trades ({pendingTradeCount})
                      </Button>
                    </Link>
                  </span>
                )}
                <Button onClick={handleSimWeek} size="sm">
                  Sim Week {week}
                </Button>
                {week <= (leagueSettings?.tradeDeadlineWeek ?? 12) + 1 && (
                  <Button
                    onClick={handleSimToDeadline}
                    variant="secondary"
                    size="sm"
                  >
                    Sim to Deadline
                  </Button>
                )}
                <Button
                  onClick={handleSimSeason}
                  variant="secondary"
                  size="sm"
                >
                  Sim Season
                </Button>
              </>
            )}
            {phase === 'playoffs' && (
              <>
                {!superBowlDone && !pathname.startsWith('/game/') && (
                  <>
                    <Button
                      onClick={simNextPlayoffGame}
                      size="sm"
                      disabled={!nextPlayoffGame}
                    >
                      Sim Next Game
                    </Button>
                    <Button
                      onClick={simPlayoffRound}
                      size="sm"
                      variant="secondary"
                      disabled={!nextPlayoffGame}
                    >
                      Sim Round
                    </Button>
                    <Button
                      onClick={simAllPlayoffGames}
                      size="sm"
                      variant="secondary"
                      disabled={!nextPlayoffGame}
                    >
                      Sim Remaining
                    </Button>
                  </>
                )}
                {superBowlDone && (
                  <Button
                    onClick={() => {
                      const store = useGameStore.getState();
                      if (store.phase !== 'resigning') {
                        store.advanceToResigning();
                      }
                      router.push('/re-sign');
                    }}
                    size="sm"
                    className="relative z-20"
                  >
                    Advance to Re-signing →
                  </Button>
                )}
              </>
            )}
            {phase === 'resigning' && (
              <>
                <Link href="/re-sign">
                  <Button size="sm">
                    Go to Re-signing
                  </Button>
                </Link>
                <Button
                  onClick={() => {
                    const store = useGameStore.getState();
                    if (store.phase !== 'draft') {
                      store.advanceToDraft();
                    }
                    router.push('/draft');
                  }}
                  variant="secondary"
                  size="sm"
                >
                  {resigningPlayers.length === 0 ? 'Advance to Draft →' : 'Skip to Draft'}
                </Button>
              </>
            )}
            {phase === 'draft' && (
              <>
                <Link href="/draft">
                  <Button size="sm">
                    Go to Draft
                  </Button>
                </Link>
                {draftOrder.length > 0 ? (
                  <>
                    {draftOrder[0] !== userTeamId && (
                      <Button onClick={simDraftPick} size="sm" variant="secondary">
                        Sim Pick
                      </Button>
                    )}
                    {draftOrder[0] !== userTeamId && (
                      <Button onClick={simToUserDraftPick} size="sm" variant="secondary">
                        Sim to My Pick
                      </Button>
                    )}
                    <Button
                      onClick={() => {
                        simToEndDraft({ skipAdvance: true });
                        router.push('/draft-recap');
                      }}
                      size="sm"
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
                    <Button size="sm" onClick={() => { advanceToFreeAgency(); router.push('/free-agency'); }}>
                      Advance to Free Agency →
                    </Button>
                  </>
                )}
              </>
            )}
            {phase === 'freeAgency' && (
              <>
                <Link href="/free-agency">
                  <Button size="sm">
                    Go to Free Agency
                  </Button>
                </Link>
                {faDay >= 30 ? (
                  <Button onClick={() => {
                    startNewSeason(); router.push('/roster');
                  }} variant="secondary" size="sm">
                    Start New Season →
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      startNewSeason();
                      router.push('/roster');
                    }}
                    variant="secondary"
                    size="sm"
                  >
                    End Free Agency Early
                  </Button>
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

      {/* Trade proposal popup — disabled, user prefers inline notifications */}
    </>
  );
}
