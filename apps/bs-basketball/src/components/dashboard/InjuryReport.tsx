'use client';

import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { getInjuries, SEVERITY_LABEL, type InjuryRecord } from '@/lib/injuries';
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
  const injuries = getInjuries(league);
  const day = league.currentTick;
  const players = league.players as Record<string, BasketballPlayer>;

  const injured = team.playerIds
    .map(id => ({ p: players[id], rec: injuries[id] as InjuryRecord | undefined }))
    .filter((x): x is { p: BasketballPlayer; rec: InjuryRecord } => !!x.p && !!x.rec && x.rec.returnDay > day)
    .sort((a, b) => b.rec.returnDay - a.rec.returnDay);

  if (injured.length === 0) return null;

  return (
    <Card className="mb-6">
      <CardHeader><CardTitle>🏥 Injury Report</CardTitle><span className="text-xs text-[var(--text-sec)]">{injured.length} out</span></CardHeader>
      <div className="space-y-1.5">
        {injured.map(({ p, rec }) => {
          const out = rec.returnDay >= 50_000 ? 'Out for season' : `${rec.returnDay - day} day${rec.returnDay - day === 1 ? '' : 's'}`;
          return (
            <div key={p.id} className="flex items-center gap-2 text-sm">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: SEVERITY_COLOR[rec.severity] ?? '#dc2626' }} />
              <span className="font-semibold truncate flex-1">{p.firstName} {p.lastName}</span>
              <span className="text-xs text-[var(--text-sec)] capitalize">{rec.bodyPart} · {SEVERITY_LABEL[rec.severity]}</span>
              <span className="text-xs font-semibold tabular-nums w-20 text-right" style={{ color: SEVERITY_COLOR[rec.severity] ?? '#dc2626' }}>{out}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
