'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore, computeAllLeagueTeams } from '@/lib/engine/store';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { TeamRosterModal } from '@/components/game/TeamRosterModal';
import { PlayerModal } from '@/components/game/PlayerModal';
import { BoxScoreModal } from '@/components/game/BoxScoreModal';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { formatRecord, type PlayoffMatchup, type Team, type GameResult } from '@/types';
import { EmptyState } from '@/components/ui/EmptyState';

const ROUND_LABELS: Record<number, string> = {
  1: 'Wild Card',
  2: 'Divisional',
  3: 'Conference',
  4: 'The Championship',
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
            className="shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
          >
            {team ? <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} logoUrl={team.logoUrl} size="xs" /> : <div className="w-5 h-5 rounded bg-gray-400" />}
          </button>
          <button onClick={() => team && onTeamClick?.(team.id)} className={`text-xs truncate hover:text-blue-600 transition-colors ${isUser ? 'text-blue-600' : ''}`}>
            {team ? team.abbreviation : '?'}
          </button>
          {team && (
            <span className="text-[9px] text-[var(--text-sec)] shrink-0 font-mono">
              ({formatRecord(team.record)})
            </span>
          )}
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
  onWatchLive,
}: {
  matchup: PlayoffMatchup;
  teams: Team[];
  userTeamId: string;
  onTeamClick?: (teamId: string) => void;
  onGameClick?: (matchupId: string) => void;
  onWatchLive?: (matchupId: string) => void;
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
  const isReady = !!matchup.homeTeamId && !!matchup.awayTeamId && !isCompleted;

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
      {isReady && userInGame && onWatchLive && (
        <button
          onClick={(e) => { e.stopPropagation(); onWatchLive(matchup.id); }}
          className="w-full mt-0.5 mb-1 text-[10px] font-bold uppercase tracking-wide text-green-700 bg-green-100 hover:bg-green-200 rounded px-2 py-0.5 transition-colors cursor-pointer"
        >
          Watch Live
        </button>
      )}
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
  onWatchLive,
}: {
  conference: 'AC' | 'NC';
  bracket: PlayoffMatchup[];
  teams: Team[];
  userTeamId: string;
  onTeamClick?: (teamId: string) => void;
  onGameClick?: (matchupId: string) => void;
  onWatchLive?: (matchupId: string) => void;
}) {
  const confMatchups = bracket.filter(m => m.conference === conference);
  const color = conference === 'AC' ? 'text-red-600' : 'text-blue-600';

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
            className="shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
          >
            <TeamLogo abbreviation={byeTeamObj.abbreviation} primaryColor={byeTeamObj.primaryColor} secondaryColor={byeTeamObj.secondaryColor} logoUrl={byeTeamObj.logoUrl} size="xs" />
          </button>
          <button onClick={() => onTeamClick?.(byeTeamObj.id)} className="hover:text-blue-600 transition-colors">
            {byeTeamObj.city} {byeTeamObj.name}
          </button>
          <span className="font-mono text-[10px] hidden sm:inline">({formatRecord(byeTeamObj.record)})</span>
          <Badge size="sm" variant="default">#1 Seed — Bye</Badge>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-2 sm:grid sm:grid-cols-3 sm:overflow-visible">
        {/* Wild Card */}
        <div className="min-w-[180px] sm:min-w-0 flex-shrink-0 sm:flex-shrink">
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
                onWatchLive={onWatchLive}
              />
            ))}
          </div>
        </div>

        {/* Divisional */}
        <div className="min-w-[180px] sm:min-w-0 flex-shrink-0 sm:flex-shrink flex flex-col justify-center">
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
                onWatchLive={onWatchLive}
              />
            ))}
          </div>
        </div>

        {/* Conference Championship */}
        <div className="min-w-[180px] sm:min-w-0 flex-shrink-0 sm:flex-shrink flex flex-col justify-center">
          <div className="text-[10px] font-medium text-[var(--text-sec)] mb-1.5 text-center uppercase tracking-wide">
            Conference
          </div>
          {confChamp && (
            <MatchupCard
              matchup={confChamp}
              teams={teams}
              userTeamId={userTeamId}
              onTeamClick={onTeamClick}
              onGameClick={onGameClick}
              onWatchLive={onWatchLive}
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

type StatShape = { gamesPlayed: number; passYards: number; passTDs: number; interceptions: number; rushYards: number; rushTDs: number; receptions: number; receivingYards: number; receivingTDs: number; tackles: number; sacks: number; defensiveINTs: number; fieldGoalsMade: number; fieldGoalAttempts: number; sacksAllowed: number; passBlocks: number };

const ZERO_STATS: StatShape = { gamesPlayed: 0, passYards: 0, passTDs: 0, interceptions: 0, rushYards: 0, rushTDs: 0, receptions: 0, receivingYards: 0, receivingTDs: 0, tackles: 0, sacks: 0, defensiveINTs: 0, fieldGoalsMade: 0, fieldGoalAttempts: 0, sacksAllowed: 0, passBlocks: 0 };

function posStatLine(p: { position: string; stats: StatShape }, overrideStats?: Partial<StatShape>): string {
  const s = overrideStats ? { ...ZERO_STATS, ...overrideStats } as StatShape : p.stats;
  if (!overrideStats && s.gamesPlayed === 0) return '';
  switch (p.position) {
    case 'QB': return `${s.passYards} YDS · ${s.passTDs} TD · ${s.interceptions} INT`;
    case 'RB': return `${s.rushYards} YDS · ${s.rushTDs} TD${s.receivingTDs > 0 ? ` · ${s.receivingTDs} REC TD` : ''}`;
    case 'WR': case 'TE': return `${s.receptions} REC · ${s.receivingYards} YDS · ${s.receivingTDs} TD`;
    case 'OL': return `${s.gamesPlayed} GP · ${s.sacksAllowed ?? 0} SA · ${(s.passBlocks ?? 0) > 0 ? ((s.sacksAllowed ?? 0) / s.passBlocks * 100).toFixed(1) : '0.0'}%`;
    case 'DL': case 'LB': return `${s.tackles} TKL · ${s.sacks.toFixed(1)} SCK · ${s.defensiveINTs} INT`;
    case 'CB': case 'S': return `${s.tackles} TKL · ${s.defensiveINTs} INT`;
    case 'K': return `${s.fieldGoalsMade}/${s.fieldGoalAttempts} FG${s.fieldGoalAttempts > 0 ? ` (${Math.round(s.fieldGoalsMade / s.fieldGoalAttempts * 100)}%)` : ''}`;
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
// Retirement quote helper
// ---------------------------------------------------------------------------

function retirementQuote(name: string, age: number, _position: string): string {
  if (age <= 28) {
    const young = [
      `"My body just can't take it anymore. I've had a good run but my health has to come first." — ${name}`,
      `"I've accomplished what I wanted in this league. Time to move on to the next chapter." — ${name}`,
      `"The injuries have taken their toll. I want to walk away while I still can." — ${name}`,
      `"Football gave me everything, but I've lost the passion. Better to step away now than go through the motions." — ${name}`,
    ];
    return young[name.length % young.length];
  }
  if (age >= 36) {
    const veteran = [
      `"What a ride. I gave this game everything I had, and it gave me more than I ever dreamed." — ${name}`,
      `"${age - 21} years in this league. I'm walking away on my own terms, and that's all you can ask for." — ${name}`,
      `"I've been blessed to play this game as long as I have. Time to be a full-time dad." — ${name}`,
      `"My body's telling me it's time. I leave with no regrets." — ${name}`,
      `"I'll miss the locker room more than anything. The guys, the competition — that's what I'll remember." — ${name}`,
    ];
    return veteran[name.length % veteran.length];
  }
  const mid = [
    `"I've thought about this for a while. It's the right time for me and my family." — ${name}`,
    `"I still love the game, but my body is telling me something different every morning." — ${name}`,
    `"I want to go out while I can still walk without a limp. No regrets." — ${name}`,
    `"The game has changed, and I've given it my best. Time to see what's next." — ${name}`,
  ];
  return mid[name.length % mid.length];
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PlayoffsPage() {
  const router = useRouter();
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
    allStarGame,
    simAllStarGame,
    seasonHistory,
  } = useGameStore();
  const [viewTeamId, setViewTeamId] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<GameResult | null>(null);

  const handleGameClick = (matchupId: string) => {
    const game = schedule.find(g => g.id === matchupId);
    if (game) setSelectedGame(game);
  };

  const handleWatchLive = (matchupId: string) => {
    router.push(`/game/${matchupId}`);
  };

  // Show bracket if it exists (persists through resigning/draft/FA until new season)
  // Only show "not started" message if there's no bracket at all
  if (phase !== 'playoffs' && !playoffBracket) {
    return (
      <GameShell>
        <EmptyState
          icon="🏆"
          title="Playoffs"
          description="The playoffs haven't started yet. Finish the regular season first."
        />
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

  const superBowl = playoffBracket.find(m => m.id === 'championship')!;
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

        </div>

        {/* ---- Champion Banner ---- */}
        {sbDone && champion && (() => {
          // Use secondary color if primary is too light (e.g. white)
          const isLightColor = (hex: string) => {
            const c = hex.replace('#', '');
            const r = parseInt(c.substring(0, 2), 16);
            const g = parseInt(c.substring(2, 4), 16);
            const b = parseInt(c.substring(4, 6), 16);
            return (r * 299 + g * 587 + b * 114) / 1000 > 180;
          };
          const bgColor = isLightColor(champion.primaryColor) ? (champion.secondaryColor ?? '#1E3A8A') : champion.primaryColor;
          const textClass = isLightColor(bgColor) ? 'text-gray-900' : 'text-white';
          return (
          <div
            className={`rounded-2xl px-8 py-10 text-center ${textClass} relative overflow-hidden`}
            style={{ backgroundColor: bgColor }}
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
                The Championship:{' '}
                {teams.find(t => t.id === superBowl.homeTeamId)?.abbreviation}{' '}
                {superBowl.homeScore} –{' '}
                {teams.find(t => t.id === superBowl.awayTeamId)?.abbreviation}{' '}
                {superBowl.awayScore}
              </div>
            )}
            {userIsChampion && (
              <div className="mt-4 text-xl font-bold">
                🎉 Congratulations — you won The Championship!
              </div>
            )}
          </div>
          );
        })()}

        {/* ---- Season Awards ---- */}
        {sbDone && (() => {
          const activePlayers = players.filter(p => !p.retired && p.teamId);
          const withGames = (pos: string[]) =>
            activePlayers.filter(p => pos.includes(p.position) && p.stats.gamesPlayed >= 10);

          const awards: { award: string; icon: string; player: typeof activePlayers[0] | undefined; gameStats?: Partial<StatShape> }[] = [];

          // Championship MVP — show championship game stats, not season stats
          const sbMvp = finalsMvpPlayerId ? players.find(p => p.id === finalsMvpPlayerId) : null;
          const sbGame = schedule.find(g => g.id === 'championship' && g.played);
          const sbMvpGameStats = sbMvp && sbGame ? sbGame.playerStats[sbMvp.id] : undefined;
          if (sbMvp) awards.push({ award: 'Championship MVP', icon: '🏆', player: sbMvp, gameStats: sbMvpGameStats as Partial<StatShape> | undefined });

          // MVP — heavily favor QBs (MVP is almost always a QB)
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

          // All-Pro — use the same computation as the roster star badges
          const allLeague = computeAllLeagueTeams(useGameStore.getState() as never);
          const allProFirstTeam: { conf: string; player: typeof activePlayers[0]; pos: string }[] = [];
          const allProSecondTeam: { conf: string; player: typeof activePlayers[0]; pos: string }[] = [];
          for (const entry of allLeague.first) {
            const p = players.find(pl => pl.id === entry.playerId);
            if (!p) continue;
            const team = teams.find(t => t.id === p.teamId);
            allProFirstTeam.push({ conf: team?.conference ?? 'AC', player: p, pos: entry.position });
          }
          for (const entry of allLeague.second) {
            const p = players.find(pl => pl.id === entry.playerId);
            if (!p) continue;
            const team = teams.find(t => t.id === p.teamId);
            allProSecondTeam.push({ conf: team?.conference ?? 'AC', player: p, pos: entry.position });
          }
          const allProPlayers = allProFirstTeam;

          // Retired players who still have a team (retired this season, not prior seasons)
          // Players who retired in previous seasons have teamId: null and no current stats
          const retiredThisSeason = players.filter(p =>
            p.retired && (p.teamId !== null || p.stats.gamesPlayed > 0),
          );
          // Show notable retirees (top OVR or long careers)
          const notableRetirees = retiredThisSeason
            .filter(p => p.ratings.overall >= 75 || p.experience >= 10)
            .sort((a, b) => b.ratings.overall - a.ratings.overall)
            .slice(0, 10);

          return (
            <>
            <Card>
              <CardHeader><CardTitle>Season {season} Awards</CardTitle></CardHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                {awards.map(a => {
                  if (!a.player) return null;
                  const t = teams.find(t => t.id === a.player!.teamId);
                  const isUserPlayer = a.player.teamId === userTeamId;
                  return (
                    <div key={a.award} className={`flex items-center gap-3 rounded-lg px-2 py-1.5 ${isUserPlayer ? 'bg-blue-500/10 ring-1 ring-blue-500/30' : ''}`}>
                      <span className="text-xl shrink-0">{a.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-[var(--text-sec)]">{a.award}</div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setSelectedPlayerId(a.player!.id)}
                            className={`font-semibold text-sm hover:text-blue-600 transition-colors truncate ${isUserPlayer ? 'text-blue-600' : ''}`}
                          >
                            {a.player.firstName} {a.player.lastName}
                          </button>
                          {t && (
                            <span className="text-xs text-[var(--text-sec)] shrink-0">{t.abbreviation}</span>
                          )}
                          <span className="text-xs text-[var(--text-sec)] shrink-0">{a.player.position}</span>
                        </div>
                        <div className="text-[10px] text-[var(--text-sec)] mt-0.5">
                          {a.gameStats ? `SB: ${posStatLine(a.player, a.gameStats)}` : posStatLine(a.player)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* All-Pro selections — First Team */}
              <div className="mt-4 pt-3 border-t border-[var(--border)]">
                <div className="text-xs font-bold text-[var(--text-sec)] uppercase mb-2">All-Pro First Team</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(['AC', 'NC'] as const).map(conf => (
                    <div key={conf}>
                      <div className={`text-xs font-bold mb-1.5 ${conf === 'AC' ? 'text-red-600' : 'text-blue-600'}`}>
                        {conf}
                      </div>
                      <div className="space-y-1">
                        {allProFirstTeam.filter(pb => pb.conf === conf).map((pb, idx) => {
                          const t = teams.find(t => t.id === pb.player.teamId);
                          const isUserPlayer = pb.player.teamId === userTeamId;
                          return (
                            <div key={`1st-${pb.conf}-${pb.pos}-${idx}`} className={`flex items-center justify-between text-xs rounded px-1 py-0.5 ${isUserPlayer ? 'bg-blue-500/10 font-semibold' : ''}`}>
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

              {/* All-Pro Second Team */}
              {allProSecondTeam.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[var(--border)]">
                  <div className="text-xs font-bold text-[var(--text-sec)] uppercase mb-2">All-Pro Second Team</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {(['AC', 'NC'] as const).map(conf => (
                      <div key={conf}>
                        <div className={`text-xs font-bold mb-1.5 ${conf === 'AC' ? 'text-red-600' : 'text-blue-600'}`}>
                          {conf}
                        </div>
                        <div className="space-y-1">
                          {allProSecondTeam.filter(pb => pb.conf === conf).map((pb, idx) => {
                            const t = teams.find(t => t.id === pb.player.teamId);
                            const isUserPlayer = pb.player.teamId === userTeamId;
                            return (
                              <div key={`2nd-${pb.conf}-${pb.pos}-${idx}`} className={`flex items-center justify-between text-xs rounded px-1 py-0.5 ${isUserPlayer ? 'bg-blue-500/10 font-semibold' : ''}`}>
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
              )}
            </Card>

            {/* All-Rookie Team */}
            {(() => {
              const allRookieSlots: { pos: string; positions: string[]; count: number; sortFn: (a: typeof activePlayers[0], b: typeof activePlayers[0]) => number }[] = [
                { pos: 'QB', positions: ['QB'], count: 1, sortFn: (a, b) => (b.stats.passYards + b.stats.passTDs * 20) - (a.stats.passYards + a.stats.passTDs * 20) },
                { pos: 'RB', positions: ['RB'], count: 1, sortFn: (a, b) => (b.stats.rushYards + b.stats.rushTDs * 10) - (a.stats.rushYards + a.stats.rushTDs * 10) },
                { pos: 'WR', positions: ['WR'], count: 2, sortFn: (a, b) => b.stats.receivingYards - a.stats.receivingYards },
                { pos: 'TE', positions: ['TE'], count: 1, sortFn: (a, b) => b.stats.receivingYards - a.stats.receivingYards },
                { pos: 'OL', positions: ['OL'], count: 2, sortFn: (a, b) => b.ratings.overall - a.ratings.overall },
                { pos: 'DL', positions: ['DL'], count: 2, sortFn: (a, b) => (b.stats.sacks * 3 + b.stats.tackles) - (a.stats.sacks * 3 + a.stats.tackles) },
                { pos: 'LB', positions: ['LB'], count: 2, sortFn: (a, b) => b.stats.tackles - a.stats.tackles },
                { pos: 'CB', positions: ['CB'], count: 2, sortFn: (a, b) => (b.stats.defensiveINTs * 5 + b.stats.tackles) - (a.stats.defensiveINTs * 5 + a.stats.tackles) },
                { pos: 'S', positions: ['S'], count: 1, sortFn: (a, b) => (b.stats.tackles + b.stats.defensiveINTs * 3) - (a.stats.tackles + a.stats.defensiveINTs * 3) },
                { pos: 'K', positions: ['K'], count: 1, sortFn: (a, b) => b.ratings.overall - a.ratings.overall },
              ];
              const allRookiePlayers: { player: typeof activePlayers[0]; pos: string }[] = [];
              for (const slot of allRookieSlots) {
                const eligible = rookies
                  .filter(p => slot.positions.includes(p.position))
                  .sort(slot.sortFn);
                for (let i = 0; i < slot.count && i < eligible.length; i++) {
                  allRookiePlayers.push({ player: eligible[i], pos: slot.pos });
                }
              }
              if (allRookiePlayers.length === 0) return null;
              return (
                <Card>
                  <CardHeader><CardTitle>All-Rookie Team</CardTitle></CardHeader>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                    {allRookiePlayers.map((ar, idx) => {
                      const t = teams.find(t => t.id === ar.player.teamId);
                      const isUserPlayer = ar.player.teamId === userTeamId;
                      return (
                        <div key={`rookie-${ar.pos}-${idx}`} className={`flex items-center justify-between text-xs rounded px-1 py-1 ${isUserPlayer ? 'bg-blue-500/10 font-semibold' : ''}`}>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Badge size="sm">{ar.pos}</Badge>
                            <button
                              onClick={() => setSelectedPlayerId(ar.player.id)}
                              className={`hover:text-blue-600 transition-colors shrink-0 ${isUserPlayer ? 'text-blue-600' : ''}`}
                            >
                              {ar.player.firstName[0]}. {ar.player.lastName}
                            </button>
                            {isUserPlayer && <span className="text-[9px] text-blue-600 font-bold shrink-0">★</span>}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] text-[var(--text-sec)]">{posStatLine(ar.player)}</span>
                            <span className="text-[var(--text-sec)] ml-1">{t?.abbreviation}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })()}

            </>
          );
        })()}

        {/* ---- Your team status ---- */}
        {userTeam && (
          <Card>
            <div className="flex items-center gap-3">
              <TeamLogo abbreviation={userTeam.abbreviation} primaryColor={userTeam.primaryColor} secondaryColor={userTeam.secondaryColor} logoUrl={userTeam.logoUrl} size="lg" />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm">
                  {userTeam.city} {userTeam.name}
                </div>
                <div className="text-xs text-[var(--text-sec)]">
                  {formatRecord(userTeam.record)} Regular Season
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
                  <Badge variant="red">Championship Runner-Up</Badge>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* ---- Conference Brackets ---- */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card>
            <ConferenceBracket
              conference="AC"
              bracket={playoffBracket}
              teams={teams}
              userTeamId={userTeamId}
              onTeamClick={(id) => setViewTeamId(id)}
              onGameClick={handleGameClick}
              onWatchLive={phase === 'playoffs' ? handleWatchLive : undefined}
            />
          </Card>
          <Card>
            <ConferenceBracket
              conference="NC"
              bracket={playoffBracket}
              teams={teams}
              userTeamId={userTeamId}
              onTeamClick={(id) => setViewTeamId(id)}
              onGameClick={handleGameClick}
              onWatchLive={phase === 'playoffs' ? handleWatchLive : undefined}
            />
          </Card>
        </div>

        {/* ---- All-Star Game (Pro Bowl) ---- */}
        {(() => {
          const acConf = playoffBracket.find(m => m.id === 'ac-conf');
          const ncConf = playoffBracket.find(m => m.id === 'nc-conf');
          const confsDone = !!acConf?.winnerId && !!ncConf?.winnerId;
          if (!confsDone) return null;

          return (
            <Card>
              <CardHeader>
                <CardTitle>⭐ All-Pro Game</CardTitle>
              </CardHeader>
              {allStarGame?.played ? (
                <div className="text-center py-4">
                  <div className="text-lg font-black">
                    AC {allStarGame.acScore} — NC {allStarGame.ncScore}
                  </div>
                  {allStarGame.mvpPlayerId && (() => {
                    const mvp = players.find(p => p.id === allStarGame.mvpPlayerId);
                    if (!mvp) return null;
                    const mvpTeam = teams.find(t => t.id === mvp.teamId);
                    return (
                      <div className="text-sm text-[var(--text-sec)] mt-1">
                        All-Pro Game MVP: <span className="font-bold text-[var(--text)]">{mvp.firstName} {mvp.lastName}</span>
                        {mvpTeam && <span> ({mvpTeam.abbreviation})</span>}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-sm text-[var(--text-sec)] mb-3">
                    The best from each conference face off before The Championship.
                  </p>
                  <button
                    onClick={simAllStarGame}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-lg transition-colors"
                  >
                    Sim All-Pro Game
                  </button>
                </div>
              )}
            </Card>
          );
        })()}

        {/* ---- The Championship ---- */}
        <Card>
          <CardHeader>
            <CardTitle>🏆 The Championship</CardTitle>
          </CardHeader>
          <div className="max-w-xs mx-auto">
            <MatchupCard
              matchup={superBowl}
              teams={teams}
              userTeamId={userTeamId}
              onTeamClick={(id) => setViewTeamId(id)}
              onGameClick={handleGameClick}
              onWatchLive={phase === 'playoffs' ? (allStarGame?.played ? handleWatchLive : undefined) : undefined}
            />
          </div>
        </Card>
        {/* ---- Owner Message ---- */}
        {status !== 'active' && (() => {
          const userTeam = teams.find(t => t.id === userTeamId);
          if (!userTeam) return null;
          const record = userTeam.record;
          const wins = record.wins;
          const losses = record.losses;
          let tone: 'ecstatic' | 'pleased' | 'satisfied' | 'disappointed' | 'frustrated';
          let message: string;

          if (status === 'champion') {
            tone = 'ecstatic';
            message = `What a season! A championship in Season ${season} — that's what we hired you for. The city is buzzing, merchandise is flying off the shelves, and the parade route is already mapped out. You've earned every bit of this. Now let's do it again.`;
          } else if (status === 'eliminated-4' || status === 'won-3') {
            tone = 'pleased';
            message = `A ${wins}-${losses} season and a trip to The Championship — that's an incredible run. We came up short in the big game, but this team is clearly headed in the right direction. Make the right moves this offseason and we'll be back.`;
          } else if (status === 'eliminated-3' || status === 'won-2') {
            tone = 'satisfied';
            message = `${wins}-${losses} and a conference championship appearance. That's a strong season by any measure. But we're not building this thing to stop short of the title. Let's figure out what pieces we're missing and go get them.`;
          } else if (status === 'eliminated-2' || status === 'won-1') {
            tone = wins >= 10 ? 'satisfied' : 'disappointed';
            message = wins >= 10
              ? `A ${wins}-${losses} record and a divisional round exit. We had a good regular season but couldn't get it done when it mattered. I need you to evaluate what went wrong in that game and address it.`
              : `We squeezed into the playoffs at ${wins}-${losses} and bowed out in the divisional round. The fans expected more. I expect more. This offseason needs to be aggressive.`;
          } else if (status === 'missed') {
            tone = wins >= 8 ? 'disappointed' : 'frustrated';
            message = wins >= 8
              ? `${wins}-${losses} and no playoff berth. We were right there but couldn't close it out. I'm frustrated, but I still believe in the direction. Make the right moves this offseason.`
              : wins >= 5
              ? `${wins}-${losses}. Missing the playoffs is unacceptable for this franchise. The fans deserve better. You've got one more offseason to turn this around, or we'll need to have a harder conversation.`
              : `${wins}-${losses}. I don't need to tell you how bad that is. The fans are furious. I'm furious. We need a complete overhaul. If I don't see major changes this offseason, we're going in a different direction.`;
          } else {
            tone = wins >= 9 ? 'disappointed' : 'frustrated';
            message = wins >= 9
              ? `${wins}-${losses} and a first-round exit. That's not why we made the playoffs. I'm giving you another offseason to fix this, but I need to see real improvement in January next year.`
              : `A wild card berth at ${wins}-${losses} and a quick exit. The fans are restless and frankly so am I. You've got one more offseason to show me this roster is trending up. Don't waste it.`;
          }

          const toneColors = {
            ecstatic: 'border-green-500/30 bg-green-50',
            pleased: 'border-blue-500/30 bg-blue-50',
            satisfied: 'border-amber-500/30 bg-amber-50',
            disappointed: 'border-orange-500/30 bg-orange-50',
            frustrated: 'border-red-500/30 bg-red-50',
          };

          return (
            <Card className={`border-2 ${toneColors[tone]}`}>
              <CardHeader>
                <CardTitle>📋 Message from the Owner</CardTitle>
              </CardHeader>
              <div className="px-1 pb-1">
                <p className="text-sm text-[var(--text)] leading-relaxed italic">&ldquo;{message}&rdquo;</p>
                <p className="text-xs text-[var(--text-sec)] mt-2 text-right">— {userTeam.city} {userTeam.name} Ownership</p>
              </div>
            </Card>
          );
        })()}

        {/* Notable Retirements — after owner message, before team status */}
        {sbDone && (() => {
          const lastSummary = seasonHistory.length > 0 ? seasonHistory[seasonHistory.length - 1] : null;
          const retirees = lastSummary?.retiredPlayers ?? [];
          if (retirees.length === 0) return null;
          return (
            <Card>
              <CardHeader><CardTitle>Notable Retirements</CardTitle></CardHeader>
              <div className="space-y-3">
                {retirees.map((r, i) => {
                  const t = teams.find(t => t.id === r.teamId);
                  return (
                    <div key={i} className="border-t border-[var(--border)] pt-2 first:border-t-0 first:pt-0">
                      <div className="flex items-center gap-3 text-sm">
                        <Badge size="sm">{r.position}</Badge>
                        <button onClick={() => setSelectedPlayerId(r.playerId)} className="font-medium hover:text-blue-600 transition-colors">
                          {r.name}
                        </button>
                        {t && <span className="text-xs text-[var(--text-sec)]">{t.abbreviation}</span>}
                        <span className="text-xs text-[var(--text-sec)] ml-auto">Retired at age {r.age}</span>
                      </div>
                      <p className="text-xs italic text-[var(--text-sec)] mt-1 ml-8">
                        {retirementQuote(r.name, r.age, r.position)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })()}
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
