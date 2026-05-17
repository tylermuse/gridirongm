'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore, flushToStorage } from '@/lib/engine/store';
import { GameShell } from '@/components/game/GameShell';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PlayerModal } from '@/components/game/PlayerModal';
import { isPracticeSquadEligible, PRACTICE_SQUAD_LIMIT } from '@/types';
import type { Player } from '@/types';

function ratingColor(val: number): string {
  if (val >= 85) return 'text-green-600';
  if (val >= 70) return 'text-blue-600';
  if (val >= 55) return 'text-amber-600';
  return 'text-red-600';
}

export default function PostDraftCutsPage() {
  const router = useRouter();
  const {
    teams, userTeamId, players,
    releasePlayer, demoteToPracticeSquad, startNewSeason,
  } = useGameStore();

  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const userTeam = teams.find(t => t.id === userTeamId);
  if (!userTeam) {
    return (
      <GameShell>
        <div className="max-w-4xl mx-auto p-4 text-center">No user team.</div>
      </GameShell>
    );
  }

  const active: Player[] = userTeam.roster
    .map(id => players.find(p => p.id === id))
    .filter((p): p is Player => !!p);
  const psIds = new Set(userTeam.practiceSquad ?? []);
  const psPlayers: Player[] = [...psIds]
    .map(id => players.find(p => p.id === id))
    .filter((p): p is Player => !!p);

  const overCount = active.length - 53;
  const psSlotsLeft = PRACTICE_SQUAD_LIMIT - psPlayers.length;

  // Lowest-OVR first — these are the default cut candidates.
  const sorted = useMemo(
    () => [...active].sort((a, b) => a.ratings.overall - b.ratings.overall),
    [active],
  );

  async function finish() {
    // 5/16 instrumentation widening (bige08676 + marioalsosa). The inner
    // try/catch in startNewSeason may itself throw on recovery (Zustand
    // set fails, etc.). Outer catch here ensures (a) we get a console
    // error + localStorage breadcrumb the testers can paste, and
    // (b) router.push runs even if startNewSeason crashes — the user
    // ends up on /roster instead of stranded on /post-draft-cuts.
    try {
      startNewSeason();
    } catch (err) {
      console.error('[post-draft-cuts] startNewSeason escaped its own catch:', err);
      try {
        localStorage.setItem('gg-rollover-outer-error', JSON.stringify({
          ts: new Date().toISOString(),
          source: 'post-draft-cuts',
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack?.split('\n').slice(0, 6).join('\n') : undefined,
        }));
      } catch { /* best-effort */ }
    }
    try { await flushToStorage(); } catch (err) { console.error('[post-draft-cuts] flushToStorage failed', err); }
    router.push('/roster');
  }

  return (
    <GameShell>
      <div className="max-w-5xl mx-auto space-y-4 p-3">
        <div>
          <h1 className="text-2xl font-black">Post-Draft Cuts</h1>
          <p className="text-sm text-[var(--text-sec)] mt-1">
            Your active roster is at <span className="font-bold text-[var(--text)]">{active.length}</span> —{' '}
            {overCount > 0 ? (
              <>
                you need to get down to 53. <span className="text-red-600 font-bold">{overCount} to go.</span>
              </>
            ) : (
              <span className="text-green-600 font-bold">you&apos;re at the limit. Ready to start the season.</span>
            )}
          </p>
          <p className="text-xs text-[var(--text-sec)] mt-1">
            Demote eligible young players to your practice squad instead of cutting them outright —{' '}
            {psSlotsLeft > 0 ? `${psSlotsLeft} PS slots available.` : 'PS is full.'}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Cut Candidates ({sorted.length})</CardTitle>
            <span className="text-xs text-[var(--text-sec)]">Sorted by OVR, lowest first</span>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-[var(--text-sec)] uppercase tracking-wider">
                  <th className="py-2 pl-2 text-left">Player</th>
                  <th className="py-2 text-center">Pos</th>
                  <th className="py-2 text-center">OVR</th>
                  <th className="py-2 text-center">Age</th>
                  <th className="py-2 text-center">Yrs</th>
                  <th className="py-2 text-center">Salary</th>
                  <th className="py-2 text-right pr-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(p => {
                  const psCheck = isPracticeSquadEligible(p, psPlayers);
                  const canDemote = psCheck.eligible && psSlotsLeft > 0;
                  return (
                    <tr key={p.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-2)]">
                      <td className="py-2 pl-2">
                        <button onClick={() => setSelectedPlayerId(p.id)} className="font-semibold hover:text-blue-600">
                          {p.firstName} {p.lastName}
                        </button>
                      </td>
                      <td className="py-2 text-center text-xs font-bold text-[var(--text-sec)]">{p.position}</td>
                      <td className={`py-2 text-center font-bold ${ratingColor(p.ratings.overall)}`}>{p.ratings.overall}</td>
                      <td className="py-2 text-center">{p.age}</td>
                      <td className="py-2 text-center">{p.experience}</td>
                      <td className="py-2 text-center">${p.contract.salary}M</td>
                      <td className="py-2 text-right pr-2">
                        <div className="inline-flex gap-1.5">
                          <span title={!canDemote ? psCheck.reason || 'PS is full' : 'Demote to practice squad'}>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={!canDemote}
                              onClick={() => {
                                const err = demoteToPracticeSquad(p.id);
                                if (err) alert(err);
                              }}
                            >
                              Demote to PS
                            </Button>
                          </span>
                          <Button
                            size="sm"
                            onClick={() => {
                              if (confirm(`Release ${p.firstName} ${p.lastName}? This cannot be undone.`)) {
                                releasePlayer(p.id);
                              }
                            }}
                            className="bg-red-600 hover:bg-red-700 text-white"
                          >
                            Cut
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex items-center justify-between gap-3 pt-2">
          <Button size="sm" variant="secondary" onClick={() => router.push('/draft-recap')}>
            ← Back to Draft Recap
          </Button>
          <Button size="lg" onClick={finish} disabled={overCount > 0}>
            {overCount > 0
              ? `Cut ${overCount} more to continue`
              : 'Start New Season →'}
          </Button>
        </div>
      </div>
      <PlayerModal playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />
    </GameShell>
  );
}
