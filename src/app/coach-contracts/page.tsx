'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useGameStore } from '@/lib/engine/store';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

/**
 * Coaching Contracts page — split out of the player Re-signing Window
 * (Tyler-direct via Cowork chat 5/3) so the player and coach decisions
 * don't live on the same screen and the player Re-signing cap math
 * ($X asking / $Y remaining) is no longer muddied by coach contracts.
 *
 * Lives on its own route inside the existing 'resigning' phase — no
 * persisted-shape change. Users navigate here from the re-sign page
 * via a CTA card; once all coaches are extended (or the user chooses
 * not to), they navigate back to finish player re-signings.
 */
export default function CoachContractsPage() {
  const router = useRouter();
  const { teams, userTeamId, extendCoachContract } = useGameStore();

  const userTeamCoaches = teams.find(t => t.id === userTeamId)?.coaches ?? [];
  const expiringCoaches = userTeamCoaches.filter(c => (c.contractYears ?? 0) <= 1);

  return (
    <GameShell>
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-black">Coaching Contracts</h2>
            <p className="text-xs sm:text-sm text-[var(--text-sec)] mt-1">
              Extend or release coaches whose contracts expire at season end.
            </p>
          </div>
          <Link href="/re-sign" className="self-start">
            <Button size="sm" variant="ghost">← Back to Player Re-signing</Button>
          </Link>
        </div>

        {expiringCoaches.length === 0 ? (
          <Card>
            <div className="px-4 py-8 text-center text-sm text-[var(--text-sec)]">
              No coaches with expiring contracts. You&apos;re all set on the staff side.
              <div className="mt-4">
                <Button onClick={() => router.push('/re-sign')}>Continue to Player Re-signing</Button>
              </div>
            </div>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="flex items-center gap-2">
                  <span>🧑‍🏫</span> Coaching Contracts Expiring ({expiringCoaches.length})
                </span>
              </CardTitle>
            </CardHeader>
            <div className="px-4 pb-4 space-y-2">
              {expiringCoaches.map(c => {
                const aav = c.salary ?? 1;
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-[var(--surface-2)]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-sm truncate">
                        {c.firstName} {c.lastName}
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-[var(--text-sec)]">
                          {c.role}
                        </span>
                      </div>
                      <div className="text-[10px] text-[var(--text-sec)]">
                        Current: ${aav.toFixed(1)}M/yr · {c.trait}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => extendCoachContract(c.id, 2)}
                        className="text-[11px] px-2.5 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 font-bold border border-blue-200"
                        title={`Extend 2 years at $${aav.toFixed(1)}M/yr`}
                      >
                        Extend 2yr
                      </button>
                      <button
                        onClick={() => extendCoachContract(c.id, 4)}
                        className="text-[11px] px-2.5 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 font-bold border border-blue-200"
                        title={`Extend 4 years at $${aav.toFixed(1)}M/yr`}
                      >
                        Extend 4yr
                      </button>
                    </div>
                  </div>
                );
              })}
              <p className="text-[10px] text-[var(--text-sec)] italic mt-2">
                Coaches at <strong>1 year remaining</strong> hit free agency at season end. Extend now to keep them.
              </p>
            </div>
          </Card>
        )}
      </div>
    </GameShell>
  );
}
