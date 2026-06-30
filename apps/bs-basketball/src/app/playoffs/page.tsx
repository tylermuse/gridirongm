'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/modals/Modal';
import { LiveViewer } from '@/components/live/LiveViewer';
import { dropConfetti } from '@/lib/ui/confetti';
import { getBracket, isRegularSeasonComplete } from '@/lib/playoffs';
import { computeSeasonAwards } from '@/lib/awards';
import type { PlayoffSeries } from '@/lib/playoffs';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';
import { PlayerName } from '@/components/modals/PlayerModalProvider';

/**
 * /playoffs — the postseason bracket (Phase 2D-1).
 *
 * States:
 *   - Regular season still running → prompt to finish it on /standings.
 *   - Regular season done, no bracket → "Start Playoffs" CTA.
 *   - Bracket live → symmetric NBA tree (East ← Finals → West) + "Sim Playoff
 *     Day". Each series card shows seeds, logos, and the series score.
 *   - Champion crowned → trophy banner + confetti.
 */
export default function PlayoffsPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const { startPlayoffs, simPlayoffDay, simPlayoffRound, simAllPlayoffs, watchNextPlayoffGame, loading: storeLoading } = useLeagueStore();
  const [watching, setWatching] = useState<{ userGameId: string; dayGameIds: string[] } | null>(null);

  const bracket = league ? getBracket(league) : null;
  const teamById = useMemo(() => {
    const m = new Map<string, BasketballTeam>();
    if (league) for (const t of league.teams) m.set(t.id, t as BasketballTeam);
    return m;
  }, [league]);

  // Awards modal pops the moment the clinching game is simmed (event-driven,
  // not an effect — avoids cascading-render setState-in-effect).
  const [awardsModalOpen, setAwardsModalOpen] = useState(false);
  async function runPlayoffSim(fn: () => Promise<{ champion: string | null } | null>) {
    const res = await fn();
    if (res?.champion) {
      dropConfetti();
      setAwardsModalOpen(true);
    }
  }

  // MVP for the finish modal — computed lazily, only when the season is done.
  const mvp = useMemo<BasketballPlayer | null>(() => {
    if (!league || !bracket?.complete) return null;
    const awards = computeSeasonAwards(league);
    const id = awards?.winners.mvp?.winnerId;
    return id ? ((league.players as Record<string, BasketballPlayer>)[id] ?? null) : null;
  }, [league, bracket?.complete]);

  if (loading) return <Loading />;
  if (!league) return <NotFound message={error ?? 'No league loaded.'} />;

  // --- No bracket yet ---
  if (!bracket) {
    const regularDone = isRegularSeasonComplete(league);
    return (
      <Shell>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {regularDone ? (
            <EmptyState
              icon="🏆"
              title="The regular season is in the books"
              message="Seed the field and tip off the postseason. The top 6 in each conference are locked in; seeds 7–10 fight through the play-in for the last two spots. Higher seeds get home court."
              action={{ label: 'Start Playoffs →', onClick: () => void startPlayoffs() }}
            />
          ) : (
            <EmptyState
              icon="🏀"
              title="16 teams. One survives."
              message="Finish the 82-game grind first — the bracket sets once every regular-season game is in the books."
            />
          )}
        </div>
        {!regularDone && (
          <div className="mt-4 text-center">
            <Link href="/standings" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
              Go to Standings →
            </Link>
          </div>
        )}
      </Shell>
    );
  }

  // --- Bracket live ---
  const eastR1 = bracket.rounds[0].filter(s => s.conference === 'Eastern');
  const eastSF = bracket.rounds[1].filter(s => s.conference === 'Eastern');
  const eastCF = bracket.rounds[2].filter(s => s.conference === 'Eastern');
  const westR1 = bracket.rounds[0].filter(s => s.conference === 'Western');
  const westSF = bracket.rounds[1].filter(s => s.conference === 'Western');
  const westCF = bracket.rounds[2].filter(s => s.conference === 'Western');
  const finals = bracket.rounds[3];

  const champion = bracket.championTeamId ? teamById.get(bracket.championTeamId) : null;

  // The user can watch live while their team is still alive in the bracket.
  const uid = league.userTeamId;
  const allSeries = [...bracket.rounds.flat(), ...(bracket.playIn ?? [])];
  const userInPlayoffs = !!uid && allSeries.some(s => s.teamA === uid || s.teamB === uid);
  const userEliminated = !!uid && allSeries.some(s => s.winnerTeamId && s.winnerTeamId !== uid && (s.teamA === uid || s.teamB === uid));
  const canWatch = !bracket.complete && userInPlayoffs && !userEliminated;

  async function handleWatchPlayoff() {
    const res = await watchNextPlayoffGame();
    if (res) setWatching({ userGameId: res.userGameId, dayGameIds: res.dayGameIds });
  }

  return (
    <Shell>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <p className="text-sm opacity-70">
          {bracket.complete
            ? `${bracket.season} champion crowned`
            : `Day ${bracket.dayIndex} · best-of-7 every round`}
        </p>
        {!bracket.complete && (
          <div className="ml-auto flex flex-wrap gap-2">
            {canWatch && (
              <Button variant="primary" disabled={storeLoading} onClick={() => void handleWatchPlayoff()}>
                {storeLoading ? 'Loading…' : '▶ Watch Live'}
              </Button>
            )}
            <Button variant={canWatch ? 'secondary' : 'primary'} disabled={storeLoading} onClick={() => void runPlayoffSim(simPlayoffDay)}>
              {storeLoading ? 'Simming…' : 'Sim Day'}
            </Button>
            <Button variant="secondary" disabled={storeLoading} onClick={() => void runPlayoffSim(simPlayoffRound)}>
              Sim Round
            </Button>
            <Button variant="secondary" disabled={storeLoading} onClick={() => void runPlayoffSim(simAllPlayoffs)}>
              Sim All Playoffs
            </Button>
          </div>
        )}
      </div>

      {champion && (
        <div
          className="mb-8 rounded-xl border-2 p-6 text-center"
          style={{ borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}
        >
          <div className="text-4xl mb-2">🏆</div>
          <div className="text-xs uppercase tracking-widest opacity-60">{bracket.season} Champions</div>
          <div className="flex items-center justify-center gap-3 mt-2">
            <TeamLogo
              abbreviation={champion.abbreviation}
              primaryColor={champion.primaryColor}
              secondaryColor={champion.secondaryColor}
              size="lg"
            />
            <span className="text-2xl font-black" style={{ color: 'var(--accent)' }}>
              {champion.city} {champion.name}
            </span>
          </div>
          <div className="mt-4">
            <Link href="/awards">
              <Button variant="secondary">🏆 View Season Awards →</Button>
            </Link>
          </div>
        </div>
      )}

      {bracket.playIn && bracket.playIn.length > 0 && (
        <PlayInSection playIn={bracket.playIn} teamById={teamById} userTeamId={uid} />
      )}

      {/* Symmetric bracket — columns flex to fill the width so the whole tree
          fits on one screen; only very narrow viewports scroll. */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-2 items-stretch">
          <BracketColumn title="First Round" series={eastR1} teamById={teamById} userTeamId={uid} />
          <BracketColumn title="Semifinals" series={eastSF} teamById={teamById} userTeamId={uid} />
          <BracketColumn title="Conf Finals" series={eastCF} teamById={teamById} userTeamId={uid} />
          <BracketColumn title="Finals" series={finals} teamById={teamById} highlight userTeamId={uid} />
          <BracketColumn title="Conf Finals" series={westCF} teamById={teamById} userTeamId={uid} />
          <BracketColumn title="Semifinals" series={westSF} teamById={teamById} userTeamId={uid} />
          <BracketColumn title="First Round" series={westR1} teamById={teamById} userTeamId={uid} />
        </div>
      </div>

      <Modal
        open={awardsModalOpen && !!champion}
        onClose={() => setAwardsModalOpen(false)}
        title="🏆 Champions!"
        maxWidthClass="max-w-md"
      >
        {champion && (
          <div className="text-center p-2">
            <div className="text-5xl mb-2">🏆</div>
            <div className="text-xl font-black" style={{ color: 'var(--accent)' }}>
              {champion.city} {champion.name}
            </div>
            <div className="text-sm text-[var(--text-sec)] mt-1">
              {bracket.season} BS Hoops Champions
            </div>
            {mvp && (
              <div className="mt-4 text-sm">
                <span className="opacity-60">MVP: </span>
                <PlayerName playerId={mvp.id} firstName={mvp.firstName} lastName={mvp.lastName} className="font-bold" />
              </div>
            )}
            <div className="mt-5 flex justify-center gap-2">
              <Link href="/awards" onClick={() => setAwardsModalOpen(false)}>
                <Button variant="primary">View all awards →</Button>
              </Link>
            </div>
          </div>
        )}
      </Modal>

      {watching && (
        <LiveViewer userGameId={watching.userGameId} dayGameIds={watching.dayGameIds} onClose={() => setWatching(null)} />
      )}
    </Shell>
  );
}

// ===========================================================================
// Components
// ===========================================================================

function PlayInSection({
  playIn, teamById, userTeamId,
}: {
  playIn: PlayoffSeries[];
  teamById: Map<string, BasketballTeam>;
  userTeamId?: string | null;
}) {
  return (
    <div className="mb-8">
      <div className="text-xs uppercase tracking-widest text-center font-bold opacity-60 mb-3">
        Play-In Tournament
      </div>
      <div className="grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
        {(['Eastern', 'Western'] as const).map(conf => (
          <div key={conf} className="rounded-xl border bg-[var(--surface)] p-3" style={{ borderColor: 'var(--border)' }}>
            <div className="text-[10px] uppercase tracking-widest font-bold opacity-60 mb-2">{conf}</div>
            <div className="space-y-2.5">
              {playIn.filter(s => s.conference === conf).map(s => (
                <div key={s.id}>
                  <div className="text-[9px] uppercase tracking-wider text-[var(--text-sec)] mb-0.5">{s.roundName}</div>
                  <SeriesCard series={s} teamById={teamById} userTeamId={userTeamId} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BracketColumn({
  title, series, teamById, highlight, userTeamId,
}: {
  title: string;
  series: PlayoffSeries[];
  teamById: Map<string, BasketballTeam>;
  highlight?: boolean;
  userTeamId?: string | null;
}) {
  return (
    <div className="flex flex-col justify-around gap-4 flex-1 min-w-[6.25rem]">
      <div
        className="text-[10px] uppercase tracking-widest text-center font-bold opacity-60"
        style={highlight ? { color: 'var(--accent)', opacity: 1 } : undefined}
      >
        {title}
      </div>
      <div className="flex flex-col justify-around gap-4 flex-1">
        {series.map(s => (
          <SeriesCard key={s.id} series={s} teamById={teamById} highlight={highlight} userTeamId={userTeamId} />
        ))}
      </div>
    </div>
  );
}

function SeriesCard({
  series, teamById, highlight, userTeamId,
}: {
  series: PlayoffSeries;
  teamById: Map<string, BasketballTeam>;
  highlight?: boolean;
  userTeamId?: string | null;
}) {
  // Outline the whole card too when the user's team is in this series.
  const userInSeries = !!userTeamId && (series.teamA === userTeamId || series.teamB === userTeamId);
  return (
    <div
      className="rounded-lg border bg-[var(--surface)] overflow-hidden"
      style={{ borderColor: highlight || userInSeries ? 'var(--accent)' : 'var(--border)' }}
    >
      <SeriesRow
        teamId={series.teamA}
        seed={series.seedA}
        wins={series.winsA}
        isWinner={series.winnerTeamId != null && series.winnerTeamId === series.teamA}
        decided={series.winnerTeamId != null}
        teamById={teamById}
        userTeamId={userTeamId}
      />
      <div className="h-px" style={{ background: 'var(--border)' }} />
      <SeriesRow
        teamId={series.teamB}
        seed={series.seedB}
        wins={series.winsB}
        isWinner={series.winnerTeamId != null && series.winnerTeamId === series.teamB}
        decided={series.winnerTeamId != null}
        teamById={teamById}
        userTeamId={userTeamId}
      />
    </div>
  );
}

function SeriesRow({
  teamId, seed, wins, isWinner, decided, teamById, userTeamId,
}: {
  teamId: string | null;
  seed: number | null;
  wins: number;
  isWinner: boolean;
  decided: boolean;
  teamById: Map<string, BasketballTeam>;
  userTeamId?: string | null;
}) {
  const team = teamId ? teamById.get(teamId) : null;

  if (!team) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 h-9 opacity-50">
        <span className="text-xs italic text-[var(--text-sec)]">TBD</span>
      </div>
    );
  }

  // Highlight the user's franchise wherever it lands in the bracket: an accent
  // tint + left bar + the abbreviation in accent, so it's findable at a glance.
  const isUser = !!userTeamId && team.id === userTeamId;

  return (
    <Link
      href={`/team/${team.id}`}
      className="flex items-center gap-2 px-2 py-1.5 h-9 transition-colors"
      style={{
        opacity: decided && !isWinner ? 0.55 : 1,
        background: isUser ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : undefined,
        boxShadow: isUser ? 'inset 3px 0 0 0 var(--accent)' : undefined,
      }}
    >
      {seed != null && (
        <span className="text-[10px] w-3 text-center opacity-50 tabular-nums">{seed}</span>
      )}
      <TeamLogo
        abbreviation={team.abbreviation}
        primaryColor={team.primaryColor}
        secondaryColor={team.secondaryColor}
        size="xs"
      />
      <span
        className={`text-xs truncate flex-1 ${isWinner || isUser ? 'font-bold' : 'font-semibold'}`}
        style={isUser ? { color: 'var(--accent)' } : undefined}
      >
        {team.abbreviation}
        {isUser && <span className="ml-1 text-[9px] font-bold align-middle">★</span>}
      </span>
      <span
        className="text-sm font-black tabular-nums w-4 text-right"
        style={{ color: isWinner ? 'var(--accent)' : undefined }}
      >
        {wins}
      </span>
    </Link>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-6xl mx-auto p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">
        ← Home
      </Link>
      <h1 className="text-4xl font-extrabold mt-2 mb-6" style={{ color: 'var(--accent)' }}>
        Playoffs
      </h1>
      {children}
    </main>
  );
}

function Loading() {
  return <main className="max-w-4xl mx-auto p-8"><p className="opacity-60">Loading…</p></main>;
}

function NotFound({ message }: { message: string }) {
  return (
    <main className="max-w-4xl mx-auto p-8">
      <p className="mb-4">{message}</p>
      <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
        ← Home
      </Link>
    </main>
  );
}
