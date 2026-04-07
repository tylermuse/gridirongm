'use client';

import { use } from 'react';
import Link from 'next/link';
import { useGameStore } from '@/lib/engine/store';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { TeamLogo } from '@/components/ui/TeamLogo';
import {
  OFFENSIVE_SCHEME_LABELS,
  DEFENSIVE_SCHEME_LABELS,
} from '@/lib/engine/coaching';
import type { Coach, CoachHistory } from '@/types';

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

function ratingColor(val: number): string {
  if (val >= 85) return 'text-green-600';
  if (val >= 70) return 'text-blue-600';
  if (val >= 55) return 'text-amber-600';
  return 'text-red-600';
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 text-center">
      <div className="text-lg font-black">{value}</div>
      <div className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider">{label}</div>
    </div>
  );
}

export default function CoachProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { teams } = useGameStore();

  // Search all teams to find the coach and its team
  let coach: Coach | undefined;
  let coachTeam: (typeof teams)[number] | undefined;

  for (const team of teams) {
    const found = team.coaches?.find((c) => c.id === id);
    if (found) {
      coach = found;
      coachTeam = team;
      break;
    }
  }

  if (!coach) {
    return (
      <GameShell>
        <div className="max-w-4xl mx-auto text-center py-20">
          <h2 className="text-2xl font-black mb-4">Coach Not Found</h2>
          <p className="text-[var(--text-sec)]">This coach doesn&apos;t exist or has been removed.</p>
          <Link href="/staff" className="mt-4 inline-block text-blue-500 hover:underline text-sm">
            Back to Staff
          </Link>
        </div>
      </GameShell>
    );
  }

  const wins = coach.careerWins ?? 0;
  const losses = coach.careerLosses ?? 0;
  const totalGames = wins + losses;
  const winPct = totalGames > 0 ? ((wins / totalGames) * 100).toFixed(1) : '0.0';
  const yearsExp = coach.yearsWithTeam ?? 0;

  // Aggregate from history
  const history: CoachHistory[] = coach.history ?? [];
  const playoffApps = history.reduce((sum, h) => sum + (h.playoffAppearances ?? 0), 0);
  const championships = history.reduce((sum, h) => sum + (h.championships ?? 0), 0);

  const offSchemeLabel = coach.offensiveScheme ? OFFENSIVE_SCHEME_LABELS[coach.offensiveScheme] : null;
  const defSchemeLabel = coach.defensiveScheme ? DEFENSIVE_SCHEME_LABELS[coach.defensiveScheme] : null;

  // OVR Progression sparkline
  const ratingHistory = coach.ratingHistory ?? [];
  let sparklineSvg: React.ReactNode = null;
  if (ratingHistory.length >= 2) {
    const ovrs = ratingHistory.map((h) => h.ovr);
    const minOvr = Math.min(...ovrs);
    const maxOvr = Math.max(...ovrs);
    const points = ratingHistory
      .map((h, i) => {
        const x = (i / Math.max(1, ratingHistory.length - 1)) * 200;
        const y = 48 - ((h.ovr - minOvr) / Math.max(1, maxOvr - minOvr)) * 48;
        return `${x},${y}`;
      })
      .join(' ');

    sparklineSvg = (
      <svg viewBox="0 0 200 52" className="w-full h-14" preserveAspectRatio="none">
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-blue-500"
        />
        {ratingHistory.map((h, i) => {
          const x = (i / Math.max(1, ratingHistory.length - 1)) * 200;
          const y = 48 - ((h.ovr - minOvr) / Math.max(1, maxOvr - minOvr)) * 48;
          return (
            <circle key={i} cx={x} cy={y} r="3" className="fill-blue-500" />
          );
        })}
      </svg>
    );
  }

  return (
    <GameShell>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back link */}
        <Link href="/staff" className="text-sm text-blue-500 hover:underline">&larr; Back to Staff</Link>

        {/* Header */}
        <Card>
          <div className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                {coachTeam && (
                  <div className="shrink-0">
                    <TeamLogo
                      abbreviation={coachTeam.abbreviation}
                      primaryColor={coachTeam.primaryColor}
                      secondaryColor={coachTeam.secondaryColor}
                      logoUrl={coachTeam.logoUrl}
                      size="lg"
                    />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs text-white px-2 py-0.5 rounded font-bold ${ROLE_COLORS[coach.role]}`}>
                      {coach.role}
                    </span>
                    <span className="text-xs text-[var(--text-sec)]">{ROLE_LABELS[coach.role]}</span>
                  </div>
                  <h1 className="text-3xl font-black">{coach.firstName} {coach.lastName}</h1>
                  {coachTeam && (
                    <p className="text-sm text-[var(--text-sec)] mt-1">{coachTeam.city} {coachTeam.name}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-sm text-[var(--text-sec)]">
                    <span>Age {coach.age}</span>
                    <span>&middot;</span>
                    <span>{yearsExp} yr{yearsExp !== 1 ? 's' : ''} experience</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    {coach.personality && (
                      <Badge variant="blue" size="sm">{coach.personality}</Badge>
                    )}
                    {coach.trait && (
                      <Badge variant="default" size="sm">{coach.trait}</Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-4xl font-black ${ratingColor(coach.ovr)}`}>{coach.ovr}</div>
                <div className="text-[10px] text-[var(--text-sec)] uppercase tracking-wider">OVR</div>
              </div>
            </div>
            {coach.bio && (
              <p className="mt-4 text-sm text-[var(--text-sec)] border-t border-[var(--border)] pt-3">{coach.bio}</p>
            )}
          </div>
        </Card>

        {/* Career Stats */}
        <Card>
          <CardHeader><CardTitle>Career Stats</CardTitle></CardHeader>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <StatBox label="Record" value={`${wins}-${losses}`} />
            <StatBox label="Win %" value={`${winPct}%`} />
            <StatBox label="Years" value={String(yearsExp)} />
            <StatBox label="Playoffs" value={String(playoffApps)} />
            <StatBox label="Titles" value={String(championships)} />
          </div>
        </Card>

        {/* Current Assignment */}
        <Card>
          <CardHeader><CardTitle>Current Assignment</CardTitle></CardHeader>
          <div className="space-y-3 text-sm">
            {coachTeam && (
              <div className="flex items-center gap-2">
                <span className="text-[var(--text-sec)]">Team</span>
                <span className="font-medium">{coachTeam.city} {coachTeam.name}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-sec)]">Role</span>
              <span className="font-medium">{ROLE_LABELS[coach.role]}</span>
            </div>
            {offSchemeLabel && (
              <div className="flex items-center gap-2">
                <span className="text-[var(--text-sec)]">Offensive Scheme</span>
                <Badge variant="green" size="sm">OFF</Badge>
                <span className="font-medium">{offSchemeLabel}</span>
              </div>
            )}
            {defSchemeLabel && (
              <div className="flex items-center gap-2">
                <span className="text-[var(--text-sec)]">Defensive Scheme</span>
                <Badge variant="red" size="sm">DEF</Badge>
                <span className="font-medium">{defSchemeLabel}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-[var(--text-sec)]">Contract</span>
              <span className="font-medium">
                {coach.contractYears ?? '?'} year{(coach.contractYears ?? 0) !== 1 ? 's' : ''} remaining
                {' '}· ${coach.salary != null ? `${coach.salary.toFixed(1)}M/yr` : '?'}
              </span>
            </div>
            {coach.specialties && coach.specialties.length > 0 && (
              <div>
                <span className="text-[var(--text-sec)] mr-2">Specialties</span>
                <div className="inline-flex flex-wrap gap-1 mt-1">
                  {coach.specialties.map((s, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Coaching History */}
        {history.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Coaching History</CardTitle></CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--text-sec)] text-xs uppercase tracking-wider border-b border-[var(--border)]">
                    <th className="pb-2 pr-4">Team</th>
                    <th className="pb-2 pr-4">Role</th>
                    <th className="pb-2 pr-4">Seasons</th>
                    <th className="pb-2 pr-4">Record</th>
                    <th className="pb-2 pr-4">Playoffs</th>
                    <th className="pb-2">Titles</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={i} className="border-b border-[var(--border)] last:border-b-0">
                      <td className="py-2 pr-4 font-medium">{h.teamName}</td>
                      <td className="py-2 pr-4">{h.role}</td>
                      <td className="py-2 pr-4">{h.seasonStart}-{h.seasonEnd}</td>
                      <td className="py-2 pr-4">{h.wins}-{h.losses}</td>
                      <td className="py-2 pr-4">{h.playoffAppearances}</td>
                      <td className="py-2">{h.championships}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* OVR Progression */}
        {sparklineSvg && (
          <Card>
            <CardHeader><CardTitle>OVR Progression</CardTitle></CardHeader>
            <div className="px-1">
              {sparklineSvg}
              <div className="flex justify-between text-[10px] text-[var(--text-sec)] mt-1">
                {ratingHistory.map((h, i) => (
                  <span key={i}>S{h.season}: {h.ovr}</span>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Scheme Info */}
        {(offSchemeLabel || defSchemeLabel) && (
          <Card>
            <CardHeader><CardTitle>Scheme Details</CardTitle></CardHeader>
            <div className="space-y-3 text-sm">
              {offSchemeLabel && (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="green" size="sm">OFF</Badge>
                    <span className="font-bold">{offSchemeLabel}</span>
                  </div>
                  <p className="text-[var(--text-sec)] text-xs">
                    Offensive scheme determines which players get a scheme fit bonus.
                    Players with traits matching this scheme perform above their ratings.
                  </p>
                </div>
              )}
              {defSchemeLabel && (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="red" size="sm">DEF</Badge>
                    <span className="font-bold">{defSchemeLabel}</span>
                  </div>
                  <p className="text-[var(--text-sec)] text-xs">
                    Defensive scheme determines which defenders get a scheme fit bonus.
                    Players with traits matching this scheme perform above their ratings.
                  </p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Back to Staff button */}
        <div className="flex justify-center pb-4">
          <Link href="/staff">
            <Button variant="secondary">Back to Staff</Button>
          </Link>
        </div>
      </div>
    </GameShell>
  );
}
