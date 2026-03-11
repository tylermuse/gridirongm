'use client';

import { use } from 'react';
import Link from 'next/link';
import { useGameStore } from '@/lib/engine/store';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { potentialLabel, potentialColor } from '@/lib/engine/development';
import type { Position } from '@/types';
import { POSITIONS } from '@/types';

function ratingColor(val: number): string {
  if (val >= 85) return 'text-green-400';
  if (val >= 70) return 'text-blue-400';
  if (val >= 55) return 'text-amber-400';
  return 'text-red-400';
}

const POSITION_GROUPS: { label: string; positions: Position[] }[] = [
  { label: 'Offense', positions: ['QB', 'RB', 'WR', 'TE', 'OL'] },
  { label: 'Defense', positions: ['DL', 'LB', 'CB', 'S'] },
  { label: 'Special Teams', positions: ['K', 'P'] },
];

export default function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { teams, players, userTeamId } = useGameStore();

  const team = teams.find(t => t.id === id);

  if (!team) {
    return (
      <GameShell>
        <div className="max-w-4xl mx-auto text-center py-20">
          <h2 className="text-2xl font-black mb-4">Team Not Found</h2>
          <Link href="/standings" className="text-blue-400 hover:underline">Back to Standings</Link>
        </div>
      </GameShell>
    );
  }

  const isUserTeam = team.id === userTeamId;
  const roster = players
    .filter(p => p.teamId === team.id && !p.retired)
    .sort((a, b) => b.ratings.overall - a.ratings.overall);

  const total = team.record.wins + team.record.losses;
  const pct = total > 0 ? (team.record.wins / total).toFixed(3) : '.000';
  const capSpace = team.salaryCap - team.totalPayroll;

  return (
    <GameShell>
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center text-base font-black text-white shrink-0"
            style={{ backgroundColor: team.primaryColor }}
          >
            {team.abbreviation}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black">
                {team.city} {team.name}
              </h2>
              {isUserTeam && <Badge variant="blue">Your Team</Badge>}
            </div>
            <div className="text-sm text-[var(--text-sec)] mt-0.5">
              {team.conference} {team.division} · {team.record.wins}–{team.record.losses} ({pct})
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className={`text-xl font-black ${capSpace > 0 ? 'text-green-400' : 'text-red-400'}`}>
              ${Math.round(capSpace * 10) / 10}M
            </div>
            <div className="text-xs text-[var(--text-sec)]">Cap Space</div>
            <div className="text-xs text-[var(--text-sec)] mt-0.5">
              ${Math.round(team.totalPayroll * 10) / 10}M / ${team.salaryCap}M
            </div>
          </div>
        </div>

        {/* Record detail */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Wins', value: team.record.wins, color: 'text-green-400' },
            { label: 'Losses', value: team.record.losses, color: 'text-red-400' },
            { label: 'Pts For', value: team.record.pointsFor, color: '' },
            { label: 'Pts Against', value: team.record.pointsAgainst, color: '' },
          ].map(stat => (
            <Card key={stat.label} className="text-center py-3">
              <div className={`text-xl font-black ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-[var(--text-sec)]">{stat.label}</div>
            </Card>
          ))}
        </div>

        {/* Roster by position group */}
        {POSITION_GROUPS.map(group => {
          const groupPlayers = roster.filter(p => group.positions.includes(p.position));
          if (groupPlayers.length === 0) return null;
          return (
            <Card key={group.label}>
              <CardHeader className="mb-3">
                <CardTitle>{group.label}</CardTitle>
              </CardHeader>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[var(--text-sec)] text-xs uppercase tracking-wider">
                    <th className="text-left pb-2 pl-2">Player</th>
                    <th className="text-center pb-2">Pos</th>
                    <th className="text-center pb-2">Age</th>
                    <th className="text-center pb-2">OVR</th>
                    <th className="text-center pb-2">POT</th>
                    <th className="text-right pb-2">Salary</th>
                    <th className="text-right pb-2 pr-2">Yrs</th>
                  </tr>
                </thead>
                <tbody>
                  {groupPlayers
                    .filter(p => group.positions.includes(p.position))
                    .sort((a, b) => {
                      const posA = group.positions.indexOf(a.position);
                      const posB = group.positions.indexOf(b.position);
                      if (posA !== posB) return posA - posB;
                      return b.ratings.overall - a.ratings.overall;
                    })
                    .map(p => (
                      <tr key={p.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors">
                        <td className="py-2 pl-2">
                          <Link
                            href={`/player/${p.id}`}
                            className="font-semibold hover:text-blue-400 transition-colors"
                          >
                            {p.firstName} {p.lastName}
                          </Link>
                          {p.injury && (
                            <span className="block text-xs text-red-400">
                              {p.injury.type} ({p.injury.weeksLeft}w)
                            </span>
                          )}
                        </td>
                        <td className="py-2 text-center">
                          <Badge variant="default" size="sm">{p.position}</Badge>
                        </td>
                        <td className="py-2 text-center text-[var(--text-sec)]">{p.age}</td>
                        <td className={`py-2 text-center font-bold ${ratingColor(p.ratings.overall)}`}>
                          {p.ratings.overall}
                        </td>
                        <td className={`py-2 text-center text-xs ${potentialColor(p.potential, p.experience)}`}>
                          {potentialLabel(p.potential, p.experience)}
                        </td>
                        <td className="py-2 text-right font-mono text-[var(--text-sec)]">
                          ${p.contract.salary}M
                        </td>
                        <td className="py-2 text-right pr-2 text-[var(--text-sec)]">
                          {p.contract.yearsLeft}yr
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </Card>
          );
        })}

        {roster.length === 0 && (
          <Card>
            <div className="text-center py-12 text-[var(--text-sec)]">
              No players on roster.
            </div>
          </Card>
        )}

        <div className="text-xs text-[var(--text-sec)] text-center pb-4">
          {roster.length} players · Avg OVR{' '}
          {roster.length > 0
            ? Math.round(roster.reduce((s, p) => s + p.ratings.overall, 0) / roster.length)
            : '—'}
        </div>
      </div>
    </GameShell>
  );
}
