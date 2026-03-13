'use client';

import { useGameStore } from '@/lib/engine/store';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  OFFENSIVE_SCHEME_LABELS,
  DEFENSIVE_SCHEME_LABELS,
  calculateSchemeFit,
  schemeFitDot,
  type SchemeFit,
} from '@/lib/engine/coaching';
import type { Coach, Player } from '@/types';

const ROLE_LABELS: Record<string, string> = {
  HC: 'Head Coach',
  OC: 'Offensive Coordinator',
  DC: 'Defensive Coordinator',
};

const ROLE_COLORS: Record<string, string> = {
  HC: 'bg-blue-600',
  OC: 'bg-green-600',
  DC: 'bg-red-600',
};

function ovrColor(ovr: number): string {
  if (ovr >= 80) return 'text-green-600';
  if (ovr >= 65) return 'text-blue-600';
  if (ovr >= 50) return 'text-amber-600';
  return 'text-red-600';
}

function CoachCard({ coach, roster, userTeam }: { coach: Coach; roster: Player[]; userTeam: import('@/types').Team }) {
  const offSchemeLabel = coach.offensiveScheme ? OFFENSIVE_SCHEME_LABELS[coach.offensiveScheme] : null;
  const defSchemeLabel = coach.defensiveScheme ? DEFENSIVE_SCHEME_LABELS[coach.defensiveScheme] : null;
  const winPct = coach.careerWins + coach.careerLosses > 0
    ? ((coach.careerWins / (coach.careerWins + coach.careerLosses)) * 100).toFixed(1)
    : '0.0';

  // Calculate scheme fit breakdown for this coach's side
  const relevantPlayers = roster.filter(p => {
    if (coach.role === 'OC') return ['QB', 'RB', 'WR', 'TE', 'OL'].includes(p.position);
    if (coach.role === 'DC') return ['DL', 'LB', 'CB', 'S'].includes(p.position);
    return true; // HC sees all
  });

  const fitCounts = { great: 0, neutral: 0, poor: 0 };
  for (const p of relevantPlayers) {
    const fit = calculateSchemeFit(p, userTeam);
    fitCounts[fit]++;
  }

  return (
    <Card>
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs text-white px-2 py-0.5 rounded font-bold ${ROLE_COLORS[coach.role]}`}>
                {coach.role}
              </span>
              <span className="text-xs text-[var(--text-sec)]">{ROLE_LABELS[coach.role]}</span>
            </div>
            <h3 className="text-xl font-bold">{coach.firstName} {coach.lastName}</h3>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-black ${ovrColor(coach.ovr)}`}>{coach.ovr}</div>
            <div className="text-[10px] text-[var(--text-sec)] uppercase">OVR</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
          <div>
            <span className="text-[var(--text-sec)]">Age</span>
            <span className="ml-2 font-medium">{coach.age}</span>
          </div>
          <div>
            <span className="text-[var(--text-sec)]">Trait</span>
            <span className="ml-2 font-medium">{coach.trait}</span>
          </div>
          <div>
            <span className="text-[var(--text-sec)]">Tenure</span>
            <span className="ml-2 font-medium">{coach.yearsWithTeam} yr{coach.yearsWithTeam !== 1 ? 's' : ''}</span>
          </div>
          <div>
            <span className="text-[var(--text-sec)]">Record</span>
            <span className="ml-2 font-medium">{coach.careerWins}-{coach.careerLosses} ({winPct}%)</span>
          </div>
        </div>

        {/* Schemes */}
        <div className="space-y-2 mb-4">
          {offSchemeLabel && (
            <div className="flex items-center gap-2">
              <Badge variant="green" size="sm">OFF</Badge>
              <span className="text-sm font-medium">{offSchemeLabel}</span>
            </div>
          )}
          {defSchemeLabel && (
            <div className="flex items-center gap-2">
              <Badge variant="red" size="sm">DEF</Badge>
              <span className="text-sm font-medium">{defSchemeLabel}</span>
            </div>
          )}
        </div>

        {/* Scheme Fit Summary */}
        {relevantPlayers.length > 0 && (
          <div className="border-t border-[var(--border)] pt-3">
            <div className="text-xs text-[var(--text-sec)] uppercase tracking-wider mb-2">Roster Scheme Fit</div>
            <div className="flex gap-4 text-sm">
              <span className="text-green-600 font-medium">{fitCounts.great} Great</span>
              <span className="text-[var(--text-sec)]">{fitCounts.neutral} Neutral</span>
              <span className="text-red-500 font-medium">{fitCounts.poor} Poor</span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function StaffPage() {
  const { teams, userTeamId, players } = useGameStore();
  const userTeam = teams.find(t => t.id === userTeamId);
  const coaches = userTeam?.coaches ?? [];
  const roster = players.filter(p => p.teamId === userTeamId && !p.retired);

  if (!userTeam) return null;

  const hc = coaches.find(c => c.role === 'HC');
  const oc = coaches.find(c => c.role === 'OC');
  const dc = coaches.find(c => c.role === 'DC');
  const orderedCoaches = [hc, oc, dc].filter(Boolean) as Coach[];

  // Player scheme fits for the detailed table
  const playerFits: { player: Player; fit: SchemeFit }[] = roster
    .map(p => ({ player: p, fit: calculateSchemeFit(p, userTeam) }))
    .sort((a, b) => {
      const order: Record<SchemeFit, number> = { great: 0, poor: 1, neutral: 2 };
      return order[a.fit] - order[b.fit] || b.player.ratings.overall - a.player.ratings.overall;
    });

  const greatFits = playerFits.filter(f => f.fit === 'great');
  const poorFits = playerFits.filter(f => f.fit === 'poor');

  return (
    <GameShell>
      <div className="max-w-5xl mx-auto space-y-6">
        <h2 className="text-2xl font-black">Coaching Staff</h2>

        {coaches.length === 0 ? (
          <Card>
            <div className="p-8 text-center text-[var(--text-sec)]">
              No coaching staff assigned. Start a new league to generate coaches.
            </div>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {orderedCoaches.map(coach => (
                <CoachCard key={coach.id} coach={coach} roster={roster} userTeam={userTeam} />
              ))}
            </div>

            {/* Scheme Fit Details */}
            {(greatFits.length > 0 || poorFits.length > 0) && (
              <Card>
                <CardHeader><CardTitle>Scheme Fit Breakdown</CardTitle></CardHeader>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {greatFits.length > 0 && (
                    <div>
                      <div className="text-xs text-green-600 font-bold uppercase tracking-wider mb-2">
                        Great Fits ({greatFits.length})
                      </div>
                      <div className="space-y-1">
                        {greatFits.map(({ player }) => (
                          <div key={player.id} className="flex items-center gap-2 text-sm">
                            <span className="text-green-600">{schemeFitDot('great')}</span>
                            <Badge variant="default" size="sm">{player.position}</Badge>
                            <span className="font-medium">{player.firstName} {player.lastName}</span>
                            <span className="text-[var(--text-sec)] text-xs ml-auto">OVR {player.ratings.overall}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {poorFits.length > 0 && (
                    <div>
                      <div className="text-xs text-red-500 font-bold uppercase tracking-wider mb-2">
                        Poor Fits ({poorFits.length})
                      </div>
                      <div className="space-y-1">
                        {poorFits.map(({ player }) => (
                          <div key={player.id} className="flex items-center gap-2 text-sm">
                            <span className="text-red-500">{schemeFitDot('poor')}</span>
                            <Badge variant="default" size="sm">{player.position}</Badge>
                            <span className="font-medium">{player.firstName} {player.lastName}</span>
                            <span className="text-[var(--text-sec)] text-xs ml-auto">OVR {player.ratings.overall}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </GameShell>
  );
}
