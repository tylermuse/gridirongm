'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  basketballUiMetadata,
  type BasketballPlayer,
  type BasketballStats,
  type BasketballTeam,
} from '@bs/sport-basketball';
import type { BaseGameResult } from '@bs/core/adapter';

/**
 * /player/[playerId] — full player card.
 *
 *  - xl avatar + meta + floating OVR + trajectory badge
 *  - season/career stat toggle
 *  - contract card (when signed)
 *  - game log table (recent appearances, expandable)
 *  - grouped ratings with color-coded bars
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
  const { league, loading, error } = useLeagueOrHydrate();
  const [statMode, setStatMode] = useState<'season' | 'career'>('season');
  const [showAllGames, setShowAllGames] = useState(false);

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

  const primary = team?.primaryColor ?? 'var(--accent)';
  const secondary = team?.secondaryColor ?? '#ffffff';

  // Group ratings by category as declared in basketballUiMetadata.
  const grouped = new Map<string, { key: string; label: string }[]>();
  for (const f of basketballUiMetadata.ratingFields) {
    if (!grouped.has(f.group)) grouped.set(f.group, []);
    grouped.get(f.group)!.push({ key: String(f.key), label: f.label });
  }

  const stats = statMode === 'season' ? player.seasonStats : player.careerStats;
  const traj = player.development.currentTrajectory;
  const visibleGames = showAllGames ? gameLog : gameLog.slice(0, 10);

  return (
    <main className="max-w-4xl mx-auto p-5 sm:p-8">
      {team && (
        <Link href={`/team/${team.id}`} className="text-sm font-semibold opacity-70 hover:opacity-100">
          ← {team.city} {team.name}
        </Link>
      )}

      {/* Header */}
      <header className="relative flex flex-wrap items-center gap-5 mt-2 mb-6">
        <PlayerAvatar
          firstName={player.firstName}
          lastName={player.lastName}
          primaryColor={team?.primaryColor ?? '#E66B00'}
          secondaryColor={secondary}
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
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge variant="default" size="md" className="capitalize">{player.sportData.starTier}</Badge>
            <Badge variant={trajectoryVariant(traj)} size="md" className="capitalize">{traj}</Badge>
            <Badge variant="default" size="md">
              {player.sportData.yearsInLeague > 0 ? `Yr ${player.sportData.yearsInLeague}` : 'Rookie'}
            </Badge>
            {player.sportData.isTwoWay && <Badge variant="amber" size="md">Two-way</Badge>}
          </div>
        </div>
        <div
          className="ml-auto text-5xl font-extrabold px-4 py-1 rounded-lg text-white self-start"
          style={{ background: primary, color: secondary, fontFamily: 'var(--font-display)' }}
          title="Overall rating"
        >
          {player.ratings.overall}
        </div>
      </header>

      {/* Physical / basics row */}
      <section className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-6">
        <Stat label="Height" value={`${Math.floor(player.ratings.height / 12)}'${player.ratings.height % 12}"`} />
        <Stat label="Wingspan" value={`${player.ratings.wingspan}"`} />
        <Stat label="Potential" value={player.development.potential} />
        <Stat label="Speed" value={player.ratings.speed} />
        <Stat label="Hand" value={player.sportData.shootingHand} />
        <Stat label="Two-way" value={player.sportData.isTwoWay ? 'Yes' : 'No'} />
      </section>

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
            <Stat label="PPG" value={per(stats.points, stats.gamesPlayed)} />
            <Stat label="RPG" value={per(stats.totalRebounds, stats.gamesPlayed)} />
            <Stat label="APG" value={per(stats.assists, stats.gamesPlayed)} />
            <Stat label="SPG" value={per(stats.steals, stats.gamesPlayed)} />
            <Stat label="BPG" value={per(stats.blocks, stats.gamesPlayed)} />
            <Stat label="FG%" value={pct(stats.fieldGoalsMade, stats.fieldGoalsAttempted)} />
            <Stat label="3P%" value={pct(stats.threePointsMade, stats.threePointsAttempted)} />
            <Stat label="FT%" value={pct(stats.freeThrowsMade, stats.freeThrowsAttempted)} />
          </div>
        ) : (
          <InlineEmpty
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
          <InlineEmpty
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

      {/* Ratings grouped */}
      <section className="grid sm:grid-cols-2 gap-4">
        {[...grouped.entries()].map(([group, fields]) => (
          <div key={group} className="p-4 rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <h2 className="text-sm font-bold uppercase tracking-wide mb-3 text-[var(--text-sec)]">{group}</h2>
            <ul className="space-y-2">
              {fields.map(f => {
                const v = (player.ratings as unknown as Record<string, number>)[f.key];
                if (typeof v !== 'number') return null;
                return (
                  <li key={f.key} className="flex items-center gap-3">
                    <span className="w-14 text-xs text-[var(--text-sec)]">{f.label}</span>
                    <div className="flex-1 h-2 rounded-full" style={{ background: 'var(--border)' }}>
                      <div className="h-2 rounded-full" style={{ width: `${v}%`, background: ratingColor(v) }} />
                    </div>
                    <span className="w-8 text-right text-sm font-semibold">{v}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>
    </main>
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

function ratingColor(v: number): string {
  if (v >= 90) return '#10b981';
  if (v >= 80) return '#84cc16';
  if (v >= 70) return '#eab308';
  if (v >= 60) return '#f97316';
  return '#dc2626';
}

function trajectoryVariant(t: string): 'green' | 'red' | 'default' {
  if (t === 'breakout' || t === 'rising') return 'green';
  if (t === 'declining' || t === 'cliff') return 'red';
  return 'default';
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-2.5 rounded-lg" style={{ background: 'var(--surface-2)' }}>
      <div className="text-base font-bold" style={{ color: 'var(--accent)' }}>{value}</div>
      <div className="text-[10px] opacity-70 uppercase tracking-wide">{label}</div>
    </div>
  );
}

function InlineEmpty({ icon, title, message }: { icon: string; title: string; message: string }) {
  return (
    <div className="text-center py-8 px-4">
      <div className="text-4xl mb-2">{icon}</div>
      <div className="font-bold">{title}</div>
      <p className="text-sm text-[var(--text-sec)] mt-1">{message}</p>
    </div>
  );
}

function Loading() {
  return <main className="max-w-4xl mx-auto p-8"><p className="opacity-60">Loading…</p></main>;
}

function NotFound({ message, backHref, backLabel }: { message: string; backHref: string; backLabel: string }) {
  return (
    <main className="max-w-4xl mx-auto p-8">
      <p className="mb-4">{message}</p>
      <Link href={backHref} className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
        ← Back to {backLabel}
      </Link>
    </main>
  );
}
