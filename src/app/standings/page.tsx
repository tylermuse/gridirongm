'use client';

import { useGameStore } from '@/lib/engine/store';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';

export default function StandingsPage() {
  const { teams, userTeamId } = useGameStore();

  const conferences = ['AFC', 'NFC'] as const;
  const divisions = ['North', 'South', 'East', 'West'] as const;

  return (
    <GameShell>
      <div className="max-w-6xl mx-auto">
        <h2 className="text-2xl font-black mb-6">Standings</h2>

        <div className="grid grid-cols-2 gap-6">
          {conferences.map(conf => (
            <div key={conf} className="space-y-4">
              <h3 className="text-lg font-bold text-blue-400">{conf}</h3>
              {divisions.map(div => {
                const divTeams = teams
                  .filter(t => t.conference === conf && t.division === div)
                  .sort((a, b) => {
                    const aWp = a.record.wins / Math.max(1, a.record.wins + a.record.losses);
                    const bWp = b.record.wins / Math.max(1, b.record.wins + b.record.losses);
                    if (bWp !== aWp) return bWp - aWp;
                    return b.record.pointsFor - b.record.pointsAgainst - (a.record.pointsFor - a.record.pointsAgainst);
                  });

                return (
                  <Card key={div}>
                    <CardHeader className="mb-2">
                      <CardTitle>{conf} {div}</CardTitle>
                    </CardHeader>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[var(--text-sec)] text-xs">
                          <th className="text-left pb-1">Team</th>
                          <th className="text-center pb-1">W</th>
                          <th className="text-center pb-1">L</th>
                          <th className="text-center pb-1">PCT</th>
                          <th className="text-right pb-1">PF</th>
                          <th className="text-right pb-1">PA</th>
                          <th className="text-right pb-1">DIFF</th>
                        </tr>
                      </thead>
                      <tbody>
                        {divTeams.map(t => {
                          const total = t.record.wins + t.record.losses;
                          const pct = total > 0 ? (t.record.wins / total).toFixed(3) : '.000';
                          const diff = t.record.pointsFor - t.record.pointsAgainst;

                          return (
                            <tr
                              key={t.id}
                              className={`border-t border-[var(--border)] ${t.id === userTeamId ? 'text-blue-400 font-semibold' : ''}`}
                            >
                              <td className="py-1.5">{t.city} {t.name}</td>
                              <td className="py-1.5 text-center">{t.record.wins}</td>
                              <td className="py-1.5 text-center">{t.record.losses}</td>
                              <td className="py-1.5 text-center font-mono text-xs">{pct}</td>
                              <td className="py-1.5 text-right">{t.record.pointsFor}</td>
                              <td className="py-1.5 text-right">{t.record.pointsAgainst}</td>
                              <td className={`py-1.5 text-right font-mono ${diff > 0 ? 'text-green-400' : diff < 0 ? 'text-red-400' : ''}`}>
                                {diff > 0 ? '+' : ''}{diff}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </Card>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </GameShell>
  );
}
