'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { PlayerModal } from '@/components/modals/PlayerModal';
import { dropConfetti } from '@/lib/ui/confetti';
import type {
  BasketballPlayer,
  BasketballStats,
  BasketballTeam,
} from '@bs/sport-basketball';

/**
 * /game/[gameId] — box score view.
 *
 * Renders final score + per-player stat lines for both teams. Only valid
 * for games with status='played'; scheduled games get a "not yet" message.
 */

const BOXSCORE_COLS: { key: keyof BasketballStats; label: string }[] = [
  { key: 'minutes',             label: 'MIN' },
  { key: 'points',              label: 'PTS' },
  { key: 'fieldGoalsMade',      label: 'FGM' },
  { key: 'fieldGoalsAttempted', label: 'FGA' },
  { key: 'threePointsMade',     label: '3PM' },
  { key: 'threePointsAttempted',label: '3PA' },
  { key: 'freeThrowsMade',      label: 'FTM' },
  { key: 'freeThrowsAttempted', label: 'FTA' },
  { key: 'totalRebounds',       label: 'REB' },
  { key: 'assists',             label: 'AST' },
  { key: 'steals',              label: 'STL' },
  { key: 'blocks',              label: 'BLK' },
  { key: 'turnovers',           label: 'TO' },
];

export default function GamePage() {
  const params = useParams<{ gameId: string }>();
  const { league, loading, error } = useLeagueOrHydrate();
  const [modalPlayerId, setModalPlayerId] = useState<string | null>(null);

  const game = useMemo(() => {
    if (!league) return null;
    return league.games.find(g => g.id === params.gameId) ?? null;
  }, [league, params.gameId]);

  const homeTeam = useMemo<BasketballTeam | null>(() => {
    if (!league || !game) return null;
    return (league.teams.find(t => t.id === game.homeTeamId) as BasketballTeam | undefined) ?? null;
  }, [league, game]);

  const awayTeam = useMemo<BasketballTeam | null>(() => {
    if (!league || !game) return null;
    return (league.teams.find(t => t.id === game.awayTeamId) as BasketballTeam | undefined) ?? null;
  }, [league, game]);

  // Confetti when the user's team won this game — once per viewed game.
  const celebratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!league?.userTeamId || !game || game.status !== 'played' || !game.finalScore) return;
    const userId = league.userTeamId;
    const inGame = game.homeTeamId === userId || game.awayTeamId === userId;
    if (!inGame) return;
    const userScore = game.homeTeamId === userId ? game.finalScore.home : game.finalScore.away;
    const oppScore = game.homeTeamId === userId ? game.finalScore.away : game.finalScore.home;
    if (userScore > oppScore && celebratedRef.current !== game.id) {
      celebratedRef.current = game.id;
      dropConfetti();
    }
  }, [league?.userTeamId, game]);

  if (loading) return <Loading />;
  if (!league) return <NotFound message={error ?? 'No league loaded.'} />;
  if (!game) return <NotFound message="Game not found." />;
  if (!homeTeam || !awayTeam) return <NotFound message="Game references missing teams." />;

  if (game.status !== 'played' || !game.finalScore) {
    return (
      <main className="max-w-4xl mx-auto p-8">
        <p className="mb-4 opacity-70">Game not yet played.</p>
        <Link href={`/team/${homeTeam.id}`} className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
          ← Back to {homeTeam.city} {homeTeam.name}
        </Link>
      </main>
    );
  }

  const playerMap = league.players as Record<string, BasketballPlayer>;
  const homeWon = game.finalScore.home > game.finalScore.away;

  return (
    <main className="max-w-5xl mx-auto p-8">
      {league.userTeamId && (
        <Link
          href={`/team/${league.userTeamId}`}
          className="text-sm font-semibold opacity-70 hover:opacity-100"
        >
          ← My Team
        </Link>
      )}

      {/* Final score header */}
      <section className="grid grid-cols-3 items-center my-6 p-6 rounded-lg" style={{ background: 'var(--muted)' }}>
        <TeamScoreCell
          team={awayTeam}
          score={game.finalScore.away}
          won={!homeWon}
          align="left"
        />
        <div className="text-center text-sm opacity-60 uppercase tracking-wide">
          Final
        </div>
        <TeamScoreCell
          team={homeTeam}
          score={game.finalScore.home}
          won={homeWon}
          align="right"
        />
      </section>

      <div className="grid md:grid-cols-2 gap-6">
        <BoxScoreTable team={awayTeam} game={game} playerMap={playerMap} onPlayerClick={setModalPlayerId} />
        <BoxScoreTable team={homeTeam} game={game} playerMap={playerMap} onPlayerClick={setModalPlayerId} />
      </div>

      <PlayerModal playerId={modalPlayerId} onClose={() => setModalPlayerId(null)} />
    </main>
  );
}

// ===========================================================================
// Components
// ===========================================================================

function TeamScoreCell({
  team, score, won, align,
}: {
  team: BasketballTeam;
  score: number;
  won: boolean;
  align: 'left' | 'right';
}) {
  return (
    <div className={`flex items-center gap-3 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
      {align === 'left' && (
        <TeamLogo
          abbreviation={team.abbreviation}
          primaryColor={team.primaryColor}
          secondaryColor={team.secondaryColor}
          size="lg"
        />
      )}
      <div className={align === 'right' ? 'text-right' : ''}>
        <div className="text-xs opacity-70">{team.city}</div>
        <div className="font-bold">{team.name}</div>
      </div>
      <div
        className="text-4xl font-extrabold"
        style={{ color: won ? 'var(--accent)' : 'var(--foreground)' }}
      >
        {score}
      </div>
      {align === 'right' && (
        <TeamLogo
          abbreviation={team.abbreviation}
          primaryColor={team.primaryColor}
          secondaryColor={team.secondaryColor}
          size="lg"
        />
      )}
    </div>
  );
}

function BoxScoreTable({
  team, game, playerMap, onPlayerClick,
}: {
  team: BasketballTeam;
  game: { boxScores: Record<string, Partial<BasketballStats>> };
  playerMap: Record<string, BasketballPlayer>;
  onPlayerClick: (playerId: string) => void;
}) {
  // Players who appeared (have a box score) — sorted by points descending.
  const lines = team.playerIds
    .map(pid => ({
      player: playerMap[pid],
      stats: game.boxScores[pid] ?? {},
    }))
    .filter(({ player, stats }) => player && (stats.minutes ?? 0) > 0)
    .sort((a, b) => (b.stats.points ?? 0) - (a.stats.points ?? 0));

  return (
    <section className="rounded border overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
      <h2 className="px-3 py-2 font-bold border-b" style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}>
        {team.city} {team.name}
      </h2>
      <table className="w-full text-xs">
        <thead>
          <tr className="opacity-70">
            <th className="px-2 py-1 text-left">Player</th>
            {BOXSCORE_COLS.map(c => (
              <th key={String(c.key)} className="px-2 py-1 text-right">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map(({ player, stats }) => (
            <tr key={player.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
              <td className="px-2 py-1">
                <button
                  onClick={() => onPlayerClick(player.id)}
                  className="font-semibold hover:underline text-left"
                  style={{ color: 'var(--accent)' }}
                >
                  {player.firstName[0]}. {player.lastName}
                </button>
                <span className="opacity-60 ml-1">{player.sportData.position}</span>
              </td>
              {BOXSCORE_COLS.map(c => (
                <td key={String(c.key)} className="px-2 py-1 text-right">
                  {formatStat(c.key, stats[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ===========================================================================
// Helpers
// ===========================================================================

function formatStat(key: keyof BasketballStats, value: number | undefined): string {
  if (value === undefined || value === null) return '–';
  if (key === 'minutes') return Math.round(value).toString();
  return Math.round(value).toString();
}

function Loading() {
  return <main className="max-w-4xl mx-auto p-8"><p className="opacity-60">Loading…</p></main>;
}

function NotFound({ message }: { message: string }) {
  return (
    <main className="max-w-4xl mx-auto p-8">
      <p className="mb-4">{message}</p>
      <Link href="/league" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>
        ← Back to league
      </Link>
    </main>
  );
}
