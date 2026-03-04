'use client';

import { useGameStore } from '@/lib/engine/store';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { PlayoffMatchup, Team } from '@/types';

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
}: {
  team: Team | undefined;
  seed: number | null;
  score: number | null;
  isWinner: boolean;
  isUser: boolean;
  isTBD: boolean;
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
          <div
            className="w-5 h-5 rounded flex items-center justify-center text-[8px] font-black text-white shrink-0"
            style={{ backgroundColor: team?.primaryColor ?? '#555' }}
          >
            {team?.abbreviation ?? '?'}
          </div>
          <span className={`text-xs truncate ${isUser ? 'text-blue-400' : ''}`}>
            {team ? `${team.city}` : 'Unknown'}
          </span>
          {isUser && (
            <span className="text-[9px] font-bold text-blue-400 shrink-0">YOU</span>
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
}: {
  matchup: PlayoffMatchup;
  teams: Team[];
  userTeamId: string;
}) {
  const homeTeam = matchup.homeTeamId
    ? teams.find(t => t.id === matchup.homeTeamId)
    : undefined;
  const awayTeam = matchup.awayTeamId
    ? teams.find(t => t.id === matchup.awayTeamId)
    : undefined;
  const userInGame =
    matchup.homeTeamId === userTeamId || matchup.awayTeamId === userTeamId;

  return (
    <div
      className={`rounded-lg border bg-[var(--surface)] px-2 py-0.5 ${
        userInGame
          ? 'border-blue-500/60 shadow shadow-blue-500/10'
          : 'border-[var(--border)]'
      }`}
    >
      <TeamRow
        team={homeTeam}
        seed={matchup.homeSeed}
        score={matchup.homeScore}
        isWinner={matchup.winnerId === matchup.homeTeamId}
        isUser={matchup.homeTeamId === userTeamId}
        isTBD={!matchup.homeTeamId}
      />
      <div className="border-t border-[var(--border)]" />
      <TeamRow
        team={awayTeam}
        seed={matchup.awaySeed}
        score={matchup.awayScore}
        isWinner={matchup.winnerId === matchup.awayTeamId}
        isUser={matchup.awayTeamId === userTeamId}
        isTBD={!matchup.awayTeamId}
      />
    </div>
  );
}

function ConferenceBracket({
  conference,
  bracket,
  teams,
  userTeamId,
}: {
  conference: 'AFC' | 'NFC';
  bracket: PlayoffMatchup[];
  teams: Team[];
  userTeamId: string;
}) {
  const confMatchups = bracket.filter(m => m.conference === conference);
  const color = conference === 'AFC' ? 'text-red-400' : 'text-blue-400';

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
          <div
            className="w-5 h-5 rounded flex items-center justify-center text-[8px] font-black text-white shrink-0"
            style={{ backgroundColor: byeTeamObj.primaryColor }}
          >
            {byeTeamObj.abbreviation}
          </div>
          <span>
            {byeTeamObj.city} {byeTeamObj.name}
          </span>
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
            />
          )}
        </div>
      </div>
    </div>
  );
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
    playoffBracket,
    userTeamId,
    champions,
    advanceToDraft,
  } = useGameStore();

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

          {sbDone && (
            <Button
              onClick={advanceToDraft}
              size="sm"
              variant="primary"
            >
              Advance to Draft →
            </Button>
          )}
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
            />
          </Card>
          <Card>
            <ConferenceBracket
              conference="NFC"
              bracket={playoffBracket}
              teams={teams}
              userTeamId={userTeamId}
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
            />
          </div>
        </Card>
      </div>
    </GameShell>
  );
}
