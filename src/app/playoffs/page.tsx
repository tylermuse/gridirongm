'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore } from '@/lib/engine/store';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { TeamRosterModal } from '@/components/game/TeamRosterModal';
import { PlayerModal } from '@/components/game/PlayerModal';
import { BoxScoreModal } from '@/components/game/BoxScoreModal';
import type { PlayoffMatchup, Team, GameResult } from '@/types';

const ROUND_LABELS: Record<number, string> = {
  1: 'Wild Card',
  2: 'Divisional',
  3: 'Championship',
  4: 'Super Bowl',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TeamRow({
  team,
  seed,
  score,
  isWinner,
  isUser,
  isTBD,
  onTeamClick,
}: {
  team: Team | undefined;
  seed: number | null;
  score: number | null;
  isWinner: boolean;
  isUser: boolean;
  isTBD: boolean;
  onTeamClick?: (teamId: string) => void;
}) {
  const dim = score !== null && !isWinner;
  return (
    <div
      className={`flex items-center gap-2 py-1.5 ${isWinner ? 'font-semibold' : ''} ${dim ? 'opacity-40' : ''}`}
    >
      <span className="text-[10px] text-[var(--text-sec)] w-5 text-right shrink-0">
        {seed != null ? `#${seed}` : ''}
      </span>

      {isTBD ? (
        <div className="flex-1 flex items-center gap-2">
          <div className="w-5 h-5 rounded border border-dashed border-[var(--border)]" />
          <span className="text-xs text-[var(--text-sec)] italic">TBD</span>
        </div>
      ) : (
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <button
            onClick={() => team && onTeamClick?.(team.id)}
            className="w-5 h-5 rounded flex items-center justify-center text-[8px] font-black text-white shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
            style={{ backgroundColor: team?.primaryColor ?? '#555' }}
          >
            {team?.abbreviation ?? '?'}
          </button>
          <button onClick={() => team && onTeamClick?.(team.id)} className={`text-xs truncate hover:text-blue-600 transition-colors ${isUser ? 'text-blue-600' : ''}`}>
            {team ? `${team.city}` : 'Unknown'}
          </button>
          {isUser && (
            <span className="text-[9px] font-bold text-blue-600 shrink-0">YOU</span>
          )}
        </div>
      )}

      <span className="text-sm font-mono w-5 text-right shrink-0 font-bold">
        {score !== null ? score : ''}
      </span>
    </div>
  );
}

function MatchupCard({
  matchup,
  teams,
  userTeamId,
  onTeamClick,
  onGameClick,
}: {
  matchup: PlayoffMatchup;
  teams: Team[];
  userTeamId: string;
  onTeamClick?: (teamId: string) => void;
  onGameClick?: (matchupId: string) => void;
}) {
  const homeTeam = matchup.homeTeamId
    ? teams.find(t => t.id === matchup.homeTeamId)
    : undefined;
  const awayTeam = matchup.awayTeamId
    ? teams.find(t => t.id === matchup.awayTeamId)
    : undefined;
  const userInGame =
    matchup.homeTeamId === userTeamId || matchup.awayTeamId === userTeamId;
  const isCompleted = !!matchup.winnerId;

  return (
    <div
      onClick={() => isCompleted && onGameClick?.(matchup.id)}
      className={`rounded-lg border bg-[var(--surface)] px-2 py-0.5 ${
        userInGame
          ? 'border-blue-500/60 shadow shadow-blue-500/10'
          : 'border-[var(--border)]'
      } ${isCompleted ? 'cursor-pointer hover:brightness-125 transition-all' : ''}`}
    >
      <TeamRow
        team={homeTeam}
        seed={matchup.homeSeed}
        score={matchup.homeScore}
        isWinner={matchup.winnerId === matchup.homeTeamId}
        isUser={matchup.homeTeamId === userTeamId}
        isTBD={!matchup.homeTeamId}
        onTeamClick={onTeamClick}
      />
      <div className="border-t border-[var(--border)]" />
      <TeamRow
        team={awayTeam}
        seed={matchup.awaySeed}
        score={matchup.awayScore}
        isWinner={matchup.winnerId === matchup.awayTeamId}
        isUser={matchup.awayTeamId === userTeamId}
        isTBD={!matchup.awayTeamId}
        onTeamClick={onTeamClick}
      />
    </div>
  );
}

function ConferenceBracket({
  conference,
  bracket,
  teams,
  userTeamId,
  onTeamClick,
  onGameClick,
}: {
  conference: 'AFC' | 'NFC';
  bracket: PlayoffMatchup[];
  teams: Team[];
  userTeamId: string;
  onTeamClick?: (teamId: string) => void;
  onGameClick?: (matchupId: string) => void;
}) {
  const confMatchups = bracket.filter(m => m.conference === conference);
  const color = conference === 'AFC' ? 'text-red-600' : 'text-blue-600';

  // Determine seeds 1-4 (div winners with bye)
  const wcMatchups = confMatchups.filter(m => m.round === 1);
  const divMatchups = confMatchups.filter(m => m.round === 2);
  const confChamp = confMatchups.find(m => m.round === 3);

  // Seed 1 team (bye — not in WC bracket, but in div-0 as home)
  const byeTeam = divMatchups.find(m => m.id.includes('div-0'))?.homeTeamId;
  const byeTeamObj = byeTeam ? teams.find(t => t.id === byeTeam) : undefined;

  return (
    <div>
      <h3 className={`text-sm font-bold mb-3 ${color}`}>{conference}</h3>

      {/* Bye indicator */}
      {byeTeamObj && (
        <div className="mb-3 flex items-center gap-2 text-xs text-[var(--text-sec)]">
          <button
            onClick={() => onTeamClick?.(byeTeamObj.id)}
            className="w-5 h-5 rounded flex items-center justify-center text-[8px] font-black text-white shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
            style={{ backgroundColor: byeTeamObj.primaryColor }}
          >
            {byeTeamObj.abbreviation}
          </button>
          <button onClick={() => onTeamClick?.(byeTeamObj.id)} className="hover:text-blue-600 transition-colors">
            {byeTeamObj.city} {byeTeamObj.name}
          </button>
          <Badge size="sm" variant="default">#1 Seed — Bye</Badge>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {/* Wild Card */}
        <div>
          <div className="text-[10px] font-medium text-[var(--text-sec)] mb-1.5 text-center uppercase tracking-wide">
            Wild Card
          </div>
          <div className="space-y-2">
            {wcMatchups.map(m => (
              <MatchupCard
                key={m.id}
                matchup={m}
                teams={teams}
                userTeamId={userTeamId}
                onTeamClick={onTeamClick}
                onGameClick={onGameClick}
              />
            ))}
          </div>
        </div>

        {/* Divisional */}
        <div className="flex flex-col justify-center">
          <div className="text-[10px] font-medium text-[var(--text-sec)] mb-1.5 text-center uppercase tracking-wide">
            Divisional
          </div>
          <div className="space-y-2">
            {divMatchups.map(m => (
              <MatchupCard
                key={m.id}
                matchup={m}
                teams={teams}
                userTeamId={userTeamId}
                onTeamClick={onTeamClick}
                onGameClick={onGameClick}
              />
            ))}
          </div>
        </div>

        {/* Conference Championship */}
        <div className="flex flex-col justify-center">
          <div className="text-[10px] font-medium text-[var(--text-sec)] mb-1.5 text-center uppercase tracking-wide">
            Championship
          </div>
          {confChamp && (
            <MatchupCard
              matchup={confChamp}
              teams={teams}
              userTeamId={userTeamId}
              onTeamClick={onTeamClick}
              onGameClick={onGameClick}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat line helper
// ---------------------------------------------------------------------------

type StatShape = { gamesPlayed: number; passYards: number; passTDs: number; interceptions: number; rushYards: number; rushTDs: number; receptions: number; receivingYards: number; receivingTDs: number; tackles: number; sacks: number; defensiveINTs: number; fieldGoalsMade: number; fieldGoalAttempts: number };

function posStatLine(p: { position: string; stats: StatShape }, overrideStats?: Partial<StatShape>): string {
  const s = overrideStats ? { ...p.stats, ...overrideStats } as StatShape : p.stats;
  if (!overrideStats && s.gamesPlayed === 0) return '';
  switch (p.position) {
    case 'QB': return `${s.passYards} YDS · ${s.passTDs} TD · ${s.interceptions} INT`;
    case 'RB': return `${s.rushYards} YDS · ${s.rushTDs} TD · ${s.receptions} REC`;
    case 'WR': case 'TE': return `${s.receptions} REC · ${s.receivingYards} YDS · ${s.receivingTDs} TD`;
    case 'OL': return `${s.gamesPlayed} GP`;
    case 'DL': case 'LB': return `${s.tackles} TKL · ${s.sacks.toFixed(1)} SCK · ${s.defensiveINTs} INT`;
    case 'CB': case 'S': return `${s.tackles} TKL · ${s.defensiveINTs} INT`;
    case 'K': return `${s.fieldGoalsMade}/${s.fieldGoalAttempts} FG`;
    case 'P': return `${s.gamesPlayed} GP`;
    default: return `${s.gamesPlayed} GP`;
  }
}

// ---------------------------------------------------------------------------
// User status helper
// ---------------------------------------------------------------------------

function getUserPlayoffStatus(
  bracket: PlayoffMatchup[],
  userTeamId: string,
  champions: { season: number; teamId: string }[],
  season: number,
): string {
  const isChampion = champions.some(
    c => c.season === season && c.teamId === userTeamId,
  );
  if (isChampion) return 'champion';

  const userMatchups = bracket
    .filter(m => m.homeTeamId === userTeamId || m.awayTeamId === userTeamId)
    .sort((a, b) => b.round - a.round);

  if (userMatchups.length === 0) return 'missed';

  const latest = userMatchups[0];
  if (!latest.winnerId) return 'active'; // still playing
  if (latest.winnerId !== userTeamId) return `eliminated-${latest.round}`;
  return `won-${latest.round}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PlayoffsPage() {
  const {
    phase,
    season,
    teams,
    players,
    schedule,
    playoffBracket,
    userTeamId,
    champions,
    finalsMvpPlayerId,
    advanceToResigning,
    simNextPlayoffGame,
    simPlayoffRound,
    simAllPlayoffGames,
  } = useGameStore();
  const router = useRouter();
  const [viewTeamId, setViewTeamId] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<GameResult | null>(null);

  const handleGameClick = (matchupId: string) => {
    const game = schedule.find(g => g.id === matchupId);
    if (game) setSelectedGame(game);
  };

  // Show bracket if it exists (persists through resigning/draft/FA until new season)
  // Only show "not started" message if there's no bracket at all
  if (phase !== 'playoffs' && !playoffBracket) {
    return (
      <GameShell>
        <div className="max-w-4xl mx-auto text-center py-20">
          <h2 className="text-2xl font-black mb-4">Playoffs</h2>
          <p className="text-[var(--text-sec)]">
            The playoffs haven&apos;t started yet. Finish the regular season first.
          </p>
        </div>
      </GameShell>
    );
  }

  if (!playoffBracket) {
    return (
      <GameShell>
        <div className="max-w-4xl mx-auto text-center py-20">
          <p className="text-[var(--text-sec)]">Loading bracket…</p>
        </div>
      </GameShell>
    );
  }

  const superBowl = playoffBracket.find(m => m.id === 'super-bowl')!;
  const sbDone = !!superBowl?.winnerId;
  const champion = sbDone ? teams.find(t => t.id === superBowl.winnerId) : null;
  const userIsChampion = champion?.id === userTeamId;

  const userTeam = teams.find(t => t.id === userTeamId);
  const status = getUserPlayoffStatus(playoffBracket, userTeamId, champions, season);

  const nextGame = playoffBracket
    .filter(m => !m.winnerId && m.homeTeamId && m.awayTeamId)
    .sort((a, b) => a.round - b.round)[0];

  const nextGameLabel = nextGame
    ? `${ROUND_LABELS[nextGame.round]} — ${nextGame.conference}`
    : null;

  return (
    <GameShell>
      <div className="max-w-7xl mx-auto space-y-5">
        {/* ---- Header ---- */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black">Season {season} Playoffs</h2>
            <p className="text-sm text-[var(--text-sec)] mt-0.5">
              {sbDone
                ? `${champion?.city} ${champion?.name} are Season ${season} Champions`
                : nextGameLabel
                  ? `Up next: ${nextGameLabel}`
                  : 'All games complete'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {phase === 'playoffs' && !sbDone && (
              <>
                <Button
                  onClick={simNextPlayoffGame}
                  size="sm"
                  disabled={!nextGame}
                >
                  Sim Next Game
                </Button>
                <Button
                  onClick={simPlayoffRound}
                  size="sm"
                  variant="secondary"
                  disabled={!nextGame}
                >
                  Sim Round
                </Button>
                <Button
                  onClick={simAllPlayoffGames}
                  size="sm"
                  variant="secondary"
                  disabled={!nextGame}
                >
                  Sim All
                </Button>
              </>
            )}
            {sbDone && (
              <Button
                onClick={() => {
                  const store = useGameStore.getState();
                  if (store.phase !== 'resigning') {
                    store.advanceToResigning();
                  }
                  router.push('/re-sign');
                }}
                size="sm"
                variant="primary"
              >
                Advance to Re-signing →
              </Button>
            )}
          </div>
        </div>

        {/* ---- Champion Banner ---- */}
        {sbDone && champion && (
          <div
            className="rounded-2xl px-8 py-10 text-center text-white relative overflow-hidden"
            style={{ backgroundColor: champion.primaryColor }}
          >
            <div className="text-5xl mb-2">🏆</div>
            <div className="text-3xl font-black mb-1">
              {champion.city} {champion.name}
            </div>
            <div className="text-base font-semibold opacity-80">
              Season {season} Champions
            </div>
            {superBowl.homeScore !== null && superBowl.awayScore !== null && (
              <div className="mt-2 text-sm opacity-70">
                Super Bowl:{' '}
                {teams.find(t => t.id === superBowl.homeTeamId)?.abbreviation}{' '}
                {superBowl.homeScore} –{' '}
                {teams.find(t => t.id === superBowl.awayTeamId)?.abbreviation}{' '}
                {superBowl.awayScore}
              </div>
            )}
            {userIsChampion && (
              <div className="mt-4 text-xl font-bold">
                🎉 Congratulations — you won the Super Bowl!
              </div>
            )}
          </div>
        )}

        {/* ---- Season Awards ---- */}
        {sbDone && (() => {
          const activePlayers = players.filter(p => !p.retired && p.teamId);
          const withGames = (pos: string[]) =>
            activePlayers.filter(p => pos.includes(p.position) && p.stats.gamesPlayed >= 10);

          const awards: { award: string; icon: string; player: typeof activePlayers[0] | undefined; gameStats?: Partial<StatShape> }[] = [];

          // Super Bowl MVP — show SB game stats, not season stats
          const sbMvp = finalsMvpPlayerId ? players.find(p => p.id === finalsMvpPlayerId) : null;
          const sbGame = schedule.find(g => g.id === 'super-bowl' && g.played);
          const sbMvpGameStats = sbMvp && sbGame ? sbGame.playerStats[sbMvp.id] : undefined;
          if (sbMvp) awards.push({ award: 'Super Bowl MVP', icon: '🏆', player: sbMvp, gameStats: sbMvpGameStats as Partial<StatShape> | undefined });

          // MVP — heavily favor QBs (real NFL MVP is almost always a QB)
          const mvpCandidates = withGames(['QB', 'RB', 'WR', 'TE']);
          if (mvpCandidates.length > 0) {
            const mvp = mvpCandidates.sort((a, b) => {
              // QBs get a massive boost: pass yards + TDs weighted heavily
              const aScore = a.position === 'QB'
                ? a.stats.passYards * 0.04 + a.stats.passTDs * 6 - a.stats.interceptions * 4 + a.ratings.overall * 2
                : a.position === 'RB'
                  ? a.stats.rushYards * 0.06 + a.stats.rushTDs * 6 + a.ratings.overall
                  : a.stats.receivingYards * 0.06 + a.stats.receivingTDs * 6 + a.ratings.overall;
              const bScore = b.position === 'QB'
                ? b.stats.passYards * 0.04 + b.stats.passTDs * 6 - b.stats.interceptions * 4 + b.ratings.overall * 2
                : b.position === 'RB'
                  ? b.stats.rushYards * 0.06 + b.stats.rushTDs * 6 + b.ratings.overall
                  : b.stats.receivingYards * 0.06 + b.stats.receivingTDs * 6 + b.ratings.overall;
              return bScore - aScore;
            })[0];
            awards.push({ award: 'Most Valuable Player', icon: '⭐', player: mvp });
          }

          // DPOY
          const defPlayers = withGames(['DL', 'LB', 'CB', 'S']);
          if (defPlayers.length > 0) {
            const dpoy = defPlayers.sort((a, b) =>
              (b.stats.tackles + b.stats.sacks * 5 + b.stats.defensiveINTs * 4) -
              (a.stats.tackles + a.stats.sacks * 5 + a.stats.defensiveINTs * 4)
            )[0];
            awards.push({ award: 'Defensive Player of the Year', icon: '🛡️', player: dpoy });
          }

          // OPOY
          const opoyPlayers = withGames(['QB', 'RB', 'WR', 'TE']);
          if (opoyPlayers.length > 0) {
            const opoy = opoyPlayers.sort((a, b) => {
              const aYds = a.stats.passYards + a.stats.rushYards + a.stats.receivingYards;
              const bYds = b.stats.passYards + b.stats.rushYards + b.stats.receivingYards;
              return bYds - aYds;
            })[0];
            awards.push({ award: 'Offensive Player of the Year', icon: '🏈', player: opoy });
          }

          // OROY / DROY
          const rookies = activePlayers.filter(p => p.experience === 1 && p.stats.gamesPlayed >= 10);
          const offRookies = rookies.filter(p => ['QB', 'RB', 'WR', 'TE', 'OL'].includes(p.position));
          if (offRookies.length > 0) {
            const oroy = offRookies.sort((a, b) => b.ratings.overall - a.ratings.overall)[0];
            awards.push({ award: 'Offensive Rookie of the Year', icon: '🌟', player: oroy });
          }
          const defRookies = rookies.filter(p => ['DL', 'LB', 'CB', 'S'].includes(p.position));
          if (defRookies.length > 0) {
            const droy = defRookies.sort((a, b) => b.ratings.overall - a.ratings.overall)[0];
            awards.push({ award: 'Defensive Rookie of the Year', icon: '🌟', player: droy });
          }

          // Pro Bowl — expanded: multiple players per position, more positions
          // Real NFL Pro Bowl: 2 QBs, 2 RBs, 4 WRs, 2 TEs, 3 OL, 2 DEs, 2 DTs, 3 LBs, 2 CBs, 2 S, K, P per conference
          const proBowlers: { conf: string; player: typeof activePlayers[0]; pos: string }[] = [];
          const proBowlSlots: { pos: string; positions: string[]; count: number; sortFn: (a: typeof activePlayers[0], b: typeof activePlayers[0]) => number }[] = [
            { pos: 'QB', positions: ['QB'], count: 2, sortFn: (a, b) => b.stats.passYards - a.stats.passYards },
            { pos: 'RB', positions: ['RB'], count: 2, sortFn: (a, b) => b.stats.rushYards - a.stats.rushYards },
            { pos: 'WR', positions: ['WR'], count: 4, sortFn: (a, b) => b.stats.receivingYards - a.stats.receivingYards },
            { pos: 'TE', positions: ['TE'], count: 2, sortFn: (a, b) => b.stats.receivingYards - a.stats.receivingYards },
            { pos: 'OL', positions: ['OL'], count: 3, sortFn: (a, b) => b.ratings.overall - a.ratings.overall },
            { pos: 'DL', positions: ['DL'], count: 4, sortFn: (a, b) => b.stats.sacks - a.stats.sacks },
            { pos: 'LB', positions: ['LB'], count: 3, sortFn: (a, b) => b.stats.tackles - a.stats.tackles },
            { pos: 'CB', positions: ['CB'], count: 2, sortFn: (a, b) => b.stats.defensiveINTs - a.stats.defensiveINTs },
            { pos: 'S', positions: ['S'], count: 2, sortFn: (a, b) => (b.stats.tackles + b.stats.defensiveINTs * 3) - (a.stats.tackles + a.stats.defensiveINTs * 3) },
            { pos: 'K', positions: ['K'], count: 1, sortFn: (a, b) => b.ratings.overall - a.ratings.overall },
            { pos: 'P', positions: ['P'], count: 1, sortFn: (a, b) => b.ratings.overall - a.ratings.overall },
          ];

          for (const conf of ['AFC', 'NFC'] as const) {
            const confTeamIds = new Set(teams.filter(t => t.conference === conf).map(t => t.id));
            const confPlayers = activePlayers.filter(p => confTeamIds.has(p.teamId!));
            for (const slot of proBowlSlots) {
              const eligible = confPlayers
                .filter(p => slot.positions.includes(p.position))
                .sort(slot.sortFn);
              for (let i = 0; i < slot.count && i < eligible.length; i++) {
                proBowlers.push({ conf, player: eligible[i], pos: slot.pos });
              }
            }
          }

          // Retired players (age 35+ or low OVR older players flagged as retiring)
          const retiredThisSeason = players.filter(p => p.retired && p.experience >= 5);
          // Show notable retirees (top OVR or long careers)
          const notableRetirees = retiredThisSeason
            .sort((a, b) => b.ratings.overall - a.ratings.overall)
            .slice(0, 10);

          return (
            <>
            <Card>
              <CardHeader><CardTitle>Season {season} Awards</CardTitle></CardHeader>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {awards.map(a => {
                  if (!a.player) return null;
                  const t = teams.find(t => t.id === a.player!.teamId);
                  const isUserPlayer = a.player.teamId === userTeamId;
                  return (
                    <div key={a.award} className={`flex items-center gap-3 rounded-lg px-2 py-1.5 ${isUserPlayer ? 'bg-blue-500/10 ring-1 ring-blue-500/30' : ''}`}>
                      <span className="text-xl">{a.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-[var(--text-sec)]">{a.award}</div>
                        <button
                          onClick={() => setSelectedPlayerId(a.player!.id)}
                          className={`font-semibold text-sm hover:text-blue-600 transition-colors truncate block ${isUserPlayer ? 'text-blue-600' : ''}`}
                        >
                          {a.player.firstName} {a.player.lastName}
                        </button>
                        <div className="text-[10px] text-[var(--text-sec)] mt-0.5">
                          {a.gameStats ? `SB: ${posStatLine(a.player, a.gameStats)}` : posStatLine(a.player)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {t && (
                          <div
                            className="w-5 h-5 rounded flex items-center justify-center text-[8px] font-black text-white"
                            style={{ backgroundColor: t.primaryColor }}
                          >
                            {t.abbreviation}
                          </div>
                        )}
                        <span className="text-xs text-[var(--text-sec)]">{a.player.position}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pro Bowl selections */}
              <div className="mt-4 pt-3 border-t border-[var(--border)]">
                <div className="text-xs font-bold text-[var(--text-sec)] uppercase mb-2">Pro Bowl Selections</div>
                <div className="grid grid-cols-2 gap-4">
                  {(['AFC', 'NFC'] as const).map(conf => (
                    <div key={conf}>
                      <div className={`text-xs font-bold mb-1.5 ${conf === 'AFC' ? 'text-red-600' : 'text-blue-600'}`}>
                        {conf}
                      </div>
                      <div className="space-y-1">
                        {proBowlers.filter(pb => pb.conf === conf).map((pb, idx) => {
                          const t = teams.find(t => t.id === pb.player.teamId);
                          const isUserPlayer = pb.player.teamId === userTeamId;
                          return (
                            <div key={`${pb.conf}-${pb.pos}-${idx}`} className={`flex items-center justify-between text-xs rounded px-1 py-0.5 ${isUserPlayer ? 'bg-blue-500/10 font-semibold' : ''}`}>
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Badge size="sm">{pb.pos}</Badge>
                                <button
                                  onClick={() => setSelectedPlayerId(pb.player.id)}
                                  className={`hover:text-blue-600 transition-colors shrink-0 ${isUserPlayer ? 'text-blue-600' : ''}`}
                                >
                                  {pb.player.firstName[0]}. {pb.player.lastName}
                                </button>
                                {isUserPlayer && <span className="text-[9px] text-blue-600 font-bold shrink-0">★</span>}
                                <span className="text-[10px] text-[var(--text-sec)] truncate">{posStatLine(pb.player)}</span>
                              </div>
                              <span className="text-[var(--text-sec)] shrink-0 ml-1">{t?.abbreviation}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Notable Retirements */}
            {notableRetirees.length > 0 && (
              <Card>
                <CardHeader><CardTitle>Notable Retirements</CardTitle></CardHeader>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  {notableRetirees.map(p => {
                    const t = teams.find(t => t.id === p.teamId);
                    return (
                      <div key={p.id} className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <button
                            onClick={() => setSelectedPlayerId(p.id)}
                            className="font-semibold text-sm hover:text-blue-600 transition-colors truncate block"
                          >
                            {p.firstName} {p.lastName}
                          </button>
                          <div className="text-xs text-[var(--text-sec)]">
                            {p.position} · Age {p.age} · {p.experience} seasons · OVR {p.ratings.overall}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {t && (
                            <div
                              className="w-5 h-5 rounded flex items-center justify-center text-[8px] font-black text-white"
                              style={{ backgroundColor: t.primaryColor }}
                            >
                              {t.abbreviation}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
            </>
          );
        })()}

        {/* ---- Your team status ---- */}
        {userTeam && (
          <Card>
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white shrink-0"
                style={{ backgroundColor: userTeam.primaryColor }}
              >
                {userTeam.abbreviation}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm">
                  {userTeam.city} {userTeam.name}
                </div>
                <div className="text-xs text-[var(--text-sec)]">
                  {userTeam.record.wins}–{userTeam.record.losses} Regular Season
                </div>
              </div>
              <div className="shrink-0">
                {status === 'champion' && (
                  <Badge variant="green">🏆 Champions</Badge>
                )}
                {status === 'missed' && (
                  <Badge variant="default">Missed Playoffs</Badge>
                )}
                {status === 'active' && (
                  <Badge variant="blue">In the Playoffs</Badge>
                )}
                {status === 'eliminated-1' && (
                  <Badge variant="red">Eliminated — Wild Card</Badge>
                )}
                {status === 'eliminated-2' && (
                  <Badge variant="red">Eliminated — Divisional</Badge>
                )}
                {status === 'eliminated-3' && (
                  <Badge variant="red">Eliminated — Conference Championship</Badge>
                )}
                {status === 'eliminated-4' && (
                  <Badge variant="red">Super Bowl Runner-Up</Badge>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* ---- Conference Brackets ---- */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card>
            <ConferenceBracket
              conference="AFC"
              bracket={playoffBracket}
              teams={teams}
              userTeamId={userTeamId}
              onTeamClick={(id) => setViewTeamId(id)}
              onGameClick={handleGameClick}
            />
          </Card>
          <Card>
            <ConferenceBracket
              conference="NFC"
              bracket={playoffBracket}
              teams={teams}
              userTeamId={userTeamId}
              onTeamClick={(id) => setViewTeamId(id)}
              onGameClick={handleGameClick}
            />
          </Card>
        </div>

        {/* ---- Super Bowl ---- */}
        <Card>
          <CardHeader>
            <CardTitle>🏆 Super Bowl</CardTitle>
          </CardHeader>
          <div className="max-w-xs mx-auto">
            <MatchupCard
              matchup={superBowl}
              teams={teams}
              userTeamId={userTeamId}
              onTeamClick={(id) => setViewTeamId(id)}
              onGameClick={handleGameClick}
            />
          </div>
        </Card>
      </div>
      <TeamRosterModal teamId={viewTeamId} onClose={() => setViewTeamId(null)} onPlayerClick={(id) => setSelectedPlayerId(id)} />
      <PlayerModal playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />
      <BoxScoreModal
        game={selectedGame}
        onClose={() => setSelectedGame(null)}
        onPlayerClick={(id) => {
          setSelectedGame(null);
          setSelectedPlayerId(id);
        }}
      />
    </GameShell>
  );
}
