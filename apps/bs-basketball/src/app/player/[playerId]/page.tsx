'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { computeLeagueStatRanks, ordinal, type StatCategory } from '@/lib/stats/leagueRank';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ratingDeltas, trajectoryDescription } from '@/lib/development';
import { getInjuries, SEVERITY_LABEL, canPlayThrough } from '@/lib/injuries';
import { regularSeasonStatsByPlayer, statsForPlayer } from '@/lib/stats/seasonStats';
import { buildAdvancedContext } from '@/lib/stats/advancedLeague';
import { ratingHex, potentialLabel } from '@/lib/ui/ratingColor';
import { releasePreview } from '@/lib/roster/release';
import { fmtMoney } from '@/lib/dashboard/summary';
import { ExtendModal } from '@/components/modals/ExtendModal';
import { ReleaseModal } from '@/components/modals/ReleaseModal';
import {
  AwardChipList,
  OvrHistory,
  RatingGroups,
  ovrHistoryPoints,
  playerAwardChips,
} from '@/components/modals/PlayerCardSections';
import type { BasketballPlayer, BasketballStats, BasketballTeam } from '@bs/sport-basketball';
import type { BaseGameResult } from '@bs/core/adapter';

/**
 * /player/[playerId] — full player card.
 *
 *  - breadcrumb, xl avatar + meta + tier-colored OVR circle + trajectory badge
 *  - front-office actions on your own players (trading block / extend /
 *    release, with the dead-cap preview) — same as the PlayerModal card
 *  - development (offseason deltas + rating history) and career awards
 *  - season/career stat toggle
 *  - contract card (when signed)
 *  - game log table (recent appearances, expandable)
 *  - grouped ratings — the PlayerModal's rows (components/modals/PlayerCardSections)
 */

type GameResult = BaseGameResult<BasketballStats>;

interface GameLogRow {
  gameId: string;
  day: number;
  date: string;
  opponent: BasketballTeam | null;
  isHome: boolean;
  stats: Partial<BasketballStats>;
}

function gameDay(g: GameResult): number {
  return (g.sportData as { dayOfSeason?: number } | undefined)?.dayOfSeason ?? 0;
}

export default function PlayerPage() {
  const params = useParams<{ playerId: string }>();
  const router = useRouter();
  const { league, loading, error } = useLeagueOrHydrate();
  const [statMode, setStatMode] = useState<'season' | 'career'>('season');
  const [showAllGames, setShowAllGames] = useState(false);
  const [extendId, setExtendId] = useState<string | null>(null);
  const [releaseId, setReleaseId] = useState<string | null>(null);

  const player: BasketballPlayer | null = useMemo(() => {
    if (!league) return null;
    const map = league.players as Record<string, BasketballPlayer>;
    return map[params.playerId] ?? null;
  }, [league, params.playerId]);

  const team: BasketballTeam | null = useMemo(() => {
    if (!league || !player?.rosterSlot) return null;
    return (league.teams.find(t => t.id === player.rosterSlot!.teamId) as BasketballTeam | undefined) ?? null;
  }, [league, player]);

  const gameLog: GameLogRow[] = useMemo(() => {
    if (!league || !player || !team) return [];
    const teamById = new Map((league.teams as BasketballTeam[]).map(t => [t.id, t]));
    return (league.games as GameResult[])
      .filter(g =>
        g.status === 'played' &&
        (g.homeTeamId === team.id || g.awayTeamId === team.id) &&
        (g.boxScores[player.id]?.minutes ?? 0) > 0,
      )
      .map(g => {
        const isHome = g.homeTeamId === team.id;
        const oppId = isHome ? g.awayTeamId : g.homeTeamId;
        return {
          gameId: g.id,
          day: gameDay(g),
          date: g.date,
          opponent: teamById.get(oppId) ?? null,
          isHome,
          stats: g.boxScores[player.id] ?? {},
        };
      })
      .sort((a, b) => b.day - a.day);
  }, [league, player, team]);

  if (loading) return <Loading />;
  if (!league) return <NotFound message={error ?? 'No league loaded.'} backHref="/" backLabel="Home" />;
  if (!player) return <NotFound message="Player not found." backHref="/league" backLabel="League" />;

  const secondary = team?.secondaryColor ?? '#ffffff';

  // Season stats come from box-score aggregation (player.seasonStats isn't kept
  // up to date during the season); career stats are rolled up at season's end.
  const aggregatedSeason = statsForPlayer(regularSeasonStatsByPlayer(league), player.id);
  const stats = statMode === 'season' ? aggregatedSeason : player.careerStats;
  // Advanced line (TS% / eFG% / +/- / USG% / PER — lib/stats/advanced.ts).
  // USG% depends on current-team totals, so it's season-only.
  const advanced = buildAdvancedContext(league).forPlayer(player.id, stats);
  // League ranks only make sense for the current season's per-game stats.
  const seasonRanks = statMode === 'season' ? computeLeagueStatRanks(league) : null;
  const statRank = (cat: StatCategory): number | null => seasonRanks?.rank(player.id, cat) ?? null;
  const traj = player.development.currentTrajectory;
  const visibleGames = showAllGames ? gameLog : gameLog.slice(0, 10);

  // OVR trend vs the pre-offseason snapshot.
  const ovrDelta = player.ratings.overall - (player.sportData.prevRatings?.overall ?? player.ratings.overall);

  // Injury / health status (current day = league.currentTick).
  const day = league.currentTick;
  const injury = getInjuries(league)[player.id];
  const injuryActive = !!injury && injury.returnDay > day;

  // OVR history: logged seasons + the current rating (shared with the modal).
  const ovrPoints = ovrHistoryPoints(player);
  const awardChips = playerAwardChips(league, player.id);

  // "Trade for this player" — only for players on another team while managing.
  const canTradeFor =
    !!player.rosterSlot && !!league.userTeamId && player.rosterSlot.teamId !== league.userTeamId;
  const isOnUserTeam =
    !!player.rosterSlot && !!league.userTeamId && player.rosterSlot.teamId === league.userTeamId;
  const release = isOnUserTeam ? releasePreview(player, league.currentSeason) : null;
  const pot = player.development.potential;

  // Breadcrumb — your roster, another team's page, or the players index.
  const crumb = team
    ? isOnUserTeam
      ? { href: '/roster', label: 'Roster' }
      : { href: `/team/${team.id}`, label: `${team.abbreviation} Roster` }
    : { href: '/players', label: 'Players' };

  return (
    <>
    <main className="max-w-4xl mx-auto p-3 sm:p-5 md:p-8">
      <nav aria-label="Breadcrumb" className="text-xs text-[var(--text-sec)]">
        <Link href={crumb.href} className="hover:text-[var(--text)] transition-colors">{crumb.label}</Link>
        {' / '}
        <span>{player.firstName} {player.lastName}</span>
      </nav>

      {/* Header */}
      <header className="relative flex flex-wrap items-center gap-5 mt-2 mb-6">
        <PlayerAvatar
          firstName={player.firstName}
          lastName={player.lastName}
          primaryColor={team?.primaryColor ?? '#E66B00'}
          secondaryColor={secondary}
          photoUrl={player.sportData.photoUrl}
          size="xl"
        />
        <div className="min-w-0">
          <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight">
            {player.firstName} {player.lastName}
          </h1>
          <p className="text-sm text-[var(--text-sec)] mt-1">
            {player.sportData.position} · Age {player.age}
            {team && (
              <>
                {' · '}
                <span className="inline-flex items-center gap-1 align-middle">
                  <TeamLogo
                    abbreviation={team.abbreviation}
                    primaryColor={team.primaryColor}
                    secondaryColor={team.secondaryColor}
                    size="xs"
                  />
                  {team.city} {team.name}
                </span>
              </>
            )}
            {!team && ' · Free Agent'}
            {player.sportData.draftYear && player.sportData.draftPick && (
              <> · {player.sportData.draftYear} draft, #{player.sportData.draftPick}</>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge variant="default" size="md" className="capitalize">{player.sportData.starTier}</Badge>
            <Badge variant={trajectoryVariant(traj)} size="md" className="capitalize">{traj}</Badge>
            <Badge variant="default" size="md">
              {player.sportData.yearsInLeague > 0 ? `Yr ${player.sportData.yearsInLeague}` : 'Rookie'}
            </Badge>
            {player.sportData.isTwoWay && <Badge variant="amber" size="md">Two-way</Badge>}
            {injuryActive && injury ? (
              canPlayThrough(injury) ? (
                <Badge variant="amber" size="md">
                  {`GTD: ${injury.bodyPart} · ${injury.returnDay - day}d (${SEVERITY_LABEL[injury.severity]})`}
                </Badge>
              ) : (
                <Badge variant="red" size="md">
                  {injury.returnDay >= 50_000
                    ? `Out for season (${injury.bodyPart})`
                    : `Out: ${injury.bodyPart} · ${injury.returnDay - day}d (${SEVERITY_LABEL[injury.severity]})`}
                </Badge>
              )
            ) : (
              <Badge variant="green" size="md">Healthy</Badge>
            )}
          </div>

          {/* Front-office actions on your own players (same as the card). */}
          {isOnUserTeam && (
            <div className="mt-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" onClick={() => router.push(`/trade?block=${player.id}`)}>
                  Add to Trading Block
                </Button>
                <button
                  type="button"
                  onClick={() => setExtendId(player.id)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-green-500/40 text-green-600 hover:bg-green-500/10 transition-colors"
                >
                  Extend Contract
                </button>
                <Button size="sm" variant="ghost" onClick={() => setReleaseId(player.id)}>
                  Release Player
                </Button>
              </div>
              {release && release.remainingGuaranteed > 0 && (
                <div className="text-xs mt-1 text-red-600 tabular-nums">
                  Dead cap if released: {fmtMoney(release.waiveThisYear)} this season
                  {release.years > 1 && ` (${fmtMoney(release.remainingGuaranteed)} total)`}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="ml-auto self-start flex flex-col items-end gap-2">
          <div className="flex flex-col items-center">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center shadow-sm"
              style={{ background: ratingHex(player.ratings.overall) }}
              title="Overall rating"
            >
              <span className="text-3xl font-black text-white tabular-nums">{player.ratings.overall}</span>
            </div>
            <div className="text-xs text-[var(--text-sec)] mt-1">Overall</div>
          </div>
          {ovrDelta !== 0 && (
            <span
              className="text-sm font-bold tabular-nums"
              style={{ color: ovrDelta > 0 ? '#10b981' : '#dc2626' }}
              title="Change vs last season"
            >
              {ovrDelta > 0 ? '▲' : '▼'} {ovrDelta > 0 ? '+' : ''}{ovrDelta}
            </span>
          )}
          {canTradeFor && player.rosterSlot && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push(`/trade?target=${player.rosterSlot!.teamId}&getPlayer=${player.id}`)}
            >
              🔁 Trade for
            </Button>
          )}
          <Link
            href={`/compare?a=${player.id}`}
            className="text-xs font-semibold rounded-lg border px-3 py-1.5 hover:bg-[var(--surface-2)]"
            style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}
          >
            ⚖ Compare
          </Link>
        </div>
      </header>

      {/* Physical / basics row */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
        <Stat label="Height" value={`${Math.floor(player.ratings.height / 12)}'${player.ratings.height % 12}"`} />
        <Stat label="Wingspan" value={`${player.ratings.wingspan}"`} />
        <Stat
          label="Potential"
          title={`Potential ceiling: ${pot} OVR`}
          value={
            <span style={{ color: ratingHex(pot) }}>
              {potentialLabel(pot)} <span className="tabular-nums">{pot}</span>
            </span>
          }
        />
        <Stat label="Hand" value={<span className="capitalize">{player.sportData.shootingHand}</span>} />
      </section>

      {/* Development */}
      {(() => {
        const deltas = ratingDeltas(player);
        const log = player.sportData.seasonLog ?? [];
        const desc = trajectoryDescription(traj);
        if (!desc && deltas.length === 0 && log.length === 0 && ovrPoints.length < 2) return null;
        return (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Development</CardTitle>
              {log.length > 0 && (
                <Link href={`/player/${player.id}/history`} className="text-xs font-semibold hover:underline" style={{ color: 'var(--accent)' }}>
                  Year-by-year →
                </Link>
              )}
            </CardHeader>
            {desc && (
              <p className="text-sm text-[var(--text-sec)] mb-3">
                <span className="capitalize font-semibold" style={{ color: 'var(--text)' }}>{traj}</span> · {desc}
              </p>
            )}
            {deltas.length > 0 && (
              <>
                <div className="text-xs uppercase tracking-widest opacity-60 mb-2">What changed last offseason</div>
                <div className="flex flex-wrap gap-2">
                  {deltas.slice(0, 8).map(d => (
                    <span
                      key={d.label}
                      className="text-xs px-2 py-1 rounded-md tabular-nums"
                      style={{ background: 'var(--surface-2)', color: d.delta > 0 ? '#10b981' : '#dc2626' }}
                    >
                      {d.label} {d.delta > 0 ? '▲' : '▼'}{Math.abs(d.delta)}
                    </span>
                  ))}
                </div>
              </>
            )}
            {ovrPoints.length >= 2 && (
              <div className="mt-4">
                <div className="text-xs uppercase tracking-widest opacity-60 mb-2">Rating history</div>
                <OvrHistory points={ovrPoints} />
              </div>
            )}
          </Card>
        );
      })()}

      {/* Career awards — counted from the league's season archive. */}
      {awardChips.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Career Awards</CardTitle>
          </CardHeader>
          <AwardChipList chips={awardChips} />
        </Card>
      )}

      {/* Stat block with season/career toggle */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Statistics</CardTitle>
          <div className="inline-flex rounded-lg border border-[var(--border)] overflow-hidden text-xs font-semibold">
            {(['season', 'career'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setStatMode(mode)}
                className={`px-3 py-1.5 capitalize transition-colors ${
                  statMode === mode
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--text-sec)] hover:bg-[var(--surface-2)]'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </CardHeader>
        {stats.gamesPlayed > 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            <Stat label="GP" value={stats.gamesPlayed} />
            <Stat label="MPG" value={per(stats.minutes, stats.gamesPlayed)} />
            <Stat label="PPG" value={per(stats.points, stats.gamesPlayed)} rank={statRank('ppg')} />
            <Stat label="RPG" value={per(stats.totalRebounds, stats.gamesPlayed)} rank={statRank('rpg')} />
            <Stat label="APG" value={per(stats.assists, stats.gamesPlayed)} rank={statRank('apg')} />
            <Stat label="SPG" value={per(stats.steals, stats.gamesPlayed)} rank={statRank('spg')} />
            <Stat label="BPG" value={per(stats.blocks, stats.gamesPlayed)} rank={statRank('bpg')} />
            <Stat label="FG%" value={pct(stats.fieldGoalsMade, stats.fieldGoalsAttempted)} />
            <Stat label="3P%" value={pct(stats.threePointsMade, stats.threePointsAttempted)} />
            <Stat label="FT%" value={pct(stats.freeThrowsMade, stats.freeThrowsAttempted)} />
            <Stat label="TS%" value={(advanced.ts * 100).toFixed(1)} />
            <Stat label="eFG%" value={(advanced.efg * 100).toFixed(1)} />
            <Stat label="+/− PG" value={`${advanced.plusMinusPg >= 0 ? '+' : ''}${advanced.plusMinusPg.toFixed(1)}`} />
            {statMode === 'season' && <Stat label="USG%" value={advanced.usg.toFixed(1)} />}
            <Stat label="PER" value={advanced.per.toFixed(1)} />
          </div>
        ) : (
          <EmptyState
            icon="📊"
            title={`No ${statMode} stats yet`}
            message={`${player.firstName} hasn't logged ${statMode} numbers — sim some games.`}
          />
        )}
      </Card>

      {/* Contract */}
      {player.contract && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Contract</CardTitle>
            <Badge variant="default" size="md">
              {player.contract.years.length} yr · signed {player.contract.signedSeason}
            </Badge>
          </CardHeader>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Stat label="Years" value={player.contract.years.length} />
            <Stat label="Guaranteed" value={money(player.contract.guaranteedAtSigning)} />
            <Stat
              label="Avg / yr"
              value={money(
                player.contract.years.reduce((s, y) => s + y.baseSalary, 0) /
                  Math.max(1, player.contract.years.length),
              )}
            />
            <Stat label="Total" value={money(player.contract.years.reduce((s, y) => s + y.baseSalary, 0))} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[var(--text-sec)] text-xs">
                <tr>
                  <th className="px-3 py-1.5 text-left">Season</th>
                  <th className="px-3 py-1.5 text-right">Base Salary</th>
                  <th className="px-3 py-1.5 text-right">Bonus</th>
                  <th className="px-3 py-1.5 text-right">Guaranteed</th>
                </tr>
              </thead>
              <tbody>
                {player.contract.years.map(y => (
                  <tr key={y.season} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-3 py-1.5 font-semibold">{y.season}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{money(y.baseSalary)}</td>
                    <td className="px-3 py-1.5 text-right font-mono opacity-70">{money(y.proratedBonus)}</td>
                    <td className="px-3 py-1.5 text-right">{y.guaranteed ? '✓' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Game log */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Game Log</CardTitle>
          {gameLog.length > 10 && (
            <button
              onClick={() => setShowAllGames(s => !s)}
              className="text-xs font-semibold hover:underline"
              style={{ color: 'var(--accent)' }}
            >
              {showAllGames ? 'Show recent 10' : `Show all ${gameLog.length}`}
            </button>
          )}
        </CardHeader>
        {gameLog.length === 0 ? (
          <EmptyState
            icon="🏀"
            title="No game log yet"
            message={`${player.firstName} hasn't taken the floor yet.`}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[var(--text-sec)] text-xs">
                <tr>
                  <th className="px-2 py-1.5 text-left">Day</th>
                  <th className="px-2 py-1.5 text-left">Opp</th>
                  <th className="px-2 py-1.5 text-right">MIN</th>
                  <th className="px-2 py-1.5 text-right">PTS</th>
                  <th className="px-2 py-1.5 text-right">REB</th>
                  <th className="px-2 py-1.5 text-right">AST</th>
                  <th className="px-2 py-1.5 text-right">FG%</th>
                  <th className="px-2 py-1.5 text-right">3P%</th>
                </tr>
              </thead>
              <tbody>
                {visibleGames.map(row => (
                  <tr key={row.gameId} className="border-t hover:bg-[var(--surface-2)] transition-colors" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-2 py-1.5">
                      <Link href={`/game/${row.gameId}`} className="hover:underline" style={{ color: 'var(--accent)' }}>
                        {row.day}
                      </Link>
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="flex items-center gap-1.5">
                        <span className="text-xs text-[var(--text-sec)]">{row.isHome ? 'vs' : '@'}</span>
                        {row.opponent && (
                          <TeamLogo
                            abbreviation={row.opponent.abbreviation}
                            primaryColor={row.opponent.primaryColor}
                            secondaryColor={row.opponent.secondaryColor}
                            size="xs"
                          />
                        )}
                        <span>{row.opponent?.abbreviation ?? '???'}</span>
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right">{Math.round(row.stats.minutes ?? 0)}</td>
                    <td className="px-2 py-1.5 text-right font-semibold">{row.stats.points ?? 0}</td>
                    <td className="px-2 py-1.5 text-right">{row.stats.totalRebounds ?? 0}</td>
                    <td className="px-2 py-1.5 text-right">{row.stats.assists ?? 0}</td>
                    <td className="px-2 py-1.5 text-right opacity-70">{pct(row.stats.fieldGoalsMade ?? 0, row.stats.fieldGoalsAttempted ?? 0)}</td>
                    <td className="px-2 py-1.5 text-right opacity-70">{pct(row.stats.threePointsMade ?? 0, row.stats.threePointsAttempted ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Ratings grouped — the player card's row look (full label, tier bar). */}
      <RatingGroups player={player} variant="page" />
    </main>
    {/* Rendered after the page so they portal on top. */}
    <ExtendModal playerId={extendId} onClose={() => setExtendId(null)} />
    <ReleaseModal playerId={releaseId} onClose={() => setReleaseId(null)} />
    </>
  );
}

// ===========================================================================
// Helpers
// ===========================================================================

function per(total: number, games: number): string {
  if (!games) return '0.0';
  return (total / games).toFixed(1);
}

function pct(made: number, att: number): string {
  if (!att) return '—';
  return `${Math.round((made / att) * 100)}%`;
}

function money(dollars: number): string {
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(0)}K`;
  return `$${Math.round(dollars)}`;
}

function trajectoryVariant(t: string): 'green' | 'red' | 'default' {
  if (t === 'breakout' || t === 'rising') return 'green';
  if (t === 'declining' || t === 'cliff') return 'red';
  return 'default';
}

function Stat({
  label, value, rank, title,
}: {
  label: string;
  value: ReactNode;
  rank?: number | null;
  title?: string;
}) {
  return (
    <div className="p-2.5 rounded-lg" style={{ background: 'var(--surface-2)' }} title={title}>
      <div className="text-base font-bold" style={{ color: 'var(--accent)' }}>{value}</div>
      <div className="text-[10px] opacity-70 uppercase tracking-wide">
        {label}{rank ? <span className="normal-case"> · {ordinal(rank)}</span> : null}
      </div>
    </div>
  );
}

function Loading() {
  return <main className="max-w-4xl mx-auto p-3 sm:p-5 md:p-8"><p className="opacity-60">Loading…</p></main>;
}

function NotFound({ message, backHref, backLabel }: { message: string; backHref: string; backLabel: string }) {
  return (
    <main className="max-w-4xl mx-auto p-3 sm:p-5 md:p-8">
      <p className="mb-4">{message}</p>
      <Link href={backHref} className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
        ← Back to {backLabel}
      </Link>
    </main>
  );
}
