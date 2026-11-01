'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PlayerName } from '@/components/modals/PlayerModalProvider';
import {
  NAME_CLS, OvrChip, PotValue, PotHeader, ContractText, TwoWayChip, ResponsiveName,
  SortTh, PlainTh, useRosterSort, contractInfo, injuryStatus,
} from '@/components/roster/RosterCells';
import { getTransactions } from '@/lib/transactions';
import { getInjuries, SEVERITY_LABEL, canPlayThrough } from '@/lib/injuries';
import { teamCap, fmtMoney } from '@/lib/dashboard/summary';
import { regularSeasonStatsByPlayer, statsForPlayer } from '@/lib/stats/seasonStats';
import type {
  BasketballPlayer,
  BasketballStats,
  BasketballTeam,
} from '@bs/sport-basketball';
import type { BaseGameResult } from '@bs/core/adapter';

/**
 * /team/[teamId] — team dashboard.
 *
 * Hero (record + cap space), then Team Stats + Next Game (2-col on desktop),
 * injuries / activity / recent games, and a sortable roster table. Sim
 * controls live in the top bar; the only sim button here is the Next Game
 * card's.
 */

type GameResult = BaseGameResult<BasketballStats>;

interface TeamSportData {
  conference: 'Eastern' | 'Western';
  division: string;
}

type SortKey = 'overall' | 'age' | 'position' | 'name' | 'pot' | 'contract' | 'ppg' | 'rpg' | 'apg' | 'gp';

// MOBILE-1: progressive column hiding on phone. At 390px we keep Name +
// Pos + OVR + PPG (the headline stat); Age/POT/Contract/GP/RPG/APG re-emerge
// at sm; 3PT/DEF/REB only at md. Sortable headers + body rows share the same
// `hidden` classes so the table stays aligned.
const SORTABLE: { key: SortKey; label: ReactNode; align: 'left' | 'center' | 'right'; cls?: string }[] = [
  { key: 'name',     label: 'Name',     align: 'left'  },
  { key: 'position', label: 'Pos',      align: 'left'  },
  { key: 'age',      label: 'Age',      align: 'right', cls: 'hidden sm:table-cell' },
  { key: 'overall',  label: 'OVR',      align: 'center' },
  { key: 'pot',      label: <PotHeader />, align: 'right', cls: 'hidden sm:table-cell' },
  { key: 'contract', label: 'Contract', align: 'right', cls: 'hidden sm:table-cell' },
  { key: 'gp',       label: 'GP',       align: 'right', cls: 'hidden sm:table-cell' },
  { key: 'ppg',      label: 'PPG',      align: 'right' },
  { key: 'rpg',      label: 'RPG',      align: 'right', cls: 'hidden sm:table-cell' },
  { key: 'apg',      label: 'APG',      align: 'right', cls: 'hidden sm:table-cell' },
];
const ALIGN_CLS = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;

/** Per-game value, guarding the 0-games case. */
function perGameStat(s: BasketballStats, key: 'points' | 'totalRebounds' | 'assists'): number {
  return s.gamesPlayed > 0 ? s[key] / s.gamesPlayed : 0;
}

function gameDay(g: GameResult): number {
  return (g.sportData as { dayOfSeason?: number } | undefined)?.dayOfSeason ?? 0;
}

export default function TeamPage() {
  const params = useParams<{ teamId: string }>();
  const router = useRouter();
  const { league, loading, error } = useLeagueOrHydrate();
  const { pickUserTeam, simNextUserGame } = useLeagueStore();
  const { sortKey, sortDir, onSort } = useRosterSort<SortKey>('overall', 'desc', ['name', 'position']);
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

  // Current-season aggregated box-score stats, keyed by player id.
  const statsMap = useMemo(
    () => (league ? regularSeasonStatsByPlayer(league) : new Map()),
    [league],
  );

  const season = league?.currentSeason ?? 0;
  const sorted = useMemo(() => {
    const arr = [...roster];
    arr.sort((a, b) => {
      const sa = statsForPlayer(statsMap, a.id);
      const sb = statsForPlayer(statsMap, b.id);
      let diff = 0;
      switch (sortKey) {
        case 'overall':  diff = a.ratings.overall - b.ratings.overall; break;
        case 'age':      diff = a.age - b.age; break;
        case 'position': diff = a.sportData.position.localeCompare(b.sportData.position); break;
        case 'name':     diff = `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`); break;
        case 'pot':      diff = a.development.potential - b.development.potential; break;
        case 'contract': diff = (contractInfo(a, season)?.aav ?? 0) - (contractInfo(b, season)?.aav ?? 0); break;
        case 'gp':       diff = sa.gamesPlayed - sb.gamesPlayed; break;
        case 'ppg':      diff = perGameStat(sa, 'points') - perGameStat(sb, 'points'); break;
        case 'rpg':      diff = perGameStat(sa, 'totalRebounds') - perGameStat(sb, 'totalRebounds'); break;
        case 'apg':      diff = perGameStat(sa, 'assists') - perGameStat(sb, 'assists'); break;
      }
      return sortDir === 'desc' ? -diff : diff;
    });
    return arr;
  }, [roster, sortKey, sortDir, statsMap, season]);

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
  const cap = teamCap(league, team);
  const injuries = getInjuries(league);
  const day = league.currentTick;

  // Team lookup for opponent rendering.
  const teamById = new Map((league.teams as BasketballTeam[]).map(t => [t.id, t]));

  return (
    <main className="max-w-5xl mx-auto p-3 sm:p-5 md:p-8">
      <Link href="/standings" className="text-sm font-semibold opacity-70 hover:opacity-100">
        ← Standings
      </Link>

      <header
        className="relative overflow-hidden rounded-2xl mt-2 mb-6 flex flex-wrap items-center gap-4 p-5 sm:p-6"
        style={{ background: `linear-gradient(135deg, ${team.primaryColor} 0%, ${team.primaryColor} 55%, ${team.secondaryColor} 100%)` }}
      >
        {/* Diagonal chevron texture in the team's secondary color */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ opacity: 0.1, backgroundImage: `repeating-linear-gradient(135deg, ${team.secondaryColor} 0 14px, transparent 14px 30px)` }}
        />
        <TeamLogo
          abbreviation={team.abbreviation}
          primaryColor={team.primaryColor}
          secondaryColor={team.secondaryColor}
          size="xl"
        />
        <div className="relative min-w-0">
          <h1 className="text-3xl sm:text-4xl font-extrabold flex flex-wrap items-center gap-2 text-white" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.35)' }}>
            {team.city} {team.name}
            {isUserTeam && <Badge variant="orange" size="md">Your team</Badge>}
          </h1>
          <p className="text-sm text-white/85" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.35)' }}>
            {sd.conference} Conference · {sd.division} Division ·{' '}
            <strong>{team.record.wins}–{team.record.losses}</strong>
          </p>
        </div>

        <div className="relative ml-auto flex flex-wrap items-center gap-3">
          {/* Cap space (football parity) — on a dark scrim so the green/red
              reads on any team color. */}
          <div className="rounded-xl px-3 py-2 text-right" style={{ background: 'rgba(0,0,0,0.32)' }}>
            <div className={`text-xl font-black tabular-nums leading-tight ${cap.capRoom >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {cap.capRoom >= 0 ? fmtMoney(cap.capRoom) : `−${fmtMoney(-cap.capRoom)}`}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-white/80">{cap.capRoom >= 0 ? 'Cap space' : 'Over the cap'}</div>
            <div className="text-[11px] tabular-nums text-white/80">{fmtMoney(cap.payroll)} / {fmtMoney(cap.cap)}</div>
          </div>
          {isUserTeam ? (
            <Button variant="secondary" onClick={() => router.push('/roster')}>Edit Lineup</Button>
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
              value={last5.length ? <Last5Dots results={last5} /> : '—'}
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

      {/* Injury report */}
      {(() => {
        const hurt = team.playerIds
          .map(id => injuries[id])
          .filter((inj): inj is NonNullable<typeof inj> => !!inj && inj.returnDay > day);
        if (hurt.length === 0) return null;
        return (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>🏥 Injury Report ({hurt.length})</CardTitle>
            </CardHeader>
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {hurt.map(inj => {
                const p = league.players[inj.playerId] as BasketballPlayer | undefined;
                const gtd = canPlayThrough(inj);
                const out = gtd ? 'GTD' : inj.returnDay > 90_000 ? 'out for season' : `~${Math.max(1, inj.returnDay - day)}d`;
                return (
                  <li key={inj.playerId} className="py-1.5 flex items-center gap-2 text-sm">
                    <PlayerName playerId={inj.playerId} className="font-semibold">{p ? `${p.firstName} ${p.lastName}` : inj.playerId}</PlayerName>
                    <span className="text-xs text-[var(--text-sec)]">{inj.bodyPart} · {SEVERITY_LABEL[inj.severity]}</span>
                    <span className="ml-auto text-xs font-semibold" style={{ color: gtd ? '#f59e0b' : '#dc2626' }}>{out}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })()}

      {/* Recent activity */}
      {(() => {
        const teamTxns = getTransactions(league).filter(t => t.teamIds.includes(team.id)).slice(0, 5);
        if (teamTxns.length === 0) return null;
        return (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <Link href="/transactions" className="text-xs font-semibold hover:underline" style={{ color: 'var(--accent)' }}>
                View all →
              </Link>
            </CardHeader>
            <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {teamTxns.map((t, i) => (
                <li key={i} className="py-1.5 text-sm">
                  <span className="font-semibold">{t.summary}</span>
                  <span className="text-xs text-[var(--text-sec)] ml-2">{t.detail}</span>
                </li>
              ))}
            </ul>
          </Card>
        );
      })()}

      {/* Recent games */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Recent Games</CardTitle>
        </CardHeader>
        {recentGames.length === 0 ? (
          <EmptyState
            icon="🏀"
            title="No tape to study yet"
            message="Sim a few games and your results show up right here."
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
            <thead>
              <tr>
                {SORTABLE.map(col => (
                  <SortTh
                    key={col.key}
                    k={col.key}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    className={`${ALIGN_CLS[col.align]} ${col.cls ?? ''}`}
                  >
                    {col.label}
                  </SortTh>
                ))}
                {/* Rating peeks — secondary context, only at md+. */}
                <PlainTh className="text-right opacity-70 hidden md:table-cell">3PT</PlainTh>
                <PlainTh className="text-right opacity-70 hidden md:table-cell">DEF</PlainTh>
                <PlainTh className="text-right opacity-70 hidden md:table-cell">REB</PlainTh>
              </tr>
            </thead>
            <tbody>
              {sorted.map(p => {
                const s = statsForPlayer(statsMap, p.id);
                const gp = s.gamesPlayed;
                const pg = (v: number) => (gp > 0 ? (v / gp).toFixed(1) : '—');
                const inj = injuryStatus(injuries[p.id], day);
                return (
                  <tr key={p.id} className="border-t hover:bg-[var(--surface-2)] transition-colors" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-2 py-2">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <PlayerName playerId={p.id} className={`${NAME_CLS} truncate`}>
                          <ResponsiveName firstName={p.firstName} lastName={p.lastName} />
                        </PlayerName>
                        <TwoWayChip player={p} />
                      </span>
                      {inj && (
                        <span className={`block text-[10px] ${inj.gtd ? 'text-amber-600' : 'text-red-600'}`}>
                          {inj.bodyPart} · {inj.text}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-xs font-bold text-[var(--text-sec)]">{p.sportData.position}</td>
                    <td className="px-2 py-2 text-right tabular-nums hidden sm:table-cell">{p.age}</td>
                    <td className="px-2 py-2 text-center"><OvrChip value={p.ratings.overall} /></td>
                    <td className="px-2 py-2 text-right hidden sm:table-cell"><PotValue pot={p.development.potential} /></td>
                    <td className="px-2 py-2 text-right text-xs hidden sm:table-cell"><ContractText player={p} season={season} /></td>
                    <td className="px-2 py-2 text-right tabular-nums hidden sm:table-cell">{gp || '—'}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{pg(s.points)}</td>
                    <td className="px-2 py-2 text-right tabular-nums hidden sm:table-cell">{pg(s.totalRebounds)}</td>
                    <td className="px-2 py-2 text-right tabular-nums hidden sm:table-cell">{pg(s.assists)}</td>
                    <td className="px-2 py-2 text-right opacity-70 hidden md:table-cell">{p.ratings.threePoint}</td>
                    <td className="px-2 py-2 text-right opacity-70 hidden md:table-cell">{Math.round((p.ratings.perimeterDefense + p.ratings.interiorDefense) / 2)}</td>
                    <td className="px-2 py-2 text-right opacity-70 hidden md:table-cell">{p.ratings.rebounding}</td>
                  </tr>
                );
              })}
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
          <Button variant="primary" busy={simming} onClick={onSim}>
            Sim Next Game →
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

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="p-2.5 rounded-lg" style={{ background: 'var(--surface-2)' }}>
      <div className="text-lg font-extrabold min-h-7 flex items-center" style={{ color: 'var(--accent)' }}>{value}</div>
      <div className="text-[10px] opacity-70 uppercase tracking-wide">{label}</div>
    </div>
  );
}

/** Last-5 results as colored dots (oldest → newest) instead of a "WWLWL" string. */
function Last5Dots({ results }: { results: string[] }) {
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={`Last ${results.length}: ${results.join(' ')}`}>
      {results.map((r, i) => (
        <span
          key={i}
          className={`w-2.5 h-2.5 rounded-full ${r === 'W' ? 'bg-green-500' : r === 'L' ? 'bg-red-500' : 'bg-[var(--border)]'}`}
          title={r === 'W' ? 'Win' : r === 'L' ? 'Loss' : r}
        />
      ))}
    </span>
  );
}

function Loading() {
  return <main className="max-w-5xl mx-auto p-3 sm:p-5 md:p-8"><p className="opacity-60">Loading…</p></main>;
}

function NotFound({ message }: { message: string }) {
  return (
    <main className="max-w-5xl mx-auto p-3 sm:p-5 md:p-8">
      <p className="mb-4">{message}</p>
      <Link href="/standings" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
        ← Back to standings
      </Link>
    </main>
  );
}
