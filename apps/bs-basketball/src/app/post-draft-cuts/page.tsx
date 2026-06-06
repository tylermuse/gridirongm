'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useLeagueOrHydrate } from '@/lib/store/useLeagueOrHydrate';
import { useLeagueStore } from '@/lib/store/leagueStore';
import { Button } from '@/components/ui/Button';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { Chip } from '@/components/ui/Chip';
import { OffseasonStepper } from '@/components/shell/OffseasonStepper';
import { ratingColor } from '@/lib/ui/ratingColor';
import { keepValueOf } from '@/lib/season/advanceSeason';
import { MAX_ROSTER } from '@/lib/freeAgency';
import type { BasketballPlayer, BasketballTeam } from '@bs/sport-basketball';

/**
 * /post-draft-cuts — trim the roster to 15 before the season (parity with
 * football). Lists your roster by keep-value (lowest first = cut candidates),
 * with Cut buttons; "Start New Season" is gated until you're at the limit.
 * Cuts are no longer silent — you confirm them.
 */
export default function PostDraftCutsPage() {
  const { league, loading, error } = useLeagueOrHydrate();
  const store = useLeagueStore();
  const router = useRouter();

  const userTeam = useMemo<BasketballTeam | null>(() => {
    if (!league?.userTeamId) return null;
    return (league.teams.find(t => t.id === league.userTeamId) as BasketballTeam | undefined) ?? null;
  }, [league]);

  const roster = useMemo<BasketballPlayer[]>(() => {
    if (!league || !userTeam) return [];
    return userTeam.playerIds
      .map(id => league.players[id] as BasketballPlayer)
      .filter(Boolean)
      .sort((a, b) => keepValueOf(a.ratings.overall, a.development.potential) - keepValueOf(b.ratings.overall, b.development.potential));
  }, [league, userTeam]);

  if (loading) return <Shell><p className="opacity-60">Loading…</p></Shell>;
  if (!league) return <Shell><p>{error ?? 'No league loaded.'}</p></Shell>;
  if (!userTeam) return <Shell><p className="text-sm text-[var(--text-sec)]">You&apos;re spectating — no roster to set.</p></Shell>;

  const over = roster.length - MAX_ROSTER;
  const season = (() => { const d = (league.sportData as { draft?: { season?: number } }).draft; return d?.season ?? league.currentSeason; })();

  async function startSeason() {
    const next = await store.startNextSeason();
    if (next) router.push('/');
  }

  return (
    <Shell>
      <OffseasonStepper active="cuts" />
      <header className="flex flex-wrap items-baseline gap-3 mb-1">
        <h1 className="text-2xl font-black uppercase tracking-tight">Final Cuts</h1>
        {over > 0
          ? <span className="text-sm font-bold" style={{ color: '#dc2626' }}>{over} to go — {roster.length}/{MAX_ROSTER}</span>
          : <span className="text-sm font-bold" style={{ color: '#10b981' }}>At the limit — {roster.length}/{MAX_ROSTER} ✓</span>}
      </header>
      <p className="text-sm text-[var(--text-sec)] mb-5">Trim to {MAX_ROSTER} before the season. Sorted by keep-value (lowest first) — but it&apos;s your call.</p>

      <section className="rounded-xl border bg-[var(--surface)] overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[var(--text-sec)] text-[10px] uppercase tracking-wider" style={{ background: 'var(--surface-2)' }}>
              <tr>
                <th className="text-left px-3 py-2">Player</th>
                <th className="text-center">Pos</th>
                <th className="text-center">OVR</th>
                <th className="text-center">Age</th>
                <th className="text-center">Pot</th>
                <th className="text-right pr-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((p, i) => (
                <tr key={p.id} className="border-t" style={{ borderColor: 'var(--border)', background: i < over ? 'color-mix(in srgb, #dc2626 6%, transparent)' : undefined }}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <PlayerAvatar firstName={p.firstName} lastName={p.lastName} primaryColor={userTeam.primaryColor} secondaryColor={userTeam.secondaryColor} size="sm" />
                      <span className="font-semibold truncate">{p.firstName} {p.lastName}</span>
                    </div>
                  </td>
                  <td className="text-center"><Chip>{p.sportData.position}</Chip></td>
                  <td className={`text-center font-bold tabular-nums ${ratingColor(p.ratings.overall)}`}>{p.ratings.overall}</td>
                  <td className="text-center tabular-nums text-[var(--text-sec)]">{p.age}</td>
                  <td className="text-center tabular-nums text-[var(--text-sec)]">{p.development.potential}</td>
                  <td className="text-right pr-3">
                    <button
                      onClick={() => { if (confirm(`Waive ${p.firstName} ${p.lastName}? They become a free agent.`)) void store.releasePlayer(p.id); }}
                      disabled={store.loading}
                      className="text-xs font-bold rounded-md px-2.5 py-1 text-white disabled:opacity-40"
                      style={{ background: '#dc2626' }}
                    >
                      Cut
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-5 flex items-center gap-3">
        <Button variant="primary" disabled={over > 0 || store.loading} onClick={() => void startSeason()}>
          {store.loading ? 'Tipping off…' : `Start ${season} Season →`}
        </Button>
        {over > 0 && <span className="text-sm text-[var(--text-sec)]">Cut {over} more to start.</span>}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="max-w-5xl mx-auto p-8">
      <Link href="/" className="text-sm font-semibold opacity-70 hover:opacity-100">← Home</Link>
      <div className="mt-2">{children}</div>
    </main>
  );
}
