'use client';

import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { TeamLogo } from '@/components/ui/TeamLogo';
import { AwardWinnerBadge } from '@/components/awards/AwardWinnerBadge';
import type { AwardRace } from '@/lib/awards/computeAwardRaces';
import type { BasketballLeagueState } from '@/lib/persistence/db';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';

/**
 * A single ranked award-race leaderboard (parity with football's AwardRaceCard):
 * top candidates with rank, avatar, a normalized progress bar (leader gold,
 * others navy), and a stat line. Crowns #1 once the regular season's done.
 */
export function AwardRaceCard({ race, league, showWinnerCrown }: { race: AwardRace; league: BasketballLeagueState; showWinnerCrown: boolean }) {
  const players = league.players as Record<string, BasketballPlayer>;
  const teamById = new Map((league.teams as BasketballTeam[]).map(t => [t.id as string, t]));

  const scores = race.entries.map(e => e.score);
  const topScore = Math.max(...scores, 1);
  const minScore = Math.min(...scores, 0);
  const range = Math.max(topScore - minScore, 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle><span className="flex items-center gap-2"><span>{race.emoji}</span> {race.title}</span></CardTitle>
      </CardHeader>
      <div className="text-[10px] text-[var(--text-sec)] -mt-3 mb-2">{race.subtitle}</div>
      {race.entries.length === 0 ? (
        <p className="text-sm text-[var(--text-sec)] text-center py-6">No qualified candidates yet.</p>
      ) : (
        <div className="space-y-1.5">
          {race.entries.map((e, i) => {
            const team = teamById.get(e.teamId);
            const barPct = Math.max(4, Math.round(((e.score - minScore) / range) * 100));
            const p = e.isCoach ? null : players[e.playerId];
            return (
              <div key={e.playerId} className="flex items-center gap-2 min-w-0">
                <span className="w-5 shrink-0 text-xs font-bold text-[var(--text-sec)] tabular-nums text-right">{i + 1}</span>
                {e.isCoach
                  ? team && <TeamLogo abbreviation={team.abbreviation} primaryColor={team.primaryColor} secondaryColor={team.secondaryColor} size="md" />
                  : <PlayerAvatar firstName={p?.firstName ?? '?'} lastName={p?.lastName ?? ''} primaryColor={team?.primaryColor ?? '#444'} secondaryColor={team?.secondaryColor ?? '#fff'} size="md" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {e.isCoach
                      ? <span className="text-sm font-bold truncate">{team ? `${team.city} ${team.name}` : 'Team'}</span>
                      : <Link href={`/player/${e.playerId}`} className="text-sm font-bold truncate hover:text-[var(--accent)] transition-colors">{p ? `${p.firstName} ${p.lastName}` : 'Player'}</Link>}
                    {showWinnerCrown && i === 0 && <AwardWinnerBadge />}
                    {!e.isCoach && <span className="text-[10px] text-[var(--text-sec)]">{e.position}</span>}
                    {team && !e.isCoach && <span className="text-[10px] text-[var(--text-sec)] hidden sm:inline">{team.abbreviation}</span>}
                  </div>
                  <div className="mt-0.5 h-1.5 bg-[var(--surface-2)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${barPct}%`, background: i === 0 ? '#f59e0b' : 'color-mix(in srgb, var(--accent-alt) 60%, transparent)' }} />
                  </div>
                  <div className="text-[10px] text-[var(--text-sec)] truncate mt-0.5">{e.keyStatLine}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
