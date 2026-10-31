'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore, flushToStorage } from '@/lib/engine/store';
import { getGmJobOpenings } from '@/lib/engine/gmJobs';
import { trackEvent } from '@bs/core/analytics/track';
import { Button } from '@/components/ui/Button';

/**
 * Blocking "You've been fired" modal. Lives in GameShell so it covers every
 * in-game page — fired users used to land on /re-sign with no explanation and
 * keep pressing "Advance to Re-signing" (sometimes for hours). The only ways
 * out are taking a new job in this league or starting a new one.
 */
export function FiredModal() {
  const router = useRouter();
  const firedState = useGameStore(s => s.firedState);
  const teams = useGameStore(s => s.teams);
  const userTeamId = useGameStore(s => s.userTeamId);
  const seasonHistory = useGameStore(s => s.seasonHistory);
  const [leaving, setLeaving] = useState(false);

  const openings = useMemo(() => getGmJobOpenings(teams, userTeamId), [teams, userTeamId]);
  const career = useMemo(() => seasonHistory.reduce(
    (acc, s) => ({
      wins: acc.wins + s.userRecord.wins,
      losses: acc.losses + s.userRecord.losses,
      titles: acc.titles + (s.userPlayoffResult === 'champion' ? 1 : 0),
    }),
    { wins: 0, losses: 0, titles: 0 },
  ), [seasonHistory]);

  if (!firedState?.fired) return null;
  const oldTeam = teams.find(t => t.id === userTeamId);

  const takeJob = async (teamId: string) => {
    if (leaving) return;
    setLeaving(true);
    useGameStore.getState().acceptGmJob(teamId);
    await flushToStorage();
    router.push('/re-sign');
  };

  const startNewLeague = () => {
    if (leaving) return;
    setLeaving(true);
    trackEvent('gm_fired_new_league', { season: firedState.season, seasons_completed: seasonHistory.length });
    // firedState stays set until newLeague replaces the save, so a reload
    // before picking a team comes back to this modal instead of the old
    // league with the firing undone.
    useGameStore.setState({ initialized: false });
    router.push('/');
  };

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/80 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fired-modal-title"
    >
      {/* Centering lives on an inner min-h-screen wrapper so a modal taller
          than the viewport scrolls from its top instead of clipping it. */}
      <div className="flex min-h-screen items-center justify-center px-4 py-8">
        <div className="bg-[var(--surface)] rounded-2xl shadow-2xl max-w-lg w-full p-8 text-center space-y-6">
          <div className="text-6xl">🔥</div>
          <h1 id="fired-modal-title" className="text-3xl font-black text-red-600">You&apos;ve Been Fired</h1>
          <p className="text-[var(--text-sec)]">{firedState.reason}</p>
          <p className="text-sm text-[var(--text-sec)]">
            Season {firedState.season} · {oldTeam?.city} {oldTeam?.name}
          </p>
          {seasonHistory.length > 0 && (
            <p className="text-sm">
              Your career: {seasonHistory.length} season{seasonHistory.length !== 1 ? 's' : ''} · {career.wins}-{career.losses}
              {career.titles > 0 && ` · ${career.titles} title${career.titles !== 1 ? 's' : ''}`}
            </p>
          )}

          <div className="border-t border-[var(--border)] pt-4 space-y-4">
            {openings.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-bold">Take a new job</p>
                <p className="text-xs text-[var(--text-sec)]">
                  These teams are looking for a GM. Your career record and history come with you.
                </p>
                {openings.map(t => (
                  <button
                    key={t.id}
                    onClick={() => takeJob(t.id)}
                    disabled={leaving}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-[var(--border)] hover:border-blue-500 hover:bg-blue-500/10 transition-all text-left disabled:opacity-50 disabled:cursor-wait"
                  >
                    <div>
                      <div className="font-bold text-sm">{t.city} {t.name}</div>
                      <div className="text-xs text-[var(--text-sec)]">{t.record.wins}-{t.record.losses} · {t.conference} {t.division}</div>
                    </div>
                    <span className="text-xs text-blue-600 font-medium">Accept Job →</span>
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {openings.length > 0 && <p className="text-xs text-[var(--text-sec)] uppercase tracking-wider font-bold">or</p>}
              <Button className="w-full" variant="secondary" onClick={startNewLeague} disabled={leaving}>
                Start a New League
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
