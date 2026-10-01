'use client';

import { useMemo } from 'react';
import { useGameStore } from '@/lib/engine/store';
import { computeAwardRaces } from '@/lib/engine/awards';
import { GameShell } from '@/components/game/GameShell';
import { SpectatorBanner } from '@/components/game/SpectatorBanner';
import { AwardRaceCard } from '@/components/awards/AwardRaceCard';
import { RankingsTabs } from '@/components/awards/RankingsTabs';

export default function AwardsPage() {
  const { teams, players, season, week, phase, schedule, seasonHistory } = useGameStore();
  const races = useMemo(
    () => computeAwardRaces({ teams, players, season, week, phase, schedule } as never),
    [teams, players, season, week, phase, schedule],
  );

  // Empty-state: before any games are played, show the gated message instead
  // of six empty grids. Use schedule-completed as the proxy ("Week 1 games
  // complete" → some games have played === true).
  const anyGamesPlayed = schedule.some(g => g.played);
  // Award winners are decided when the regular season ends. Past then,
  // surface the crown on the leader of each card.
  const isPostRegularSeason = phase === 'playoffs' || phase === 'resigning' || phase === 'draft' || phase === 'freeAgency' || phase === 'offseason';

  // Official season awards are frozen at the end of the regular season and
  // stored in seasonHistory (same source the /history tab reads). The live
  // award-race leaderboard keeps moving as playoff stats come in, so its #1
  // can diverge from the official winner. Once the season is decided, crown
  // the official winner on each card so /awards agrees with /history.
  const officialWinners = useMemo(() => {
    const map = new Map<string, string>();
    if (!isPostRegularSeason) return map;
    const summary = seasonHistory.find(s => s.season === season);
    summary?.awards.forEach(a => map.set(a.award, a.playerId));
    return map;
  }, [isPostRegularSeason, seasonHistory, season]);

  return (
    <GameShell>
      <div className="max-w-6xl mx-auto">
        <SpectatorBanner />
        <RankingsTabs />
        <div className="mb-5">
          <h2 className="text-2xl font-black font-display uppercase tracking-tight">Award Race</h2>
          <p className="text-xs text-[var(--text-sec)] mt-1">
            Season {season} · Week {week} · Live ranking; leader updates after every week.
            {isPostRegularSeason && ' Season-end winners marked with 🏆.'}
          </p>
        </div>
        {!anyGamesPlayed ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center">
            <div className="text-3xl mb-3">🏆</div>
            <h3 className="text-lg font-black mb-1">Award races begin once Week 1 games complete</h3>
            <p className="text-sm text-[var(--text-sec)] max-w-md mx-auto">
              Sim or watch your first week and the rankings will populate here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AwardRaceCard emoji="🏆" title="MVP" subtitle="Most Valuable Player"
              entries={races.mvp} teams={teams} players={players} showWinnerCrown={isPostRegularSeason}
              officialWinnerId={officialWinners.get('MVP')} />
            <AwardRaceCard emoji="🎩" title="Coach of the Year" subtitle="Head Coach award"
              entries={races.coachOfTheYear} teams={teams} players={players} showWinnerCrown={isPostRegularSeason} />
            <AwardRaceCard emoji="🏅" title="Offensive Player of the Year" subtitle="Top non-QB skill player"
              entries={races.opoy} teams={teams} players={players} showWinnerCrown={isPostRegularSeason}
              officialWinnerId={officialWinners.get('Offensive POY')} />
            <AwardRaceCard emoji="🛡️" title="Defensive Player of the Year" subtitle="Defensive playmakers"
              entries={races.dpoy} teams={teams} players={players} showWinnerCrown={isPostRegularSeason}
              officialWinnerId={officialWinners.get('Defensive POY')} />
            <AwardRaceCard emoji="🌱" title="Offensive Rookie of the Year" subtitle="First-year offensive players"
              entries={races.oroy} teams={teams} players={players} showWinnerCrown={isPostRegularSeason}
              officialWinnerId={officialWinners.get('Offensive ROY')} />
            <AwardRaceCard emoji="🌱" title="Defensive Rookie of the Year" subtitle="First-year defensive players"
              entries={races.droy} teams={teams} players={players} showWinnerCrown={isPostRegularSeason}
              officialWinnerId={officialWinners.get('Defensive ROY')} />
          </div>
        )}
        <p className="text-[10px] text-[var(--text-sec)] mt-4 text-center">
          Awards are decided at the end of the regular season. Player must have played at least 1 game to appear.
        </p>
      </div>
    </GameShell>
  );
}
