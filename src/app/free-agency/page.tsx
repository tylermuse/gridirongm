'use client';

import { useGameStore } from '@/lib/engine/store';
import { GameShell } from '@/components/game/GameShell';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { potentialLabel, potentialColor } from '@/lib/engine/development';

function ratingColor(val: number): string {
  if (val >= 80) return 'text-green-400';
  if (val >= 65) return 'text-blue-400';
  if (val >= 50) return 'text-amber-400';
  return 'text-red-400';
}

export default function FreeAgencyPage() {
  const { phase, players, freeAgents, signFreeAgent } = useGameStore();

  if (phase !== 'freeAgency') {
    return (
      <GameShell>
        <div className="max-w-4xl mx-auto text-center py-20">
          <div className="text-5xl mb-4">✍️</div>
          <h2 className="text-2xl font-black mb-3">Free Agency</h2>
          <p className="text-[var(--text-sec)] mb-6">
            {phase === 'regular' ? 'Free agency opens in the offseason. Focus on the current season first.' :
             phase === 'playoffs' ? 'Free agency opens after the Draft phase.' :
             phase === 'draft' ? 'Free agency opens after the Draft. Finish your picks first.' :
             "Free agency hasn't started yet."}
          </p>
          <div className="flex gap-3 justify-center">
            <a href="/" className="text-sm text-blue-400 hover:underline">Go to Dashboard</a>
            <a href="/roster" className="text-sm text-blue-400 hover:underline">View Roster</a>
          </div>
        </div>
      </GameShell>
    );
  }

  const agents = freeAgents
    .map(id => players.find(p => p.id === id)!)
    .filter(Boolean)
    .sort((a, b) => b.ratings.overall - a.ratings.overall)
    .slice(0, 50);

  function estimateSalary(overall: number): number {
    return Math.round(Math.max(0.5, ((overall - 40) / 60) * 15) * 10) / 10;
  }

  return (
    <GameShell>
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-black mb-6">Free Agency</h2>

        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[var(--text-sec)] text-xs uppercase tracking-wider">
                <th className="text-left pb-3 pl-2">Player</th>
                <th className="text-center pb-3">Pos</th>
                <th className="text-center pb-3">Age</th>
                <th className="text-center pb-3">OVR</th>
                <th className="text-center pb-3">POT</th>
                <th className="text-right pb-3">Est. Salary</th>
                <th className="text-right pb-3 pr-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {agents.map(p => {
                const salary = estimateSalary(p.ratings.overall);
                return (
                  <tr key={p.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors">
                    <td className="py-2.5 pl-2 font-semibold">
                      {p.firstName} {p.lastName}
                    </td>
                    <td className="py-2.5 text-center"><Badge>{p.position}</Badge></td>
                    <td className="py-2.5 text-center">{p.age}</td>
                    <td className={`py-2.5 text-center font-bold ${ratingColor(p.ratings.overall)}`}>
                      {p.ratings.overall}
                    </td>
                    <td className={`py-2.5 text-center text-xs ${potentialColor(p.potential, p.experience)}`}>
                      {potentialLabel(p.potential, p.experience)}
                    </td>
                    <td className="py-2.5 text-right font-mono">${salary}M/yr</td>
                    <td className="py-2.5 text-right pr-2">
                      <Button onClick={() => signFreeAgent(p.id, salary, 3)} size="sm">
                        Sign
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
    </GameShell>
  );
}
