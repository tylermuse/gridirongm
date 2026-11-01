'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton, SkeletonList } from '@/components/ui/Skeleton';
import { LiveViewer } from '@/components/live/LiveViewer';
import { dropConfetti } from '@/lib/ui/confetti';
import { getContrastText } from '@/lib/ui/ratingColor';
import { getBracket, isRegularSeasonComplete } from '@/lib/playoffs';
import type { PlayoffBracket, PlayoffSeries } from '@/lib/playoffs';
import type { BasketballTeam } from '@bs/sport-basketball';

/**
 * /playoffs — the postseason bracket (Phase 2D-1).
 *
 * States:
 *   - Regular season still running → prompt to finish it on /standings.
 *   - Regular season done, no bracket → "Start Playoffs" CTA.
 *   - Bracket live → "your team" status card + the tree: a symmetric NBA tree
 *     (East ← Finals → West) at lg+, stacked East / Finals / West sections
 *     below lg so phones never side-scroll a 750px grid. Sim buttons spin
 *     individually (only the clicked one shows busy).
 *   - Champion crowned → banner in the champion's colors + confetti.
 */

type SimKey = 'watch' | 'day' | 'round' | 'all';

const ROUND_SHORT: Record<number, string> = {
  0: 'Play-In', 1: 'First Round', 2: 'Conf. Semis', 3: 'Conf. Finals', 4: 'Finals',
};

type UserStatus =
  | { kind: 'champion' }
  | { kind: 'runnerUp' }
  | { kind: 'eliminated'; round: number }
  | { kind: 'active' }
  | { kind: 'missed' };

/** Where the user's team stands. A play-in loss that drops the team into the
 *  8-seed game (loserNext) is not an elimination. */
function userPlayoffStatus(bracket: PlayoffBracket, uid: string): UserStatus {
  if (bracket.championTeamId === uid) return { kind: 'champion' };
  if (bracket.runnerUpTeamId === uid) return { kind: 'runnerUp' };
  const all = [...(bracket.playIn ?? []), ...bracket.rounds.flat()];
  const mine = all.filter(s => s.teamA === uid || s.teamB === uid);
  if (mine.length === 0) return { kind: 'missed' };
  const knockout = mine.find(s => s.winnerTeamId && s.winnerTeamId !== uid && !s.loserNext);
  if (knockout) return knockout.round === 4 ? { kind: 'runnerUp' } : { kind: 'eliminated', round: knockout.round };
  return { kind: 'active' };
}

function statusPill(status: UserStatus): { label: string; cls: string } {
  switch (status.kind) {
    case 'champion': return { label: '🏆 Champions', cls: 'bg-amber-500/15 text-amber-600' };
    case 'runnerUp': return { label: 'Runner-Up', cls: 'bg-blue-500/15 text-blue-600' };
    case 'eliminated': return { label: `Eliminated — ${ROUND_SHORT[status.round] ?? `Round ${status.round}`}`, cls: 'bg-red-500/15 text-red-600' };
    case 'active': return { label: 'In the Playoffs', cls: 'bg-green-500/15 text-green-600' };
    case 'missed': return { label: 'Missed Playoffs', cls: 'bg-[var(--surface-2)] text-[var(--text-sec)]' };
  }
}

/** "Up next" line for the user's live (both teams set, undecided) series. */
function upNextLabel(bracket: PlayoffBracket, uid: string, teamById: Map<string, BasketballTeam>): string | null {
  const all = [...(bracket.playIn ?? []), ...bracket.rounds.flat()];
  const live = all
    .filter(s => (s.teamA === uid || s.teamB === uid) && s.teamA && s.teamB && !s.winnerTeamId)
    .sort((a, b) => b.round - a.round)[0];
  if (!live) return null;
  const oppId = live.teamA === uid ? live.teamB : live.teamA;
  const opp = oppId ? teamById.get(oppId) : undefined;
  const vs = opp ? `${opp.city} ${opp.name}` : 'TBD';
  const roundName = live.round === 0 ? `Play-In (${live.roundName})` : ROUND_SHORT[live.round] ?? live.roundName;
  if ((live.winsNeeded ?? 4) === 1) return `Up next: ${roundName} vs ${vs}`;
  const my = live.teamA === uid ? live.winsA : live.winsB;
  const their = live.teamA === uid ? live.winsB : live.winsA;
  const game = live.winsA + live.winsB + 1;
  const series = my === their ? `series tied ${my}–${their}` : my > their ? `you lead ${my}–${their}` : `you trail ${my}–${their}`;
  return `Up next: ${roundName} vs ${vs} · Game ${game}, ${series}`;
}

export default function PlayoffsPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const { startPlayoffs, simPlayoffDay, simPlayoffRound, simAllPlayoffs, watchNextPlayoffGame, loading: storeLoading } = useLeagueStore();
  const [watching, setWatching] = useState<{ userGameId: string; dayGameIds: string[] } | null>(null);
  // Which of this page's buttons is working — only that one spins.
  const [pending, setPending] = useState<SimKey | null>(null);

  const bracket = league ? getBracket(league) : null;
  const teamById = useMemo(() => {
    const m = new Map<string, BasketballTeam>();
    if (league) for (const t of league.teams) m.set(t.id, t as BasketballTeam);
    return m;
  }, [league]);

  const router = useRouter();
  // When the clinching game is simmed, drop confetti and go straight to the
  // season awards page — no manual "View all awards" click. Event-driven (fires
  // once, from the sim action), so revisiting /playoffs later still shows the
  // bracket + the champion banner's manual awards link rather than bouncing.
  async function runPlayoffSim(key: SimKey, fn: () => Promise<{ champion: string | null } | null>) {
    setPending(key);
    try {
      const res = await fn();
      if (res?.champion) {
        dropConfetti();
        router.push('/awards');
      }
    } finally {
      setPending(null);
    }
  }

  if (loading) return <Loading />;
  if (!league) return <NotFound message={error ?? 'No league loaded.'} />;

  // --- No bracket yet ---
  if (!bracket) {
    const regularDone = isRegularSeasonComplete(league);
    return (
      <Shell title="Playoffs">
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
            <Link href="/standings" className="text-sm font-semibold hover:underline" style={{ color: 'var(--accent)' }}>
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
  const userTeam = uid ? teamById.get(uid) : undefined;
  const status = uid ? userPlayoffStatus(bracket, uid) : null;
  const canWatch = !bracket.complete && status?.kind === 'active';
  const upNext = uid && !bracket.complete ? upNextLabel(bracket, uid, teamById) : null;
  const busyAny = storeLoading || pending !== null;

  async function handleWatchPlayoff() {
    setPending('watch');
    try {
      const res = await watchNextPlayoffGame();
      if (res) setWatching({ userGameId: res.userGameId, dayGameIds: res.dayGameIds });
    } finally {
      setPending(null);
    }
  }

  const subtitle = bracket.complete
    ? (champion ? `The ${champion.city} ${champion.name} are the ${bracket.season} champions` : `${bracket.season} champion crowned`)
    : upNext ?? `Day ${bracket.dayIndex} · best-of-7 every round`;

  const simButtons = !bracket.complete && (
    <>
      {canWatch && (
        <Button variant="primary" busy={pending === 'watch'} disabled={busyAny} onClick={() => void handleWatchPlayoff()}>
          ▶ Watch Live
        </Button>
      )}
      <Button variant={canWatch ? 'secondary' : 'primary'} busy={pending === 'day'} disabled={busyAny} onClick={() => void runPlayoffSim('day', simPlayoffDay)}>
        Sim Day
      </Button>
      <Button variant="secondary" busy={pending === 'round'} disabled={busyAny} onClick={() => void runPlayoffSim('round', simPlayoffRound)}>
        Sim Round
      </Button>
      <Button variant="secondary" busy={pending === 'all'} disabled={busyAny} onClick={() => void runPlayoffSim('all', simAllPlayoffs)}>
        Sim All Playoffs
      </Button>
    </>
  );

  const finalsSeries = finals[0];
  const userIsChampion = !!uid && bracket.championTeamId === uid;

  return (
    <Shell title={`${bracket.season} Playoffs`} subtitle={subtitle} right={simButtons || undefined}>
      {champion && (
        <ChampionBanner
          champion={champion}
          season={bracket.season}
          finals={finalsSeries}
          teamById={teamById}
          userIsChampion={userIsChampion}
        />
      )}

      {userTeam && status && (
        <UserStatusCard team={userTeam} status={status} />
      )}

      {bracket.playIn && bracket.playIn.length > 0 && (
        <PlayInSection playIn={bracket.playIn} teamById={teamById} userTeamId={uid} />
      )}

      {/* lg+: the symmetric tree — columns flex to fill the width so the whole
          bracket fits on one screen. */}
      <div className="hidden lg:block pb-4">
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

      {/* Below lg: stacked East / Finals / West sections, round by round. */}
      <div className="lg:hidden space-y-4">
        <StackedConference
          title="Eastern Conference"
          rounds={[['First Round', eastR1], ['Semifinals', eastSF], ['Conf Finals', eastCF]]}
          teamById={teamById}
          userTeamId={uid}
        />
        <StackedConference title="Finals" rounds={[['Finals', finals]]} teamById={teamById} userTeamId={uid} highlight />
        <StackedConference
          title="Western Conference"
          rounds={[['First Round', westR1], ['Semifinals', westSF], ['Conf Finals', westCF]]}
          teamById={teamById}
          userTeamId={uid}
        />
      </div>

      {watching && (
        <LiveViewer userGameId={watching.userGameId} dayGameIds={watching.dayGameIds} onClose={() => setWatching(null)} pregame />
      )}
    </Shell>
  );
}

// ===========================================================================
// Status + champion
// ===========================================================================

function UserStatusCard({ team, status }: { team: BasketballTeam; status: UserStatus }) {
  const pill = statusPill(status);
  return (
    <div className="mb-6 flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4">
      <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="lg" />
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm truncate">{team.city} {team.name}</div>
        <div className="text-xs text-[var(--text-sec)] tabular-nums">{team.record.wins}–{team.record.losses} regular season</div>
      </div>
      <span className={`shrink-0 inline-flex items-center font-semibold rounded-full uppercase tracking-wide px-2.5 py-1 text-[10px] sm:text-xs whitespace-nowrap ${pill.cls}`}>
        {pill.label}
      </span>
    </div>
  );
}

/** Perceived brightness (0–255) — swaps a near-white primary for the secondary. */
function brightness(hex: string): number {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return 0;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function ChampionBanner({
  champion, season, finals, teamById, userIsChampion,
}: {
  champion: BasketballTeam;
  season: number;
  finals: PlayoffSeries | undefined;
  teamById: Map<string, BasketballTeam>;
  userIsChampion: boolean;
}) {
  const bg = brightness(champion.primaryColor) > 200 && champion.secondaryColor ? champion.secondaryColor : champion.primaryColor;
  const fg = getContrastText(bg);
  // Finals result, champion's wins first.
  let result: string | null = null;
  if (finals?.winnerTeamId && finals.teamA && finals.teamB) {
    const champIsA = finals.teamA === champion.id;
    const runnerId = champIsA ? finals.teamB : finals.teamA;
    const runner = teamById.get(runnerId);
    const cw = champIsA ? finals.winsA : finals.winsB;
    const rw = champIsA ? finals.winsB : finals.winsA;
    result = `Def. ${runner ? `${runner.city} ${runner.name}` : 'TBD'} ${cw}–${rw} in the Finals`;
  }
  return (
    <div
      className="mb-6 rounded-2xl px-6 py-8 text-center relative overflow-hidden"
      style={{ background: bg, color: fg }}
    >
      <div className="text-5xl mb-2" aria-hidden>🏆</div>
      <div className="flex items-center justify-center gap-3">
        <TeamLogo abbreviation={champion.abbreviation} primaryColor={champion.primaryColor} secondaryColor={champion.secondaryColor} size="lg" />
        <span className="text-2xl sm:text-3xl font-black">{champion.city} {champion.name}</span>
      </div>
      <div className="text-sm font-semibold uppercase tracking-widest mt-2" style={{ opacity: 0.8 }}>{season} Champions</div>
      {result && <div className="mt-1 text-sm tabular-nums" style={{ opacity: 0.75 }}>{result}</div>}
      {userIsChampion && <div className="mt-3 text-lg font-bold">🎉 Congratulations — you won the title!</div>}
      <div className="mt-5">
        <Link
          href="/awards"
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors hover:brightness-110"
          style={{ background: `color-mix(in srgb, ${fg} 18%, transparent)`, color: fg }}
        >
          🏆 View Season Awards →
        </Link>
      </div>
    </div>
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

function StackedConference({
  title, rounds, teamById, userTeamId, highlight,
}: {
  title: string;
  rounds: [string, PlayoffSeries[]][];
  teamById: Map<string, BasketballTeam>;
  userTeamId?: string | null;
  highlight?: boolean;
}) {
  return (
    <section
      className="rounded-xl border bg-[var(--surface)] p-3"
      style={{ borderColor: highlight ? 'var(--accent)' : 'var(--border)' }}
    >
      <h2
        className="text-[11px] uppercase tracking-widest font-bold mb-3"
        style={{ color: highlight ? 'var(--accent)' : 'var(--text-sec)' }}
      >
        {title}
      </h2>
      <div className="space-y-3">
        {rounds.map(([label, series]) => (
          <div key={label}>
            {rounds.length > 1 && (
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-sec)] mb-1.5">{label}</div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {series.map(s => (
                <SeriesCard key={s.id} series={s} teamById={teamById} highlight={highlight} userTeamId={userTeamId} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
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

function Shell({ title, subtitle, right, children }: { title: string; subtitle?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <main className="max-w-6xl mx-auto p-3 sm:p-5 md:p-8">
      <PageHeader title={title} subtitle={subtitle} right={right} className="mb-6" />
      {children}
    </main>
  );
}

function Loading() {
  return (
    <main className="max-w-6xl mx-auto p-3 sm:p-5 md:p-8">
      <Skeleton className="h-8 w-48 mb-6" />
      <SkeletonList rows={6} />
    </main>
  );
}

function NotFound({ message }: { message: string }) {
  return (
    <main className="max-w-4xl mx-auto p-3 sm:p-5 md:p-8">
      <p className="mb-4">{message}</p>
      <Link href="/" className="text-sm font-semibold hover:underline" style={{ color: 'var(--accent)' }}>
        Start or load a league
      </Link>
    </main>
  );
}
