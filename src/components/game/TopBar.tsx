'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useGameStore } from '@/lib/engine/store';
import { Button } from '@/components/ui/Button';
import { TradeProposalPopup } from './TradeProposalPopup';

export function TopBar() {
  const router = useRouter();
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
    startNewSeason,
  } = useGameStore();

  const [newProposalIds, setNewProposalIds] = useState<string[]>([]);

  const superBowlDone = !!playoffBracket?.find(m => m.id === 'super-bowl')?.winnerId;
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
    const deadlineWeek = leagueSettings?.tradeDeadlineWeek ?? 12;
    const store = useGameStore.getState();
    for (let w = store.week; w <= deadlineWeek; w++) {
      if (useGameStore.getState().phase !== 'regular') break;
      useGameStore.getState().simWeek();
    }
    // Auto-redirect to playoffs if season ended during sim
    if (useGameStore.getState().phase === 'playoffs') {
      router.push('/playoffs');
    }
  }, [leagueSettings, router]);

  const handleSimSeason = useCallback(() => {
    const store = useGameStore.getState();
    const max = Math.max(...store.schedule.map(g => g.week));
    for (let w = store.week; w <= max; w++) {
      useGameStore.getState().simWeek();
    }
    // Auto-redirect to playoffs when season ends
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
    const tradeDeadlineNote = week <= 12 ? '' : ' · Trade window closed';
    bannerText = `Week ${week} of ${maxWeek} · Record: ${wins}-${losses} · ${gamesLeft} game${gamesLeft !== 1 ? 's' : ''} remaining${tradeDeadlineNote}`;
  } else if (phase === 'playoffs') {
    if (playoffSeeds && userTeamId) {
      const afcSeed = playoffSeeds.AFC.indexOf(userTeamId);
      const nfcSeed = playoffSeeds.NFC.indexOf(userTeamId);
      const seed = afcSeed >= 0 ? afcSeed + 1 : nfcSeed >= 0 ? nfcSeed + 1 : null;
      const conf = afcSeed >= 0 ? 'AFC' : nfcSeed >= 0 ? 'NFC' : null;
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
    bannerText = `${remaining} free agent${remaining !== 1 ? 's' : ''} available · $${Math.round(capSpace * 10) / 10}M cap space`;
  }

  return (
    <>
      <header className="border-b border-[var(--border)] bg-[var(--surface)] sticky top-0 z-10">
        <div className="h-14 flex items-center justify-between px-6">
          <div className="text-sm text-[var(--text-sec)]">
            {phase === 'regular' && `Week ${week} · Regular Season`}
            {phase === 'playoffs' && 'Playoffs'}
            {phase === 'resigning' && 'Re-signing Window'}
            {phase === 'draft' && `NFL Draft · Season ${season}`}
            {phase === 'freeAgency' && 'Free Agency'}
            {phase === 'offseason' && 'Offseason'}
          </div>

          <div className="flex items-center gap-2">
            {phase === 'regular' && (
              <>
                {pendingTradeCount > 0 && (
                  <Link href="/trades">
                    <Button size="sm" variant="secondary">
                      Trades ({pendingTradeCount})
                    </Button>
                  </Link>
                )}
                <Button onClick={handleSimWeek} size="sm">
                  Sim Week {week}
                </Button>
                {week <= (leagueSettings?.tradeDeadlineWeek ?? 12) && (
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
                {!superBowlDone && (
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
                      Sim All
                    </Button>
                  </>
                )}
                <Button
                  onClick={() => { advanceToResigning(); router.push('/re-sign'); }}
                  size="sm"
                  variant={superBowlDone ? 'primary' : 'secondary'}
                >
                  {superBowlDone ? 'Advance to Re-signing →' : 'Skip to Re-signing'}
                </Button>
              </>
            )}
            {phase === 'resigning' && (
              <>
                <Link href="/re-sign">
                  <Button size="sm" variant="secondary">Go to Re-signing</Button>
                </Link>
                <Button
                  onClick={() => { advanceToDraft(); router.push('/draft'); }}
                  size="sm"
                >
                  {resigningPlayers.length === 0 ? 'Advance to Draft →' : 'Skip to Draft'}
                </Button>
              </>
            )}
            {phase === 'draft' && (
              <>
                <Link href="/draft">
                  <Button size="sm" variant="secondary">Go to Draft</Button>
                </Link>
                <Button
                  onClick={() => {
                    // Finish remaining draft picks first, then advance to FA
                    useGameStore.getState().simToEndDraft();
                    useGameStore.getState().advanceToFreeAgency();
                    router.push('/free-agency');
                  }}
                  variant="secondary"
                  size="sm"
                >
                  Skip to Free Agency
                </Button>
              </>
            )}
            {phase === 'freeAgency' && (
              <>
                <Button onClick={() => { startNewSeason(); router.push('/'); }} size="sm">
                  Start New Season →
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Phase context banner */}
        {bannerText && (
          <div className="px-6 py-1.5 bg-[var(--surface-2)] border-t border-[var(--border)] text-xs text-[var(--text-sec)]">
            {bannerText}
          </div>
        )}
      </header>

      {/* Trade proposal popup */}
      {newProposalIds.length > 0 && (
        <TradeProposalPopup
          proposalIds={newProposalIds}
          onClose={() => setNewProposalIds([])}
        />
      )}
    </>
  );
}
