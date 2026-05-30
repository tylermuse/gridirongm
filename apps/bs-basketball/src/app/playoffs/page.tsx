'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { dropConfetti } from '@/lib/ui/confetti';
import { getBracket, isRegularSeasonComplete } from '@/lib/playoffs';
import type { PlayoffSeries } from '@/lib/playoffs';
import type { BasketballTeam } from '@bs/sport-basketball';

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
  const { startPlayoffs, simPlayoffDay, loading: storeLoading } = useLeagueStore();

  const bracket = league ? getBracket(league) : null;
  const teamById = useMemo(() => {
    const m = new Map<string, BasketballTeam>();
    if (league) for (const t of league.teams) m.set(t.id, t as BasketballTeam);
    return m;
  }, [league]);

  // Confetti once when a champion is crowned.
  const celebratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (bracket?.complete && bracket.championTeamId && celebratedRef.current !== bracket.championTeamId) {
      celebratedRef.current = bracket.championTeamId;
      dropConfetti();
    }
  }, [bracket?.complete, bracket?.championTeamId]);

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
              message="Seed the field and tip off the postseason. Top 8 in each conference make it; higher seeds get home court."
              action={{ label: 'Start Playoffs →', onClick: () => void startPlayoffs() }}
            />
          ) : (
            <EmptyState
              icon="🏀"
              title="Playoffs haven't started"
              message="Finish out the 82-game regular season first. Sim days from the standings page until every game is played."
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

  return (
    <Shell>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <p className="text-sm opacity-70">
          {bracket.complete
            ? `${bracket.season} champion crowned`
            : `Day ${bracket.dayIndex} · best-of-7 every round`}
        </p>
        {!bracket.complete && (
          <Button
            variant="primary"
            onClick={() => void simPlayoffDay()}
            disabled={storeLoading}
            className="ml-auto"
          >
            {storeLoading ? 'Simming…' : 'Sim Playoff Day →'}
          </Button>
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
        </div>
      )}

      {/* Symmetric bracket — scrolls horizontally on small screens. */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max items-stretch">
          <BracketColumn title="First Round" series={eastR1} teamById={teamById} />
          <BracketColumn title="Semifinals" series={eastSF} teamById={teamById} />
          <BracketColumn title="Conf Finals" series={eastCF} teamById={teamById} />
          <BracketColumn title="Finals" series={finals} teamById={teamById} highlight />
          <BracketColumn title="Conf Finals" series={westCF} teamById={teamById} />
          <BracketColumn title="Semifinals" series={westSF} teamById={teamById} />
          <BracketColumn title="First Round" series={westR1} teamById={teamById} />
        </div>
      </div>
    </Shell>
  );
}

// ===========================================================================
// Components
// ===========================================================================

function BracketColumn({
  title, series, teamById, highlight,
}: {
  title: string;
  series: PlayoffSeries[];
  teamById: Map<string, BasketballTeam>;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col justify-around gap-4 w-44 shrink-0">
      <div
        className="text-[10px] uppercase tracking-widest text-center font-bold opacity-60"
        style={highlight ? { color: 'var(--accent)', opacity: 1 } : undefined}
      >
        {title}
      </div>
      <div className="flex flex-col justify-around gap-4 flex-1">
        {series.map(s => (
          <SeriesCard key={s.id} series={s} teamById={teamById} highlight={highlight} />
        ))}
      </div>
    </div>
  );
}

function SeriesCard({
  series, teamById, highlight,
}: {
  series: PlayoffSeries;
  teamById: Map<string, BasketballTeam>;
  highlight?: boolean;
}) {
  return (
    <div
      className="rounded-lg border bg-[var(--surface)] overflow-hidden"
      style={{ borderColor: highlight ? 'var(--accent)' : 'var(--border)' }}
    >
      <SeriesRow
        teamId={series.teamA}
        seed={series.seedA}
        wins={series.winsA}
        isWinner={series.winnerTeamId != null && series.winnerTeamId === series.teamA}
        decided={series.winnerTeamId != null}
        teamById={teamById}
      />
      <div className="h-px" style={{ background: 'var(--border)' }} />
      <SeriesRow
        teamId={series.teamB}
        seed={series.seedB}
        wins={series.winsB}
        isWinner={series.winnerTeamId != null && series.winnerTeamId === series.teamB}
        decided={series.winnerTeamId != null}
        teamById={teamById}
      />
    </div>
  );
}

function SeriesRow({
  teamId, seed, wins, isWinner, decided, teamById,
}: {
  teamId: string | null;
  seed: number | null;
  wins: number;
  isWinner: boolean;
  decided: boolean;
  teamById: Map<string, BasketballTeam>;
}) {
  const team = teamId ? teamById.get(teamId) : null;

  if (!team) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 h-9 opacity-50">
        <span className="text-xs italic text-[var(--text-sec)]">TBD</span>
      </div>
    );
  }

  return (
    <Link
      href={`/team/${team.id}`}
      className="flex items-center gap-2 px-2 py-1.5 h-9 hover:bg-[var(--surface-2)] transition-colors"
      style={{
        opacity: decided && !isWinner ? 0.55 : 1,
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
      <span className={`text-xs truncate flex-1 ${isWinner ? 'font-bold' : 'font-semibold'}`}>
        {team.abbreviation}
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
