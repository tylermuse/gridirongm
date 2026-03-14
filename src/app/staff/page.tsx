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

const STARTER_COUNTS: Record<string, number> = {
  QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, DL: 3, LB: 3, CB: 2, S: 2, K: 1, P: 1,
};

function isStarter(player: Player, roster: Player[]): boolean {
  const atPos = roster
    .filter(p => p.position === player.position)
    .sort((a, b) => b.ratings.overall - a.ratings.overall);
  const count = STARTER_COUNTS[player.position] ?? 1;
  return atPos.indexOf(player) < count;
}

function generateRecommendations(
  playerFits: { player: Player; fit: SchemeFit }[],
): string[] {
  const tips: string[] = [];

  // Count poor fits by position
  const poorByPos: Record<string, number> = {};
  const greatByPos: Record<string, number> = {};
  let replaceableCount = 0;

  for (const { player, fit } of playerFits) {
    if (fit === 'poor') {
      poorByPos[player.position] = (poorByPos[player.position] ?? 0) + 1;
      if (player.ratings.overall < 60) replaceableCount++;
    }
    if (fit === 'great') {
      greatByPos[player.position] = (greatByPos[player.position] ?? 0) + 1;
    }
  }

  // Positions with many poor fits
  for (const [pos, count] of Object.entries(poorByPos)) {
    if (count >= 3) {
      tips.push(`Your ${pos} corps has ${count} poor fits. Target scheme-fit ${pos}s in the draft or free agency.`);
    }
  }

  // Positions with great fit strength
  for (const [pos, count] of Object.entries(greatByPos)) {
    if (count >= 2) {
      tips.push(`Your ${pos} group has ${count} great fits — scheme is working well here. Protect those guys.`);
    }
  }

  // Replaceable poor fits
  if (replaceableCount >= 2) {
    tips.push(`Replacing your ${replaceableCount} lowest-OVR poor fits with average neutral fits would boost your effective team OVR by ~${replaceableCount} points.`);
  }

  // All good
  if (Object.keys(poorByPos).length === 0) {
    tips.push('Your roster fits the scheme well. No major changes needed.');
  }

  return tips.slice(0, 3);
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
  const poorReplace = poorFits.filter(f => f.player.ratings.overall < 65);
  const poorKeep = poorFits.filter(f => f.player.ratings.overall >= 65);
  const recommendations = generateRecommendations(playerFits);

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
            <Card>
              <CardHeader>
                <CardTitle>Scheme Fit Breakdown</CardTitle>
                <p className="text-xs text-[var(--text-sec)] mt-1">
                  Great Fit players get <span className="text-green-600 font-bold">+2 OVR</span> in games.
                  Poor Fit players get <span className="text-red-500 font-bold">-1 OVR</span>.
                  Building a roster that fits your coach&apos;s scheme makes your team play above its ratings.
                </p>
              </CardHeader>

              <div className="space-y-6">
                {/* Great Fits */}
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
                          <span className="text-green-600 text-[10px] font-medium">+2 OVR</span>
                          <span className="text-[var(--text-sec)] text-xs ml-auto">OVR {player.ratings.overall}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Poor Fits — Consider Replacing (OVR < 65) */}
                {poorReplace.length > 0 && (
                  <div>
                    <div className="text-xs text-red-500 font-bold uppercase tracking-wider mb-2">
                      Poor Fits — Consider Replacing ({poorReplace.length})
                    </div>
                    <div className="space-y-1.5">
                      {poorReplace.map(({ player }) => {
                        const starter = isStarter(player, roster);
                        return (
                          <div key={player.id}>
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-red-500">{schemeFitDot('poor')}</span>
                              <Badge variant="default" size="sm">{player.position}</Badge>
                              <span className="font-medium">{player.firstName} {player.lastName}</span>
                              <span className="text-red-500 text-[10px] font-medium">-1 OVR</span>
                              <span className="text-[var(--text-sec)] text-xs ml-auto">OVR {player.ratings.overall}</span>
                            </div>
                            <div className={`text-[10px] ml-7 mt-0.5 ${starter ? 'text-amber-600' : 'text-[var(--text-sec)]'}`}>
                              {starter
                                ? `\u26A0\uFE0F Upgrade priority \u2014 starting at ${player.position} despite poor fit`
                                : 'Low priority \u2014 bench player'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Poor Fits — Keep Anyway (OVR >= 65) */}
                {poorKeep.length > 0 && (
                  <div>
                    <div className="text-xs text-amber-600 font-bold uppercase tracking-wider mb-2">
                      Poor Fits — Keep Anyway ({poorKeep.length})
                    </div>
                    <div className="space-y-1.5">
                      {poorKeep.map(({ player }) => (
                        <div key={player.id}>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-amber-500">{schemeFitDot('poor')}</span>
                            <Badge variant="default" size="sm">{player.position}</Badge>
                            <span className="font-medium">{player.firstName} {player.lastName}</span>
                            <span className="text-red-500 text-[10px] font-medium">-1 OVR</span>
                            <span className="text-[var(--text-sec)] text-xs ml-auto">OVR {player.ratings.overall}</span>
                          </div>
                          <div className="text-[10px] ml-7 mt-0.5 text-[var(--text-sec)]">
                            Too talented to move. Scheme penalty is minor compared to production.
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {greatFits.length === 0 && poorFits.length === 0 && (
                  <p className="text-sm text-[var(--text-sec)]">All players have a neutral scheme fit.</p>
                )}
              </div>
            </Card>

            {/* Recommended Moves */}
            {recommendations.length > 0 && (
              <Card>
                <CardHeader><CardTitle>Recommended Moves</CardTitle></CardHeader>
                <div className="space-y-2">
                  {recommendations.map((tip, i) => (
                    <div key={i} className="flex gap-2 text-sm">
                      <span className="text-blue-500 shrink-0">&#x2022;</span>
                      <span>{tip}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </GameShell>
  );
}
