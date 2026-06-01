'use client';

import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { getInjuries, getPlayThrough, isPlayingThrough, canPlayThrough, SEVERITY_LABEL, type InjuryRecord } from '@/lib/injuries';
import { getDiscipline, type DisciplineRecord } from '@/lib/discipline';
import { useLeagueStore } from '@/lib/store/leagueStore';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';
import type { BaseLeagueState } from '@bs/core/adapter';
import type { BasketballRatings, BasketballStats } from '@bs/sport-basketball';

type LeagueState = BaseLeagueState<BasketballRatings, BasketballStats>;

const SEVERITY_COLOR: Record<string, string> = {
  day_to_day: '#f59e0b', minor: '#f97316', major: '#dc2626', season_ending: '#991b1b',
};

/** Surfaces the injury system (parity audit #12). Renders nothing when the team
 *  is healthy so it doesn't clutter the dashboard. */
export function InjuryReport({ league, team }: { league: LeagueState; team: BasketballTeam }) {
  const playThroughInjury = useLeagueStore(s => s.playThroughInjury);
  const injuries = getInjuries(league);
  const playThrough = getPlayThrough(league);
  const day = league.currentTick;
  const players = league.players as Record<string, BasketballPlayer>;

  // Players suiting up through a knock (available, elevated re-injury risk).
  const gritty = team.playerIds
    .map(id => players[id])
    .filter((p): p is BasketballPlayer => !!p && isPlayingThrough(playThrough, p.id, day));

  const injured = team.playerIds
    .map(id => ({ p: players[id], rec: injuries[id] as InjuryRecord | undefined }))
    .filter((x): x is { p: BasketballPlayer; rec: InjuryRecord } => !!x.p && !!x.rec && x.rec.returnDay > day)
    .sort((a, b) => b.rec.returnDay - a.rec.returnDay);

  const discipline = getDiscipline(league);
  const suspended = team.playerIds
    .map(id => ({ p: players[id], rec: discipline[id] as DisciplineRecord | undefined }))
    .filter((x): x is { p: BasketballPlayer; rec: DisciplineRecord } => !!x.p && !!x.rec && x.rec.kind === 'suspension' && x.rec.returnDay > day)
    .sort((a, b) => b.rec.returnDay - a.rec.returnDay);

  if (injured.length === 0 && suspended.length === 0 && gritty.length === 0) return null;

  return (
    <Card className="mb-6">
      <CardHeader><CardTitle>🏥 Availability Report</CardTitle><span className="text-xs text-[var(--text-sec)]">{injured.length + suspended.length} out</span></CardHeader>
      <div className="space-y-1.5">
        {injured.map(({ p, rec }) => {
          const out = rec.returnDay >= 50_000 ? 'Out for season' : `${rec.returnDay - day} day${rec.returnDay - day === 1 ? '' : 's'}`;
          return (
            <div key={p.id} className="flex items-center gap-2 text-sm">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: SEVERITY_COLOR[rec.severity] ?? '#dc2626' }} />
              <span className="font-semibold truncate flex-1">{p.firstName} {p.lastName}</span>
              <span className="text-xs text-[var(--text-sec)] capitalize">{rec.bodyPart} · {SEVERITY_LABEL[rec.severity]}</span>
              {canPlayThrough(rec) && (
                <button
                  onClick={() => void playThroughInjury(p.id)}
                  title="Suit him up now — at elevated re-injury risk"
                  className="text-[10px] font-bold rounded px-1.5 py-0.5 hover:opacity-80 transition-opacity"
                  style={{ background: 'color-mix(in srgb, var(--accent) 16%, transparent)', color: 'var(--accent)' }}
                >
                  Play through →
                </button>
              )}
              <span className="text-xs font-semibold tabular-nums w-20 text-right" style={{ color: SEVERITY_COLOR[rec.severity] ?? '#dc2626' }}>{out}</span>
            </div>
          );
        })}
        {gritty.map(p => (
          <div key={p.id} className="flex items-center gap-2 text-sm">
            <span className="shrink-0" aria-hidden>💪</span>
            <span className="font-semibold truncate flex-1">{p.firstName} {p.lastName}</span>
            <span className="text-xs text-[var(--text-sec)]">Playing through — elevated risk</span>
            <span className="text-xs font-semibold tabular-nums w-20 text-right" style={{ color: '#f59e0b' }}>Active</span>
          </div>
        ))}
        {suspended.map(({ p, rec }) => {
          const left = rec.returnDay - day;
          return (
            <div key={p.id} className="flex items-center gap-2 text-sm">
              <span className="shrink-0" aria-hidden>🚫</span>
              <span className="font-semibold truncate flex-1">{p.firstName} {p.lastName}</span>
              <span className="text-xs text-[var(--text-sec)] truncate">Suspended</span>
              <span className="text-xs font-semibold tabular-nums w-20 text-right" style={{ color: '#a855f7' }}>{left} game{left === 1 ? '' : 's'}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
