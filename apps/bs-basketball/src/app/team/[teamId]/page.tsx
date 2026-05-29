'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import type {
  BasketballPlayer,
  BasketballStats,
  BasketballTeam,
} from '@bs/sport-basketball';
import type { BaseGameResult } from '@bs/core/adapter';

/**
 * /team/[teamId] — team dashboard.
 *
 * Top row: Team Stats card + Next Game card (2-col on desktop).
 * Then: Recent Games card (full width), Roster table (full width).
 */

type GameResult = BaseGameResult<BasketballStats>;

interface TeamSportData {
  conference: 'Eastern' | 'Western';
  division: string;
}

type SortKey = 'overall' | 'age' | 'position' | 'name';

const SORTABLE: { key: SortKey; label: string; align?: 'left' | 'right' }[] = [
  { key: 'name',     label: 'Name',     align: 'left' },
  { key: 'position', label: 'Pos',      align: 'left' },
  { key: 'age',      label: 'Age',      align: 'right' },
  { key: 'overall',  label: 'OVR',      align: 'right' },
];

function gameDay(g: GameResult): number {
  return (g.sportData as { dayOfSeason?: number } | undefined)?.dayOfSeason ?? 0;
}

export default function TeamPage() {
  const params = useParams<{ teamId: string }>();
  const router = useRouter();
  const { league, loading, error } = useLeagueOrHydrate();
  const { pickUserTeam, simNextUserGame, simDay } = useLeagueStore();
  const [sortKey, setSortKey] = useState<SortKey>('overall');
  const [sortDesc, setSortDesc] = useState(true);
  const [simming, setSimming] = useState(false);

  const team: BasketballTeam | null = useMemo(() => {
    if (!league) return null;
    return (league.teams.find(t => t.id === params.teamId) as BasketballTeam | undefined) ?? null;
  }, [league, params.teamId]);

  const roster: BasketballPlayer[] = useMemo(() => {
    if (!league || !team) return [];
    return team.playerIds
      .map(pid => league.players[pid] as BasketballPlayer | undefined)
      .filter((p): p is BasketballPlayer => !!p);
  }, [league, team]);

  // All games involving this team, in schedule order.
  const teamGames: GameResult[] = useMemo(() => {
    if (!league || !team) return [];
    return league.games.filter(
      g => g.homeTeamId === team.id || g.awayTeamId === team.id,
    ) as GameResult[];
  }, [league, team]);

  const nextGame = useMemo(
    () => teamGames.find(g => g.status === 'scheduled') ?? null,
    [teamGames],
  );

  const recentGames = useMemo(
    () => teamGames.filter(g => g.status === 'played').slice(-5).reverse(),
    [teamGames],
  );

  // Conference rank: sort same-conference teams by record, find this team.
  const confRank = useMemo(() => {
    if (!league || !team) return null;
    const conf = (team.sportData as TeamSportData).conference;
    const peers = (league.teams as BasketballTeam[])
      .filter(t => (t.sportData as TeamSportData).conference === conf)
      .sort((a, b) => {
        if (b.record.wins !== a.record.wins) return b.record.wins - a.record.wins;
        if (a.record.losses !== b.record.losses) return a.record.losses - b.record.losses;
        return (b.record.pointsFor - b.record.pointsAgainst) - (a.record.pointsFor - a.record.pointsAgainst);
      });
    const idx = peers.findIndex(t => t.id === team.id);
    return { rank: idx + 1, of: peers.length, conf };
  }, [league, team]);

  const sorted = useMemo(() => {
    const arr = [...roster];
    arr.sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case 'overall':  diff = a.ratings.overall - b.ratings.overall; break;
        case 'age':      diff = a.age - b.age; break;
        case 'position': diff = a.sportData.position.localeCompare(b.sportData.position); break;
        case 'name':     diff = `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`); break;
      }
      return sortDesc ? -diff : diff;
    });
    return arr;
  }, [roster, sortKey, sortDesc]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDesc(d => !d);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  if (loading) return <Loading />;
  if (!league) return <NotFound message={error ?? 'No league loaded.'} />;
  if (!team) return <NotFound message="Team not found in this league." />;

  const sd = team.sportData as TeamSportData;
  const isUserTeam = league.userTeamId === team.id;
  const gamesPlayed = team.record.wins + team.record.losses;
  const ppg = gamesPlayed > 0 ? team.record.pointsFor / gamesPlayed : 0;
  const oppPpg = gamesPlayed > 0 ? team.record.pointsAgainst / gamesPlayed : 0;
  const avgOvr = roster.length ? avg(roster.map(p => p.ratings.overall)) : 0;
  const last5 = team.record.streak.slice(-5);

  // Team lookup for opponent rendering.
  const teamById = new Map((league.teams as BasketballTeam[]).map(t => [t.id, t]));

  return (
    <main className="max-w-5xl mx-auto p-5 sm:p-8">
      <Link href="/league" className="text-sm font-semibold opacity-70 hover:opacity-100">
        ← League
      </Link>

      <header className="flex flex-wrap items-center gap-4 mt-2 mb-6">
        <TeamLogo
          abbreviation={team.abbreviation}
          primaryColor={team.primaryColor}
          secondaryColor={team.secondaryColor}
          size="xl"
        />
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold flex flex-wrap items-center gap-2">
            {team.city} {team.name}
            {isUserTeam && <Badge variant="orange" size="md">Your team</Badge>}
          </h1>
          <p className="text-sm opacity-70">
            {sd.conference} Conference · {sd.division} Division ·{' '}
            <strong>{team.record.wins}–{team.record.losses}</strong>
          </p>
        </div>

        <div className="ml-auto flex flex-wrap gap-2">
          {isUserTeam ? (
            <>
              <Button
                variant="primary"
                disabled={simming || !nextGame}
                onClick={async () => {
                  setSimming(true);
                  const gameId = await simNextUserGame();
                  setSimming(false);
                  if (gameId) router.push(`/game/${gameId}`);
                }}
              >
                {simming ? 'Simming…' : 'Sim Next Game →'}
              </Button>
              <Button
                variant="secondary"
                disabled={simming}
                onClick={async () => {
                  setSimming(true);
                  await simDay();
                  setSimming(false);
                }}
              >
                Sim Day
              </Button>
            </>
          ) : league.userTeamId ? null : (
            <Button variant="primary" onClick={() => void pickUserTeam(team.id)}>
              Pick This Team
            </Button>
          )}
        </div>
      </header>

      {/* Top row: Team Stats + Next Game */}
      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <Card>
          <CardHeader>
            <CardTitle>Team Stats</CardTitle>
            {confRank && (
              <Badge variant="default" size="md">
                #{confRank.rank} in {confRank.conf}
              </Badge>
            )}
          </CardHeader>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="PPG" value={gamesPlayed ? ppg.toFixed(1) : '—'} />
            <Stat label="Opp PPG" value={gamesPlayed ? oppPpg.toFixed(1) : '—'} />
            <Stat label="Avg OVR" value={roster.length ? avgOvr.toFixed(1) : '—'} />
            <Stat
              label="Last 5"
              value={last5.length ? last5.join('') : '—'}
              mono
            />
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Next Game</CardTitle>
          </CardHeader>
          {nextGame ? (
            <NextGamePanel
              game={nextGame}
              team={team}
              opponent={teamById.get(nextGame.homeTeamId === team.id ? nextGame.awayTeamId : nextGame.homeTeamId) ?? null}
              isHome={nextGame.homeTeamId === team.id}
              isUserTeam={isUserTeam}
              simming={simming}
              onSim={async () => {
                setSimming(true);
                const gameId = await simNextUserGame();
                setSimming(false);
                if (gameId) router.push(`/game/${gameId}`);
              }}
            />
          ) : (
            <EmptyState
              icon="🏁"
              title="Season complete"
              message="No scheduled games remaining — see standings."
            />
          )}
        </Card>
      </div>

      {/* Recent games */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Recent Games</CardTitle>
        </CardHeader>
        {recentGames.length === 0 ? (
          <EmptyState
            icon="🏀"
            title="No games played yet"
            message="Sim some games to see results here."
          />
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {recentGames.map(g => {
              const isHome = g.homeTeamId === team.id;
              const oppId = isHome ? g.awayTeamId : g.homeTeamId;
              const opp = teamById.get(oppId);
              const teamScore = isHome ? g.finalScore!.home : g.finalScore!.away;
              const oppScore = isHome ? g.finalScore!.away : g.finalScore!.home;
              const won = teamScore > oppScore;
              return (
                <li key={g.id}>
                  <Link
                    href={`/game/${g.id}`}
                    className="flex items-center gap-3 py-2.5 px-1 rounded-md hover:bg-[var(--surface-2)] transition-colors"
                  >
                    <Badge variant={won ? 'green' : 'red'} size="md" className="w-7 justify-center">
                      {won ? 'W' : 'L'}
                    </Badge>
                    <span className="text-xs text-[var(--text-sec)] w-12">
                      {isHome ? 'vs' : '@'}
                    </span>
                    {opp && (
                      <TeamLogo
                        abbreviation={opp.abbreviation}
                        primaryColor={opp.primaryColor}
                        secondaryColor={opp.secondaryColor}
                        size="sm"
                      />
                    )}
                    <span className="font-semibold">{opp?.abbreviation ?? '???'}</span>
                    <span className="ml-auto font-mono tabular-nums">
                      <span className={won ? 'font-bold' : ''}>{teamScore}</span>
                      <span className="opacity-50 mx-1">–</span>
                      <span>{oppScore}</span>
                    </span>
                    <span className="text-xs text-[var(--text-sec)] w-12 text-right hidden sm:inline">
                      Day {gameDay(g)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Roster */}
      <Card>
        <CardHeader>
          <CardTitle>Roster</CardTitle>
          <span className="text-sm text-[var(--text-sec)]">{roster.length} players</span>
        </CardHeader>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm">
            <thead className="text-[var(--text-sec)]">
              <tr>
                {SORTABLE.map(col => (
                  <th
                    key={col.key}
                    className={`px-3 py-2 cursor-pointer select-none ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                    onClick={() => toggleSort(col.key)}
                  >
                    {col.label}
                    {sortKey === col.key && <span className="ml-1 opacity-60">{sortDesc ? '▼' : '▲'}</span>}
                  </th>
                ))}
                <th className="px-3 py-2 text-right opacity-60">3PT</th>
                <th className="px-3 py-2 text-right opacity-60">DEF</th>
                <th className="px-3 py-2 text-right opacity-60">REB</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(p => (
                <tr key={p.id} className="border-t hover:bg-[var(--surface-2)] transition-colors" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-3 py-2">
                    <Link
                      href={`/player/${p.id}`}
                      className="font-semibold hover:underline"
                      style={{ color: 'var(--accent)' }}
                    >
                      {p.firstName} {p.lastName}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{p.sportData.position}</td>
                  <td className="px-3 py-2 text-right">{p.age}</td>
                  <td className="px-3 py-2 text-right font-bold">{p.ratings.overall}</td>
                  <td className="px-3 py-2 text-right opacity-70">{p.ratings.threePoint}</td>
                  <td className="px-3 py-2 text-right opacity-70">{Math.round((p.ratings.perimeterDefense + p.ratings.interiorDefense) / 2)}</td>
                  <td className="px-3 py-2 text-right opacity-70">{p.ratings.rebounding}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}

// ===========================================================================
// Components
// ===========================================================================

function NextGamePanel({
  game, team, opponent, isHome, isUserTeam, simming, onSim,
}: {
  game: GameResult;
  team: BasketballTeam;
  opponent: BasketballTeam | null;
  isHome: boolean;
  isUserTeam: boolean;
  simming: boolean;
  onSim: () => void;
}) {
  void team;
  const dateStr = formatGameDate(game.date);
  return (
    <div className="flex items-center gap-4">
      {opponent && (
        <TeamLogo
          abbreviation={opponent.abbreviation}
          primaryColor={opponent.primaryColor}
          secondaryColor={opponent.secondaryColor}
          size="lg"
        />
      )}
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-widest text-[var(--text-sec)]">
          {isHome ? 'Home vs' : 'Away @'}
        </div>
        <div className="text-lg font-bold truncate">
          {opponent ? `${opponent.city} ${opponent.name}` : 'TBD'}
        </div>
        <div className="text-xs text-[var(--text-sec)]">
          Day {gameDay(game)}{dateStr ? ` · ${dateStr}` : ''}
        </div>
      </div>
      <div className="ml-auto shrink-0">
        {isUserTeam ? (
          <Button variant="primary" disabled={simming} onClick={onSim}>
            {simming ? 'Simming…' : 'Sim Next Game →'}
          </Button>
        ) : (
          <Badge variant="default" size="md">Upcoming</Badge>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// Helpers
// ===========================================================================

function avg(nums: number[]): number {
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function formatGameDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function Stat({ label, value, mono }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div className="p-2.5 rounded-lg" style={{ background: 'var(--surface-2)' }}>
      <div className={`text-lg font-extrabold ${mono ? 'font-mono' : ''}`} style={{ color: 'var(--accent)' }}>{value}</div>
      <div className="text-[10px] opacity-70 uppercase tracking-wide">{label}</div>
    </div>
  );
}

function Loading() {
  return <main className="max-w-5xl mx-auto p-8"><p className="opacity-60">Loading…</p></main>;
}

function NotFound({ message }: { message: string }) {
  return (
    <main className="max-w-5xl mx-auto p-8">
      <p className="mb-4">{message}</p>
      <Link href="/league" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
        ← Back to league
      </Link>
    </main>
  );
}
